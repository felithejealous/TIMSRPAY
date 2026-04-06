from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, date, time, timedelta

from backend.database import SessionLocal
from backend.models import AttendanceLog, User, StaffProfile, Role, ClosingChecklist
from fastapi.responses import StreamingResponse
import csv
from io import StringIO

from backend.security import get_current_user, require_roles

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
    staff_id: Optional[int] = None
    terminal_name: Optional[str] = None
    notes: Optional[str] = None


class ClockOutPayload(BaseModel):
    staff_id: Optional[int] = None
    terminal_name: Optional[str] = None
    notes: Optional[str] = None


class ClosingChecklistPayload(BaseModel):
    wipe_counters: bool = False
    refill_bins: bool = False
    final_cash_register: bool = False
    pos_devices_charging: bool = False


# -----------------------
# HELPERS
# -----------------------
def _get_user_role_name(db: Session, user: User) -> str:
    if not user:
        return "customer"

    direct = getattr(user, "role_name", None)
    if direct:
        return str(direct).strip().lower()

    if getattr(user, "role", None) and getattr(user.role, "name", None):
        return str(user.role.name).strip().lower()

    if getattr(user, "role_id", None):
        role = db.query(Role).filter(Role.id == user.role_id).first()
        if role and role.name:
            return str(role.name).strip().lower()

    return "customer"


def _ensure_staff_exists(db: Session, staff_id: int):
    u = db.query(User).filter(User.id == staff_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Staff user not found")

    if hasattr(u, "is_active") and not bool(u.is_active):
        raise HTTPException(status_code=400, detail="Staff user is inactive")

    role_name = _get_user_role_name(db, u)

    if role_name not in {"staff", "cashier"}:
        raise HTTPException(status_code=400, detail="Target user is not a staff/cashier account")

    sp = db.query(StaffProfile).filter(StaffProfile.user_id == staff_id).first()
    if not sp:
        raise HTTPException(status_code=400, detail="Staff profile not found")

    return u, sp


def _resolve_staff_id(db: Session, payload_staff_id: Optional[int], current_user: User) -> int:
    if payload_staff_id is None:
        return int(current_user.id)

    payload_staff_id = int(payload_staff_id)
    role = _get_user_role_name(db, current_user)

    if role != "admin" and payload_staff_id != int(current_user.id):
        raise HTTPException(status_code=403, detail="You can only clock in/out your own account")

    return payload_staff_id


def _parse_hhmm(value: Optional[str]) -> Optional[time]:
    if not value:
        return None

    raw = str(value).strip()
    try:
        return datetime.strptime(raw, "%H:%M").time()
    except Exception:
        return None


def _combine_shift_datetime(target_date: date, hhmm_value: Optional[str]) -> Optional[datetime]:
    t = _parse_hhmm(hhmm_value)
    if not t:
        return None
    return datetime.combine(target_date, t)


def _decimal_hours_from_datetimes(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> float:
    if not start_dt or not end_dt:
        return 0.0

    diff_seconds = (end_dt - start_dt).total_seconds()
    if diff_seconds <= 0:
        return 0.0

    return round(diff_seconds / 3600.0, 2)


def _compute_attendance_metrics(
    time_in: Optional[datetime],
    time_out: Optional[datetime],
    scheduled_start: Optional[datetime],
    scheduled_end: Optional[datetime],
):
    total_hours = _decimal_hours_from_datetimes(time_in, time_out)

    late_minutes = 0
    overtime_hours = 0.0
    undertime_hours = 0.0

    if scheduled_start and time_in and time_in > scheduled_start:
        late_minutes = max(0, int((time_in - scheduled_start).total_seconds() // 60))

    if scheduled_end and time_out:
        if time_out > scheduled_end:
            overtime_hours = round((time_out - scheduled_end).total_seconds() / 3600.0, 2)
        elif time_out < scheduled_end:
            undertime_hours = round((scheduled_end - time_out).total_seconds() / 3600.0, 2)

    if late_minutes > 0:
        attendance_status = "late"
    elif overtime_hours > 0:
        attendance_status = "overtime"
    elif undertime_hours > 0:
        attendance_status = "undertime"
    else:
        attendance_status = "present"

    return {
        "total_hours": total_hours,
        "late_minutes": late_minutes,
        "overtime_hours": overtime_hours,
        "undertime_hours": undertime_hours,
        "attendance_status": attendance_status,
    }


def _get_shift_context_for_staff(sp: StaffProfile):
    today = date.today()
    shift_date_dt = datetime.combine(today, time.min)

    scheduled_start_dt = _combine_shift_datetime(today, getattr(sp, "scheduled_start_time", None))
    scheduled_end_dt = _combine_shift_datetime(today, getattr(sp, "scheduled_end_time", None))

    return shift_date_dt, scheduled_start_dt, scheduled_end_dt


def _parse_checklist_date(value: Optional[str]) -> datetime:
    if value:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d")
            return datetime.combine(parsed.date(), time.min)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid checklist_date format. Use YYYY-MM-DD")

    today = date.today()
    return datetime.combine(today, time.min)


def _get_attendance_date_range(target_date: datetime):
    start_dt = datetime.combine(target_date.date(), time.min)
    end_dt = start_dt + timedelta(days=1)
    return start_dt, end_dt


def _get_latest_attendance_for_staff_on_date(db: Session, staff_id: int, target_date: datetime):
    start_dt, end_dt = _get_attendance_date_range(target_date)

    return (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.staff_id == staff_id,
            AttendanceLog.time_in >= start_dt,
            AttendanceLog.time_in < end_dt,
        )
        .order_by(desc(AttendanceLog.id))
        .first()
    )


def _is_checklist_locked(db: Session, staff_id: int, checklist_date: datetime) -> bool:
    latest_attendance = _get_latest_attendance_for_staff_on_date(db, staff_id, checklist_date)
    if not latest_attendance:
        return False
    return bool(latest_attendance.time_out)


def _serialize_checklist(row: Optional[ClosingChecklist], checklist_locked: bool = False):
    if not row:
        return {
            "has_checklist": False,
            "checklist_id": None,
            "checklist_date": None,
            "wipe_counters": False,
            "refill_bins": False,
            "final_cash_register": False,
            "pos_devices_charging": False,
            "submitted_at": None,
            "updated_at": None,
            "checklist_locked": bool(checklist_locked),
        }

    return {
        "has_checklist": True,
        "checklist_id": row.id,
        "checklist_date": str(row.checklist_date) if row.checklist_date else None,
        "wipe_counters": bool(row.wipe_counters),
        "refill_bins": bool(row.refill_bins),
        "final_cash_register": bool(row.final_cash_register),
        "pos_devices_charging": bool(row.pos_devices_charging),
        "submitted_at": str(row.submitted_at) if row.submitted_at else None,
        "updated_at": str(row.updated_at) if row.updated_at else None,
        "checklist_locked": bool(checklist_locked),
    }


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
    current_role = _get_user_role_name(db, current_user)
    if current_role == "admin" and payload.staff_id is None:
        raise HTTPException(status_code=403, detail="Admin accounts are not allowed to clock in")

    staff_id = _resolve_staff_id(db, payload.staff_id, current_user)
    _, sp = _ensure_staff_exists(db, staff_id)

    open_log = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == staff_id,
        AttendanceLog.time_out.is_(None)
    ).first()
    if open_log:
        raise HTTPException(status_code=400, detail="Already clocked in (open shift exists)")

    now_dt = datetime.now()
    shift_date_dt, scheduled_start_dt, scheduled_end_dt = _get_shift_context_for_staff(sp)

    late_minutes = 0
    attendance_status = "present"

    if scheduled_start_dt and now_dt > scheduled_start_dt:
        late_minutes = int((now_dt - scheduled_start_dt).total_seconds() // 60)
        if late_minutes > 0:
            attendance_status = "late"

    row = AttendanceLog(
        staff_id=staff_id,
        shift_date=shift_date_dt,
        scheduled_start=scheduled_start_dt,
        scheduled_end=scheduled_end_dt,
        time_in=now_dt,
        attendance_status=attendance_status,
        total_hours=0,
        overtime_hours=0,
        undertime_hours=0,
        late_minutes=late_minutes,
        terminal_name=(payload.terminal_name or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        approval_status="approved",
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "clocked in",
        "attendance_id": row.id,
        "staff_id": row.staff_id,
        "shift_date": str(row.shift_date) if row.shift_date else None,
        "scheduled_start": str(row.scheduled_start) if row.scheduled_start else None,
        "scheduled_end": str(row.scheduled_end) if row.scheduled_end else None,
        "time_in": str(row.time_in),
        "time_out": str(row.time_out) if row.time_out else None,
        "attendance_status": row.attendance_status,
        "late_minutes": int(row.late_minutes or 0),
        "terminal_name": row.terminal_name,
        "notes": row.notes,
    }


@router.post("/clock-out")
def clock_out(
    payload: ClockOutPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    current_role = _get_user_role_name(db, current_user)
    if current_role == "admin" and payload.staff_id is None:
        raise HTTPException(status_code=403, detail="Admin accounts are not allowed to clock out")

    staff_id = _resolve_staff_id(db, payload.staff_id, current_user)
    _, sp = _ensure_staff_exists(db, staff_id)

    row = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == staff_id,
        AttendanceLog.time_out.is_(None)
    ).order_by(desc(AttendanceLog.id)).first()

    if not row:
        raise HTTPException(status_code=400, detail="No open shift found (not clocked in)")

    now_dt = datetime.now()
    row.time_out = now_dt

    if not row.shift_date:
        row.shift_date = datetime.combine(date.today(), time.min)

    if not row.scheduled_start:
        row.scheduled_start = _combine_shift_datetime(date.today(), getattr(sp, "scheduled_start_time", None))

    if not row.scheduled_end:
        row.scheduled_end = _combine_shift_datetime(date.today(), getattr(sp, "scheduled_end_time", None))

    metrics = _compute_attendance_metrics(
        time_in=row.time_in,
        time_out=row.time_out,
        scheduled_start=row.scheduled_start,
        scheduled_end=row.scheduled_end,
    )

    row.total_hours = metrics["total_hours"]
    row.late_minutes = metrics["late_minutes"]
    row.overtime_hours = metrics["overtime_hours"]
    row.undertime_hours = metrics["undertime_hours"]
    row.attendance_status = metrics["attendance_status"]

    if payload.terminal_name is not None:
        row.terminal_name = (payload.terminal_name or "").strip() or row.terminal_name

    if payload.notes is not None:
        existing_notes = (row.notes or "").strip()
        new_notes = (payload.notes or "").strip()
        if new_notes:
            row.notes = f"{existing_notes}\n{new_notes}".strip() if existing_notes else new_notes

    db.commit()
    db.refresh(row)

    return {
        "message": "clocked out",
        "attendance_id": row.id,
        "staff_id": row.staff_id,
        "shift_date": str(row.shift_date) if row.shift_date else None,
        "scheduled_start": str(row.scheduled_start) if row.scheduled_start else None,
        "scheduled_end": str(row.scheduled_end) if row.scheduled_end else None,
        "time_in": str(row.time_in),
        "time_out": str(row.time_out),
        "attendance_status": row.attendance_status,
        "total_hours": float(row.total_hours or 0),
        "late_minutes": int(row.late_minutes or 0),
        "overtime_hours": float(row.overtime_hours or 0),
        "undertime_hours": float(row.undertime_hours or 0),
        "terminal_name": row.terminal_name,
        "notes": row.notes,
    }


@router.get("/my-logs")
def get_my_attendance_logs(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier")),
):
    staff_id = int(current_user.id)
    _ensure_staff_exists(db, staff_id)

    rows = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.staff_id == staff_id)
        .order_by(desc(AttendanceLog.id))
        .limit(limit)
        .all()
    )

    sp = db.query(StaffProfile).filter(StaffProfile.user_id == staff_id).first()

    return {
        "count": len(rows),
        "data": [
            {
                "attendance_id": r.id,
                "staff_id": r.staff_id,
                "full_name": sp.full_name if sp else None,
                "position": sp.position if sp else None,
                "staff_code": sp.staff_code if sp else None,
                "shift_date": str(r.shift_date) if r.shift_date else None,
                "scheduled_start": str(r.scheduled_start) if r.scheduled_start else None,
                "scheduled_end": str(r.scheduled_end) if r.scheduled_end else None,
                "time_in": str(r.time_in) if r.time_in else None,
                "time_out": str(r.time_out) if r.time_out else None,
                "attendance_status": r.attendance_status,
                "total_hours": float(r.total_hours or 0),
                "overtime_hours": float(r.overtime_hours or 0),
                "undertime_hours": float(r.undertime_hours or 0),
                "late_minutes": int(r.late_minutes or 0),
                "terminal_name": r.terminal_name,
                "notes": r.notes,
                "approval_status": r.approval_status,
                "created_at": str(r.created_at) if r.created_at else None,
                "updated_at": str(r.updated_at) if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.get("/my-status")
def get_my_attendance_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier")),
):
    staff_id = int(current_user.id)
    _, sp = _ensure_staff_exists(db, staff_id)

    row = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == staff_id,
        AttendanceLog.time_out.is_(None)
    ).order_by(desc(AttendanceLog.id)).first()

    shift_date_dt, scheduled_start_dt, scheduled_end_dt = _get_shift_context_for_staff(sp)

    return {
        "staff_id": staff_id,
        "is_clocked_in": bool(row),
        "open_attendance_id": row.id if row else None,
        "shift_date": str(row.shift_date) if row and row.shift_date else str(shift_date_dt),
        "scheduled_start": str(row.scheduled_start) if row and row.scheduled_start else (str(scheduled_start_dt) if scheduled_start_dt else None),
        "scheduled_end": str(row.scheduled_end) if row and row.scheduled_end else (str(scheduled_end_dt) if scheduled_end_dt else None),
        "time_in": str(row.time_in) if row else None,
        "attendance_status": row.attendance_status if row else None,
        "late_minutes": int(row.late_minutes or 0) if row else 0,
        "terminal_name": row.terminal_name if row else None,
    }


@router.get("/status/{staff_id}")
def attendance_status(
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    role = _get_user_role_name(db, current_user)
    if role != "admin" and int(staff_id) != int(current_user.id):
        raise HTTPException(status_code=403, detail="You can only view your own attendance status")

    _, sp = _ensure_staff_exists(db, int(staff_id))

    row = db.query(AttendanceLog).filter(
        AttendanceLog.staff_id == int(staff_id),
        AttendanceLog.time_out.is_(None)
    ).order_by(desc(AttendanceLog.id)).first()

    shift_date_dt, scheduled_start_dt, scheduled_end_dt = _get_shift_context_for_staff(sp)

    return {
        "staff_id": int(staff_id),
        "is_clocked_in": bool(row),
        "open_attendance_id": row.id if row else None,
        "shift_date": str(row.shift_date) if row and row.shift_date else str(shift_date_dt),
        "scheduled_start": str(row.scheduled_start) if row and row.scheduled_start else (str(scheduled_start_dt) if scheduled_start_dt else None),
        "scheduled_end": str(row.scheduled_end) if row and row.scheduled_end else (str(scheduled_end_dt) if scheduled_end_dt else None),
        "time_in": str(row.time_in) if row else None,
        "attendance_status": row.attendance_status if row else None,
        "late_minutes": int(row.late_minutes or 0) if row else 0,
        "terminal_name": row.terminal_name if row else None,
    }


@router.post("/closing-checklist")
def submit_my_closing_checklist(
    payload: ClosingChecklistPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier")),
):
    staff_id = int(current_user.id)
    _ensure_staff_exists(db, staff_id)

    checklist_date = _parse_checklist_date(None)
    checklist_locked = _is_checklist_locked(db, staff_id, checklist_date)

    if checklist_locked:
        raise HTTPException(status_code=400, detail="Checklist is locked after clock out")

    row = db.query(ClosingChecklist).filter(
        ClosingChecklist.staff_id == staff_id,
        ClosingChecklist.checklist_date == checklist_date,
    ).first()

    if not row:
        row = ClosingChecklist(
            staff_id=staff_id,
            checklist_date=checklist_date,
        )
        db.add(row)

    row.wipe_counters = bool(payload.wipe_counters)
    row.refill_bins = bool(payload.refill_bins)
    row.final_cash_register = bool(payload.final_cash_register)
    row.pos_devices_charging = bool(payload.pos_devices_charging)
    row.submitted_at = datetime.now()

    db.commit()
    db.refresh(row)

    return {
        "message": "closing checklist saved",
        **_serialize_checklist(row, checklist_locked=False),
    }


@router.get("/closing-checklist/my-today")
def get_my_closing_checklist_today(
    checklist_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("staff", "cashier")),
):
    staff_id = int(current_user.id)
    _ensure_staff_exists(db, staff_id)

    target_date = _parse_checklist_date(checklist_date)
    checklist_locked = _is_checklist_locked(db, staff_id, target_date)

    row = db.query(ClosingChecklist).filter(
        ClosingChecklist.staff_id == staff_id,
        ClosingChecklist.checklist_date == target_date,
    ).first()

    return _serialize_checklist(row, checklist_locked=checklist_locked)


@router.get("/closing-checklists")
def list_closing_checklists(
    checklist_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    users = db.query(User).all()
    user_map = {u.id: u for u in users}
    sp_map = {s.user_id: s for s in db.query(StaffProfile).all()}

    q = db.query(ClosingChecklist)
    target_date = _parse_checklist_date(checklist_date)
    q = q.filter(ClosingChecklist.checklist_date == target_date)

    rows = q.order_by(desc(ClosingChecklist.submitted_at), desc(ClosingChecklist.id)).all()

    result = []
    for r in rows:
        role_name = _get_user_role_name(db, user_map.get(r.staff_id)) if user_map.get(r.staff_id) else None
        if role_name not in {"staff", "cashier"}:
            continue

        result.append({
            "has_checklist": True,
            "checklist_id": r.id,
            "staff_id": r.staff_id,
            "full_name": sp_map.get(r.staff_id).full_name if sp_map.get(r.staff_id) else None,
            "position": sp_map.get(r.staff_id).position if sp_map.get(r.staff_id) else None,
            "staff_code": sp_map.get(r.staff_id).staff_code if sp_map.get(r.staff_id) else None,
            "email": user_map.get(r.staff_id).email if user_map.get(r.staff_id) else None,
            "role": role_name,
            "checklist_date": str(r.checklist_date) if r.checklist_date else None,
            "wipe_counters": bool(r.wipe_counters),
            "refill_bins": bool(r.refill_bins),
            "final_cash_register": bool(r.final_cash_register),
            "pos_devices_charging": bool(r.pos_devices_charging),
            "submitted_at": str(r.submitted_at) if r.submitted_at else None,
            "updated_at": str(r.updated_at) if r.updated_at else None,
            "checklist_locked": _is_checklist_locked(db, r.staff_id, target_date),
        })

    return {
        "count": len(result),
        "data": result,
    }


@router.get("/closing-checklist/compliance-summary")
def get_closing_checklist_compliance_summary(
    checklist_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    target_date = _parse_checklist_date(checklist_date)

    users = db.query(User).all()
    staff_users = [u for u in users if _get_user_role_name(db, u) in {"staff", "cashier"}]
    total_staff = len(staff_users)

    checklist_rows = db.query(ClosingChecklist).filter(
        ClosingChecklist.checklist_date == target_date
    ).all()
    submitted_staff_ids = {row.staff_id for row in checklist_rows}

    submitted_count = sum(1 for u in staff_users if u.id in submitted_staff_ids)
    not_submitted_count = max(0, total_staff - submitted_count)

    compliance_rate = round((submitted_count / total_staff) * 100, 2) if total_staff > 0 else 0.0

    return {
        "checklist_date": str(target_date),
        "total_staff": total_staff,
        "submitted_count": submitted_count,
        "not_submitted_count": not_submitted_count,
        "compliance_rate": compliance_rate,
    }


@router.get("/export")
def export_attendance(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    q = db.query(AttendanceLog).join(User, User.id == AttendanceLog.staff_id)

    rows_all_users = db.query(User).all()
    allowed_staff_ids = []
    for u in rows_all_users:
        if _get_user_role_name(db, u) in {"staff", "cashier"}:
            allowed_staff_ids.append(u.id)

    if allowed_staff_ids:
        q = q.filter(AttendanceLog.staff_id.in_(allowed_staff_ids))
    else:
        q = q.filter(AttendanceLog.staff_id == -1)

    if start_date:
        q = q.filter(AttendanceLog.time_in >= start_date)

    if end_date:
        q = q.filter(AttendanceLog.time_in <= end_date)

    rows = q.order_by(desc(AttendanceLog.id)).all()

    user_map = {u.id: u for u in rows_all_users}
    sp_map = {s.user_id: s for s in db.query(StaffProfile).all()}

    output = StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Staff ID",
        "Staff Code",
        "Full Name",
        "Position",
        "Email",
        "Shift Date",
        "Scheduled Start",
        "Scheduled End",
        "Time In",
        "Time Out",
        "Total Hours",
        "Late Minutes",
        "Overtime",
        "Undertime",
        "Status",
        "Terminal",
        "Notes"
    ])

    for r in rows:
        writer.writerow([
            r.staff_id,
            sp_map.get(r.staff_id).staff_code if sp_map.get(r.staff_id) else "",
            sp_map.get(r.staff_id).full_name if sp_map.get(r.staff_id) else "",
            sp_map.get(r.staff_id).position if sp_map.get(r.staff_id) else "",
            user_map.get(r.staff_id).email if user_map.get(r.staff_id) else "",
            r.shift_date,
            r.scheduled_start,
            r.scheduled_end,
            r.time_in,
            r.time_out,
            float(r.total_hours or 0),
            int(r.late_minutes or 0),
            float(r.overtime_hours or 0),
            float(r.undertime_hours or 0),
            r.attendance_status,
            r.terminal_name,
            r.notes
        ])

    output.seek(0)

    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance.csv"}
    )


@router.get("/logs")
def list_attendance_logs(
    staff_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    users = db.query(User).all()
    user_map = {u.id: u for u in users}
    sp_map = {s.user_id: s for s in db.query(StaffProfile).all()}

    role_name_map = {}
    allowed_staff_ids = []

    today_checklist_date = _parse_checklist_date(None)
    checklist_rows = db.query(ClosingChecklist).filter(
        ClosingChecklist.checklist_date == today_checklist_date
    ).all()
    checklist_map = {r.staff_id: r for r in checklist_rows}

    for u in users:
        role_name = _get_user_role_name(db, u)
        role_name_map[u.id] = role_name

        if role_name in {"staff", "cashier"}:
            allowed_staff_ids.append(u.id)

    q = db.query(AttendanceLog)

    if allowed_staff_ids:
        q = q.filter(AttendanceLog.staff_id.in_(allowed_staff_ids))
    else:
        q = q.filter(AttendanceLog.staff_id == -1)

    if staff_id is not None:
        q = q.filter(AttendanceLog.staff_id == int(staff_id))

    rows = q.order_by(desc(AttendanceLog.id)).limit(limit).all()

    return {
        "count": len(rows),
        "data": [
            {
                "attendance_id": r.id,
                "staff_id": r.staff_id,
                "full_name": sp_map.get(r.staff_id).full_name if sp_map.get(r.staff_id) else None,
                "position": sp_map.get(r.staff_id).position if sp_map.get(r.staff_id) else None,
                "staff_code": sp_map.get(r.staff_id).staff_code if sp_map.get(r.staff_id) else None,
                "email": user_map.get(r.staff_id).email if user_map.get(r.staff_id) else None,
                "role": role_name_map.get(r.staff_id),
                "shift_date": str(r.shift_date) if r.shift_date else None,
                "scheduled_start": str(r.scheduled_start) if r.scheduled_start else None,
                "scheduled_end": str(r.scheduled_end) if r.scheduled_end else None,
                "time_in": str(r.time_in) if r.time_in else None,
                "time_out": str(r.time_out) if r.time_out else None,
                "attendance_status": r.attendance_status,
                "total_hours": float(r.total_hours or 0),
                "overtime_hours": float(r.overtime_hours or 0),
                "undertime_hours": float(r.undertime_hours or 0),
                "late_minutes": int(r.late_minutes or 0),
                "absence_reason": r.absence_reason,
                "terminal_name": r.terminal_name,
                "notes": r.notes,
                "approval_status": r.approval_status,
                "created_at": str(r.created_at) if r.created_at else None,
                "updated_at": str(r.updated_at) if r.updated_at else None,
                "closing_checklist": _serialize_checklist(
                    checklist_map.get(r.staff_id),
                    checklist_locked=_is_checklist_locked(db, r.staff_id, today_checklist_date)
                ),
            }
            for r in rows
        ]
    }