# auth.py
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets
import smtplib
import bcrypt
import re  # ✅ ADD: password rules regex
from email.message import EmailMessage
from pydantic import BaseModel, EmailStr, Field
import requests
from fastapi.responses import RedirectResponse
from urllib.parse import urlencode
from backend.routers.wallet import _get_wallet_by_user_id #added

from backend.database import SessionLocal
from backend.models import User, Wallet, RewardWallet, Role, PasswordResetToken
from backend.routers import wallet
from backend.routers.wallet import hash_pin
from backend.security import create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

# -----------------------
# DB DEP
# -----------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ----------------------
# PASSWORD STRENGTH RULES (ADD-ONLY)
# ----------------------
def validate_password_strength(pw: str):
    pw = (pw or "").strip()

    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    if re.search(r"\s", pw):
        raise HTTPException(status_code=400, detail="Password must not contain spaces")

    if not re.search(r"[a-z]", pw):
        raise HTTPException(status_code=400, detail="Password must contain at least 1 lowercase letter")

    if not re.search(r"[A-Z]", pw):
        raise HTTPException(status_code=400, detail="Password must contain at least 1 uppercase letter")

    if not re.search(r"\d", pw):
        raise HTTPException(status_code=400, detail="Password must contain at least 1 number")

    # special character (anything not alphanumeric underscore)
    if not re.search(r"[^\w]", pw):
        raise HTTPException(status_code=400, detail="Password must contain at least 1 special character")

# ----------------------
# PASSWORD HASH
# ----------------------
def hash_password(pw: str) -> str:
    pw = (pw or "").strip()

    # ✅ keep your existing length check
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    hashed = bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")

def verify_password(pw: str, stored_hash: str) -> bool:
    if not pw or not stored_hash:
        return False

    try:
        return bcrypt.checkpw(
            pw.encode("utf-8"),
            stored_hash.encode("utf-8")
        )
    except Exception:
        return False

# -----------------------
# ROLE HELPERS
# -----------------------
def _get_role_id(db: Session, role_name: str) -> int:
    r = db.query(Role).filter(Role.name.ilike(role_name)).first()
    if not r:
        raise HTTPException(status_code=500, detail=f"Role '{role_name}' not found")
    return r.id


# -----------------------
# TIME HELPERS
# -----------------------
def _utcnow():
    return datetime.now(timezone.utc)

def _as_utc(dt: datetime):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# -----------------------
# EMAIL SENDER
# -----------------------
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


# -----------------------
# TOKEN HASH (PBKDF2) for reset code
# -----------------------
TOKEN_ITERS = 120_000

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


# -----------------------
# SCHEMAS
# -----------------------
class ForgotPasswordConfirmPayload(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8)


# ============================================================
# REGISTER
# ============================================================
@router.post("/register")
def register_user(full_name: str, email: str, password: str, db: Session = Depends(get_db)): #added full_name param
    email = email.strip().lower()

    # ✅ ADD: enforce strong password rules on register
    validate_password_strength(password)

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    role_id = _get_role_id(db, "customer")

    user = User(
        full_name=full_name, #added full_name field
        email=email,
        password_hash=hash_password(password),
        role_id=role_id,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Wallet(user_id=user.id, balance=0))
    db.add(RewardWallet(user_id=user.id, total_points=0))
    db.commit()

    return {"user_id": user.id}


# ============================================================
# LOGIN (JWT)
# ============================================================
@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    email = email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if hasattr(user, "is_active") and not bool(user.is_active):
        raise HTTPException(status_code=403, detail="Account is deactivated")

    role = db.query(Role).filter(Role.id == user.role_id).first()
    role_name = (role.name if role else "customer").lower()

    access_token_jwt = create_access_token({
        "sub": str(user.id),
        "role": role_name,
        "email": user.email
    })

    return {
        "access_token": access_token_jwt,
        "token_type": "bearer",
        "user_id": user.id,
        "email": user.email,
        "role": role_name,
    }


# ============================================================
# FORGOT PASSWORD - REQUEST (6 DIGIT CODE)
# ============================================================
RESET_TTL_SECONDS = 15 * 60
RESET_MAX_ATTEMPTS = 3

@router.post("/forgot-password/request")
def forgot_password_request(email: str, db: Session = Depends(get_db)):
    email = email.strip().lower()
    generic = {"message": "If the email exists, a reset code was sent."}

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return generic

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.is_used == False
    ).delete(synchronize_session=False)

    code = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_bytes(16)

    row = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(code, salt),
        expires_at=_utcnow() + timedelta(seconds=RESET_TTL_SECONDS),
        attempts=0,
        is_used=False
    )
    db.add(row)
    db.commit()

    sent = _send_email(
        email,
        "TIMSRPAY Password Reset Code",
        f"Your reset code is: {code}\n\nExpires in 15 minutes."
    )

    if not sent:
        return {"message": "DEV MODE", "code_dev": code}

    return generic


# ============================================================
# FORGOT PASSWORD - CONFIRM
# ============================================================
@router.post("/forgot-password/confirm")
def forgot_password_confirm(payload: ForgotPasswordConfirmPayload, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    code = payload.code.strip()

    # ✅ ADD: enforce strong password rules on reset too
    validate_password_strength(payload.new_password)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid code or email")

    row = db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.is_used == False
    ).order_by(PasswordResetToken.id.desc()).first()

    if not row:
        raise HTTPException(status_code=400, detail="No active reset code")

    if _utcnow() > _as_utc(row.expires_at):
        row.is_used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Reset code expired")

    if row.attempts >= RESET_MAX_ATTEMPTS:
        row.is_used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts")

    if not _verify_token(code, row.token_hash):
        row.attempts += 1
        if row.attempts >= RESET_MAX_ATTEMPTS:
            row.is_used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid code")

    row.is_used = True
    user.password_hash = hash_password(payload.new_password)
    #  (RESET PIN)
    wallet = _get_wallet_by_user_id(user.id)
    wallet.pin_hash = hash_pin("0000")  # default PIN OR force change later
    db.commit()

    return {"message": "Password reset successful"}


# ============================================================
# GOOGLE OAUTH (CONTINUE WITH GOOGLE) - WITH STATE VALIDATION
# ============================================================
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

def _google_env(name: str) -> str:
    v = (os.getenv(name) or "").strip()
    if not v:
        raise HTTPException(status_code=500, detail=f"Missing env var: {name}")
    return v

@router.get("/google/login")
def google_login():
    client_id = _google_env("GOOGLE_CLIENT_ID")
    redirect_uri = _google_env("GOOGLE_REDIRECT_URI")
    state = secrets.token_urlsafe(24)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    resp = RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")

    # ✅ store state in cookie (anti-CSRF)
    resp.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        samesite="lax",
        secure=False,   # set True in prod HTTPS
        max_age=600,
        domain="127.0.0.1", # Force it to the IP you are using
    )
    return resp

@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str = "",
    state: str = "",
    db: Session = Depends(get_db),
):
    if not code:
        raise HTTPException(status_code=400, detail="Missing code from Google")

    # ✅ validate state
    saved_state = request.cookies.get("oauth_state")
    if not saved_state or saved_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    client_id = _google_env("GOOGLE_CLIENT_ID")
    client_secret = _google_env("GOOGLE_CLIENT_SECRET")
    redirect_uri = _google_env("GOOGLE_REDIRECT_URI")

    frontend_redirect = os.getenv(
        "FRONTEND_OAUTH_REDIRECT",
        "http://127.0.0.1:5500/PUBLICWEB/oauth-callback.html"
    ) 

    token_res = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if token_res.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Google token exchange failed: {token_res.text}")

    google_access_token = token_res.json().get("access_token")
    if not google_access_token:
        raise HTTPException(status_code=400, detail="No access_token returned by Google")

    userinfo_res = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {google_access_token}"},
        timeout=10,
    )
    if userinfo_res.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Google userinfo failed: {userinfo_res.text}")

    info = userinfo_res.json()
    google_id = info.get("sub")
    email = (info.get("email") or "").strip().lower()
    picture = info.get("picture")
    name = info.get("name") #added to capture full name from Google profile

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Google account missing required fields (sub/email)")

    user = db.query(User).filter(User.email == email).first()

    if user:
        if getattr(user, "google_id", None) and user.google_id != google_id:
            raise HTTPException(status_code=400, detail="This email is already linked to another Google account")
        user.google_id = google_id
        user.oauth_provider = "google"
        user.profile_picture = picture

        #added: only update full_name if it's not already set, to avoid overwriting existing names with empty or less accurate data from Google
        if not user.full_name and name: 
            user.full_name = name

    else:
        customer_role_id = _get_role_id(db, "customer")
        user = User(
            email=email,
            password_hash=None,
            role_id=customer_role_id,
            is_active=True,
            google_id=google_id,
            oauth_provider="google",
            profile_picture=picture,
            full_name=name, #added full_name from Google profile
        )
        db.add(user)
        db.flush()
        db.add(Wallet(user_id=user.id, balance=0))
        db.add(RewardWallet(user_id=user.id, total_points=0))

    db.commit()
    db.refresh(user)

    role = db.query(Role).filter(Role.id == user.role_id).first()
    role_name = (role.name if role else "customer").lower()

    access_token_jwt = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": role_name
    })

    q = urlencode({"token": access_token_jwt})
    resp = RedirectResponse(url=f"{frontend_redirect}?{q}")

    # ✅ clear state cookie
    resp.delete_cookie("oauth_state")
    return resp


# ============================================================
# ME (JWT-protected)
# ============================================================
@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "user_id": current_user.id,
        "full_name": current_user.full_name, #added full_name to response
        "email": current_user.email,
        "role": getattr(current_user, "role_name", "customer"),
        "provider": getattr(current_user, "oauth_provider", None),
        "profile_picture": getattr(current_user, "profile_picture", None),
    }


# ============================================================
# BOOTSTRAP ADMIN (ADD-ONLY, does NOT remove anything)
# ============================================================
class BootstrapAdminPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)

def _get_or_create_role(db: Session, name: str) -> Role:
    name = (name or "").strip().lower()
    r = db.query(Role).filter(Role.name.ilike(name)).first()
    if r:
        return r
    r = Role(name=name)
    db.add(r)
    db.flush()
    return r

def _has_any_admin(db: Session) -> bool:
    admin_role = db.query(Role).filter(Role.name.ilike("admin")).first()
    if not admin_role:
        return False
    exists = db.query(User).filter(User.role_id == admin_role.id).first()
    return bool(exists)

@router.post("/bootstrap-admin")
def bootstrap_admin(
    payload: BootstrapAdminPayload,
    db: Session = Depends(get_db),
    x_bootstrap_secret: str = Header(default="", alias="X-Bootstrap-Secret"),
):
    expected = (os.getenv("BOOTSTRAP_SECRET", "") or "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="BOOTSTRAP_SECRET is not set on server")
    if (x_bootstrap_secret or "").strip() != expected:
        raise HTTPException(status_code=403, detail="Invalid bootstrap secret")

    # disable if admin already exists
    if _has_any_admin(db):
        raise HTTPException(status_code=403, detail="Admin already exists; bootstrap is disabled")

    email = payload.email.strip().lower()

    # ✅ ADD: enforce strong password rules for bootstrap too
    validate_password_strength(payload.password)

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    admin_role = _get_or_create_role(db, "admin")

    u = User(
        email=email,
        password_hash=hash_password(payload.password),  # uses your current hash_password()
        role_id=admin_role.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    token = create_access_token({
        "sub": str(u.id),
        "role": "admin",
        "email": u.email
    })

    return {
        "message": "bootstrap admin created",
        "user_id": u.id,
        "email": u.email,
        "role": "admin",
        "access_token": token,
        "token_type": "bearer",
    }
