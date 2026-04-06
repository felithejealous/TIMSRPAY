from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import ActivityLog, User
from backend.security import require_roles

router = APIRouter(prefix="/activity-logs", tags=["Activity Logs"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
def list_activity_logs(
    q: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    query = db.query(ActivityLog)

    if module:
        query = query.filter(ActivityLog.module.ilike(f"%{module.strip()}%"))

    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            (ActivityLog.action.ilike(search)) |
            (ActivityLog.module.ilike(search)) |
            (ActivityLog.user_email.ilike(search)) |
            (ActivityLog.role_name.ilike(search)) |
            (ActivityLog.target_type.ilike(search)) |
            (ActivityLog.details.ilike(search))
        )

    rows = query.order_by(ActivityLog.id.desc()).limit(limit).all()

    return {
        "count": len(rows),
        "data": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "user_email": row.user_email,
                "role_name": row.role_name,
                "action": row.action,
                "module": row.module,
                "target_type": row.target_type,
                "target_id": row.target_id,
                "details": row.details,
                "created_at": str(row.created_at) if row.created_at else None,
            }
            for row in rows
        ],
    }