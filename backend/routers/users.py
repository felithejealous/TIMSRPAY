from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from pydantic import BaseModel

from database import SessionLocal
from models import User, Role, Wallet, RewardWallet

# ✅ JWT security
from security import get_current_user, require_roles


router = APIRouter(prefix="/users", tags=["Users"])


# -----------------------
# DB
# -----------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -----------------------
# ROLE HELPERS
# -----------------------
def get_role_name(db: Session, role_id: Optional[int]) -> str:
    if not role_id:
        return "unknown"
    r = db.query(Role).filter(Role.id == role_id).first()
    return (r.name if r and r.name else "unknown").lower()


def _get_role_id(db: Session, role_name: str) -> Optional[int]:
    role_name = (role_name or "").strip().lower()
    r = db.query(Role).filter(sa_func.lower(Role.name) == role_name).first()
    return r.id if r else None


def _is_customer(db: Session, user: User) -> bool:
    customer_role_id = _get_role_id(db, "customer")
    if not customer_role_id:
        # if roles table not ready, fail loudly
        raise HTTPException(status_code=500, detail="Role 'customer' not found in roles table")
    return int(getattr(user, "role_id", 0) or 0) == int(customer_role_id)


# -----------------------
# 1) LIST USERS
# - staff/cashier: customers only
# - admin: all users
# -----------------------
@router.get("/")
def list_users(
    q: Optional[str] = Query(default=None, description="search by email"),
    active_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    include_balances: bool = Query(default=False, description="include wallet_balance + reward_points"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    role = (getattr(current_user, "role_name", "") or "").lower()

    query = db.query(User)

    # staff/cashier sees customers only
    if role in {"staff", "cashier"}:
        customer_role_id = _get_role_id(db, "customer")
        if not customer_role_id:
            raise HTTPException(status_code=500, detail="Role 'customer' not found in roles table")
        query = query.filter(User.role_id == customer_role_id)

    if active_only:
        query = query.filter(User.is_active == True)

    if q:
        query = query.filter(User.email.ilike(f"%{q.strip()}%"))

    rows = query.order_by(User.id.desc()).limit(limit).all()

    # optional balances (avoid extra queries if not needed)
    wallet_map = {}
    points_map = {}
    if include_balances and rows:
        user_ids = [u.id for u in rows]

        wallets = db.query(Wallet).filter(Wallet.user_id.in_(user_ids)).all()
        wallet_map = {w.user_id: float(w.balance) for w in wallets}

        rws = db.query(RewardWallet).filter(RewardWallet.user_id.in_(user_ids)).all()
        points_map = {rw.user_id: int(rw.total_points or 0) for rw in rws}

    data = []
    for u in rows:
        item = {
            "user_id": u.id,
            "email": u.email,
            "is_active": bool(getattr(u, "is_active", True)),
            "role_id": u.role_id,
            "role_name": get_role_name(db, u.role_id),
            "created_at": str(getattr(u, "created_at", "")) if hasattr(u, "created_at") else None,
        }

        if include_balances:
            item["wallet_balance"] = wallet_map.get(u.id, 0.0)
            item["reward_points"] = points_map.get(u.id, 0)

        data.append(item)

    return {"count": len(data), "data": data}


# -----------------------
# 2) GET SINGLE USER
# - staff/cashier: customer only
# - admin: all
# Includes wallet + points snapshot
# -----------------------
@router.get("/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    role = (getattr(current_user, "role_name", "") or "").lower()

    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    # staff/cashier can only view customers
    if role in {"staff", "cashier"}:
        if not _is_customer(db, u):
            raise HTTPException(status_code=403, detail="Staff/Cashier can only view customers")

    wallet = db.query(Wallet).filter(Wallet.user_id == u.id).first()
    rw = db.query(RewardWallet).filter(RewardWallet.user_id == u.id).first()

    return {
        "user_id": u.id,
        "email": u.email,
        "is_active": bool(getattr(u, "is_active", True)),
        "role_id": u.role_id,
        "role_name": get_role_name(db, u.role_id),
        "wallet_balance": float(wallet.balance) if wallet else 0.0,
        "reward_points": int(rw.total_points) if rw else 0,
    }


# -----------------------
# 3) ADMIN ONLY: DEACTIVATE / ACTIVATE USER
# -----------------------
class ToggleActivePayload(BaseModel):
    is_active: bool


@router.patch("/{user_id}/active")
def set_user_active(
    user_id: int,
    payload: ToggleActivePayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    u.is_active = bool(payload.is_active)
    db.commit()
    db.refresh(u)

    return {"message": "User updated", "user_id": u.id, "is_active": bool(u.is_active)}
