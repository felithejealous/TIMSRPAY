from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime

from database import SessionLocal
from models import AttendanceLog, User, Role, StaffProfile

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
# GUARDS
# -----------------------
def require_staff_or_higher(
    x_role: str = Header(default="", alias="X-Role", description="staff|cashier|admin")
):
    if (x_role or "").strip().lower() not in {"staff", "cashier", "admin"}:
        raise HTTPException(status_code=403, detail="Staff only (set header X-Role: staff)")
    return True

def require_admin(
    x_role: str = Header(default="", alias="X-Role", description="admin")
):
    if (x_role or "").strip().lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin only (set header X-Role: admin)")
    return True

# -----------------------
# SCHEMAS
# -----------------------
class ClockInPayload(BaseModel):
    staff_id: int  # this should be users.id

class ClockOutPayload(BaseModel):
    staff_id: int

# -----------------------
# HELPERS
# -----------------------
def _ensure_staff_exists(db: Session, staff_id: int):
    u = db.query(User).filter(User.id == staff_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Staff user not found")

    if not u.is_active:
        raise HTTPException(status_code=400, detail="Staff user is inactive")

    sp = db.query(StaffProfile).filter(StaffProfile.user_id == staff_id).first()
    if not sp:
        raise HTTPException(status_code=400, detail="Staff profile not found")

    return u, sp

# -----------------------
# ENDPOINTS
# -----------------------
@router.post("/clock-in")
def clock_in(
    payload: ClockInPayload,
    db: Session = Depends(get_db),
    _: bool = Depends(require_staff_or_higher),
):
    staff_id = int(payload.staff_id)
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
    _: bool = Depends(require_staff_or_higher),
):
    staff_id = int(payload.staff_id)
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
    _: bool = Depends(require_staff_or_higher),
):
    _ensure_staff_exists(db, staff_id)

    row = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == staff_id,
        AttendanceLog.time_out.is_(None)
    ).order_by(desc(AttendanceLog.id)).first()

    return {
        "staff_id": staff_id,
        "is_clocked_in": bool(row),
        "open_attendance_id": row.id if row else None,
        "time_in": str(row.time_in) if row else None,
    }


@router.get("/logs")
def list_attendance_logs(
    staff_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
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
