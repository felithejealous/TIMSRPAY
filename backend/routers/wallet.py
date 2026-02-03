from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from decimal import Decimal
import os
import hashlib
import hmac

from database import SessionLocal
from models import Wallet, WalletTransaction, Order, User

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
# PBKDF2 PIN HASH HELPERS (NO PASSLIB/BCRYPT)
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
# GUARDS (TEMP via X-Role)
# -----------------------
def require_staff_cashier_admin(
    x_role: str = Header(default="", alias="X-Role", description="staff | cashier | admin")
):
    role = (x_role or "").strip().lower()
    if role not in {"staff", "cashier", "admin"}:
        raise HTTPException(status_code=403, detail="Staff/Cashier/Admin only (set header X-Role)")
    return role


# -----------------------
# SCHEMAS
# -----------------------
class WalletTopUp(BaseModel):
    user_id: int
    amount: Decimal

class WalletSetPin(BaseModel):
    user_id: int
    pin: str = Field(min_length=4, max_length=6)

class WalletVerifyPin(BaseModel):
    email: EmailStr
    pin: str = Field(min_length=4, max_length=6)

class WalletPayByEmail(BaseModel):
    email: EmailStr
    pin: str = Field(min_length=4, max_length=6)
    order_id: int


# -----------------------
# HELPERS
# -----------------------
def _get_user_by_email(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def _get_user_by_id(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def _get_wallet_by_user_id(db: Session, user_id: int) -> Wallet:
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet

def _validate_pin_format(pin: str):
    pin = (pin or "").strip()
    if not pin.isdigit() or not (4 <= len(pin) <= 6):
        raise HTTPException(status_code=400, detail="PIN must be 4-6 digits")
    return pin

def _verify_wallet_pin(wallet: Wallet, pin: str):
    pin = _validate_pin_format(pin)

    if not getattr(wallet, "pin_hash", None):
        raise HTTPException(status_code=400, detail="Wallet PIN not set")

    if not verify_pin(pin, wallet.pin_hash):
        raise HTTPException(status_code=401, detail="Invalid PIN")


# -----------------------
# SET PIN (USER SETUP)
# -----------------------
@router.post("/set-pin")
def set_pin(payload: WalletSetPin, db: Session = Depends(get_db)):
    pin = _validate_pin_format(payload.pin)

    user = _get_user_by_id(db, payload.user_id)
    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(status_code=400, detail="User is inactive")

    wallet = _get_wallet_by_user_id(db, payload.user_id)

    wallet.pin_hash = hash_pin(pin)
    db.commit()
    db.refresh(wallet)

    return {"message": "PIN set successfully", "user_id": user.id}


# -----------------------
# VERIFY PIN (KIOSK CAN CALL BEFORE PAY)
# -----------------------
@router.post("/verify-pin")
def verify_user_pin(payload: WalletVerifyPin, db: Session = Depends(get_db)):
    user = _get_user_by_email(db, payload.email)

    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(status_code=400, detail="User is inactive")

    wallet = _get_wallet_by_user_id(db, user.id)

    _verify_wallet_pin(wallet, payload.pin)

    return {"verified": True, "user_id": user.id, "wallet_id": wallet.id}


# -----------------------
# TOP-UP (STAFF/CASHIER/ADMIN)
# -----------------------
@router.post("/topup")
def top_up(
    payload: WalletTopUp,
    db: Session = Depends(get_db),
    _: str = Depends(require_staff_cashier_admin),
):
    amt = Decimal(str(payload.amount)) if payload.amount is not None else Decimal("0")
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")

    user = _get_user_by_id(db, payload.user_id)
    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(status_code=400, detail="Cannot top-up inactive user")

    wallet = _get_wallet_by_user_id(db, payload.user_id)

    wallet.balance = Decimal(str(wallet.balance)) + amt

    db.add(WalletTransaction(
        wallet_id=wallet.id,
        amount=amt,
        transaction_type="TOPUP"
    ))

    db.commit()
    db.refresh(wallet)

    return {
        "message": "Top-up successful",
        "user_id": user.id,
        "balance": float(wallet.balance)
    }


# -----------------------
# PAY USING TEO PAY (EMAIL + PIN)
# -----------------------
@router.post("/pay")
def pay_with_wallet(payload: WalletPayByEmail, db: Session = Depends(get_db)):
    user = _get_user_by_email(db, payload.email)

    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(status_code=400, detail="User is inactive")

    wallet = _get_wallet_by_user_id(db, user.id)
    _verify_wallet_pin(wallet, payload.pin)

    order = db.query(Order).filter(Order.id == payload.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Block if already paid
    if (order.status or "").lower() == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    total = Decimal(str(order.total_amount))
    bal = Decimal(str(wallet.balance))

    if bal < total:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")

    wallet.balance = bal - total
    order.status = "paid"

    db.add(WalletTransaction(
        wallet_id=wallet.id,
        order_id=order.id,
        amount=total,
        transaction_type="PAYMENT"
    ))

    db.commit()
    db.refresh(wallet)

    return {
        "message": "Payment successful",
        "order_id": order.id,
        "user_id": user.id,
        "remaining_balance": float(wallet.balance)
    }
