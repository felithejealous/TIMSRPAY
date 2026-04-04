from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel, Field
from decimal import Decimal
import os
import hashlib
import hmac
import secrets
import string
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from backend.security import get_current_user, require_roles
from backend.database import SessionLocal
from backend.models import Wallet, WalletTransaction, Order, User, CustomerProfile, WalletPinResetToken
from backend.routers.notification import create_customer_notification

router = APIRouter(prefix="/wallet", tags=["TeoPay"])


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
# PBKDF2 PIN HASH HELPERS
# -----------------------
PBKDF2_ITERS = 120_000


def hash_pin(pin: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, PBKDF2_ITERS, dklen=32)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, iters, dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


# -----------------------
# SCHEMAS
# -----------------------
class WalletTopUp(BaseModel):
    user_id: int | None = None
    email: str | None = None
    wallet_code: str | None = None
    amount: Decimal


class WalletSetPin(BaseModel):
    pin: str = Field(min_length=4, max_length=6)


class WalletVerifyPin(BaseModel):
    pin: str = Field(min_length=4, max_length=6)


class WalletPay(BaseModel):
    pin: str = Field(min_length=4, max_length=6)
    order_id: int


# -----------------------
# HELPERS
# -----------------------
def _generate_wallet_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _generate_unique_wallet_code(db: Session) -> str:
    while True:
        code = _generate_wallet_code(6)
        exists = db.query(Wallet).filter(Wallet.wallet_code == code).first()
        if not exists:
            return code


def _ensure_wallet_code(db: Session, wallet: Wallet) -> str:
    existing = (getattr(wallet, "wallet_code", None) or "").strip().upper()
    if existing:
        if wallet.wallet_code != existing:
            wallet.wallet_code = existing
            db.commit()
            db.refresh(wallet)
        return existing

    new_code = _generate_unique_wallet_code(db)
    wallet.wallet_code = new_code
    db.commit()
    db.refresh(wallet)
    return new_code


def _get_wallet_by_user_id(db: Session, user_id: int) -> Wallet:
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


def _get_user_by_id(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _validate_pin(pin: str) -> str:
    pin = (pin or "").strip()
    if not pin.isdigit() or not (4 <= len(pin) <= 6):
        raise HTTPException(status_code=400, detail="PIN must be 4-6 digits")
    return pin


def _verify_wallet_pin(wallet: Wallet, pin: str):
    pin = _validate_pin(pin)
    if not getattr(wallet, "pin_hash", None):
        raise HTTPException(status_code=400, detail="Wallet PIN not set")
    if not verify_pin(pin, wallet.pin_hash):
        raise HTTPException(status_code=401, detail="Invalid PIN")


def _decimal_amt(x) -> Decimal:
    try:
        d = Decimal(str(x))
    except Exception:
        d = Decimal("0")
    return d


def _apply_idempotency(tx_obj, idem_key):
    if not idem_key:
        return
    if hasattr(tx_obj, "idempotency_key"):
        setattr(tx_obj, "idempotency_key", idem_key)


def _idempotency_already_used(db: Session, wallet_id: int, idem_key):
    if not idem_key:
        return False
    if not hasattr(WalletTransaction, "idempotency_key"):
        return False
    existing = db.query(WalletTransaction).filter(
        WalletTransaction.wallet_id == wallet_id,
        WalletTransaction.idempotency_key == idem_key
    ).first()
    return bool(existing)


def _resolve_wallet_for_topup(
    db: Session,
    user_id: int | None,
    email: str | None,
    wallet_code: str | None,
):
    provided = [
        bool(user_id),
        bool((email or "").strip()),
        bool((wallet_code or "").strip()),
    ]

    if sum(provided) != 1:
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one identifier: user_id OR email OR wallet_code"
        )

    user = None
    wallet = None

    if user_id:
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()

    elif (email or "").strip():
        email_clean = email.strip().lower()
        user = db.query(User).filter(User.email == email_clean).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()

    else:
        code_clean = (wallet_code or "").strip().upper()
        wallet = db.query(Wallet).filter(Wallet.wallet_code == code_clean).first()
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        user = db.query(User).filter(User.id == wallet.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    _ensure_wallet_code(db, wallet)
    return user, wallet

# -----------------------
# RESET TOKEN HASH
# -----------------------
TOKEN_ITERS = 120_000
PIN_RESET_TTL_SECONDS = 15*60
PIN_RESET_COOLDOWN_SECONDS = 60
PIN_RESET_MAX_ATTEMPTS = 5

def _utcnow():
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _hash_token(token_str: str, salt: bytes) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", token_str.encode(), salt, TOKEN_ITERS, dklen=32)
    return f"pbkdf2_sha256${TOKEN_ITERS}${salt.hex()}${dk.hex()}"


def _verify_token(token_str: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False

        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)

        dk = hashlib.pbkdf2_hmac(
            "sha256",
            token_str.encode(),
            salt,
            int(iters),
            dklen=len(expected)
        )
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False

def _get_latest_pin_reset_token(db: Session, user_id: int):
    return (
        db.query(WalletPinResetToken)
        .filter(WalletPinResetToken.user_id == user_id)
        .order_by(WalletPinResetToken.id.desc())
        .first()
    )


def _seconds_until_pin_reset_request_allowed(db: Session, user_id: int) -> int:
    latest = _get_latest_pin_reset_token(db, user_id)
    if not latest or not latest.created_at:
        return 0

    created_at_utc = _as_utc(latest.created_at)
    now_utc = _utcnow()

    elapsed = (now_utc - created_at_utc).total_seconds()
    remaining = int(PIN_RESET_COOLDOWN_SECONDS - elapsed)

    return max(0, remaining)


def _ensure_new_pin_is_not_same_as_current(wallet: Wallet, new_pin: str):
    if getattr(wallet, "pin_hash", None) and verify_pin(new_pin, wallet.pin_hash):
        raise HTTPException(
            status_code=400,
            detail="New PIN must be different from your current PIN"
        )
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


class WalletForgotPinRequest(BaseModel):
    email: str


class WalletForgotPinConfirm(BaseModel):
    email: str
    code: str = Field(min_length=6, max_length=6)
    new_pin: str = Field(min_length=4, max_length=6)
# -----------------------
# SET PIN (SELF ONLY)
# -----------------------
@router.post("/set-pin")
def set_pin(
    payload: WalletSetPin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not bool(getattr(current_user, "is_active", True)):
        raise HTTPException(status_code=400, detail="User is inactive")

    wallet = _get_wallet_by_user_id(db, current_user.id)
    _ensure_wallet_code(db, wallet)

    new_pin = _validate_pin(payload.pin)
    _ensure_new_pin_is_not_same_as_current(wallet, new_pin)

    wallet.pin_hash = hash_pin(new_pin)
    db.commit()
    db.refresh(wallet)

    return {
        "message": "PIN set successfully",
        "user_id": current_user.id,
        "wallet_code": getattr(wallet, "wallet_code", None),
    }
# -----------------------
# VERIFY PIN (SELF ONLY)
# -----------------------
@router.post("/verify-pin")
def verify_my_pin(
    payload: WalletVerifyPin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not bool(getattr(current_user, "is_active", True)):
        raise HTTPException(status_code=400, detail="User is inactive")

    wallet = _get_wallet_by_user_id(db, current_user.id)
    _ensure_wallet_code(db, wallet)
    _verify_wallet_pin(wallet, payload.pin)

    return {
        "verified": True,
        "user_id": current_user.id,
        "wallet_id": wallet.id,
        "wallet_code": getattr(wallet, "wallet_code", None),
    }
#---------------
#_-------------VERIFY PIN
#---------
# -----------------------
# PIN STATUS (SELF ONLY)
# -----------------------
@router.get("/pin-status")
def get_pin_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = _get_wallet_by_user_id(db, current_user.id)
    _ensure_wallet_code(db, wallet)

    return {
        "has_pin": bool(getattr(wallet, "pin_hash", None))
    }

# -----------------------
# FORGOT PIN REQUEST (SELF ONLY)
# -----------------------
@router.post("/forgot-pin/request")
def forgot_pin_request(
    payload: WalletForgotPinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    email = (payload.email or "").strip().lower()
    current_email = (getattr(current_user, "email", "") or "").strip().lower()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    if email != current_email:
        raise HTTPException(status_code=403, detail="Email does not match your account")

    wallet = _get_wallet_by_user_id(db, current_user.id)
    _ensure_wallet_code(db, wallet)

    seconds_left = _seconds_until_pin_reset_request_allowed(db, current_user.id)
    if seconds_left > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {seconds_left} second(s) before requesting another code"
        )

    db.query(WalletPinResetToken).filter(
        WalletPinResetToken.user_id == current_user.id,
        WalletPinResetToken.is_used == False
    ).update(
        {
            WalletPinResetToken.is_used: True,
            WalletPinResetToken.used_at: datetime.utcnow(),
        },
        synchronize_session=False
    )

    code = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_bytes(16)

    row = WalletPinResetToken(
        user_id=current_user.id,
        token_hash=_hash_token(code, salt),
        expires_at=_utcnow() + timedelta(seconds=PIN_RESET_TTL_SECONDS),
        attempts=0,
        is_used=False
    )
    db.add(row)
    db.commit()

    sent = _send_email(
        email,
        "TIMSRPAY Wallet PIN Reset Code",
        f"Your wallet PIN reset code is: {code}\n\nThis code will expire in 15 minutes."
    )

    if not sent:
        return {
            "message": "DEV MODE",
            "code_dev": code,
            "cooldown_seconds": PIN_RESET_COOLDOWN_SECONDS
        }

    return {
        "message": "Wallet PIN reset code sent successfully",
        "cooldown_seconds": PIN_RESET_COOLDOWN_SECONDS
    }
# -----------------------
# FORGOT PIN CONFIRM (SELF ONLY)
# -----------------------
@router.post("/forgot-pin/confirm")
def forgot_pin_confirm(
    payload: WalletForgotPinConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()
    new_pin = _validate_pin(payload.new_pin)

    current_email = (getattr(current_user, "email", "") or "").strip().lower()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    if email != current_email:
        raise HTTPException(status_code=403, detail="Email does not match your account")

    wallet = _get_wallet_by_user_id(db, current_user.id)
    _ensure_wallet_code(db, wallet)
    _ensure_new_pin_is_not_same_as_current(wallet, new_pin)

    row = (
        db.query(WalletPinResetToken)
        .filter(
            WalletPinResetToken.user_id == current_user.id,
            WalletPinResetToken.is_used == False
        )
        .order_by(WalletPinResetToken.id.desc())
        .first()
    )

    if not row:
        raise HTTPException(status_code=400, detail="No active PIN reset code")

    if _utcnow() > _as_utc(row.expires_at):
        row.is_used = True
        row.used_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="PIN reset code expired")

    if int(row.attempts or 0) >= PIN_RESET_MAX_ATTEMPTS:
        row.is_used = True
        row.used_at = datetime.utcnow()
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many invalid attempts. Please request a new code"
        )

    if not _verify_token(code, row.token_hash):
        row.attempts = int(row.attempts or 0) + 1

        remaining_attempts = PIN_RESET_MAX_ATTEMPTS - int(row.attempts)

        if int(row.attempts) >= PIN_RESET_MAX_ATTEMPTS:
            row.is_used = True
            row.used_at = datetime.utcnow()
            db.commit()
            raise HTTPException(
                status_code=400,
                detail="Too many invalid attempts. Please request a new code"
            )

        db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"Invalid code. {remaining_attempts} attempt(s) remaining"
        )

    wallet.pin_hash = hash_pin(new_pin)
    row.is_used = True
    row.used_at = datetime.utcnow()

    db.commit()
    db.refresh(wallet)

    return {
        "message": "Wallet PIN reset successful",
        "user_id": current_user.id,
        "wallet_code": getattr(wallet, "wallet_code", None),
    }
# -----------------------
# LOOKUP WALLET USERS (STAFF/CASHIER/ADMIN)
# search by wallet_code or email or full_name
# -----------------------
@router.get("/lookup")
def lookup_wallet_users(
    q: str = Query(default="", min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    search = f"%{q.strip()}%"

    rows = (
        db.query(User, Wallet, CustomerProfile)
        .join(Wallet, Wallet.user_id == User.id)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == User.id)
        .filter(
            or_(
                User.email.ilike(search),
                Wallet.wallet_code.ilike(search),
                CustomerProfile.full_name.ilike(search),
            )
        )
        .order_by(User.id.desc())
        .limit(limit)
        .all()
    )

    data = []
    changed = False

    for user, wallet, customer_profile in rows:
        if wallet and not (getattr(wallet, "wallet_code", None) or "").strip():
            wallet.wallet_code = _generate_unique_wallet_code(db)
            changed = True

        data.append({
            "user_id": user.id,
            "email": user.email,
            "full_name": customer_profile.full_name if customer_profile else None,
            "wallet_code": getattr(wallet, "wallet_code", None),
            "balance": float(wallet.balance or 0),
            "is_active": bool(getattr(user, "is_active", True)),
        })

    if changed:
        db.commit()

    return {
        "count": len(data),
        "data": data,
    }


# -----------------------
# TOP-UP (CASHIER/ADMIN ONLY)
# accepts user_id OR email OR wallet_code
# -----------------------
@router.post("/topup")
def top_up(
    payload: WalletTopUp,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "admin","staff")),
    idempotency_key: str = Header(default=None, alias="Idempotency-Key"),
):
    try:
        amt = _decimal_amt(payload.amount)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Amount must be > 0")

        user, wallet = _resolve_wallet_for_topup(
            db=db,
            user_id=payload.user_id,
            email=payload.email,
            wallet_code=payload.wallet_code,
        )

        if not bool(getattr(user, "is_active", True)):
            raise HTTPException(status_code=400, detail="Cannot top-up inactive user")

        wallet = (
            db.query(Wallet)
            .filter(Wallet.id == wallet.id)
            .with_for_update()
            .first()
        )
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")

        _ensure_wallet_code(db, wallet)

        idem_key = (idempotency_key or "").strip() or None
        if _idempotency_already_used(db, wallet.id, idem_key):
            return {
                "message": "Top-up already processed (idempotent)",
                "user_id": user.id,
                "email": user.email,
                "wallet_code": getattr(wallet, "wallet_code", None),
                "balance": float(wallet.balance or 0),
            }

        bal = _decimal_amt(wallet.balance or 0)
        wallet.balance = bal + amt

        tx = WalletTransaction(
            wallet_id=wallet.id,
            amount=amt,
            transaction_type="TOPUP",
        )
        _apply_idempotency(tx, idem_key)
        db.add(tx)

        db.commit()
        db.refresh(wallet)

        create_customer_notification(
            db,
            user_id=user.id,
            title="Wallet top-up successful",
            message=f"₱{amt:.2f} has been added to your TeoPay wallet.",
            notif_type="wallet",
            priority="important",
            is_sticky=True,
            action_url="topup.html",
            reference_type="wallet",
            reference_id=wallet.id,
        )

        return {
            "message": "Top-up successful",
            "user_id": user.id,
            "email": user.email,
            "wallet_code": getattr(wallet, "wallet_code", None),
            "balance": float(wallet.balance),
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Top-up failed: {str(e)}")
# -----------------------
# BACKFILL WALLET CODES (ADMIN ONLY)
# for old wallets with null/empty wallet_code
# -----------------------
@router.post("/backfill-codes")
def backfill_wallet_codes(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    wallets = db.query(Wallet).all()
    updated = 0

    for wallet in wallets:
        current = (getattr(wallet, "wallet_code", None) or "").strip().upper()
        if not current:
            wallet.wallet_code = _generate_unique_wallet_code(db)
            updated += 1
        else:
            wallet.wallet_code = current

    db.commit()

    return {
        "message": "Wallet code backfill completed",
        "updated_count": updated,
    }


# -----------------------
# PAY (SELF ONLY)
# -----------------------
@router.post("/pay")
def pay_with_wallet(
    payload: WalletPay,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: str = Header(default=None, alias="Idempotency-Key"),
):
    if not bool(getattr(current_user, "is_active", True)):
        raise HTTPException(status_code=400, detail="User is inactive")

    with db.begin():
        wallet = (
            db.query(Wallet)
            .filter(Wallet.user_id == current_user.id)
            .with_for_update()
            .first()
        )
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")

        if not (getattr(wallet, "wallet_code", None) or "").strip():
            wallet.wallet_code = _generate_unique_wallet_code(db)

        _verify_wallet_pin(wallet, payload.pin)

        if _idempotency_already_used(db, wallet.id, (idempotency_key or "").strip() or None):
            return {
                "message": "Payment already processed (idempotent)",
                "order_id": payload.order_id,
                "user_id": current_user.id,
                "wallet_code": getattr(wallet, "wallet_code", None),
                "remaining_balance": float(wallet.balance or 0),
            }

        order = (
            db.query(Order)
            .filter(Order.id == int(payload.order_id))
            .with_for_update()
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if int(getattr(order, "user_id", 0) or 0) != int(current_user.id):
            raise HTTPException(status_code=403, detail="You can only pay your own orders")

        if (getattr(order, "status", "") or "").lower() == "paid":
            raise HTTPException(status_code=400, detail="Order already paid")

        total = _decimal_amt(getattr(order, "total_amount", 0) or 0)
        if total <= 0:
            raise HTTPException(status_code=400, detail="Order total invalid")

        bal = _decimal_amt(wallet.balance or 0)
        if bal < total:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")

        wallet.balance = bal - total
        order.status = "paid"

        tx = WalletTransaction(
            wallet_id=wallet.id,
            order_id=order.id,
            amount=total,
            transaction_type="PAYMENT",
        )
        _apply_idempotency(tx, (idempotency_key or "").strip() or None)
        db.add(tx)

    db.refresh(wallet)
    return {
        "message": "Payment successful",
        "order_id": int(payload.order_id),
        "user_id": current_user.id,
        "wallet_code": getattr(wallet, "wallet_code", None),
        "remaining_balance": float(wallet.balance),
    }


# -----------------------
# GET BALANCE (SELF ONLY)
# -----------------------
@router.get("/balance")
def get_my_wallet_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not w:
        return {
            "user_id": current_user.id,
            "wallet_code": None,
            "balance": 0.0,
        }

    if not (getattr(w, "wallet_code", None) or "").strip():
        w.wallet_code = _generate_unique_wallet_code(db)
        db.commit()
        db.refresh(w)

    bal = float(w.balance or 0)
    code = getattr(w, "wallet_code", None)

    return {
        "user_id": current_user.id,
        "wallet_code": code,
        "balance": bal,
    }

#-------------------------
#-----HISTORY OF TRANSACTIONS (SELF ONLY)------
#-------------------------
# -----------------------
# WALLET HISTORY (SELF ONLY)
# -----------------------
@router.get("/history")
def get_wallet_history(
    range: str = Query(default="month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()

    if not wallet:
        return {"transactions": []}

    from datetime import datetime, timedelta

    now = datetime.utcnow()

    if range == "today":
        since = now - timedelta(days=1)
    elif range == "week":
        since = now - timedelta(days=7)
    else:
        since = now - timedelta(days=30)

    rows = (
        db.query(WalletTransaction)
        .filter(
            WalletTransaction.wallet_id == wallet.id,
            WalletTransaction.created_at >= since,
            WalletTransaction.transaction_type == "TOPUP"
        )
        .order_by(WalletTransaction.created_at.desc())
        .all()
    )

    data = []

    for r in rows:
        data.append({
            "amount": float(r.amount),
            "type": r.transaction_type,
            "created_at": r.created_at
        })

    return {"transactions": data}