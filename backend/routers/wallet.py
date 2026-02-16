from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from pydantic import BaseModel, Field
from decimal import Decimal
import os
import hashlib
import hmac

from backend.security import get_current_user
from backend.database import SessionLocal
from backend.models import Wallet, WalletTransaction, Order, User


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
# ROLE GUARD (JWT-based)
# expects get_current_user to attach role_name
# -----------------------
def require_cashier_or_admin(current_user: User = Depends(get_current_user)):
    role = (getattr(current_user, "role_name", "") or "").strip().lower()
    if role not in {"cashier", "admin"}:
        raise HTTPException(status_code=403, detail="Cashier/Admin only")
    return current_user


# -----------------------
# SCHEMAS
# -----------------------
class WalletTopUp(BaseModel):
    user_id: int
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


def _apply_idempotency(tx_obj, idem_key: str | None):
    """
    Optional: if your WalletTransaction model already has idempotency_key column,
    we will store it. If not, ignore safely.
    """
    if not idem_key:
        return
    if hasattr(tx_obj, "idempotency_key"):
        setattr(tx_obj, "idempotency_key", idem_key)


def _idempotency_already_used(db: Session, wallet_id: int, idem_key: str | None) -> bool:
    """
    Works only if WalletTransaction has idempotency_key column.
    If no column, we skip idempotency (still safe via row locks, but not perfect for retries).
    """
    if not idem_key:
        return False
    if not hasattr(WalletTransaction, "idempotency_key"):
        return False
    existing = db.query(WalletTransaction).filter(
        WalletTransaction.wallet_id == wallet_id,
        WalletTransaction.idempotency_key == idem_key
    ).first()
    return bool(existing)


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

    # transactional
    with db.begin():
        wallet = _get_wallet_by_user_id(db, current_user.id)
        wallet.pin_hash = hash_pin(_validate_pin(payload.pin))

    db.refresh(wallet)
    return {"message": "PIN set successfully", "user_id": current_user.id}


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
    _verify_wallet_pin(wallet, payload.pin)

    return {"verified": True, "user_id": current_user.id, "wallet_id": wallet.id}


# -----------------------
# TOP-UP (CASHIER/ADMIN ONLY) — TRANSACTION SAFE
# optional Idempotency-Key header to prevent double-submit
# -----------------------
@router.post("/topup")
def top_up(
    payload: WalletTopUp,
    db: Session = Depends(get_db),
    _: User = Depends(require_cashier_or_admin),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    amt = _decimal_amt(payload.amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")

    user = _get_user_by_id(db, payload.user_id)
    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(status_code=400, detail="Cannot top-up inactive user")

    with db.begin():
        # lock wallet row
        wallet = (
            db.query(Wallet)
            .filter(Wallet.user_id == payload.user_id)
            .with_for_update()
            .first()
        )
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")

        # idempotency check (only if column exists)
        if _idempotency_already_used(db, wallet.id, (idempotency_key or "").strip() or None):
            # no changes; return current balance
            return {
                "message": "Top-up already processed (idempotent)",
                "user_id": user.id,
                "balance": float(wallet.balance or 0),
            }

        bal = _decimal_amt(wallet.balance or 0)
        wallet.balance = bal + amt

        tx = WalletTransaction(
            wallet_id=wallet.id,
            amount=amt,
            transaction_type="TOPUP",
        )
        _apply_idempotency(tx, (idempotency_key or "").strip() or None)
        db.add(tx)

    db.refresh(wallet)
    return {"message": "Top-up successful", "user_id": user.id, "balance": float(wallet.balance)}


# -----------------------
# PAY (SELF ONLY) + must own the order — TRANSACTION SAFE
# optional Idempotency-Key header to prevent double-submit
# -----------------------
@router.post("/pay")
def pay_with_wallet(
    payload: WalletPay,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if not bool(getattr(current_user, "is_active", True)):
        raise HTTPException(status_code=400, detail="User is inactive")

    with db.begin():
        # lock wallet
        wallet = (
            db.query(Wallet)
            .filter(Wallet.user_id == current_user.id)
            .with_for_update()
            .first()
        )
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")

        _verify_wallet_pin(wallet, payload.pin)

        # idempotency check (only if column exists)
        if _idempotency_already_used(db, wallet.id, (idempotency_key or "").strip() or None):
            return {
                "message": "Payment already processed (idempotent)",
                "order_id": payload.order_id,
                "user_id": current_user.id,
                "remaining_balance": float(wallet.balance or 0),
            }

        # lock order too
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

        # apply changes atomically
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
    bal = float(w.balance or 0) if w else 0.0
    return {"user_id": current_user.id, "balance": bal}
