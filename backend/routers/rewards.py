from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib
import hmac
import os
import smtplib
from email.message import EmailMessage

from security import get_current_user, require_roles
from database import SessionLocal
from models import (
    User,
    Order,  # ✅ for order_id claim flow
    RewardWallet,
    RewardTransaction,
    RewardRedemptionToken,
    RewardManualOTP,
)

router = APIRouter(prefix="/rewards", tags=["Rewards"])

# =======================
# CONSTANTS
# =======================
REQUIRED_POINTS = 2800

QR_TOKEN_TTL_SECONDS = 120          # 2 minutes
MANUAL_OTP_TTL_SECONDS = 300        # 5 minutes
OTP_ITERS = 120_000

MANUAL_OTP_MAX_ATTEMPTS = 3
MANUAL_OTP_REQUEST_COOLDOWN_SECONDS = 60  # 1 request per minute per user

ORDER_POINTS_CLAIM_WINDOW_HOURS = 24


# =======================
# DB DEP
# =======================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =======================
# ROLE GUARD (legacy header guard — optional)
# NOTE: You already use JWT roles; this is kept only for legacy compatibility.
# =======================
def require_staff_or_admin(x_role: str = Header(default="", alias="X-Role")):
    role = (x_role or "").strip().lower()
    if role not in {"staff", "admin", "cashier"}:
        raise HTTPException(status_code=403, detail="Staff/Admin/Cashier only (set header X-Role)")
    return role


# =======================
# HELPERS
# =======================
def _utcnow():
    return datetime.now(timezone.utc)

def _as_utc(dt: datetime) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

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
        return False  # dev mode fallback

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


# =======================
# REQUEST BODIES (JSON)
# =======================
class ManualOTPRequest(BaseModel):
    email: EmailStr
    order_id: int = Field(gt=0)

class ManualOTPConfirm(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)

    # secured claim flow (recommended)
    order_id: Optional[int] = Field(default=None, gt=0)

    # legacy/manual override (admin only). If order_id is provided, points_to_add is ignored.
    points_to_add: Optional[int] = Field(default=None, gt=0)


# ============================================================
# 1) CUSTOMER — GENERATE REDEEM QR ✅ customer only
# IMPORTANT: DO NOT accept user_id from client (security).
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

    # Remove any previous unused tokens for this user
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


# ============================================================
# 2) CASHIER/ADMIN — CONSUME QR ✅ recommended for POS
# ============================================================
@router.post("/redeem-qr/consume")
def consume_redeem_qr(
    qr_token: str,
    db: Session = Depends(get_db),
    staff: User = Depends(require_roles("cashier", "admin")),
):
    token = (qr_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="qr_token is required")

    row = db.query(RewardRedemptionToken).filter(RewardRedemptionToken.token == token).first()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid token")

    if row.is_used:
        raise HTTPException(status_code=400, detail="Token already used")

    if row.expires_at and _utcnow() > row.expires_at:
        raise HTTPException(status_code=400, detail="Token expired")

    rw = _get_reward_wallet(db, row.user_id)
    if int(rw.total_points or 0) < REQUIRED_POINTS:
        raise HTTPException(status_code=400, detail="Not enough points")

    # NOTE: you currently reset to 0. If you want "minus 2800" instead, change logic here.
    rw.total_points = 0
    row.is_used = True
    row.used_at = _utcnow()

    db.add(RewardTransaction(
        reward_wallet_id=rw.id,
        reward_id=None,
        order_id=None,
        points_change=-REQUIRED_POINTS,
        transaction_type="REDEEM"
    ))

    db.commit()

    return {
        "message": "Reward redeemed",
        "user_id": row.user_id,
        "remaining_points": int(rw.total_points or 0)
    }


# ============================================================
# 3) STAFF/CASHIER/ADMIN — REQUEST MANUAL OTP (SECURED + HARDENED)
# ============================================================
@router.post("/manual/otp/request")
def request_manual_points_otp(
    payload: ManualOTPRequest,
    db: Session = Depends(get_db),
    staff_user: User = Depends(require_roles("staff", "admin", "cashier")),
):
    user = _get_user_by_email(db, str(payload.email))

    # Validate order claimability BEFORE sending OTP
    order = _get_order_for_claim(db, int(payload.order_id))

    # cooldown
    last = db.query(RewardManualOTP).filter(
        RewardManualOTP.user_id == user.id
    ).order_by(RewardManualOTP.id.desc()).first()

    if last and getattr(last, "created_at", None):
        elapsed = (_utcnow() - _as_utc(last.created_at)).total_seconds()
        if elapsed < MANUAL_OTP_REQUEST_COOLDOWN_SECONDS:
            return {
                "message": "If the account exists, an OTP was sent.",
                "email": str(payload.email),
                "order_id": int(payload.order_id),
            }

    # remove old unused OTPs
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
        expires_at=expires_at.replace(tzinfo=None),  # DB is timezone=False in your models
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
            "order_id": int(payload.order_id),
            "claim_points": claim_points,
            "expires_at": str(row.expires_at)
        }

    return {
        "message": "OTP generated (DEV MODE - SMTP disabled)",
        "email": str(payload.email),
        "order_id": int(payload.order_id),
        "claim_points": claim_points,
        "otp_dev": otp,
        "expires_at": str(row.expires_at)
    }


# ============================================================
# POINTS ENDPOINTS (customer self)
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
# 4) STAFF/CASHIER/ADMIN — CONFIRM OTP + CLAIM POINTS BY ORDER_ID (SECURED)
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

    # expired => auto invalidate
    if row.expires_at and _utcnow() > _as_utc(row.expires_at):
        row.is_used = True
        row.used_at = _utcnow().replace(tzinfo=None)
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired")

    # too many attempts => auto invalidate
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

    # success OTP
    row.is_used = True
    row.used_at = _utcnow().replace(tzinfo=None)
    row.last_attempt_at = _utcnow().replace(tzinfo=None)

    # ✅ SECURED CLAIM MODE (recommended)
    if payload.order_id:
        order = _get_order_for_claim(db, int(payload.order_id))

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
                "order_id": int(payload.order_id),
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
                "order_id": int(payload.order_id),
                "added_points": 0,
                "total_points": current
            }

        rw.total_points = capped_total

        db.add(RewardTransaction(
            reward_wallet_id=rw.id,
            reward_id=None,
            order_id=int(payload.order_id),
            points_change=int(actual_added),
            transaction_type="EARN"
        ))

        # mark the order as claimed/synced (anti double claim)
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
            "order_id": int(payload.order_id),
            "added_points": int(actual_added),
            "total_points": int(rw.total_points or 0)
        }

    # ✅ LEGACY MODE (admin only): manual points add without order_id
    if payload.points_to_add is None:
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="order_id is required for claim, or provide points_to_add for manual adjustment"
        )

    # ✅ ENFORCE admin-only for arbitrary point adjustment
    role_name = (getattr(staff_user, "role_name", "") or "").strip().lower()
    if role_name != "admin":
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
        db.add(RewardTransaction(
            reward_wallet_id=rw.id,
            reward_id=None,
            order_id=None,
            points_change=int(actual_added),
            transaction_type="EARN"
        ))

    db.commit()
    db.refresh(rw)

    return {
        "message": "Manual points added successfully",
        "user_id": user.id,
        "added_points": int(actual_added),
        "total_points": int(rw.total_points or 0)
    }
