from fastapi import APIRouter, Depends
from backend.decorators import get_current_user, require_role

router = APIRouter(prefix="/admin")

@router.get("/dashboard")
def admin_dashboard(current_user = Depends(require_role("admin"))):
    return {"msg": "welcome admin", "user": current_user.email}

@router.get("/profile")
def profile(current_user = Depends(get_current_user)):
    return {"email": current_user.email, "role": current_user.role}