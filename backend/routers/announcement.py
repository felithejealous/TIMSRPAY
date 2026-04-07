<<<<<<< HEAD
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from datetime import datetime, timezone
from typing import Optional, List

from backend.database import SessionLocal
from backend.security import get_current_user, require_roles
from backend.models import Announcement, User
from fastapi import File, UploadFile, Form
import shutil
import uuid
from pathlib import Path

router = APIRouter(prefix="/announcements", tags=["Announcements"])

# -----------------------
# DB
# -----------------------
=======
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


>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

<<<<<<< HEAD
def _utcnow():
    return datetime.now(timezone.utc)

def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

# -----------------------
# SCHEMAS
# -----------------------
class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1)
    is_pinned: bool = False
    publish_at: Optional[datetime] = None
    expire_at: Optional[datetime] = None
    status: str = "draft"   # draft|published|archived

class AnnouncementPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=150)
    body: Optional[str] = Field(default=None, min_length=1)
    is_pinned: Optional[bool] = None
    publish_at: Optional[datetime] = None
    expire_at: Optional[datetime] = None
    status: Optional[str] = None  # draft|published|archived

# ============================================================
# PUBLIC: list announcements (published only + auto-schedule)
# ============================================================
=======

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
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
@router.get("/public")
def list_public_announcements(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
<<<<<<< HEAD
    now = _utcnow()

    q = db.query(Announcement).filter(Announcement.status == "published")

    # scheduled publish
    q = q.filter(
        (Announcement.publish_at == None) | (Announcement.publish_at <= now.replace(tzinfo=None))
    )

    # auto-expire
    q = q.filter(
        (Announcement.expire_at == None) | (Announcement.expire_at > now.replace(tzinfo=None))
    )

    rows = (
        q.order_by(Announcement.is_pinned.desc(), Announcement.id.desc())
=======
    now_naive_utc = _to_naive_utc(_utcnow())

    rows = (
        db.query(Announcement)
        .filter(sa_func.lower(Announcement.status) == "published")
        .filter(
            (Announcement.publish_at.is_(None)) | (Announcement.publish_at <= now_naive_utc)
        )
        .filter(
            (Announcement.expire_at.is_(None)) | (Announcement.expire_at > now_naive_utc)
        )
        .order_by(
            Announcement.is_pinned.desc(),
            Announcement.publish_at.desc().nullslast(),
            Announcement.created_at.desc(),
            Announcement.id.desc(),
        )
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
        .limit(limit)
        .all()
    )

    return {
        "count": len(rows),
<<<<<<< HEAD
        "data": [
            {
                "id": a.id,
                "title": a.title,
                "body": a.body,
                "is_pinned": bool(a.is_pinned),
                "publish_at": str(a.publish_at) if a.publish_at else None,
                "expire_at": str(a.expire_at) if a.expire_at else None,
                "created_at": str(a.created_at),
            }
            for a in rows
        ],
    }

# ============================================================
# STAFF: list all (draft/published/archived)
# ============================================================
=======
        "data": [serialize_announcement(a) for a in rows],
    }

>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
@router.get("/")
def list_all_announcements(
    status: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    q = db.query(Announcement)
<<<<<<< HEAD
=======

>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
    if status:
        q = q.filter(Announcement.status == status.strip().lower())

    rows = q.order_by(Announcement.is_pinned.desc(), Announcement.id.desc()).limit(limit).all()

    return {
        "count": len(rows),
<<<<<<< HEAD
        "data": [
            {
                "id": a.id,
                "title": a.title,
                "body": a.body,
                "status": a.status,
                "is_pinned": bool(a.is_pinned),
                "publish_at": str(a.publish_at) if a.publish_at else None,
                "expire_at": str(a.expire_at) if a.expire_at else None,
                "created_at": str(a.created_at),
                "updated_at": str(a.updated_at) if a.updated_at else None,
                "created_by_user_id": a.created_by_user_id,
                "updated_by_user_id": a.updated_by_user_id,
            }
            for a in rows
        ],
    }

# ============================================================
# STAFF: create
# ============================================================
UPLOAD_DIR = Path("uploads/announcements")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

=======
        "data": [serialize_announcement(a) for a in rows],
    }

>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

@router.post("/")
def create_announcement(
    title: str = Form(...),
    body: str = Form(...),
    status: str = Form("draft"),
    is_pinned: bool = Form(False),
    publish_at: Optional[str] = Form(None),
    expire_at: Optional[str] = Form(None),
<<<<<<< HEAD

    image: UploadFile = File(None),  # 👈 optional photo

    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):

    status = status.strip().lower()
    if status not in {"draft", "published", "archived"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    image_path = None

    # --------------------
    # Save image
    # --------------------
    if image:
        ext = image.filename.split(".")[-1].lower()

        if ext not in {"jpg", "jpeg", "png", "webp"}:
            raise HTTPException(status_code=400, detail="Invalid image type")

        filename = f"{uuid.uuid4().hex}.{ext}"
        full_path = UPLOAD_DIR / filename

        with full_path.open("wb") as f:
            shutil.copyfileobj(image.file, f)

        image_path = f"/uploads/announcements/{filename}"

    # --------------------
    # Dates
    # --------------------
    def parse_dt(v):
        if not v:
            return None
        return datetime.fromisoformat(v).replace(tzinfo=None)

    publish_at_dt = parse_dt(publish_at)
    expire_at_dt = parse_dt(expire_at)

    if publish_at_dt and expire_at_dt and expire_at_dt <= publish_at_dt:
        raise HTTPException(status_code=400, detail="expire_at must be after publish_at")

    # --------------------
    # Save DB
    # --------------------
    a = Announcement(
        title=title.strip(),
        body=body.strip(),
        status=status,
        is_pinned=bool(is_pinned),

        publish_at=publish_at_dt,
        expire_at=expire_at_dt,

        image_url=image_path,

=======
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
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )

<<<<<<< HEAD
    db.add(a)
    db.commit()
    db.refresh(a)

    return {
        "message": "created",
        "id": a.id,
        "image_url": image_path,
    }


# ============================================================
# STAFF: patch/edit
# ============================================================
@router.patch("/{announcement_id}")
def patch_announcement(
    announcement_id: int,
    payload: AnnouncementPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("staff", "cashier", "admin")),
):
    a = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Announcement not found")

    if payload.title is not None:
        a.title = payload.title.strip()
    if payload.body is not None:
        a.body = payload.body.strip()
    if payload.is_pinned is not None:
        a.is_pinned = bool(payload.is_pinned)

    if payload.status is not None:
        status = payload.status.strip().lower()
        if status not in {"draft", "published", "archived"}:
            raise HTTPException(status_code=400, detail="Invalid status")
        a.status = status

    if payload.publish_at is not None:
        a.publish_at = payload.publish_at.replace(tzinfo=None) if payload.publish_at else None
    if payload.expire_at is not None:
        a.expire_at = payload.expire_at.replace(tzinfo=None) if payload.expire_at else None

    if a.publish_at and a.expire_at and a.expire_at <= a.publish_at:
        raise HTTPException(status_code=400, detail="expire_at must be after publish_at")

    a.updated_by_user_id = current_user.id
    a.updated_at = sa_func.now()

    db.commit()
    db.refresh(a)
    return {"message": "updated", "id": a.id}

# ============================================================
# ADMIN: delete (hard delete)
# ============================================================
=======
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


>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
@router.delete("/{announcement_id}")
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
<<<<<<< HEAD
    a = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Announcement not found")

    db.delete(a)
    db.commit()
    return {"message": "deleted", "id": announcement_id}
=======
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    delete_image(announcement.image_url)

    db.delete(announcement)
    db.commit()

    return {"message": "deleted", "id": announcement_id}
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
