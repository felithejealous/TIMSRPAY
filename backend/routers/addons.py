from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import SessionLocal
from models import AddOn

router = APIRouter(prefix="/addons", tags=["AddOns"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
def list_addons(
    addon_type: Optional[str] = None,   # "SIZE" or "ADDON"
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    q = db.query(AddOn)

    if addon_type:
        q = q.filter(AddOn.addon_type == addon_type)

    if active_only:
        q = q.filter(AddOn.is_active == True)

    rows = q.order_by(AddOn.addon_type.asc(), AddOn.name.asc()).all()

    return [
        {
            "id": a.id,
            "name": a.name,
            "addon_type": a.addon_type,
            "price": float(a.price),
            "is_active": bool(a.is_active),
            "created_at": str(a.created_at) if a.created_at else None
        }
        for a in rows
    ]
