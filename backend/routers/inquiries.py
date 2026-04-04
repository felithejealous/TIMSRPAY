from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.database import SessionLocal
from backend.models import Inquiry, User, CustomerProfile
from backend.schemas import (
    InquiryPublicCreate,
    InquiryCustomerCreate,
    InquiryReply,
    InquiryStatusUpdate,
)
from backend.security import require_roles, get_current_user
from backend.utils.mailer import send_inquiry_reply_email

router = APIRouter(prefix="/inquiries", tags=["Inquiries"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def serialize_inquiry(row: Inquiry):
    return {
        "id": row.id,
        "user_id": row.user_id,
        "name": row.name,
        "email": row.email,
        "subject": row.subject,
        "message": row.message,
        "status": row.status,
        "admin_reply": row.admin_reply,
        "replied_by_user_id": row.replied_by_user_id,
        "replied_at": str(row.replied_at) if row.replied_at else None,
        "is_visible": row.is_visible,
        "created_at": str(row.created_at),
        "updated_at": str(row.updated_at),
    }


@router.post("/public")
def create_public_inquiry(payload: InquiryPublicCreate, db: Session = Depends(get_db)):
    row = Inquiry(
        user_id=None,
        name=payload.name.strip(),
        email=payload.email.strip().lower(),
        subject=(payload.subject or "").strip() or None,
        message=payload.message.strip(),
        status="pending",
        is_visible=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "Inquiry submitted successfully",
        "inquiry_id": row.id,
        "data": serialize_inquiry(row),
    }


@router.post("/me")
def create_my_inquiry(
    payload: InquiryCustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == current_user.id).first()

    full_name = None
    if profile:
        full_name = (
            (profile.full_name or "").strip()
            or " ".join(
                part for part in [
                    (profile.first_name or "").strip(),
                    (profile.last_name or "").strip(),
                ] if part
            ).strip()
        )

    if not full_name:
        full_name = (current_user.email or "Customer").split("@")[0]

    row = Inquiry(
        user_id=current_user.id,
        name=full_name,
        email=(current_user.email or "").strip().lower(),
        subject=(payload.subject or "").strip() or None,
        message=payload.message.strip(),
        status="pending",
        is_visible=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "Inquiry submitted successfully",
        "inquiry_id": row.id,
        "data": serialize_inquiry(row),
    }
@router.get("/my")
def list_my_inquiries(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_email = (current_user.email or "").strip().lower()

    rows = (
        db.query(Inquiry)
        .filter(
            Inquiry.is_visible == True,
            or_(
                Inquiry.user_id == current_user.id,
                Inquiry.email == user_email,
            )
        )
        .order_by(Inquiry.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "count": len(rows),
        "data": [serialize_inquiry(row) for row in rows],
    }
@router.get("/")
def list_inquiries(
    status: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    q = db.query(Inquiry)

    if status:
        q = q.filter(Inquiry.status == status.strip().lower())

    rows = q.order_by(Inquiry.id.desc()).limit(limit).all()

    return {
        "count": len(rows),
        "data": [serialize_inquiry(row) for row in rows],
    }


@router.put("/{inquiry_id}/reply")
def reply_inquiry(
    inquiry_id: int,
    payload: InquiryReply,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    row = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    clean_reply = payload.admin_reply.strip()

    row.admin_reply = clean_reply
    row.status = (payload.status or "replied").strip().lower()
    row.replied_by_user_id = admin_user.id
    row.replied_at = datetime.utcnow()

    db.commit()
    db.refresh(row)

    email_sent = False
    email_error = None

    try:
        send_inquiry_reply_email(
            to_email=(row.email or "").strip().lower(),
            customer_name=row.name or "Customer",
            inquiry_subject=row.subject,
            inquiry_message=row.message or "",
            admin_reply=clean_reply,
        )
        email_sent = True
    except Exception as exc:
        email_error = str(exc)
        print(f"[INQUIRY EMAIL ERROR] inquiry_id={row.id} error={email_error}")

    response = {
        "message": "Inquiry replied successfully",
        "email_sent": email_sent,
        "data": serialize_inquiry(row),
    }

    if not email_sent:
        response["warning"] = "Reply saved, but email notification failed."
        response["email_error"] = email_error

    return response


@router.patch("/{inquiry_id}/status")
def update_inquiry_status(
    inquiry_id: int,
    payload: InquiryStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    row.status = payload.status.strip().lower()
    db.commit()
    db.refresh(row)

    return {
        "message": "Inquiry status updated successfully",
        "data": serialize_inquiry(row),
    }


@router.patch("/{inquiry_id}/visibility")
def update_inquiry_visibility(
    inquiry_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    row.is_visible = bool(payload.get("is_visible", True))
    db.commit()
    db.refresh(row)

    return {
        "message": "Inquiry visibility updated successfully",
        "data": serialize_inquiry(row),
    }