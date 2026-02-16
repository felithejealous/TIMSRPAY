from datetime import datetime, timedelta, timezone
import os
from typing import Optional, Dict, Any, Set, Callable

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import User, Role


# =======================
# ENV
# =======================
JWT_SECRET = (os.getenv("JWT_SECRET") or "").strip()
JWT_ALGORITHM = (os.getenv("JWT_ALGORITHM") or "HS256").strip()
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES") or "60")

if not JWT_SECRET:
    JWT_SECRET = "DEV_ONLY_CHANGE_ME"


# =======================
# DB DEP
# =======================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =======================
# BEARER TOKEN READER
# - bearer_scheme: required auth (401 if missing)
# - bearer_scheme_optional: optional auth (returns None if missing)
# =======================
bearer_scheme = HTTPBearer(auto_error=True)
bearer_scheme_optional = HTTPBearer(auto_error=False)


# =======================
# TOKEN CREATE/VERIFY
# =======================
def create_access_token(
    data: Dict[str, Any],
    expires_minutes: int = JWT_EXPIRE_MINUTES
) -> str:
    """
    Expected payload convention:
      - sub: user_id (string or int)
      - role: optional role name (e.g. "admin")
    """
    to_encode = data.copy()

    # normalize sub if present
    if "sub" in to_encode and to_encode["sub"] is not None:
        to_encode["sub"] = str(to_encode["sub"])

    exp = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": exp})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# =======================
# HELPERS
# =======================
def _get_role_name(db: Session, role_id: Optional[int]) -> str:
    if not role_id:
        return "customer"
    r = db.query(Role).filter(Role.id == role_id).first()
    return (r.name if r and r.name else "customer").lower()


def _attach_role_name(db: Session, user: User, token_payload: Dict[str, Any]) -> None:
    """
    Prefer role from token payload (faster), fallback to DB role_id lookup.
    This keeps roles JWT-based (Letter C) but still works even if token has no role yet.
    """
    role_from_token = (token_payload.get("role") or "").strip().lower()
    if role_from_token:
        user.role_name = role_from_token
        return

    user.role_name = _get_role_name(db, getattr(user, "role_id", None))


# =======================
# CURRENT USER DEP (REQUIRED)
# =======================
def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = creds.credentials
    payload = decode_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload (missing sub)")

    try:
        uid = int(str(user_id))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token payload (bad sub)")

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if hasattr(user, "is_active") and not bool(user.is_active):
        raise HTTPException(status_code=403, detail="Account is deactivated")

    _attach_role_name(db, user, payload)
    return user


# =======================
# OPTIONAL CURRENT USER DEP (returns None if no token)
# Useful for endpoints that allow guest but want user if logged-in.
# =======================
def get_current_user_optional(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme_optional),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not creds or not getattr(creds, "credentials", None):
        return None

    token = creds.credentials
    payload = decode_token(token)

    user_id = payload.get("sub")
    if not user_id:
        return None

    try:
        uid = int(str(user_id))
    except Exception:
        return None

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        return None
    if hasattr(user, "is_active") and not bool(user.is_active):
        return None

    _attach_role_name(db, user, payload)
    return user


# =======================
# ROLE GUARD DEP (JWT roles)
# =======================
def require_roles(*allowed_roles: str):
    allowed: Set[str] = {r.strip().lower() for r in allowed_roles if (r or "").strip()}

    def _guard(user: User = Depends(get_current_user)) -> User:
        role = (getattr(user, "role_name", "customer") or "customer").strip().lower()
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return _guard
