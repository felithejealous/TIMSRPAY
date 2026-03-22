from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, func as sa_func
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib
import hmac
import os
import re
import smtplib
from email.message import EmailMessage

from backend.security import get_current_user, require_roles
from backend.database import SessionLocal
from backend.models import (
    User,
    Order,
    Role,
    RewardWallet,
    RewardTransaction,
    RewardRedemptionToken,
    RewardManualOTP,
    CustomerProfile,
)

router = APIRouter(prefix="/rewards", tags=["Rewards"])

REQUIRED_POINTS = 2800
QR_TOKEN_TTL_SECONDS = 120
MANUAL_OTP_TTL_SECONDS = 300
OTP_ITERS = 120_000
MANUAL_OTP_MAX_ATTEMPTS = 3
MANUAL_OTP_REQUEST_COOLDOWN_SECONDS = 60
ORDER_POINTS_CLAIM_WINDOW_HOURS = 24
ORDER_DISPLAY_OFFSET = 900


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_staff_or_admin(x_role: str = Header(default="", alias="X-Role")):
    role = (x_role or "").strip().lower()
    if role not in {"staff", "admin", "cashier"}:
        raise HTTPException(status_code=403, detail="Staff/Admin/Cashier only (set header X-Role)")
    return role


def _utcnow():
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _format_order_display_id(order_id: int) -> str:
    return f"#TM-{ORDER_DISPLAY_OFFSET + int(order_id)}"


def _resolve_order_id(order_reference: Optional[str], order_id: Optional[int] = None) -> int:
    """
    Supports:
    - raw DB id: 190
    - UI id: #TM-1090
    - UI id: TM-1090
    """
    if order_id is not None:
        return int(order_id)

    raw = (order_reference or "").strip().upper()
    if not raw:
        raise HTTPException(status_code=400, detail="order_reference or order_id is required")

    tm_match = re.match(r"^#?TM-(\d+)$", raw)
    if tm_match:
        ui_number = int(tm_match.group(1))
        resolved = ui_number - ORDER_DISPLAY_OFFSET
        if resolved <= 0:
            raise HTTPException(status_code=400, detail="Invalid UI order reference")
        return resolved

    if raw.isdigit():
        return int(raw)

    raise HTTPException(
        status_code=400,
        detail="Invalid order reference. Use DB order id like 190 or UI order id like #TM-1090"
    )


def _get_user_by_email(db: Session, email: str) -> User:
    email = (email or "").strip().lower()
    u = db.query(User).filter(User.email == email).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if hasattr(u, "is_active") and not bool(u.is_active):
        raise HTTPException(status_code=400, detail="User is inactive")
    return u


def _get_reward_wallet(db: Session, user_id: int) -> RewardWallet:
    rw = db.query(RewardWallet).filter(RewardWallet.user_id == user_id).first()
    if not rw:
        rw = RewardWallet(user_id=user_id, total_points=0)
        db.add(rw)
        db.flush()
    return rw


def _hash_otp(otp: str, salt: bytes) -> str:
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        otp.encode("utf-8"),
        salt,
        OTP_ITERS,
        dklen=32
    )
    return f"pbkdf2_sha256${OTP_ITERS}${salt.hex()}${dk.hex()}"


def _verify_otp(otp: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False

        iters = int(iters)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)

        dk = hashlib.pbkdf2_hmac(
            "sha256",
            otp.encode("utf-8"),
            salt,
            iters,
            dklen=len(expected)
        )
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def _send_otp_email(to_email: str, otp: str, ttl_seconds: int) -> bool:
    enabled = (os.getenv("SMTP_ENABLED", "false").lower() == "true")
    if not enabled:
        return False

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    pw = os.getenv("SMTP_PASS", "")
    from_addr = os.getenv("SMTP_FROM", user)

    if not user or not pw:
        raise HTTPException(status_code=500, detail="SMTP credentials not set (SMTP_USER/SMTP_PASS)")

    msg = EmailMessage()
    msg["Subject"] = "Your TIMSRPAY OTP"
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(
        f"Your OTP is: {otp}\n\n"
        f"This code expires in {max(1, ttl_seconds // 60)} minutes.\n"
        f"If you did not request this, ignore this email."
    )

    try:
        with smtplib.SMTP(host, port) as smtp:
            smtp.starttls()
            smtp.login(user, pw)
            smtp.send_message(msg)
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMTP send failed: {str(e)}")


def _get_order_for_claim(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    earned = int(getattr(order, "earned_points", 0) or 0)
    if earned <= 0:
        raise HTTPException(status_code=400, detail="This order has no claimable points")

    if bool(getattr(order, "points_synced", False)):
        raise HTTPException(status_code=400, detail="Points already synced/claimed for this order")

    created_at = _as_utc(getattr(order, "created_at", None))
    expires_at = getattr(order, "points_claim_expires_at", None)
    expires_at = _as_utc(expires_at) if expires_at else (
        created_at + timedelta(hours=ORDER_POINTS_CLAIM_WINDOW_HOURS) if created_at else None
    )

    if expires_at and _utcnow() > expires_at:
        raise HTTPException(status_code=400, detail="Claim window expired for this order")

    return order


def _get_customer_role_id(db: Session) -> Optional[int]:
    role = db.query(Role).filter(sa_func.lower(Role.name) == "customer").first()
    return role.id if role else None


def _ensure_claim_user_matches_order(user: User, order: Order):
    """
    Rules:
    - If order.user_id exists, dapat same user ang mag-claim.
    - If order.user_id is null, puwede ang manual OTP claim to bind it to this customer account.
    """
    order_user_id = getattr(order, "user_id", None)
    if order_user_id is not None and int(order_user_id) != int(user.id):
        raise HTTPException(
            status_code=400,
            detail="This order is already linked to another customer account"
        )


class ManualOTPRequest(BaseModel):
    email: EmailStr
    order_reference: str = Field(min_length=1, max_length=50)


class ManualOTPConfirm(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)
    order_reference: Optional[str] = Field(default=None, max_length=50)
    order_id: Optional[int] = Field(default=None, gt=0)
    points_to_add: Optional[int] = Field(default=None, gt=0)


# ============================================================
# ADMIN / STAFF REWARDS DASHBOARD
# ============================================================
@router.get("/admin/summary")
def admin_rewards_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "staff", "cashier")),
):
    customer_role_id = _get_customer_role_id(db)
    if not customer_role_id:
        raise HTTPException(status_code=500, detail="Role 'customer' not found")

    customer_user_ids_subq = db.query(User.id).filter(User.role_id == customer_role_id).subquery()

    total_issued = db.query(
        sa_func.coalesce(sa_func.sum(RewardTransaction.points_change), 0)
    ).join(
        RewardWallet, RewardWallet.id == RewardTransaction.reward_wallet_id
    ).filter(
        RewardWallet.user_id.in_(customer_user_ids_subq),
        RewardTransaction.transaction_type == "EARN",
        RewardTransaction.points_change > 0
    ).scalar() or 0

    total_redeemed = db.query(
        sa_func.coalesce(sa_func.sum(sa_func.abs(RewardTransaction.points_change)), 0)
    ).join(
        RewardWallet, RewardWallet.id == RewardTransaction.reward_wallet_id
    ).filter(
        RewardWallet.user_id.in_(customer_user_ids_subq),
        RewardTransaction.transaction_type == "REDEEM",
        RewardTransaction.points_change < 0
    ).scalar() or 0

    current_balance = db.query(
        sa_func.coalesce(sa_func.sum(RewardWallet.total_points), 0)
    ).join(
        User, User.id == RewardWallet.user_id
    ).filter(
        User.role_id == customer_role_id
    ).scalar() or 0

    pending_claimable_orders = db.query(Order).outerjoin(
        User, User.id == Order.user_id
    ).filter(
        Order.earned_points > 0,
        Order.points_synced == False,
        or_(Order.user_id.is_(None), User.role_id == customer_role_id)
    ).count()

    return {
        "total_issued": int(total_issued),
        "total_redeemed": int(total_redeemed),
        "current_balance": int(current_balance),
        "pending_claimable_orders": int(pending_claimable_orders),
    }


@router.get("/admin/customers")
def admin_rewards_customers(
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=300),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "staff", "cashier")),
):
    customer_role_id = _get_customer_role_id(db)
    if not customer_role_id:
        raise HTTPException(status_code=500, detail="Role 'customer' not found")

    query = (
        db.query(User, CustomerProfile, RewardWallet)
        .join(CustomerProfile, CustomerProfile.user_id == User.id)
        .outerjoin(RewardWallet, RewardWallet.user_id == User.id)
        .filter(User.role_id == customer_role_id)
    )

    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.email.ilike(search),
                CustomerProfile.full_name.ilike(search),
            )
        )

    rows = query.order_by(User.id.desc()).limit(limit).all()
    user_ids = [user.id for user, _, _ in rows]

    earn_map = {}
    redeem_map = {}

    if user_ids:
        earn_rows = (
            db.query(
                RewardWallet.user_id,
                sa_func.coalesce(sa_func.sum(RewardTransaction.points_change), 0)
            )
            .join(RewardTransaction, RewardTransaction.reward_wallet_id == RewardWallet.id)
            .filter(
                RewardWallet.user_id.in_(user_ids),
                RewardTransaction.transaction_type == "EARN",
                RewardTransaction.points_change > 0
            )
            .group_by(RewardWallet.user_id)
            .all()
        )
        earn_map = {int(user_id): int(total or 0) for user_id, total in earn_rows}

        redeem_rows = (
            db.query(
                RewardWallet.user_id,
                sa_func.coalesce(sa_func.sum(sa_func.abs(RewardTransaction.points_change)), 0)
            )
            .join(RewardTransaction, RewardTransaction.reward_wallet_id == RewardWallet.id)
            .filter(
                RewardWallet.user_id.in_(user_ids),
                RewardTransaction.transaction_type == "REDEEM",
                RewardTransaction.points_change < 0
            )
            .group_by(RewardWallet.user_id)
            .all()
        )
        redeem_map = {int(user_id): int(total or 0) for user_id, total in redeem_rows}

    data = []
    for user, profile, reward_wallet in rows:
        full_name = profile.full_name if profile and profile.full_name else None
        total_points = int(reward_wallet.total_points or 0) if reward_wallet else 0
        total_earned = int(earn_map.get(user.id, 0))
        total_redeemed = int(redeem_map.get(user.id, 0))

        data.append({
            "user_id": user.id,
            "email": user.email,
            "full_name": full_name,
            "is_active": bool(getattr(user, "is_active", True)),
            "total_points": total_points,
            "earn_count": total_earned,
            "redeem_count": total_redeemed,
            "total_earned": total_earned,
            "total_redeemed": total_redeemed,
        })

    return {"count": len(data), "data": data}


@router.get("/admin/customer/{user_id}/history")
def admin_customer_history(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "staff", "cashier")),
):
    customer_role_id = _get_customer_role_id(db)
    if not customer_role_id:
        raise HTTPException(status_code=500, detail="Role 'customer' not found")

    user = db.query(User).filter(User.id == user_id, User.role_id == customer_role_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Customer not found")

    rw = db.query(RewardWallet).filter(RewardWallet.user_id == user_id).first()
    if not rw:
        return {
            "user_id": user_id,
            "total_points": 0,
            "earn_count": 0,
            "redeem_count": 0,
            "total_earned": 0,
            "total_redeemed": 0,
            "history": []
        }

    txs = db.query(RewardTransaction).filter(
        RewardTransaction.reward_wallet_id == rw.id
    ).order_by(RewardTransaction.id.desc()).limit(100).all()

    total_earned = db.query(
        sa_func.coalesce(sa_func.sum(RewardTransaction.points_change), 0)
    ).filter(
        RewardTransaction.reward_wallet_id == rw.id,
        RewardTransaction.transaction_type == "EARN",
        RewardTransaction.points_change > 0
    ).scalar() or 0

    total_redeemed = db.query(
        sa_func.coalesce(sa_func.sum(sa_func.abs(RewardTransaction.points_change)), 0)
    ).filter(
        RewardTransaction.reward_wallet_id == rw.id,
        RewardTransaction.transaction_type == "REDEEM",
        RewardTransaction.points_change < 0
    ).scalar() or 0

    return {
        "user_id": user_id,
        "total_points": int(rw.total_points or 0),
        "earn_count": int(total_earned),
        "redeem_count": int(total_redeemed),
        "total_earned": int(total_earned),
        "total_redeemed": int(total_redeemed),
        "history": [
            {
                "id": t.id,
                "points_change": int(t.points_change or 0),
                "type": t.transaction_type,
                "order_id": getattr(t, "order_id", None),
                "display_order_id": _format_order_display_id(t.order_id) if getattr(t, "order_id", None) else None,
                "created_at": str(getattr(t, "created_at", "")),
            }
            for t in txs
        ],
    }


@router.get("/admin/claimable-orders")
def admin_claimable_orders(
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=300),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "staff", "cashier")),
):
    customer_role_id = _get_customer_role_id(db)
    if not customer_role_id:
        raise HTTPException(status_code=500, detail="Role 'customer' not found")

    query = (
        db.query(Order, User, CustomerProfile)
        .outerjoin(User, User.id == Order.user_id)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == User.id)
        .filter(
            Order.earned_points > 0,
            Order.points_synced == False,
            or_(Order.user_id.is_(None), User.role_id == customer_role_id)
        )
    )

    if q:
        raw_search = (q or "").strip()
        search = f"%{raw_search}%"
        resolved_order_id = None

        try:
            resolved_order_id = _resolve_order_id(raw_search)
        except Exception:
            resolved_order_id = None

        conditions = [
            User.email.ilike(search),
            CustomerProfile.full_name.ilike(search),
            sa_func.cast(Order.id, sa_func.String).ilike(search),
        ]

        if resolved_order_id is not None:
            conditions.append(Order.id == resolved_order_id)

        query = query.filter(or_(*conditions))

    rows = query.order_by(Order.id.desc()).limit(limit).all()

    data = []
    for order, user, profile in rows:
        customer_name = None
        if getattr(order, "customer_name", None):
            customer_name = order.customer_name
        elif profile and getattr(profile, "full_name", None):
            customer_name = profile.full_name
        elif user and getattr(user, "email", None):
            customer_name = user.email

        data.append({
            "order_id": order.id,
            "display_id": _format_order_display_id(order.id),
            "user_id": order.user_id,
            "customer_name": customer_name,
            "customer_email": getattr(user, "email", None) if user else None,
            "earned_points": int(getattr(order, "earned_points", 0) or 0),
            "order_type": getattr(order, "order_type", None),
            "payment_method": getattr(order, "payment_method", None),
            "total_amount": float(getattr(order, "total_amount", 0) or 0),
            "created_at": str(getattr(order, "created_at", "")),
        })

    return {"count": len(data), "data": data}


# ============================================================
# CUSTOMER SELF
# ============================================================
@router.get("/points/history")
def get_my_reward_points_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rw = db.query(RewardWallet).filter(RewardWallet.user_id == current_user.id).first()
    if not rw:
        return {"user_id": current_user.id, "history": []}

    txs = db.query(RewardTransaction).filter(
        RewardTransaction.reward_wallet_id == rw.id
    ).order_by(RewardTransaction.id.desc()).limit(100).all()

    return {
        "user_id": current_user.id,
        "history": [
            {
                "id": t.id,
                "points_change": int(t.points_change or 0),
                "type": t.transaction_type,
                "created_at": str(getattr(t, "created_at", "")),
                "order_id": getattr(t, "order_id", None),
                "display_order_id": _format_order_display_id(t.order_id) if getattr(t, "order_id", None) else None,
            }
            for t in txs
        ],
    }


@router.get("/points")
def get_my_reward_points(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rw = db.query(RewardWallet).filter(RewardWallet.user_id == current_user.id).first()
    points = int(rw.total_points or 0) if rw else 0
    return {"user_id": current_user.id, "total_points": points}


# ============================================================
# CUSTOMER QR REDEMPTION
# ============================================================
@router.post("/redeem-qr/generate")
def generate_redeem_qr(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("customer")),
):
    user_id = int(current_user.id)

    rw = _get_reward_wallet(db, user_id)
    points = int(rw.total_points or 0)

    if points < REQUIRED_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough points. Need {REQUIRED_POINTS}, you have {points}."
        )

    db.query(RewardRedemptionToken).filter(
        RewardRedemptionToken.user_id == user_id,
        RewardRedemptionToken.is_used == False
    ).delete(synchronize_session=False)

    token = "RDM_" + secrets.token_urlsafe(24)
    expires_at = _utcnow() + timedelta(seconds=QR_TOKEN_TTL_SECONDS)

    row = RewardRedemptionToken(
        user_id=user_id,
        token=token,
        required_points=REQUIRED_POINTS,
        expires_at=expires_at,
        is_used=False
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "user_id": user_id,
        "token": row.token,
        "expires_at": str(row.expires_at)
    }


@router.post("/redeem-qr/consume")
def consume_redeem_qr(
    qr_token: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "admin")),
):
    token = (qr_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="qr_token is required")

    row = db.query(RewardRedemptionToken).filter(RewardRedemptionToken.token == token).first()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid token")

    if row.is_used:
        raise HTTPException(status_code=400, detail="Token already used")

    if row.expires_at and _utcnow() > _as_utc(row.expires_at):
        raise HTTPException(status_code=400, detail="Token expired")

    rw = _get_reward_wallet(db, row.user_id)
    if int(rw.total_points or 0) < REQUIRED_POINTS:
        raise HTTPException(status_code=400, detail="Not enough points")

    rw.total_points = 0
    row.is_used = True
    row.used_at = _utcnow().replace(tzinfo=None)

    db.add(
        RewardTransaction(
            reward_wallet_id=rw.id,
            reward_id=None,
            order_id=None,
            points_change=-REQUIRED_POINTS,
            transaction_type="REDEEM"
        )
    )

    db.commit()

    return {
        "message": "Reward redeemed",
        "user_id": row.user_id,
        "remaining_points": int(rw.total_points or 0)
    }


# ============================================================
# MANUAL OTP REQUEST
# ============================================================
@router.post("/manual/otp/request")
def request_manual_points_otp(
    payload: ManualOTPRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "admin", "cashier")),
):
    user = _get_user_by_email(db, str(payload.email))
    resolved_order_id = _resolve_order_id(payload.order_reference)
    order = _get_order_for_claim(db, resolved_order_id)
    _ensure_claim_user_matches_order(user, order)

    last = db.query(RewardManualOTP).filter(
        RewardManualOTP.user_id == user.id
    ).order_by(RewardManualOTP.id.desc()).first()

    if last and getattr(last, "created_at", None):
        elapsed = (_utcnow() - _as_utc(last.created_at)).total_seconds()
    if elapsed < MANUAL_OTP_REQUEST_COOLDOWN_SECONDS:
              remaining = int(MANUAL_OTP_REQUEST_COOLDOWN_SECONDS - elapsed)
              raise HTTPException(
                 status_code=429,
                 detail=f"Please wait {remaining} seconds before requesting a new OTP."
        )

    db.query(RewardManualOTP).filter(
        RewardManualOTP.user_id == user.id,
        RewardManualOTP.is_used == False
    ).delete(synchronize_session=False)

    otp = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_bytes(16)
    otp_hash = _hash_otp(otp, salt)
    expires_at = _utcnow() + timedelta(seconds=MANUAL_OTP_TTL_SECONDS)

    row = RewardManualOTP(
        user_id=user.id,
        otp_hash=otp_hash,
        expires_at=expires_at.replace(tzinfo=None),
        is_used=False,
        attempt_count=0,
        last_attempt_at=None
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    sent = _send_otp_email(str(payload.email), otp, MANUAL_OTP_TTL_SECONDS)
    claim_points = int(getattr(order, "earned_points", 0) or 0)

    if sent:
        return {
            "message": "OTP sent to email",
            "email": str(payload.email),
            "order_id": resolved_order_id,
            "display_id": _format_order_display_id(resolved_order_id),
            "claim_points": claim_points,
            "expires_at": str(row.expires_at)
        }

    return {
        "message": "OTP generated (DEV MODE - SMTP disabled)",
        "email": str(payload.email),
        "order_id": resolved_order_id,
        "display_id": _format_order_display_id(resolved_order_id),
        "claim_points": claim_points,
        "otp_dev": otp,
        "expires_at": str(row.expires_at)
    }


# ============================================================
# MANUAL OTP CONFIRM
# ============================================================
@router.post("/manual/otp/confirm")
def confirm_manual_points_otp(
    payload: ManualOTPConfirm,
    db: Session = Depends(get_db),
    staff_user: User = Depends(require_roles("staff", "admin", "cashier")),
):
    user = _get_user_by_email(db, str(payload.email))

    row = db.query(RewardManualOTP).filter(
        RewardManualOTP.user_id == user.id,
        RewardManualOTP.is_used == False
    ).order_by(RewardManualOTP.id.desc()).first()

    if not row:
        raise HTTPException(status_code=404, detail="No active OTP found")

    if row.expires_at and _utcnow() > _as_utc(row.expires_at):
        row.is_used = True
        row.used_at = _utcnow().replace(tzinfo=None)
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired")

    if int(getattr(row, "attempt_count", 0)) >= MANUAL_OTP_MAX_ATTEMPTS:
        row.is_used = True
        row.used_at = _utcnow().replace(tzinfo=None)
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts. Request a new OTP.")

    otp_clean = (payload.otp or "").strip()
    ok = _verify_otp(otp_clean, row.otp_hash)

    if not ok:
        row.attempt_count = int(getattr(row, "attempt_count", 0)) + 1
        row.last_attempt_at = _utcnow().replace(tzinfo=None)

        if row.attempt_count >= MANUAL_OTP_MAX_ATTEMPTS:
            row.is_used = True
            row.used_at = _utcnow().replace(tzinfo=None)

        db.commit()

        if row.is_used:
            raise HTTPException(status_code=400, detail="Too many attempts. Request a new OTP.")
        raise HTTPException(status_code=401, detail="Invalid OTP")

    row.is_used = True
    row.used_at = _utcnow().replace(tzinfo=None)
    row.last_attempt_at = _utcnow().replace(tzinfo=None)

    resolved_order_id = None
    if payload.order_id is not None or payload.order_reference:
        resolved_order_id = _resolve_order_id(payload.order_reference, payload.order_id)

    if resolved_order_id is not None:
        order = _get_order_for_claim(db, resolved_order_id)
        _ensure_claim_user_matches_order(user, order)

        claim_points = int(getattr(order, "earned_points", 0) or 0)
        if claim_points <= 0:
            db.commit()
            raise HTTPException(status_code=400, detail="This order has no claimable points")

        rw = _get_reward_wallet(db, user.id)
        current = int(rw.total_points or 0)

        if current >= REQUIRED_POINTS:
            db.commit()
            return {
                "message": "Account already at max points. No points were added.",
                "user_id": user.id,
                "order_id": resolved_order_id,
                "display_id": _format_order_display_id(resolved_order_id),
                "added_points": 0,
                "total_points": current
            }

        capped_total = min(REQUIRED_POINTS, current + claim_points)
        actual_added = capped_total - current

        if actual_added <= 0:
            db.commit()
            return {
                "message": "No points were added.",
                "user_id": user.id,
                "order_id": resolved_order_id,
                "display_id": _format_order_display_id(resolved_order_id),
                "added_points": 0,
                "total_points": current
            }

        rw.total_points = capped_total

        db.add(
            RewardTransaction(
                reward_wallet_id=rw.id,
                reward_id=None,
                order_id=resolved_order_id,
                points_change=int(actual_added),
                transaction_type="EARN"
            )
        )

        if hasattr(order, "user_id") and not getattr(order, "user_id", None):
            order.user_id = user.id

        if hasattr(order, "points_synced"):
            order.points_synced = True
        if hasattr(order, "points_claimed_at"):
            order.points_claimed_at = _utcnow().replace(tzinfo=None)
        if hasattr(order, "points_claimed_user_id"):
            order.points_claimed_user_id = user.id
        if hasattr(order, "points_claimed_by_staff_id"):
            order.points_claimed_by_staff_id = getattr(staff_user, "id", None)
        if hasattr(order, "points_claim_method"):
            order.points_claim_method = "manual_otp"
        if hasattr(order, "points_claim_expires_at"):
            order.points_claim_expires_at = None

        db.commit()
        db.refresh(rw)

        return {
            "message": "Points claimed and synced to account",
            "user_id": user.id,
            "order_id": resolved_order_id,
            "display_id": _format_order_display_id(resolved_order_id),
            "added_points": int(actual_added),
            "total_points": int(rw.total_points or 0)
        }

    if payload.points_to_add is None:
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="order_reference/order_id is required for claim, or provide points_to_add for manual adjustment"
        )

    staff_role = (getattr(staff_user, "role_name", "") or "").strip().lower()
    if staff_role != "admin":
        db.commit()
        raise HTTPException(status_code=403, detail="Admin only for manual point adjustments")

    rw = _get_reward_wallet(db, user.id)
    current = int(rw.total_points or 0)

    if current >= REQUIRED_POINTS:
        db.commit()
        return {
            "message": "Account already at max points. No points were added.",
            "user_id": user.id,
            "added_points": 0,
            "total_points": current
        }

    capped_total = min(REQUIRED_POINTS, current + int(payload.points_to_add))
    actual_added = capped_total - current
    rw.total_points = capped_total

    if actual_added > 0:
        db.add(
            RewardTransaction(
                reward_wallet_id=rw.id,
                reward_id=None,
                order_id=None,
                points_change=int(actual_added),
                transaction_type="EARN"
            )
        )

    db.commit()
    db.refresh(rw)

    return {
        "message": "Manual points added successfully",
        "user_id": user.id,
        "added_points": int(actual_added),
        "total_points": int(rw.total_points or 0)
    }