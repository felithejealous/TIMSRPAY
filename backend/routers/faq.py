from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import FAQ, User
from backend.schemas import FAQCreate, FAQUpdate
from backend.security import require_roles

router = APIRouter(prefix="/faq", tags=["FAQ"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/")
def create_faq(
    payload: FAQCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    row = FAQ(
        question=payload.question.strip(),
        answer=payload.answer.strip(),
        display_order=payload.display_order if payload.display_order is not None else 0,
        is_active=payload.is_active if payload.is_active is not None else True,
        is_pinned=payload.is_pinned if payload.is_pinned is not None else False,
        created_by_user_id=admin_user.id,
        updated_by_user_id=admin_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "FAQ created successfully",
        "faq_id": row.id,
    }


@router.get("/")
def list_faq(
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(FAQ)

    if active_only:
        q = q.filter(FAQ.is_active == True)

    rows = q.order_by(
        FAQ.is_pinned.desc(),
        FAQ.display_order.asc(),
        FAQ.id.desc()
    ).all()

    return {
        "count": len(rows),
        "data": [
            {
                "id": row.id,
                "question": row.question,
                "answer": row.answer,
                "display_order": row.display_order,
                "is_active": row.is_active,
                "is_pinned": row.is_pinned,
                "created_at": str(row.created_at) if row.created_at else None,
                "updated_at": str(row.updated_at) if row.updated_at else None,
            }
            for row in rows
        ],
    }


@router.get("/public")
def list_public_faq(
    db: Session = Depends(get_db),
):
    rows = (
        db.query(FAQ)
        .filter(FAQ.is_active == True)
        .order_by(FAQ.is_pinned.desc(), FAQ.display_order.asc(), FAQ.id.desc())
        .all()
    )

    return {
        "count": len(rows),
        "data": [
            {
                "id": row.id,
                "question": row.question,
                "answer": row.answer,
                "display_order": row.display_order,
                "is_pinned": row.is_pinned,
                "created_at": str(row.created_at) if row.created_at else None,
                "updated_at": str(row.updated_at) if row.updated_at else None,
            }
            for row in rows
        ],
    }


@router.put("/{faq_id}")
@router.patch("/{faq_id}")
def update_faq(
    faq_id: int,
    payload: FAQUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    row = db.query(FAQ).filter(FAQ.id == faq_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="FAQ not found")

    if payload.question is not None:
        row.question = payload.question.strip()

    if payload.answer is not None:
        row.answer = payload.answer.strip()

    if payload.display_order is not None:
        row.display_order = payload.display_order

    if payload.is_active is not None:
        row.is_active = payload.is_active

    if payload.is_pinned is not None:
        row.is_pinned = payload.is_pinned

    row.updated_by_user_id = admin_user.id

    db.commit()
    db.refresh(row)

    return {"message": "FAQ updated successfully"}


@router.delete("/{faq_id}")
def delete_faq(
    faq_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(FAQ).filter(FAQ.id == faq_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="FAQ not found")

    db.delete(row)
    db.commit()

    return {"message": "FAQ deleted successfully"}