from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets
import smtplib
from email.message import EmailMessage
from pydantic import BaseModel, EmailStr, Field

from database import SessionLocal
from models import User, Wallet, RewardWallet, Role, PasswordResetToken

router = APIRouter(prefix="/auth", tags=["Auth"])

# -----------------------
# DB DEP
# -----------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -----------------------
# PASSWORD HASH
# -----------------------
def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

def verify_password(pw: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False
    return hmac.compare_digest(hash_password(pw), stored_hash)

# -----------------------
# ROLE HELPERS
# -----------------------
def _get_role_id(db: Session, role_name: str) -> int:
    r = db.query(Role).filter(Role.name.ilike(role_name)).first()
    if not r:
        raise HTTPException(status_code=500, detail=f"Role '{role_name}' not found")
    return r.id

# -----------------------
# TIME HELPERS (FIX)
# -----------------------
def _utcnow():
    # ALWAYS timezone-aware UTC
    return datetime.now(timezone.utc)

def _as_utc(dt: datetime):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

# -----------------------
# EMAIL SENDER
# -----------------------
def _send_email(to_email: str, subject: str, body: str):
    enabled = (os.getenv("SMTP_ENABLED", "false").lower() == "true")
    if not enabled:
        return False

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    pw = os.getenv("SMTP_PASS", "")
    from_addr = os.getenv("SMTP_FROM", user)

    if not user or not pw:
        raise HTTPException(status_code=500, detail="SMTP credentials not set")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP(host, port) as smtp:
            smtp.starttls()
            smtp.login(user, pw)
            smtp.send_message(msg)
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMTP send failed: {e}")

# -----------------------
# TOKEN HASH (PBKDF2)
# -----------------------
TOKEN_ITERS = 120_000

def _hash_token(token: str, salt: bytes) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", token.encode(), salt, TOKEN_ITERS, dklen=32)
    return f"pbkdf2_sha256${TOKEN_ITERS}${salt.hex()}${dk.hex()}"

def _verify_token(token: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
        dk = hashlib.pbkdf2_hmac("sha256", token.encode(), salt, int(iters), dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False

# -----------------------
# SCHEMAS
# -----------------------
class ForgotPasswordConfirmPayload(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8)

# ============================================================
# REGISTER
# ============================================================
@router.post("/register")
def register_user(email: str, password: str, db: Session = Depends(get_db)):
    email = email.strip().lower()

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    role_id = _get_role_id(db, "customer")

    user = User(
        email=email,
        password_hash=hash_password(password),
        role_id=role_id,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Wallet(user_id=user.id, balance=0))
    db.add(RewardWallet(user_id=user.id, total_points=0))
    db.commit()

    return {"user_id": user.id}

# ============================================================
# LOGIN
# ============================================================
@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    email = email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"user_id": user.id, "email": user.email}

# ============================================================
# FORGOT PASSWORD - REQUEST (6 DIGIT CODE)
# ============================================================
RESET_TTL_SECONDS = 15 * 60
RESET_MAX_ATTEMPTS = 3

@router.post("/forgot-password/request")
def forgot_password_request(email: str, db: Session = Depends(get_db)):
    email = email.strip().lower()

    generic = {"message": "If the email exists, a reset code was sent."}

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return generic

    # invalidate old tokens
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.is_used == False
    ).delete(synchronize_session=False)

    code = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_bytes(16)

    row = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(code, salt),
        expires_at=_utcnow() + timedelta(seconds=RESET_TTL_SECONDS),
        attempts=0,
        is_used=False
    )
    db.add(row)
    db.commit()

    sent = _send_email(
        email,
        "TIMSRPAY Password Reset Code",
        f"Your reset code is: {code}\n\nExpires in 15 minutes."
    )

    if not sent:
        return {"message": "DEV MODE", "code_dev": code}

    return generic

# ============================================================
# FORGOT PASSWORD - CONFIRM
# ============================================================
@router.post("/forgot-password/confirm")
def forgot_password_confirm(payload: ForgotPasswordConfirmPayload, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    code = payload.code.strip()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid code or email")

    row = db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.is_used == False
    ).order_by(PasswordResetToken.id.desc()).first()

    if not row:
        raise HTTPException(status_code=400, detail="No active reset code")

    if _utcnow() > _as_utc(row.expires_at):
        row.is_used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Reset code expired")

    if row.attempts >= RESET_MAX_ATTEMPTS:
        row.is_used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts")

    if not _verify_token(code, row.token_hash):
        row.attempts += 1
        if row.attempts >= RESET_MAX_ATTEMPTS:
            row.is_used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid code")

    row.is_used = True
    user.password_hash = hash_password(payload.new_password)
    db.commit()

    return {"message": "Password reset successful"}
