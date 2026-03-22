from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path
import shutil
import uuid

from backend.database import SessionLocal
from backend.security import require_roles
from backend.models import Announcement, User

router = APIRouter(prefix="/announcements", tags=["Announcements"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _utcnow():
    return datetime.now(timezone.utc)


def _to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    return _to_naive_utc(dt)


def validate_announcement_dates(
    publish_at_dt: Optional[datetime],
    expire_at_dt: Optional[datetime],
):
    publish_at_dt = _to_naive_utc(publish_at_dt)
    expire_at_dt = _to_naive_utc(expire_at_dt)
    now_naive_utc = _to_naive_utc(_utcnow())

    if publish_at_dt and publish_at_dt < now_naive_utc:
        raise HTTPException(status_code=400, detail="publish_at cannot be in the past")

    if publish_at_dt and expire_at_dt and expire_at_dt <= publish_at_dt:
        raise HTTPException(status_code=400, detail="expire_at must be after publish_at")


UPLOAD_DIR = Path("uploads/announcements")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def save_image(image: UploadFile):
    if not image.filename:
        raise HTTPException(status_code=400, detail="Invalid image file")

    ext = image.filename.split(".")[-1].lower()

    if ext not in {"jpg", "jpeg", "png", "webp"}:
        raise HTTPException(status_code=400, detail="Invalid image type")

    filename = f"{uuid.uuid4().hex}.{ext}"
    full_path = UPLOAD_DIR / filename

    with full_path.open("wb") as f:
        shutil.copyfileobj(image.file, f)

    return f"/uploads/announcements/{filename}", full_path


def delete_image(path: Optional[str]):
    if not path:
        return
    try:
        full_path = Path("." + path)
        if full_path.exists():
            full_path.unlink()
    except Exception:
        pass


def serialize_announcement(a: Announcement):
    return {
        "id": a.id,
        "title": a.title,
        "body": a.body,
        "image_url": a.image_url,
        "status": a.status,
        "is_pinned": bool(a.is_pinned),
        "publish_at": str(a.publish_at) if a.publish_at else None,
        "expire_at": str(a.expire_at) if a.expire_at else None,
        "created_at": str(a.created_at),
        "updated_at": str(a.updated_at) if a.updated_at else None,
    }


@router.get("/public")
def list_public_announcements(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    now_naive_utc = _to_naive_utc(_utcnow())

    rows = (
        db.query(Announcement)
        .filter(Announcement.status == "published")
        .filter(
            (Announcement.publish_at == None) | (Announcement.publish_at <= now_naive_utc)
        )
        .filter(
            (Announcement.expire_at == None) | (Announcement.expire_at > now_naive_utc)
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "count": len(rows),
        "data": [serialize_announcement(a) for a in rows],
    }


@router.get("/")
def list_all_announcements(
    status: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    q = db.query(Announcement)

    if status:
        q = q.filter(Announcement.status == status.strip().lower())

    rows = q.order_by(Announcement.is_pinned.desc(), Announcement.id.desc()).limit(limit).all()

    return {
        "count": len(rows),
        "data": [serialize_announcement(a) for a in rows],
    }


@router.post("/")
def create_announcement(
    title: str = Form(...),
    body: str = Form(...),
    status: str = Form("draft"),
    is_pinned: bool = Form(False),
    publish_at: Optional[str] = Form(None),
    expire_at: Optional[str] = Form(None),
    image: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    clean_title = title.strip()
    clean_body = body.strip()
    clean_status = status.strip().lower()

    if not clean_title:
        raise HTTPException(status_code=400, detail="Title is required")

    if not clean_body:
        raise HTTPException(status_code=400, detail="Body is required")

    if clean_status not in {"draft", "published", "archived"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    publish_at_dt = parse_dt(publish_at)
    expire_at_dt = parse_dt(expire_at)

    validate_announcement_dates(publish_at_dt, expire_at_dt)

    image_path = None
    if image:
        image_path, _ = save_image(image)

    announcement = Announcement(
        title=clean_title,
        body=clean_body,
        status=clean_status,
        is_pinned=bool(is_pinned),
        publish_at=publish_at_dt,
        expire_at=expire_at_dt,
        image_url=image_path,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )

    db.add(announcement)
    db.commit()
    db.refresh(announcement)

    return {
        "message": "created",
        "id": announcement.id,
        "data": serialize_announcement(announcement),
    }


@router.patch("/{announcement_id}")
def patch_announcement(
    announcement_id: int,
    title: Optional[str] = Form(None),
    body: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    is_pinned: Optional[bool] = Form(None),
    publish_at: Optional[str] = Form(None),
    expire_at: Optional[str] = Form(None),
    image: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    if title is not None:
        clean_title = title.strip()
        if not clean_title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        announcement.title = clean_title

    if body is not None:
        clean_body = body.strip()
        if not clean_body:
            raise HTTPException(status_code=400, detail="Body cannot be empty")
        announcement.body = clean_body

    if status is not None:
        clean_status = status.strip().lower()
        if clean_status not in {"draft", "published", "archived"}:
            raise HTTPException(status_code=400, detail="Invalid status")
        announcement.status = clean_status

    if is_pinned is not None:
        announcement.is_pinned = bool(is_pinned)

    if publish_at is not None:
        announcement.publish_at = parse_dt(publish_at)

    if expire_at is not None:
        announcement.expire_at = parse_dt(expire_at)

    validate_announcement_dates(announcement.publish_at, announcement.expire_at)

    if image:
        delete_image(announcement.image_url)
        image_path, _ = save_image(image)
        announcement.image_url = image_path

    announcement.updated_by_user_id = current_user.id
    announcement.updated_at = sa_func.now()

    db.commit()
    db.refresh(announcement)

    return {
        "message": "updated",
        "id": announcement.id,
        "data": serialize_announcement(announcement),
    }


@router.delete("/{announcement_id}")
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    delete_image(announcement.image_url)

    db.delete(announcement)
    db.commit()

    return {"message": "deleted", "id": announcement_id}