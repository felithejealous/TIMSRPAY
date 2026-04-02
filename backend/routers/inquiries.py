from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import Inquiry, User
from backend.schemas import InquiryCreate, InquiryReply, InquiryStatusUpdate
from backend.security import require_roles

router = APIRouter(prefix="/inquiries", tags=["Inquiries"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/")
def create_inquiry(payload: InquiryCreate, db: Session = Depends(get_db)):
    row = Inquiry(
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
        "data": [
            {
                "id": row.id,
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
            for row in rows
        ],
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

    from datetime import datetime

    row.admin_reply = payload.admin_reply.strip()
    row.status = (payload.status or "replied").strip().lower()
    row.replied_by_user_id = admin_user.id
    row.replied_at = datetime.utcnow()

    db.commit()
    return {"message": "Inquiry replied successfully"}


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

    return {"message": "Inquiry status updated successfully"}

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

    return {"message": "Inquiry visibility updated successfully"}