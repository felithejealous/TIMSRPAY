from typing import Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from database import SessionLocal
from models import InventoryMaster, InventoryMasterMovement

# ✅ JWT + role guards
from security import require_roles, get_current_user  # get_current_user optional if you want to return who did what
from models import User  # for type hints only

router = APIRouter(prefix="/inventory", tags=["Inventory"])


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
class InventoryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    unit: str = Field(..., min_length=1)
    quantity: Decimal = Field(default=Decimal("0"))
    is_active: bool = True


class InventoryUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    is_active: Optional[bool] = None


class RestockPayload(BaseModel):
    qty_added: Decimal = Field(..., gt=0)
    reason: str = Field(default="restock")


class AdjustPayload(BaseModel):
    change_qty: Decimal
    reason: str = Field(default="adjustment")


# -----------------------
# HELPERS
# -----------------------
def _normalize_name(s: str) -> str:
    return (s or "").strip().lower()


def _get_item(db: Session, inventory_master_id: int) -> InventoryMaster:
    row = db.query(InventoryMaster).filter(InventoryMaster.id == inventory_master_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return row


# =========================================================
# 1) LIST INVENTORY MASTER
# staff/cashier/admin
# =========================================================
@router.get("/master", operation_id="inventory_list_master_v1")
def list_inventory_master(
    only_active: bool = True,
    q: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    query = db.query(InventoryMaster)

    if only_active:
        query = query.filter(InventoryMaster.is_active == True)

    if q:
        query = query.filter(sa_func.lower(InventoryMaster.name).like(f"%{_normalize_name(q)}%"))

    rows = query.order_by(InventoryMaster.id.asc()).limit(limit).all()

    return {
        "count": len(rows),
        "data": [
            {
                "inventory_master_id": r.id,
                "name": r.name,
                "unit": r.unit,
                "quantity": float(Decimal(str(r.quantity))),
                "is_active": bool(r.is_active),
            }
            for r in rows
        ],
    }


# =========================================================
# 2) GET SINGLE ITEM
# staff/cashier/admin
# =========================================================
@router.get("/master/{inventory_master_id}", operation_id="inventory_get_master_v1")
def get_inventory_master_item(
    inventory_master_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    r = _get_item(db, inventory_master_id)
    return {
        "inventory_master_id": r.id,
        "name": r.name,
        "unit": r.unit,
        "quantity": float(Decimal(str(r.quantity))),
        "is_active": bool(r.is_active),
    }


# =========================================================
# 3) CREATE NEW INVENTORY ITEM
# admin only
# =========================================================
@router.post("/master", operation_id="inventory_create_master_v1")
def create_inventory_master_item(
    payload: InventoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    name_norm = _normalize_name(payload.name)
    if not name_norm:
        raise HTTPException(status_code=400, detail="name is required")

    exists = db.query(InventoryMaster).filter(sa_func.lower(InventoryMaster.name) == name_norm).first()
    if exists:
        raise HTTPException(
            status_code=400,
            detail=f"Item already exists: {exists.name} (id={exists.id})",
        )

    row = InventoryMaster(
        name=payload.name.strip(),
        unit=payload.unit.strip(),
        quantity=Decimal(str(payload.quantity)),
        is_active=bool(payload.is_active),
    )
    db.add(row)
    db.flush()

    if Decimal(str(payload.quantity)) != Decimal("0"):
        db.add(
            InventoryMasterMovement(
                inventory_master_id=row.id,
                change_qty=Decimal(str(payload.quantity)),
                reason="create_initial_stock",
                ref_order_id=None,
            )
        )

    db.commit()
    db.refresh(row)

    return {
        "message": "created",
        "inventory_master_id": row.id,
        "name": row.name,
        "unit": row.unit,
        "quantity": float(Decimal(str(row.quantity))),
        "is_active": bool(row.is_active),
    }


# =========================================================
# 4) UPDATE ITEM
# admin only
# =========================================================
@router.patch("/master/{inventory_master_id}", operation_id="inventory_update_master_v1")
def update_inventory_master_item(
    inventory_master_id: int,
    payload: InventoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = _get_item(db, inventory_master_id)

    if payload.name is not None:
        new_name_norm = _normalize_name(payload.name)
        if not new_name_norm:
            raise HTTPException(status_code=400, detail="name cannot be empty")

        dup = db.query(InventoryMaster).filter(
            sa_func.lower(InventoryMaster.name) == new_name_norm,
            InventoryMaster.id != row.id,
        ).first()
        if dup:
            raise HTTPException(
                status_code=400,
                detail=f"Another item already has this name: {dup.name} (id={dup.id})",
            )
        row.name = payload.name.strip()

    if payload.unit is not None:
        if not payload.unit.strip():
            raise HTTPException(status_code=400, detail="unit cannot be empty")
        row.unit = payload.unit.strip()

    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(row)

    return {
        "message": "updated",
        "inventory_master_id": row.id,
        "name": row.name,
        "unit": row.unit,
        "quantity": float(Decimal(str(row.quantity))),
        "is_active": bool(row.is_active),
    }


# =========================================================
# 5) RESTOCK
# staff/cashier/admin (✅ up to you; if gusto mo admin only, sabihin mo)
# =========================================================
@router.post("/master/{inventory_master_id}/restock", operation_id="inventory_restock_master_v1")
def restock_inventory_master_item(
    inventory_master_id: int,
    payload: RestockPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    row = _get_item(db, inventory_master_id)

    if not row.is_active:
        raise HTTPException(status_code=400, detail="Item is inactive")

    add = Decimal(str(payload.qty_added))
    if add <= 0:
        raise HTTPException(status_code=400, detail="qty_added must be > 0")

    row.quantity = Decimal(str(row.quantity)) + add

    db.add(
        InventoryMasterMovement(
            inventory_master_id=row.id,
            change_qty=add,
            reason=(payload.reason or "restock").strip(),
            ref_order_id=None,
        )
    )

    db.commit()
    db.refresh(row)

    return {
        "message": "restocked",
        "inventory_master_id": row.id,
        "name": row.name,
        "unit": row.unit,
        "quantity": float(Decimal(str(row.quantity))),
    }


# =========================================================
# 6) ADJUST (+/-)
# admin only
# =========================================================
@router.post("/master/{inventory_master_id}/adjust", operation_id="inventory_adjust_master_v1")
def adjust_inventory_master_item(
    inventory_master_id: int,
    payload: AdjustPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = _get_item(db, inventory_master_id)

    change = Decimal(str(payload.change_qty))
    if change == 0:
        raise HTTPException(status_code=400, detail="change_qty must not be 0")

    new_qty = Decimal(str(row.quantity)) + change
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Adjustment would make quantity negative")

    row.quantity = new_qty

    db.add(
        InventoryMasterMovement(
            inventory_master_id=row.id,
            change_qty=change,
            reason=(payload.reason or "adjustment").strip(),
            ref_order_id=None,
        )
    )

    db.commit()
    db.refresh(row)

    return {
        "message": "adjusted",
        "inventory_master_id": row.id,
        "name": row.name,
        "unit": row.unit,
        "quantity": float(Decimal(str(row.quantity))),
    }


# =========================================================
# 7) MOVEMENT LOGS
# staff/cashier/admin
# =========================================================
@router.get("/master/{inventory_master_id}/movements", operation_id="inventory_master_movements_v1")
def get_inventory_master_movements(
    inventory_master_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    _ = _get_item(db, inventory_master_id)

    rows = (
        db.query(InventoryMasterMovement)
        .filter(InventoryMasterMovement.inventory_master_id == inventory_master_id)
        .order_by(InventoryMasterMovement.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "inventory_master_id": inventory_master_id,
        "count": len(rows),
        "data": [
            {
                "id": r.id,
                "change_qty": float(Decimal(str(r.change_qty))),
                "reason": r.reason,
                "ref_order_id": getattr(r, "ref_order_id", None),
                "created_at": str(getattr(r, "created_at", "")) if hasattr(r, "created_at") else None,
            }
            for r in rows
        ],
    }
