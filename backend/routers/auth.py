from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Wallet, RewardWallet
from schemas import RegisterRequest, RegisterResponse

import hashlib

router = APIRouter(prefix="/auth", tags=["Auth"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(pw: str) -> str:
    # simple hash for now; later we’ll use bcrypt
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

@router.post("/register", response_model=RegisterResponse)
def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # auto-create TeoPay wallet + reward wallet
    wallet = Wallet(user_id=user.id, balance=0)
    reward_wallet = RewardWallet(user_id=user.id, total_points=0)

    db.add(wallet)
    db.add(reward_wallet)
    db.commit()

    return {"user_id": user.id, "email": user.email}
