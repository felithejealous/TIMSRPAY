from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, or_
from pydantic import BaseModel, EmailStr
import secrets
import string

from backend.database import SessionLocal
from backend.models import User, Role, Wallet, RewardWallet, CustomerProfile, StaffProfile
from backend.security import get_current_user, require_roles
from backend.routers.auth import hash_password as auth_hash_password

router = APIRouter(prefix="/users", tags=["Users"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
        raise HTTPException(status_code=500, detail="Role 'customer' not found in roles table")
    return int(getattr(user, "role_id", 0) or 0) == int(customer_role_id)


def generate_temp_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_wallet_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_unique_wallet_code(db: Session) -> str:
    while True:
        code = generate_wallet_code(6)
        exists = db.query(Wallet).filter(Wallet.wallet_code == code).first()
        if not exists:
            return code


class ToggleActivePayload(BaseModel):
    is_active: bool


class CustomerCreatePayload(BaseModel):
    email: EmailStr
    full_name: str
    password: Optional[str] = None
    is_active: bool = True
    phone: Optional[str] = None


class CustomerPatchPayload(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/")
def list_users(
    q: Optional[str] = Query(default=None, description="search by email, name, or wallet code"),
    active_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    include_balances: bool = Query(default=False, description="include wallet_balance + reward_points"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    role = (getattr(current_user, "role_name", "") or "").lower()

    query = (
        db.query(User, CustomerProfile, Wallet)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == User.id)
        .outerjoin(Wallet, Wallet.user_id == User.id)
    )

    if role in {"staff", "cashier"}:
        customer_role_id = _get_role_id(db, "customer")
        if not customer_role_id:
            raise HTTPException(status_code=500, detail="Role 'customer' not found in roles table")
        query = query.filter(User.role_id == customer_role_id)

    if active_only:
        query = query.filter(User.is_active == True)

    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.email.ilike(search),
                CustomerProfile.full_name.ilike(search),
                Wallet.wallet_code.ilike(search),
            )
        )

    rows = query.order_by(User.id.desc()).limit(limit).all()

    points_map = {}
    if include_balances and rows:
        user_ids = [u.id for u, _, _ in rows]
        reward_wallets = db.query(RewardWallet).filter(RewardWallet.user_id.in_(user_ids)).all()
        points_map = {rw.user_id: int(rw.total_points or 0) for rw in reward_wallets}

    changed = False
    data = []

    for u, cp, wallet in rows:
        if wallet and not (getattr(wallet, "wallet_code", None) or "").strip():
            wallet.wallet_code = generate_unique_wallet_code(db)
            changed = True

        item = {
            "user_id": u.id,
            "email": u.email,
            "is_active": bool(getattr(u, "is_active", True)),
            "role_id": u.role_id,
            "role_name": get_role_name(db, u.role_id),
            "created_at": str(getattr(u, "created_at", "")) if hasattr(u, "created_at") else None,
            "full_name": cp.full_name if cp else None,
            "profile_picture": getattr(u, "profile_picture", None),
            "wallet_code": getattr(wallet, "wallet_code", None) if wallet else None,
        }

        if include_balances:
            item["wallet_balance"] = float(wallet.balance) if wallet else 0.0
            item["reward_points"] = points_map.get(u.id, 0)

        data.append(item)

    if changed:
        db.commit()

    return {"count": len(data), "data": data}


@router.post("/customers")
def create_customer(
    payload: CustomerCreatePayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    email = payload.email.strip().lower()
    full_name = payload.full_name.strip()

    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    customer_role_id = _get_role_id(db, "customer")
    if not customer_role_id:
        raise HTTPException(status_code=500, detail="Role 'customer' not found in roles table")

    temp_password = (payload.password or "").strip() or generate_temp_password()

    user = User(
        email=email,
        password_hash=auth_hash_password(temp_password),
        role_id=customer_role_id,
        is_active=bool(payload.is_active),
    )
    db.add(user)
    db.flush()

    customer_profile = CustomerProfile(
        user_id=user.id,
        full_name=full_name,
        phone=(payload.phone or "").strip() or None,
    )
    db.add(customer_profile)

    wallet_code = generate_unique_wallet_code(db)

    db.add(
        Wallet(
            user_id=user.id,
            balance=0,
            wallet_code=wallet_code,
        )
    )
    db.add(RewardWallet(user_id=user.id, total_points=0))

    db.commit()
    db.refresh(user)

    return {
        "message": "customer created",
        "user_id": user.id,
        "email": user.email,
        "role": "customer",
        "is_active": user.is_active,
        "full_name": customer_profile.full_name,
        "wallet_code": wallet_code,
        "temporary_password": temp_password,
    }


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

    if role in {"staff", "cashier"}:
        if not _is_customer(db, u):
            raise HTTPException(status_code=403, detail="Staff/Cashier can only view customers")

    wallet = db.query(Wallet).filter(Wallet.user_id == u.id).first()
    rw = db.query(RewardWallet).filter(RewardWallet.user_id == u.id).first()
    cp = db.query(CustomerProfile).filter(CustomerProfile.user_id == u.id).first()
    sp = db.query(StaffProfile).filter(StaffProfile.user_id == u.id).first()

    if wallet and not (getattr(wallet, "wallet_code", None) or "").strip():
        wallet.wallet_code = generate_unique_wallet_code(db)
        db.commit()
        db.refresh(wallet)

    full_name = None
    if sp and getattr(sp, "full_name", None):
        full_name = sp.full_name
    elif cp and getattr(cp, "full_name", None):
        full_name = cp.full_name

    return {
        "user_id": u.id,
        "email": u.email,
        "full_name": full_name,
        "profile_picture": getattr(u, "profile_picture", None),
        "is_active": bool(getattr(u, "is_active", True)),
        "role_id": u.role_id,
        "role_name": get_role_name(db, u.role_id),
        "wallet_code": getattr(wallet, "wallet_code", None) if wallet else None,
        "wallet_balance": float(wallet.balance) if wallet else 0.0,
        "reward_points": int(rw.total_points) if rw else 0,
    }


@router.patch("/customers/{user_id}")
def patch_customer(
    user_id: int,
    payload: CustomerPatchPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if not _is_customer(db, u):
        raise HTTPException(status_code=400, detail="User is not a customer")

    cp = db.query(CustomerProfile).filter(CustomerProfile.user_id == user_id).first()

    if not cp:
        cp = CustomerProfile(
            user_id=user_id,
            full_name=payload.full_name or "No Name"
        )
        db.add(cp)

    if payload.full_name is not None:
        cp.full_name = payload.full_name.strip()

    if payload.is_active is not None:
        u.is_active = bool(payload.is_active)

    wallet = db.query(Wallet).filter(Wallet.user_id == u.id).first()
    if wallet and not (getattr(wallet, "wallet_code", None) or "").strip():
        wallet.wallet_code = generate_unique_wallet_code(db)

    db.commit()
    db.refresh(u)
    db.refresh(cp)

    if wallet:
        db.refresh(wallet)

    return {
        "message": "customer updated",
        "user_id": u.id,
        "email": u.email,
        "role": "customer",
        "is_active": bool(u.is_active),
        "full_name": cp.full_name,
        "wallet_code": getattr(wallet, "wallet_code", None) if wallet else None,
    }


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