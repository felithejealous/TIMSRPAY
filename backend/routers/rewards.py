from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import secrets
import hashlib
import hmac
import os
import smtplib
from email.message import EmailMessage

from database import SessionLocal
from models import (
    User,
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

# ✅ HARDENING
MANUAL_OTP_MAX_ATTEMPTS = 3
MANUAL_OTP_REQUEST_COOLDOWN_SECONDS = 60  # 1 request per minute per user


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
# ROLE GUARD
# =======================
def require_staff_or_admin(
    x_role: str = Header(default="", alias="X-Role")
):
    role = (x_role or "").strip().lower()
    if role not in {"staff", "admin", "cashier"}:
        raise HTTPException(
            status_code=403,
            detail="Staff/Admin/Cashier only (set header X-Role)"
        )
    return role


# =======================
# HELPERS
# =======================

def _utcnow():
    return datetime.now(timezone.utc)

def _as_utc(dt: datetime) -> datetime:
    """
    Normalize datetime from DB to timezone-aware UTC.
    - If dt is naive: assume UTC (common if DB column timezone=False)
    - If dt is aware: convert to UTC
    """
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
    """
    Returns True if sent, False if SMTP disabled.
    Raises HTTPException if enabled but misconfigured or sending fails.
    """
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


# =======================
# REQUEST BODIES (JSON)
# =======================
class ManualOTPRequest(BaseModel):
    email: EmailStr


class ManualOTPConfirm(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)
    points_to_add: int = Field(gt=0)


# ============================================================
# 1) CUSTOMER — GENERATE REDEEM QR
# ============================================================
@router.post("/redeem-qr/generate")
def generate_redeem_qr(
    user_id: int,
    db: Session = Depends(get_db),
):
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


# ============================================================
# 2) STAFF — CONSUME QR
# ============================================================
@router.post("/redeem-qr/consume")
def consume_redeem_qr(
    qr_token: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_staff_or_admin),
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

    if row.expires_at and _utcnow() > row.expires_at:
        raise HTTPException(status_code=400, detail="Token expired")

    rw = _get_reward_wallet(db, row.user_id)
    if int(rw.total_points or 0) < REQUIRED_POINTS:
        raise HTTPException(status_code=400, detail="Not enough points")

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
        "remaining_points": 0
    }


# ============================================================
# 3) STAFF — REQUEST MANUAL OTP (HARDENED)
# ============================================================
@router.post("/manual/otp/request")
def request_manual_points_otp(
    payload: ManualOTPRequest,
    db: Session = Depends(get_db),
    _: str = Depends(require_staff_or_admin),
):
    user = _get_user_by_email(db, str(payload.email))

    # ✅ cooldown (anti spam resend)
    last = db.query(RewardManualOTP).filter(
        RewardManualOTP.user_id == user.id
    ).order_by(RewardManualOTP.id.desc()).first()

    if last and getattr(last, "created_at", None):
        elapsed = (_utcnow() - last.created_at).total_seconds()
        if elapsed < MANUAL_OTP_REQUEST_COOLDOWN_SECONDS:
            # generic-ish response (avoid spam + no reveal)
            return {
                "message": "If the account exists, an OTP was sent.",
                "email": str(payload.email)
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
        expires_at=expires_at,
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
            "expires_at": str(row.expires_at)
        }

    return {
        "message": "OTP generated (DEV MODE - SMTP disabled)",
        "email": str(payload.email),
        "otp_dev": otp,
        "expires_at": str(row.expires_at)
    }


# ============================================================
# 4) STAFF — CONFIRM OTP + ADD POINTS (HARDENED)
# ============================================================
@router.post("/manual/otp/confirm")
def confirm_manual_points_otp(
    payload: ManualOTPConfirm,
    db: Session = Depends(get_db),
    _: str = Depends(require_staff_or_admin),
):
    user = _get_user_by_email(db, str(payload.email))

    row = db.query(RewardManualOTP).filter(
        RewardManualOTP.user_id == user.id,
        RewardManualOTP.is_used == False
    ).order_by(RewardManualOTP.id.desc()).first()

    if not row:
        raise HTTPException(status_code=404, detail="No active OTP found")

    # expired => auto invalidate
    if row.expires_at and _utcnow() > row.expires_at:
        row.is_used = True
        row.used_at = _utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired")

    # too many attempts => auto invalidate
    if int(getattr(row, "attempt_count", 0)) >= MANUAL_OTP_MAX_ATTEMPTS:
        row.is_used = True
        row.used_at = _utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts. Request a new OTP.")

    otp_clean = (payload.otp or "").strip()
    ok = _verify_otp(otp_clean, row.otp_hash)

    if not ok:
        row.attempt_count = int(getattr(row, "attempt_count", 0)) + 1
        row.last_attempt_at = _utcnow()

        # auto invalidate if max reached
        if row.attempt_count >= MANUAL_OTP_MAX_ATTEMPTS:
            row.is_used = True
            row.used_at = _utcnow()

        db.commit()

        if row.is_used:
            raise HTTPException(status_code=400, detail="Too many attempts. Request a new OTP.")
        raise HTTPException(status_code=401, detail="Invalid OTP")

    # success
    row.is_used = True
    row.used_at = _utcnow()
    row.last_attempt_at = _utcnow()

    rw = _get_reward_wallet(db, user.id)
    rw.total_points = int(rw.total_points or 0) + int(payload.points_to_add)

    db.add(RewardTransaction(
        reward_wallet_id=rw.id,
        reward_id=None,
        order_id=None,
        points_change=int(payload.points_to_add),
        transaction_type="EARN"
    ))

    db.commit()
    db.refresh(rw)

    return {
        "message": "Manual points added successfully",
        "user_id": user.id,
        "added_points": int(payload.points_to_add),
        "total_points": int(rw.total_points or 0)
    }
