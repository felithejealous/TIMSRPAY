from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime

from database import SessionLocal
from models import AttendanceLog, User, StaffProfile

# ✅ JWT security
from security import get_current_user, require_roles

router = APIRouter(prefix="/attendance", tags=["Attendance"])


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
# SCHEMAS
# -----------------------
class ClockInPayload(BaseModel):
    staff_id: Optional[int] = None  # ✅ optional; if None => self


class ClockOutPayload(BaseModel):
    staff_id: Optional[int] = None  # ✅ optional; if None => self


# -----------------------
# HELPERS
# -----------------------
def _ensure_staff_exists(db: Session, staff_id: int):
    u = db.query(User).filter(User.id == staff_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Staff user not found")

    if hasattr(u, "is_active") and not bool(u.is_active):
        raise HTTPException(status_code=400, detail="Staff user is inactive")

    sp = db.query(StaffProfile).filter(StaffProfile.user_id == staff_id).first()
    if not sp:
        raise HTTPException(status_code=400, detail="Staff profile not found")

    return u, sp


def _resolve_staff_id(payload_staff_id: Optional[int], current_user: User) -> int:
    """
    ✅ Security rule:
    - staff/cashier can only act on themselves
    - admin can act on anyone
    """
    if payload_staff_id is None:
        return int(current_user.id)

    payload_staff_id = int(payload_staff_id)

    role = getattr(current_user, "role_name", "customer")
    if role != "admin" and payload_staff_id != int(current_user.id):
        raise HTTPException(status_code=403, detail="You can only clock in/out your own account")

    return payload_staff_id


# -----------------------
# ENDPOINTS
# -----------------------
@router.post("/clock-in")
def clock_in(
    payload: ClockInPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    staff_id = _resolve_staff_id(payload.staff_id, current_user)
    _ensure_staff_exists(db, staff_id)

    # block if already has open shift
    open_log = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == staff_id,
        AttendanceLog.time_out.is_(None)
    ).first()
    if open_log:
        raise HTTPException(status_code=400, detail="Already clocked in (open shift exists)")

    row = AttendanceLog(staff_id=staff_id)
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "clocked in",
        "attendance_id": row.id,
        "staff_id": row.staff_id,
        "time_in": str(row.time_in),
        "time_out": row.time_out,
    }


@router.post("/clock-out")
def clock_out(
    payload: ClockOutPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    staff_id = _resolve_staff_id(payload.staff_id, current_user)
    _ensure_staff_exists(db, staff_id)

    row = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == staff_id,
        AttendanceLog.time_out.is_(None)
    ).order_by(desc(AttendanceLog.id)).first()

    if not row:
        raise HTTPException(status_code=400, detail="No open shift found (not clocked in)")

    row.time_out = datetime.utcnow()
    db.commit()
    db.refresh(row)

    return {
        "message": "clocked out",
        "attendance_id": row.id,
        "staff_id": row.staff_id,
        "time_in": str(row.time_in),
        "time_out": str(row.time_out),
    }


@router.get("/status/{staff_id}")
def attendance_status(
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    # ✅ staff/cashier can only view their own status; admin can view anyone
    role = getattr(current_user, "role_name", "customer")
    if role != "admin" and int(staff_id) != int(current_user.id):
        raise HTTPException(status_code=403, detail="You can only view your own attendance status")

    _ensure_staff_exists(db, int(staff_id))

    row = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == int(staff_id),
        AttendanceLog.time_out.is_(None)
    ).order_by(desc(AttendanceLog.id)).first()

    return {
        "staff_id": int(staff_id),
        "is_clocked_in": bool(row),
        "open_attendance_id": row.id if row else None,
        "time_in": str(row.time_in) if row else None,
    }


@router.get("/logs")
def list_attendance_logs(
    staff_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    q = db.query(AttendanceLog)

    if staff_id is not None:
        q = q.filter(AttendanceLog.staff_id == int(staff_id))

    rows = q.order_by(desc(AttendanceLog.id)).limit(limit).all()

    # add staff profile info (optional)
    sp_map = {s.user_id: s for s in db.query(StaffProfile).all()}

    return {
        "count": len(rows),
        "data": [
            {
                "attendance_id": r.id,
                "staff_id": r.staff_id,
                "full_name": sp_map.get(r.staff_id).full_name if sp_map.get(r.staff_id) else None,
                "position": sp_map.get(r.staff_id).position if sp_map.get(r.staff_id) else None,
                "time_in": str(r.time_in),
                "time_out": str(r.time_out) if r.time_out else None,
            }
            for r in rows
        ]
    }
