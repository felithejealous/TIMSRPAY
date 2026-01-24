from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Wallet, WalletTransaction, Order
from pydantic import BaseModel
from decimal import Decimal

router = APIRouter(prefix="/wallet", tags=["TeoPay"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -----------------------
# SCHEMAS
# -----------------------
class WalletTopUp(BaseModel):
    user_id: int
    amount: float


class WalletPay(BaseModel):
    user_id: int
    order_id: int


# -----------------------
# TOP-UP (CASHIER)
# -----------------------
@router.post("/topup")
def top_up(payload: WalletTopUp, db: Session = Depends(get_db)):
    if payload.amount <= 0:
        raise HTTPException(400, "Amount must be > 0")

    wallet = db.query(Wallet).filter(Wallet.user_id == payload.user_id).first()
    if not wallet:
        raise HTTPException(404, "Wallet not found")

    topup_amount = Decimal(str(payload.amount))

    wallet.balance += Decimal(str(payload.amount))


    db.add(WalletTransaction(
        wallet_id=wallet.id,
        amount=payload.amount,
        transaction_type="TOPUP"
    ))

    db.commit()
    db.refresh(wallet)

    return {
        "message": "Top-up successful",
        "balance": float(wallet.balance)
    }


# -----------------------
# PAY USING TEO PAY
# -----------------------
@router.post("/pay")
def pay_with_wallet(payload: WalletPay, db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.user_id == payload.user_id).first()
    if not wallet:
        raise HTTPException(404, "Wallet not found")

    order = db.query(Order).filter(Order.id == payload.order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    if wallet.balance < order.total_amount:
        raise HTTPException(400, "Insufficient wallet balance")

    wallet.balance -= order.total_amount
    order.status = "paid"

    db.add(WalletTransaction(
        wallet_id=wallet.id,
        order_id=order.id,
        amount=-order.total_amount,
        transaction_type="PAYMENT"
    ))

    db.commit()

    return {
        "message": "Payment successful",
        "remaining_balance": float(wallet.balance)
    }
