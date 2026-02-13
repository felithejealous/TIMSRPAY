from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import hashlib, hmac, secrets

from database import SessionLocal
from models import User, Role, StaffProfile

# ✅ JWT security
from security import get_current_user, require_roles


router = APIRouter(prefix="/staff", tags=["Staff"])


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
# PASSWORD HASH (same style as wallet PIN)
# -----------------------
PBKDF2_ITERS = 200_000


def hash_password(password: str) -> str:
    password = (password or "").strip()

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="password must be at least 6 characters")

    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERS)

    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$", 3)

        if algo != "pbkdf2_sha256":
            return False

        iters = int(iters)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)

        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iters,
            dklen=len(expected),
        )

        return hmac.compare_digest(dk, expected)

    except Exception:
        return False


# -----------------------
# SCHEMAS
# -----------------------
class StaffRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # admin | cashier | staff
    position: Optional[str] = None
    is_active: bool = True


class StaffPatch(BaseModel):
    full_name: Optional[str] = None
    position: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


# -----------------------
# HELPERS
# -----------------------
def _get_role(db: Session, role_name: str) -> Role:
    role_name = (role_name or "").strip().lower()

    if role_name not in {"admin", "cashier", "staff"}:
        raise HTTPException(status_code=400, detail="role must be admin|cashier|staff")

    r = db.query(Role).filter(Role.name.ilike(role_name)).first()

    if not r:
        raise HTTPException(
            status_code=400,
            detail=f"role '{role_name}' not found in roles table"
        )

    return r


# -----------------------
# ENDPOINTS (ADMIN ONLY)
# -----------------------

@router.post("/register")
def register_staff(
    payload: StaffRegister,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    email = payload.email.strip().lower()

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    role = _get_role(db, payload.role)

    u = User(
        email=email,
        password_hash=hash_password(payload.password),
        role_id=role.id,
        is_active=bool(payload.is_active),
    )

    db.add(u)
    db.flush()  # get u.id

    sp = StaffProfile(
        user_id=u.id,
        full_name=payload.full_name.strip(),
        position=(payload.position or payload.role).strip()
        if (payload.position or payload.role)
        else None,
    )

    db.add(sp)

    db.commit()
    db.refresh(u)
    db.refresh(sp)

    return {
        "message": "staff registered",
        "user_id": u.id,
        "email": u.email,
        "role": payload.role,
        "is_active": u.is_active,
        "full_name": sp.full_name,
        "position": sp.position,
    }


@router.get("/")
def list_staff(
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    users = db.query(User).all()

    role_map = {r.id: r.name for r in db.query(Role).all()}
    sp_map = {s.user_id: s for s in db.query(StaffProfile).all()}

    data = []

    for u in users:
        sp = sp_map.get(u.id)

        if not sp:
            continue

        if q and q.strip().lower() not in (sp.full_name or "").lower():
            continue

        data.append({
            "user_id": u.id,
            "email": u.email,
            "role": role_map.get(u.role_id),
            "is_active": bool(u.is_active),
            "full_name": sp.full_name,
            "position": sp.position,
        })

    return {"count": len(data), "data": data}


@router.patch("/{user_id}")
def patch_staff(
    user_id: int,
    payload: StaffPatch,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.id == user_id).first()

    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    sp = db.query(StaffProfile).filter(StaffProfile.user_id == user_id).first()

    if not sp:
        raise HTTPException(status_code=404, detail="Staff profile not found")

    if payload.role is not None:
        role = _get_role(db, payload.role)
        u.role_id = role.id

    if payload.is_active is not None:
        u.is_active = bool(payload.is_active)

    if payload.full_name is not None:
        sp.full_name = payload.full_name.strip()

    if payload.position is not None:
        sp.position = payload.position.strip() or None

    db.commit()
    db.refresh(u)
    db.refresh(sp)

    return {
        "message": "updated",
        "user_id": u.id,
        "email": u.email,
        "role_id": u.role_id,
        "is_active": u.is_active,
        "full_name": sp.full_name,
        "position": sp.position,
    }
