from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import SessionLocal
from backend.models import ProductFeedback, Product, User
from backend.schemas import ProductFeedbackCreate, ProductFeedbackReply, ProductFeedbackModerate
from backend.security import require_roles

router = APIRouter(prefix="/feedback", tags=["Feedback"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/")
def create_feedback(payload: ProductFeedbackCreate, db: Session = Depends(get_db)):
    customer_name = (payload.customer_name or "").strip()
    comment = (payload.comment or "").strip()
    email = (payload.email or "").strip().lower() if payload.email else None
    title = (payload.title or "").strip() or None
    product_name = (payload.product_name or "").strip() or None
    product_id = payload.product_id

    if not customer_name:
        raise HTTPException(status_code=400, detail="Customer name is required")

    if not comment:
        raise HTTPException(status_code=400, detail="Comment is required")

    rating = int(payload.rating or 0)
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Resolve product_id from product_name if product_id is missing
    if product_id is None and product_name:
        matched_product = (
            db.query(Product)
            .filter(func.lower(Product.name) == product_name.lower())
            .first()
        )
        if matched_product:
            product_id = matched_product.id
            product_name = matched_product.name

    # If product_id exists but product_name is missing, backfill product_name
    if product_id is not None and not product_name:
        matched_product = db.query(Product).filter(Product.id == product_id).first()
        if matched_product:
            product_name = matched_product.name

    # Duplicate check only for account-linked/order-linked feedback
    if payload.order_id is not None and payload.user_id is not None:
        existing = db.query(ProductFeedback).filter(
            ProductFeedback.order_id == payload.order_id,
            ProductFeedback.user_id == payload.user_id,
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail="Feedback already submitted for this order")

    row = ProductFeedback(
        user_id=payload.user_id,
        order_id=payload.order_id,
        product_id=product_id,
        customer_name=customer_name,
        email=email,
        product_name=product_name,
        rating=rating,
        title=title,
        comment=comment,
        is_approved=False,
        is_featured=False,
        is_visible=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "Feedback submitted successfully",
        "feedback_id": row.id,
        "product_id": row.product_id,
        "product_name": row.product_name,
    }


@router.get("/")
def list_feedback(
    approved_only: bool = False,
    featured_only: bool = False,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    q = db.query(ProductFeedback)

    if approved_only:
        q = q.filter(ProductFeedback.is_approved == True)

    if featured_only:
        q = q.filter(ProductFeedback.is_featured == True)

    rows = q.order_by(ProductFeedback.id.desc()).limit(limit).all()

    return {
        "count": len(rows),
        "data": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "order_id": row.order_id,
                "product_id": row.product_id,
                "customer_name": row.customer_name,
                "email": row.email,
                "product_name": row.product_name,
                "rating": row.rating,
                "title": row.title,
                "comment": row.comment,
                "admin_reply": row.admin_reply,
                "is_approved": row.is_approved,
                "is_featured": row.is_featured,
                "is_visible": row.is_visible,
                "created_at": str(row.created_at),
                "updated_at": str(row.updated_at),
            }
            for row in rows
        ],
    }


@router.get("/public")
def list_public_feedback(limit: int = 20, db: Session = Depends(get_db)):
    rows = (
        db.query(ProductFeedback)
        .filter(
            ProductFeedback.is_approved == True,
            ProductFeedback.is_visible == True,
        )
        .order_by(ProductFeedback.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "count": len(rows),
        "data": [
            {
                "id": row.id,
                "customer_name": row.customer_name,
                "product_name": row.product_name,
                "rating": row.rating,
                "title": row.title,
                "comment": row.comment,
                "admin_reply": row.admin_reply,
                "is_featured": row.is_featured,
                "created_at": str(row.created_at),
            }
            for row in rows
        ],
    }


@router.get("/featured")
def list_featured_feedback(limit: int = 10, db: Session = Depends(get_db)):
    rows = (
        db.query(ProductFeedback)
        .filter(
            ProductFeedback.is_approved == True,
            ProductFeedback.is_visible == True,
            ProductFeedback.is_featured == True,
        )
        .order_by(ProductFeedback.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "count": len(rows),
        "data": [
            {
                "id": row.id,
                "customer_name": row.customer_name,
                "product_name": row.product_name,
                "rating": row.rating,
                "title": row.title,
                "comment": row.comment,
                "admin_reply": row.admin_reply,
                "created_at": str(row.created_at),
            }
            for row in rows
        ],
    }


@router.put("/{feedback_id}/reply")
def reply_feedback(
    feedback_id: int,
    payload: ProductFeedbackReply,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    row = db.query(ProductFeedback).filter(ProductFeedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")

    from datetime import datetime

    row.admin_reply = payload.admin_reply.strip()
    row.replied_by_user_id = admin_user.id
    row.replied_at = datetime.utcnow()

    db.commit()
    return {"message": "Feedback replied successfully"}


@router.patch("/{feedback_id}/moderate")
def moderate_feedback(
    feedback_id: int,
    payload: ProductFeedbackModerate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(ProductFeedback).filter(ProductFeedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if payload.is_approved is not None:
        row.is_approved = payload.is_approved

    if payload.is_featured is not None:
        row.is_featured = payload.is_featured

    if payload.is_visible is not None:
        row.is_visible = payload.is_visible

    db.commit()
    return {"message": "Feedback updated successfully"}