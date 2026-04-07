from typing import Optional
from sqlalchemy.orm import Session

from backend.models import ActivityLog, User


def log_activity(
    db: Session,
    *,
    user: Optional[User] = None,
    action: str,
    module: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    details: Optional[str] = None,
    commit: bool = False,
):
    row = ActivityLog(
        user_id=getattr(user, "id", None) if user else None,
        user_email=getattr(user, "email", None) if user else None,
        role_name=getattr(user, "role_name", None) if user else None,
        action=(action or "").strip(),
        module=(module or "").strip(),
        target_type=(target_type or "").strip() or None,
        target_id=target_id,
        details=(details or "").strip() or None,
    )
    db.add(row)

    if commit:
        db.commit()
        db.refresh(row)

    return row