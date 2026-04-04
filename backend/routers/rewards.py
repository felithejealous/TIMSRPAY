from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, func as sa_func, cast, String
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib
import hmac
import os
import re
import smtplib
import string
from email.message import EmailMessage
from backend.models import Product
from backend.schemas import RewardCreate, RewardUpdate
from backend.security import get_current_user, require_roles
from backend.database import SessionLocal
from backend.models import (
    User,
    Order,
    Role,
    Reward,
    RewardWallet,
    RewardTransaction,
    RewardRedemptionToken,
    RewardManualOTP,
    CustomerProfile,
    Wallet,
    Product,
)

router = APIRouter(prefix="/rewards", tags=["Rewards"])

REQUIRED_POINTS = 2800

# token is effectively "no expiry" now for free drink redeem
NO_EXPIRY_TOKEN_PLACEHOLDER = datetime(2099, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

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


def _generate_short_redeem_token(db: Session, length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits

    while True:
        token_body = "".join(secrets.choice(alphabet) for _ in range(length))
        token = f"TDM-{token_body}"

        existing = db.query(RewardRedemptionToken).filter(
            RewardRedemptionToken.token == token
        ).first()

        if not existing:
            return token


def require_staff_or_admin(x_role: str = Header(default="", alias="X-Role")):
    role = (x_role or "").strip().lower()
    if role not in {"staff", "admin", "cashier"}:
        raise HTTPException(status_code=403, detail="Staff/Admin/Cashier only (set header X-Role)")
    return role


def _utcnow():
    return datetime.now(timezone.utc)


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
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


def _get_user_role_name(db: Session, user: Optional[User]) -> str:
    if not user:
        return ""

    direct = getattr(user, "role_name", None)
    if direct:
        return str(direct).strip().lower()

    role_obj = getattr(user, "role", None)
    if role_obj and getattr(role_obj, "name", None):
        return str(role_obj.name).strip().lower()

    role_id = getattr(user, "role_id", None)
    if role_id:
        role = db.query(Role).filter(Role.id == role_id).first()
        if role and role.name:
            return str(role.name).strip().lower()

    return ""


def _get_user_by_email(db: Session, email: str) -> User:
    email = (email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if hasattr(user, "is_active") and not bool(user.is_active):
        raise HTTPException(status_code=400, detail="User is inactive")
    return user


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


def _find_customer_by_identifier(db: Session, raw_query: str):
    q = (raw_query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query is required")

    customer_role_id = _get_customer_role_id(db)
    if not customer_role_id:
        raise HTTPException(status_code=500, detail="Role 'customer' not found")

    user = None
    wallet = None

    if q.isdigit():
        user = db.query(User).filter(
            User.id == int(q),
            User.role_id == customer_role_id
        ).first()

    if not user and "@" in q:
        user = db.query(User).filter(
            sa_func.lower(User.email) == q.lower(),
            User.role_id == customer_role_id
        ).first()

    if not user:
        wallet = db.query(Wallet).join(User, User.id == Wallet.user_id).filter(
            sa_func.upper(Wallet.wallet_code) == q.upper(),
            User.role_id == customer_role_id
        ).first()

        if wallet:
            user = db.query(User).filter(User.id == wallet.user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="Customer not found")

    if not wallet:
        wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()

    customer_profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == user.id).first()
    reward_wallet = db.query(RewardWallet).filter(RewardWallet.user_id == user.id).first()

    return {
        "user": user,
        "wallet": wallet,
        "customer_profile": customer_profile,
        "reward_wallet": reward_wallet,
    }


def _clear_unused_redeem_tokens(db: Session, user_id: int):
    db.query(RewardRedemptionToken).filter(
        RewardRedemptionToken.user_id == user_id,
        RewardRedemptionToken.is_used == False
    ).delete(synchronize_session=False)


def _create_no_expiry_redeem_token(db: Session, user: User):
    rw = _get_reward_wallet(db, int(user.id))
    points = int(rw.total_points or 0)

    if points < REQUIRED_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough points. Need {REQUIRED_POINTS}, you have {points}."
        )

    _clear_unused_redeem_tokens(db, int(user.id))

    token = _generate_short_redeem_token(db)

    row = RewardRedemptionToken(
        user_id=int(user.id),
        token=token,
        required_points=REQUIRED_POINTS,
        expires_at=NO_EXPIRY_TOKEN_PLACEHOLDER,
        is_used=False
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return row


class ManualOTPRequest(BaseModel):
    email: EmailStr
    order_reference: Optional[str] = Field(default=None, max_length=50)


class ManualOTPConfirm(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)
    order_reference: Optional[str] = Field(default=None, max_length=50)
    order_id: Optional[int] = Field(default=None, gt=0)
    points_to_add: Optional[int] = Field(default=None, gt=0)


class StaffRedeemTokenGenerateRequest(BaseModel):
    q: str = Field(min_length=1, description="Customer email, wallet code, or user id")


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
        raw_q = (q or "").strip()
        search = f"%{raw_q}%"

        query = query.outerjoin(Wallet, Wallet.user_id == User.id)

        conditions = [
            User.email.ilike(search),
            CustomerProfile.full_name.ilike(search),
            Wallet.wallet_code.ilike(search),
        ]

        if raw_q.isdigit():
            conditions.append(User.id == int(raw_q))

        query = query.filter(or_(*conditions))

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

# ============================================================
# ADMIN REWARD CATALOG MANAGEMENT
# ============================================================
@router.get("/admin/catalog")
def admin_list_reward_catalog(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "staff", "cashier")),
):
    query = db.query(Reward)

    if active_only:
        query = query.filter(Reward.is_active == True)

    rows = query.order_by(Reward.sort_order.asc(), Reward.id.asc()).all()

    product_ids = [int(row.product_id) for row in rows if getattr(row, "product_id", None)]
    product_map = {}

    if product_ids:
        product_rows = db.query(Product).filter(Product.id.in_(product_ids)).all()
        product_map = {int(p.id): p for p in product_rows}

    return {
        "count": len(rows),
        "data": [
            {
                "reward_id": row.id,
                "name": row.name,
                "description": row.description,
                "image_url": row.image_url,
                "points_required": int(row.points_required or 0),
                "reward_type": row.reward_type,
                "product_id": row.product_id,
                "product_name": product_map.get(int(row.product_id)).name if row.product_id and product_map.get(int(row.product_id)) else None,
                "size_label": row.size_label,
                "is_active": bool(row.is_active),
                "sort_order": int(row.sort_order or 0),
            }
            for row in rows
        ],
    }


@router.post("/admin/catalog")
def admin_create_reward_catalog(
    payload: RewardCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Reward name is required")

    product = None
    if payload.product_id is not None:
        product = db.query(Product).filter(Product.id == payload.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Selected product not found")

    row = Reward(
        name=name,
        description=(payload.description or "").strip() or None,
        image_url=(payload.image_url or "").strip() or None,
        points_required=int(payload.points_required),
        reward_type=(payload.reward_type or "free_drink").strip() or "free_drink",
        product_id=payload.product_id,
        size_label=(payload.size_label or "").strip() or None,
        is_active=bool(payload.is_active),
        sort_order=int(payload.sort_order or 0),
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "Reward created successfully",
        "reward_id": row.id,
        "data": {
            "reward_id": row.id,
            "name": row.name,
            "description": row.description,
            "image_url": row.image_url,
            "points_required": int(row.points_required or 0),
            "reward_type": row.reward_type,
            "product_id": row.product_id,
            "product_name": product.name if product else None,
            "size_label": row.size_label,
            "is_active": bool(row.is_active),
            "sort_order": int(row.sort_order or 0),
        }
    }


@router.put("/admin/catalog/{reward_id}")
@router.patch("/admin/catalog/{reward_id}")
def admin_update_reward_catalog(
    reward_id: int,
    payload: RewardUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(Reward).filter(Reward.id == reward_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reward not found")

    product = None

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Reward name cannot be empty")
        row.name = name

    if payload.description is not None:
        row.description = payload.description.strip() or None

    if payload.image_url is not None:
        row.image_url = payload.image_url.strip() or None

    if payload.points_required is not None:
        row.points_required = int(payload.points_required)

    if payload.reward_type is not None:
        row.reward_type = (payload.reward_type or "").strip() or "free_drink"

    if payload.product_id is not None:
        product = db.query(Product).filter(Product.id == payload.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Selected product not found")
        row.product_id = payload.product_id

    if payload.size_label is not None:
        row.size_label = payload.size_label.strip() or None

    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)

    if payload.sort_order is not None:
        row.sort_order = int(payload.sort_order)

    db.commit()
    db.refresh(row)

    if row.product_id and not product:
        product = db.query(Product).filter(Product.id == row.product_id).first()

    return {
        "message": "Reward updated successfully",
        "data": {
            "reward_id": row.id,
            "name": row.name,
            "description": row.description,
            "image_url": row.image_url,
            "points_required": int(row.points_required or 0),
            "reward_type": row.reward_type,
            "product_id": row.product_id,
            "product_name": product.name if product else None,
            "size_label": row.size_label,
            "is_active": bool(row.is_active),
            "sort_order": int(row.sort_order or 0),
        }
    }
@router.patch("/admin/catalog/{reward_id}/toggle")
def admin_toggle_reward_catalog(
    reward_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(Reward).filter(Reward.id == reward_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reward not found")

    row.is_active = not bool(row.is_active)
    db.commit()
    db.refresh(row)

    return {
        "message": "Reward status updated successfully",
        "reward_id": row.id,
        "is_active": bool(row.is_active),
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
            cast(Order.id, String).ilike(search),
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
@router.get("/catalog")
def get_reward_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rw = _get_reward_wallet(db, current_user.id)
    points = int(rw.total_points or 0)

    rewards = (
        db.query(Reward)
        .filter(Reward.is_active == True)
        .order_by(Reward.sort_order.asc(), Reward.id.asc())
        .all()
    )

    return {
        "total_points": points,
        "data": [
            {
                "reward_id": r.id,
                "name": r.name,
                "description": r.description,
                "image_url": r.image_url,
                "points_required": int(r.points_required or 0),
                "reward_type": r.reward_type,
                "product_id": r.product_id,
                "size_label": r.size_label,
                "claimable": points >= int(r.points_required or 0),
            }
            for r in rewards
        ]
    }
# ============================================================
# CUSTOMER QR REDEMPTION
# ============================================================
@router.post("/redeem-qr/generate")
def generate_redeem_qr(
    reward_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("customer")),
):
    reward = db.query(Reward).filter(
        Reward.id == reward_id,
        Reward.is_active == True
    ).first()

    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")

    rw = _get_reward_wallet(db, int(current_user.id))
    points = int(rw.total_points or 0)
    required_points = int(reward.points_required or 0)

    if points < required_points:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough points. Need {required_points}, you have {points}."
        )

    _clear_unused_redeem_tokens(db, int(current_user.id))

    token = _generate_short_redeem_token(db)

    row = RewardRedemptionToken(
        user_id=int(current_user.id),
        token=token,
        required_points=required_points,
        expires_at=NO_EXPIRY_TOKEN_PLACEHOLDER,
        is_used=False
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "user_id": int(current_user.id),
        "reward_id": int(reward.id),
        "reward_name": reward.name,
        "token": row.token,
        "qr_value": row.token,
        "expires_at": None,
        "has_expiry": False,
        "required_points": required_points,
        "message": "Redeem token generated successfully"
    }


@router.post("/redeem-qr/generate-for-customer")
def generate_redeem_qr_for_customer(
    payload: StaffRedeemTokenGenerateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "admin", "staff")),
):
    result = _find_customer_by_identifier(db, payload.q)
    user = result["user"]
    customer_profile = result["customer_profile"]

    rw = _get_reward_wallet(db, int(user.id))
    points = int(rw.total_points or 0)

    if points < REQUIRED_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough points. Need {REQUIRED_POINTS}, you have {points}."
        )

    row = _create_no_expiry_redeem_token(db, user)

    return {
        "user_id": int(user.id),
        "full_name": customer_profile.full_name if customer_profile else None,
        "email": getattr(user, "email", None),
        "token": row.token,
        "qr_value": row.token,
        "expires_at": None,
        "has_expiry": False,
        "required_points": REQUIRED_POINTS,
        "message": "Redeem token generated successfully for customer"
    }


@router.post("/redeem-qr/consume")
def consume_redeem_qr(
    qr_token: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "admin", "staff")),
):
    token = (qr_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="qr_token is required")

    row = db.query(RewardRedemptionToken).filter(
        RewardRedemptionToken.token == token
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Invalid token")

    if row.is_used:
        raise HTTPException(status_code=400, detail="Token already used")

    rw = _get_reward_wallet(db, row.user_id)
    required_points = int(getattr(row, "required_points", REQUIRED_POINTS) or REQUIRED_POINTS)
    current_points = int(rw.total_points or 0)

    if current_points < required_points:
        raise HTTPException(status_code=400, detail="Not enough points")

    rw.total_points = current_points - required_points
    row.is_used = True
    row.used_at = _utcnow()

    db.add(
        RewardTransaction(
            reward_wallet_id=rw.id,
            reward_id=None,
            order_id=None,
            points_change=-required_points,
            transaction_type="REDEEM"
        )
    )

    db.commit()

    return {
        "message": "Reward redeemed",
        "user_id": row.user_id,
        "remaining_points": int(rw.total_points or 0)
    }


# ======================
# INQUIRY
# ======================
@router.get("/inquiry")
def rewards_inquiry(
    q: str = Query(..., min_length=1, description="Email, wallet code, or user id"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    result = _find_customer_by_identifier(db, q)

    user = result["user"]
    wallet = result["wallet"]
    customer_profile = result["customer_profile"]
    reward_wallet = result["reward_wallet"]

    active_token = db.query(RewardRedemptionToken).filter(
        RewardRedemptionToken.user_id == user.id,
        RewardRedemptionToken.is_used == False
    ).order_by(RewardRedemptionToken.id.desc()).first()

    return {
        "user_id": user.id,
        "full_name": customer_profile.full_name if customer_profile else None,
        "email": user.email,
        "wallet_code": getattr(wallet, "wallet_code", None) if wallet else None,
        "reward_points": int(reward_wallet.total_points or 0) if reward_wallet else 0,
        "wallet_balance": float(wallet.balance or 0) if wallet else 0.0,
        "is_active": bool(getattr(user, "is_active", True)),
        "has_active_redeem_token": bool(active_token),
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

    resolved_order_id = None
    claim_points = None

    if payload.order_reference:
        resolved_order_id = _resolve_order_id(payload.order_reference)
        order = _get_order_for_claim(db, resolved_order_id)
        _ensure_claim_user_matches_order(user, order)
        claim_points = int(getattr(order, "earned_points", 0) or 0)

    last = db.query(RewardManualOTP).filter(
        RewardManualOTP.user_id == user.id
    ).order_by(RewardManualOTP.id.desc()).first()

    elapsed = MANUAL_OTP_REQUEST_COOLDOWN_SECONDS + 1
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

    if sent:
        return {
            "message": "OTP sent to email",
            "email": str(payload.email),
            "order_id": resolved_order_id,
            "display_id": _format_order_display_id(resolved_order_id) if resolved_order_id else None,
            "claim_points": claim_points,
            "expires_at": str(row.expires_at)
        }

    return {
        "message": "OTP generated (DEV MODE - SMTP disabled)",
        "email": str(payload.email),
        "order_id": resolved_order_id,
        "display_id": _format_order_display_id(resolved_order_id) if resolved_order_id else None,
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

    staff_role = _get_user_role_name(db, staff_user)
    if staff_role not in {"admin", "staff", "cashier"}:
        db.commit()
        raise HTTPException(status_code=403, detail="Staff/Admin/Cashier only for manual point adjustments")

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