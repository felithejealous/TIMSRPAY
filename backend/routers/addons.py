from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from backend.database import SessionLocal
from backend.models import AddOn, User
from backend.security import require_roles

router = APIRouter(prefix="/addons", tags=["AddOns"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class AddOnCreate(BaseModel):
    name: str
    addon_type: str = "ADDON"
    price: float = 0
    is_active: bool = True


class AddOnPatch(BaseModel):
    name: Optional[str] = None
    addon_type: Optional[str] = None
    price: Optional[float] = None
    is_active: Optional[bool] = None


def serialize_addon(a: AddOn):
    return {
        "id": a.id,
        "add_on_id": a.id,
        "name": a.name,
        "addon_type": a.addon_type,
        "price": float(a.price),
        "is_active": bool(a.is_active),
        "created_at": str(a.created_at) if a.created_at else None,
    }


@router.get("/")
def list_addons(
    addon_type: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(AddOn)

    if addon_type:
        q = q.filter(sa_func.upper(AddOn.addon_type) == addon_type.strip().upper())

    if active_only:
        q = q.filter(AddOn.is_active == True)

    rows = q.order_by(AddOn.addon_type.asc(), AddOn.name.asc()).all()

    return [serialize_addon(a) for a in rows]


@router.post("/")
def create_addon(
    payload: AddOnCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    name = (payload.name or "").strip()
    addon_type = (payload.addon_type or "ADDON").strip().upper()

    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    if addon_type not in ["ADDON", "SIZE"]:
        raise HTTPException(status_code=400, detail="addon_type must be ADDON or SIZE")

    if payload.price < 0:
        raise HTTPException(status_code=400, detail="price must be >= 0")

    existing = db.query(AddOn).filter(sa_func.lower(AddOn.name) == name.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Add-on/size name already exists")

    row = AddOn(
        name=name,
        addon_type=addon_type,
        price=payload.price,
        is_active=payload.is_active,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return serialize_addon(row)


@router.patch("/{addon_id}")
def patch_addon(
    addon_id: int,
    payload: AddOnPatch,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    row = db.query(AddOn).filter(AddOn.id == addon_id).first()

    if not row:
        raise HTTPException(status_code=404, detail="Add-on/size not found")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")

        duplicate = db.query(AddOn).filter(
            sa_func.lower(AddOn.name) == name.lower(),
            AddOn.id != addon_id,
        ).first()

        if duplicate:
            raise HTTPException(status_code=400, detail="Add-on/size name already exists")

        row.name = name

    if payload.addon_type is not None:
        addon_type = payload.addon_type.strip().upper()
        if addon_type not in ["ADDON", "SIZE"]:
            raise HTTPException(status_code=400, detail="addon_type must be ADDON or SIZE")
        row.addon_type = addon_type

    if payload.price is not None:
        if payload.price < 0:
            raise HTTPException(status_code=400, detail="price must be >= 0")
        row.price = payload.price

    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(row)

    return serialize_addon(row)


@router.delete("/{addon_id}")
def delete_addon(
    addon_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    row = db.query(AddOn).filter(AddOn.id == addon_id).first()

    if not row:
        raise HTTPException(status_code=404, detail="Add-on/size not found")

    row.is_active = False
    db.commit()
    db.refresh(row)

    return {"message": "deactivated", "id": addon_id}