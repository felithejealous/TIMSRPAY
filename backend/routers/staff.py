from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
<<<<<<< HEAD
import hashlib, hmac, secrets

from backend.database import SessionLocal
from backend.models import User, Role, StaffProfile

# ✅ JWT security
from backend.security import get_current_user, require_roles

=======
from sqlalchemy import func as sa_func

import secrets
import string
from backend.activity_logger import log_activity
from backend.database import SessionLocal
from backend.models import User, Role, StaffProfile
from backend.security import get_current_user, require_roles
from backend.routers.auth import (
    hash_password as auth_hash_password,
    verify_password as auth_verify_password,
    validate_password_strength,
)
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

router = APIRouter(prefix="/staff", tags=["Staff"])


<<<<<<< HEAD
# -----------------------
# DB
# -----------------------
=======
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


<<<<<<< HEAD
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
=======
def generate_temp_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits + "@#$%!"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))

        has_lower = any(c.islower() for c in pw)
        has_upper = any(c.isupper() for c in pw)
        has_digit = any(c.isdigit() for c in pw)
        has_special = any(c in "@#$%!" for c in pw)

        if has_lower and has_upper and has_digit and has_special:
            return pw


class StaffRegister(BaseModel):
    email: EmailStr
    password: Optional[str] = None
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
    full_name: str
    role: str  # admin | cashier | staff
    position: Optional[str] = None
    is_active: bool = True


class StaffPatch(BaseModel):
    full_name: Optional[str] = None
    position: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
<<<<<<< HEAD


# -----------------------
# HELPERS
# -----------------------
=======
    profile_picture: Optional[str] = None


class StaffSelfPatch(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    profile_picture: Optional[str] = None


class ChangeMyPasswordPayload(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
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


<<<<<<< HEAD
# -----------------------
# ENDPOINTS (ADMIN ONLY)
# -----------------------
=======
def _get_role_name(db: Session, role_id: Optional[int]) -> str:
    if not role_id:
        return "unknown"

    role = db.query(Role).filter(Role.id == role_id).first()
    return (role.name if role and role.name else "unknown").lower()


def _get_or_create_staff_profile(db: Session, user: User) -> StaffProfile:
    sp = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()

    if not sp:
        fallback_name = user.email.split("@")[0] if getattr(user, "email", None) else f"Staff {user.id}"
        sp = StaffProfile(
            user_id=user.id,
            full_name=fallback_name,
            position=_get_role_name(db, getattr(user, "role_id", None)).title()
        )
        db.add(sp)
        db.flush()

    return sp

>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

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
<<<<<<< HEAD

    u = User(
        email=email,
        password_hash=hash_password(payload.password),
=======
    temp_password = (payload.password or "").strip() or generate_temp_password()

    validate_password_strength(temp_password)

    u = User(
        email=email,
        password_hash=auth_hash_password(temp_password),
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
        role_id=role.id,
        is_active=bool(payload.is_active),
    )

    db.add(u)
<<<<<<< HEAD
    db.flush()  # get u.id
=======
    db.flush()
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

    sp = StaffProfile(
        user_id=u.id,
        full_name=payload.full_name.strip(),
<<<<<<< HEAD
        position=(payload.position or payload.role).strip()
        if (payload.position or payload.role)
        else None,
    )

    db.add(sp)
=======
        position=(payload.position or payload.role).strip() if (payload.position or payload.role) else None,
    )

    db.add(sp)
    log_activity(
    db,
    user=_,
    action="Registered staff account",
    module="staff",
    target_type="user",
    target_id=u.id,
    details=f"{u.email} | role={payload.role} | full_name={sp.full_name}"
)
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

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
<<<<<<< HEAD
=======
        "temporary_password": temp_password,
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
    }


@router.get("/")
def list_staff(
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
<<<<<<< HEAD
    users = db.query(User).all()

    role_map = {r.id: r.name for r in db.query(Role).all()}
=======
    allowed_roles = {"admin", "cashier", "staff"}

    users = db.query(User).all()
    role_map = {r.id: (r.name or "").lower() for r in db.query(Role).all()}
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
    sp_map = {s.user_id: s for s in db.query(StaffProfile).all()}

    data = []

    for u in users:
<<<<<<< HEAD
        sp = sp_map.get(u.id)

        if not sp:
            continue

        if q and q.strip().lower() not in (sp.full_name or "").lower():
            continue
=======
        role_name = role_map.get(u.role_id, "").lower()

        if role_name not in allowed_roles:
            continue

        sp = sp_map.get(u.id)
        if not sp:
            continue

        if q:
            search = q.strip().lower()
            searchable = " ".join([
                str(u.id),
                u.email or "",
                sp.full_name or "",
                sp.position or "",
                role_name,
            ]).lower()

            if search not in searchable:
                continue
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

        data.append({
            "user_id": u.id,
            "email": u.email,
<<<<<<< HEAD
            "role": role_map.get(u.role_id),
            "is_active": bool(u.is_active),
            "full_name": sp.full_name,
            "position": sp.position,
=======
            "role": role_name,
            "is_active": bool(u.is_active),
            "full_name": sp.full_name,
            "position": sp.position,
            "staff_code": sp.staff_code,
            "profile_picture": getattr(u, "profile_picture", None),
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
        })

    return {"count": len(data), "data": data}


<<<<<<< HEAD
=======
@router.get("/me")
def get_my_staff_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sp = _get_or_create_staff_profile(db, user)
    role_name = _get_role_name(db, getattr(user, "role_id", None))

    db.commit()
    db.refresh(user)
    db.refresh(sp)

    return {
        "user_id": user.id,
        "email": user.email,
        "full_name": sp.full_name,
        "position": sp.position,
        "staff_code": sp.staff_code,
        "role": role_name,
        "is_active": bool(getattr(user, "is_active", True)),
        "profile_picture": getattr(user, "profile_picture", None),
    }


@router.patch("/me")
def patch_my_staff_profile(
    payload: StaffSelfPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sp = _get_or_create_staff_profile(db, user)

    if payload.full_name is not None:
        full_name = payload.full_name.strip()
        if not full_name:
            raise HTTPException(status_code=400, detail="Full name cannot be empty")
        sp.full_name = full_name

    if payload.email is not None:
        new_email = payload.email.strip().lower()

        existing = db.query(User).filter(
            sa_func.lower(User.email) == new_email,
            User.id != user.id
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")

        user.email = new_email

    if payload.profile_picture is not None:
        profile_picture = payload.profile_picture.strip()
        user.profile_picture = profile_picture or None

    db.commit()
    db.refresh(user)
    db.refresh(sp)

    role_name = _get_role_name(db, getattr(user, "role_id", None))

    return {
        "message": "Profile updated successfully",
        "user_id": user.id,
        "email": user.email,
        "full_name": sp.full_name,
        "position": sp.position,
        "staff_code": sp.staff_code,
        "role": role_name,
        "is_active": bool(getattr(user, "is_active", True)),
        "profile_picture": getattr(user, "profile_picture", None),
    }
@router.post("/{user_id}/reset-password")
def reset_staff_password(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    role_map = {r.id: (r.name or "").lower() for r in db.query(Role).all()}
    role_name = role_map.get(u.role_id, "")

    if role_name not in {"admin", "cashier", "staff"}:
        raise HTTPException(status_code=400, detail="Password reset here is for staff/admin/cashier only")

    temp_password = generate_temp_password()
    validate_password_strength(temp_password)
    u.password_hash = auth_hash_password(temp_password)
    log_activity(
    db,
    user=_,
    action="Reset staff password",
    module="staff",
    target_type="user",
    target_id=u.id,
    details=f"{u.email}"
)

    db.commit()
    db.refresh(u)

    return {
        "message": "temporary password generated",
        "user_id": u.id,
        "email": u.email,
        "temporary_password": temp_password,
    }


>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
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

<<<<<<< HEAD
=======
    if payload.profile_picture is not None:
        u.profile_picture = payload.profile_picture.strip() or None
    log_activity(
    db,
    user=_,
    action="Updated staff account",
    module="staff",
    target_type="user",
    target_id=u.id,
    details=f"{u.email} | full_name={sp.full_name} | position={sp.position}"
)

>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
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
<<<<<<< HEAD
    }
=======
        "staff_code": sp.staff_code,
        "profile_picture": getattr(u, "profile_picture", None),
    }
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
