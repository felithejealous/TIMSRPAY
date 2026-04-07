from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import CustomerNotification, User
from backend.schemas import (
    CustomerNotificationOut,
    CustomerNotificationDismiss,
    CustomerNotificationRead,
)
from backend.security import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_customer_notification(
    db: Session,
    *,
    user_id: int,
    title: str,
    message: str,
    notif_type: str = "general",
    priority: str = "normal",
    is_sticky: bool = False,
    action_url: str | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
    expires_in_days: int = 30,
):
    notif = CustomerNotification(
        user_id=user_id,
        title=title,
        message=message,
        notif_type=notif_type,
        priority=priority,
        is_sticky=is_sticky,
        is_read=False,
        is_dismissed=False,
        action_url=action_url,
        reference_type=reference_type,
        reference_id=reference_id,
        expires_at=datetime.now() + timedelta(days=expires_in_days),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.get("/me", response_model=list[CustomerNotificationOut])
def get_my_notifications(
    important_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now()

    query = db.query(CustomerNotification).filter(
        CustomerNotification.user_id == current_user.id,
        (CustomerNotification.expires_at.is_(None) | (CustomerNotification.expires_at >= now)),
    )

    if important_only:
        query = query.filter(
            CustomerNotification.priority == "important",
            CustomerNotification.is_sticky == True,
            CustomerNotification.is_dismissed == False,
        )

    items = (
        query.order_by(CustomerNotification.created_at.desc())
        .limit(limit)
        .all()
    )
    return items


@router.get("/me/unread-count")
def get_unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now()

    unread_count = (
        db.query(CustomerNotification)
        .filter(
            CustomerNotification.user_id == current_user.id,
            CustomerNotification.is_read == False,
            (CustomerNotification.expires_at.is_(None) | (CustomerNotification.expires_at >= now)),
        )
        .count()
    )

    return {"unread_count": unread_count}


@router.patch("/{notification_id}/dismiss", response_model=CustomerNotificationOut)
def dismiss_notification(
    notification_id: int,
    payload: CustomerNotificationDismiss,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = (
        db.query(CustomerNotification)
        .filter(
            CustomerNotification.id == notification_id,
            CustomerNotification.user_id == current_user.id,
        )
        .first()
    )

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    notif.is_dismissed = payload.is_dismissed
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


@router.patch("/{notification_id}/read", response_model=CustomerNotificationOut)
def mark_notification_read(
    notification_id: int,
    payload: CustomerNotificationRead,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = (
        db.query(CustomerNotification)
        .filter(
            CustomerNotification.id == notification_id,
            CustomerNotification.user_id == current_user.id,
        )
        .first()
    )

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    notif.is_read = payload.is_read
    db.commit()
    db.refresh(notif)
    return notif