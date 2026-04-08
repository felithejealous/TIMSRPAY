from fastapi import APIRouter, Depends, Response, HTTPException, Request, Header, Form, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets
import smtplib
import bcrypt
import re
import string
from email.message import EmailMessage
from pydantic import BaseModel, EmailStr, Field
import requests
from fastapi.responses import RedirectResponse
from urllib.parse import urlencode
from pathlib import Path
from uuid import uuid4
from backend.database import SessionLocal
from backend.models import User, Wallet, RewardWallet, Role, PasswordResetToken, LoginRateLimit, CustomerProfile
from backend.security import create_access_token, get_current_user
from backend.activity_logger import log_activity
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
# PASSWORD STRENGTH RULES
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

    if not re.search(r"[^\w]", pw):
        raise HTTPException(status_code=400, detail="Password must contain at least 1 special character")


# ----------------------
# PASSWORD HASH
# ----------------------
def hash_password(pw: str) -> str:
    pw = (pw or "").strip()

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


def _generate_wallet_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _generate_unique_wallet_code(db: Session) -> str:
    while True:
        code = _generate_wallet_code(6)
        existing = db.query(Wallet).filter(Wallet.wallet_code == code).first()
        if not existing:
            return code

#===============
#HELPER TO GENERATE SPILIT NAME
#---------------------------
def split_full_name(full_name: str):
    full_name = (full_name or "").strip()
    if not full_name:
        return "", ""

    parts = full_name.split()
    first_name = parts[0]
    last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
    return first_name, last_name
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
#----------
#-----HELPER
#-----------------------
def _ensure_upload_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)
def _safe_profile_picture_extension(filename: str, content_type: str = "") -> str:
    filename = (filename or "").lower()
    content_type = (content_type or "").lower()

    if filename.endswith(".jpg") or filename.endswith(".jpeg") or content_type == "image/jpeg":
        return ".jpg"
    if filename.endswith(".png") or content_type == "image/png":
        return ".png"
    if filename.endswith(".webp") or content_type == "image/webp":
        return ".webp"

    raise HTTPException(status_code=400, detail="Only JPG, PNG, and WEBP images are allowed")
# -----------------------
# LOGIN RATE LIMIT
# -----------------------
LOGIN_MAX_FAILED_ATTEMPTS = 5
LOGIN_LOCK_MINUTES = 15


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    if request.client and request.client.host:
        return request.client.host.strip()

    return "unknown"


def _get_login_rate_limit_row(db: Session, email: str, ip_address: str) -> LoginRateLimit:
    row = db.query(LoginRateLimit).filter(
        LoginRateLimit.email == email,
        LoginRateLimit.ip_address == ip_address
    ).first()

    if not row:
        row = LoginRateLimit(
            email=email,
            ip_address=ip_address,
            failed_count=0,
            locked_until=None
        )
        db.add(row)
        db.flush()

    return row


def _check_login_lock(row: LoginRateLimit):
    now = datetime.utcnow()

    if row.locked_until and now < row.locked_until:
        remaining_seconds = int((row.locked_until - now).total_seconds())
        remaining_minutes = max(1, (remaining_seconds + 59) // 60)
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in about {remaining_minutes} minute(s)."
        )

    if row.locked_until and now >= row.locked_until:
        row.failed_count = 0
        row.locked_until = None


def _register_failed_login(db: Session, row: LoginRateLimit):
    now = datetime.utcnow()

    row.failed_count = int(row.failed_count or 0) + 1
    row.last_attempt_at = now

    if row.failed_count >= LOGIN_MAX_FAILED_ATTEMPTS:
        row.locked_until = now + timedelta(minutes=LOGIN_LOCK_MINUTES)

    db.commit()


def _reset_login_rate_limit(db: Session, row: LoginRateLimit):
    row.failed_count = 0
    row.locked_until = None
    row.last_attempt_at = datetime.utcnow()
    db.commit()


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
# TOKEN HASH
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
class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str
class UpdateProfilePayload(BaseModel):
    first_name: str
    last_name: str

# ============================================================
# REGISTER
# ============================================================
@router.post("/register")
def register_user(full_name: str, email: str, password: str, db: Session = Depends(get_db)):
    email = email.strip().lower()
    full_name = (full_name or "").strip()

    if not full_name:
        raise HTTPException(status_code=400, detail="Full name is required")

    validate_password_strength(password)

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    role_id = _get_role_id(db, "customer")

    user = User(
        email=email,
        password_hash=hash_password(password),
        role_id=role_id,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Wallet(
        user_id=user.id,
        balance=0,
        wallet_code=_generate_unique_wallet_code(db),
    ))
    db.add(RewardWallet(user_id=user.id, total_points=0))
    first_name, last_name = split_full_name(full_name)
    db.add(CustomerProfile(
        user_id=user.id,
        full_name=full_name,
        first_name=first_name,
        last_name=last_name
    ))
    db.commit()
    return {
        "user_id": user.id,
        "message": "Account created successfully"
    }

# ============================================================
# LOGIN
# ============================================================
@router.post("/login")
def login(
    response: Response,
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    email = email.strip().lower()
    ip_address = _get_client_ip(request)

    rate_limit_row = _get_login_rate_limit_row(db, email, ip_address)
    _check_login_lock(rate_limit_row)

    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password_hash):
        _register_failed_login(db, rate_limit_row)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if hasattr(user, "is_active") and not bool(user.is_active):
        raise HTTPException(status_code=403, detail="Account is deactivated")

    _reset_login_rate_limit(db, rate_limit_row)

    role = db.query(Role).filter(Role.id == user.role_id).first()
    role_name = (role.name if role else "customer").lower()

    access_token_jwt = create_access_token({
        "sub": str(user.id),
        "role": role_name,
        "email": user.email
    })

    response.set_cookie(
        key="access_token",
        value=access_token_jwt,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 7
    )

    return {
        "user_id": user.id,
        "email": user.email,
        "role": role_name,
        "access_token": access_token_jwt,
        "token_type": "bearer"
    }


#===========================
# LOGOUT
#===========================
@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        key="access_token",
        httponly=True,
        samesite="lax"
    )
    return {"message": "Logged out successfully"}


# ============================================================
# FORGOT PASSWORD - REQUEST
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
    db.commit()

    return {"message": "Password reset successful"}
#==================
#change password
#==================
@router.post("/change-password")
def change_password(
    payload: ChangePasswordPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == current_user.id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    current_password = (payload.current_password or "").strip()
    new_password = (payload.new_password or "").strip()
    confirm_password = (payload.confirm_password or "").strip()

    if not current_password or not new_password or not confirm_password:
        raise HTTPException(status_code=400, detail="All password fields are required")

    if not user.password_hash:
        raise HTTPException(status_code=400, detail="This account does not support password change")

    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if new_password != confirm_password:
        raise HTTPException(status_code=400, detail="New password and confirm password do not match")

    if current_password == new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    validate_password_strength(new_password)

    user.password_hash = hash_password(new_password)
    log_activity(
    db,
    user=current_user,
    action="Changed password",
    module="security",
    target_type="user",
    target_id=user.id,
    details="User changed own password"
)
    db.commit()

    return {"message": "Password updated successfully"}
# ============================================================
# GOOGLE OAUTH
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
def google_login(request: Request):
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

    is_https = request.url.scheme == "https"

    resp.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        samesite="lax",
        secure=is_https,
        max_age=600,
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

    saved_state = request.cookies.get("oauth_state")
    if not saved_state or saved_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    client_id = _google_env("GOOGLE_CLIENT_ID")
    client_secret = _google_env("GOOGLE_CLIENT_SECRET")
    redirect_uri = _google_env("GOOGLE_REDIRECT_URI")
    frontend_redirect = _google_env("FRONTEND_OAUTH_REDIRECT")

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
    full_name = (info.get("name") or "").strip()

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Google account missing required fields (sub/email)")

    user = db.query(User).filter(User.email == email).first()

    if user:
        if getattr(user, "google_id", None) and user.google_id != google_id:
            raise HTTPException(status_code=400, detail="This email is already linked to another Google account")

        user.google_id = google_id
        user.oauth_provider = "google"
        user.profile_picture = picture

        existing_profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == user.id).first()
        if not existing_profile and full_name:
            first_name, last_name = split_full_name(full_name)
            db.add(CustomerProfile(
                user_id=user.id,
                full_name=full_name,
                first_name=first_name,
                last_name=last_name
            ))
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
        )
        db.add(user)
        db.flush()

        db.add(Wallet(
            user_id=user.id,
            balance=0,
            wallet_code=_generate_unique_wallet_code(db),
        ))
        db.add(RewardWallet(user_id=user.id, total_points=0))

        profile_name = full_name or email.split("@")[0]
        first_name, last_name = split_full_name(profile_name)
        db.add(CustomerProfile(
            user_id=user.id,
            full_name=profile_name,
            first_name=first_name,
            last_name=last_name
        ))

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

    is_https = request.url.scheme == "https"
    resp.delete_cookie(
        key="oauth_state",
        httponly=True,
        samesite="lax",
        secure=is_https,
    )

    return resp
# ============================================================
# ME
# ============================================================
@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    customer_profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == current_user.id).first()

    if wallet and not (getattr(wallet, "wallet_code", None) or "").strip():
        wallet.wallet_code = _generate_unique_wallet_code(db)
        db.commit()
        db.refresh(wallet)

    full_name = None
    first_name = None
    last_name = None

    if customer_profile:
        full_name = (customer_profile.full_name or "").strip() or None
        first_name = (getattr(customer_profile, "first_name", None) or "").strip() or None
        last_name = (getattr(customer_profile, "last_name", None) or "").strip() or None

    display_name = first_name or full_name or current_user.email

    return {
        "user_id": current_user.id,
        "email": current_user.email,
        "full_name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "display_name": display_name,
        "role": getattr(current_user, "role_name", "customer"),
        "provider": getattr(current_user, "oauth_provider", None),
        "profile_picture": getattr(current_user, "profile_picture", None),
        "wallet_code": getattr(wallet, "wallet_code", None) if wallet else None,
        "created_at": current_user.created_at,
    }
#===============
#===PROFILE
#==============
@router.put("/profile")
def update_profile(
    payload: UpdateProfilePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    first_name = (payload.first_name or "").strip()
    last_name = (payload.last_name or "").strip()

    if not first_name:
        raise HTTPException(status_code=400, detail="First name is required")

    profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == current_user.id).first()

    if not profile:
        profile = CustomerProfile(
            user_id=current_user.id,
            full_name=first_name if not last_name else f"{first_name} {last_name}",
            first_name=first_name,
            last_name=last_name,
        )
        db.add(profile)
    else:
        profile.first_name = first_name
        profile.last_name = last_name
        profile.full_name = first_name if not last_name else f"{first_name} {last_name}"

    db.commit()

    return {"message": "Profile updated successfully"}
@router.post("/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    ext = _safe_profile_picture_extension(file.filename or "", file.content_type or "")
    upload_dir = "uploads/profile_pictures"
    _ensure_upload_dir(upload_dir)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    max_size = 5 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller")

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    filename = f"user_{user.id}_{uuid4().hex}{ext}"
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    old_path = (getattr(user, "profile_picture", None) or "").strip()

    user.profile_picture = f"/uploads/profile_pictures/{filename}"
    db.commit()
    db.refresh(user)

    if old_path.startswith("/uploads/profile_pictures/"):
        old_file = old_path.lstrip("/")
        if os.path.exists(old_file):
            try:
                os.remove(old_file)
            except Exception:
                pass

    return {
        "message": "Profile picture uploaded successfully",
        "profile_picture": user.profile_picture,
    }
@router.delete("/profile-picture")
def delete_profile_picture(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_path = (getattr(user, "profile_picture", None) or "").strip()
    user.profile_picture = None

    db.commit()
    db.refresh(user)

    if old_path.startswith("/uploads/profile_pictures/"):
        old_file = old_path.lstrip("/")
        if os.path.exists(old_file):
            try:
                os.remove(old_file)
            except Exception:
                pass

    return {
        "message": "Profile picture removed successfully.",
        "profile_picture": user.profile_picture
    }
# ============================================================
# BOOTSTRAP ADMIN
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

    if _has_any_admin(db):
        raise HTTPException(status_code=403, detail="Admin already exists; bootstrap is disabled")

    email = payload.email.strip().lower()

    validate_password_strength(payload.password)

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    admin_role = _get_or_create_role(db, "admin")

    u = User(
        email=email,
        password_hash=hash_password(payload.password),
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