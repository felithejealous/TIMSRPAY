from typing import Optional
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from backend.database import SessionLocal
from backend.models import InventoryMaster, InventoryMasterMovement, InventoryAlertDismissal

from backend.security import require_roles
from backend.models import User
from backend.activity_logger import log_activity
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


def _sync_all_product_availability(db: Session):
    from backend.routers.products import sync_all_product_availability
    sync_all_product_availability(db, commit=False)


# -----------------------
# SCHEMAS
# -----------------------
class InventoryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = Field(default="General", min_length=1)
    unit: str = Field(..., min_length=1)
    quantity: Decimal = Field(default=Decimal("0"))
    alert_threshold: Decimal = Field(default=Decimal("10"), ge=0)
    expiration_date: Optional[datetime] = None
    is_active: bool = True


class InventoryUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    alert_threshold: Optional[Decimal] = Field(default=None, ge=0)
    expiration_date: Optional[datetime] = None
    is_active: Optional[bool] = None


class RestockPayload(BaseModel):
    qty_added: Decimal = Field(..., gt=0)
    reason: str = Field(default="restock")


class AdjustPayload(BaseModel):
    change_qty: Decimal
    reason: str = Field(default="adjustment")
    expiration_date: Optional[datetime] = None
    category: Optional[str] = None


# -----------------------
# HELPERS
# -----------------------
def _normalize_name(s: str) -> str:
    return (s or "").strip().lower()


def _normalize_text(s: str, fallback: str = "") -> str:
    s = (s or "").strip()
    return s if s else fallback


def _get_item(db: Session, inventory_master_id: int) -> InventoryMaster:
    row = db.query(InventoryMaster).filter(InventoryMaster.id == inventory_master_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return row


def _to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _validate_future_expiration(expiration_date: Optional[datetime]):
    if expiration_date is None:
        return

    exp_utc = _to_utc(expiration_date)
    now_utc = datetime.now(timezone.utc)

    if exp_utc.date() < now_utc.date():
        raise HTTPException(
            status_code=400,
            detail="expiration_date cannot be in the past"
        )


def _serialize_item(row: InventoryMaster):
    return {
        "inventory_master_id": row.id,
        "name": row.name,
        "category": getattr(row, "category", "General") or "General",
        "unit": row.unit,
        "quantity": float(Decimal(str(row.quantity))),
        "alert_threshold": float(Decimal(str(getattr(row, "alert_threshold", 10) or 10))),
        "expiration_date": str(getattr(row, "expiration_date", None)) if getattr(row, "expiration_date", None) else None,
        "is_active": bool(row.is_active),
        "updated_at": str(getattr(row, "updated_at", "")) if hasattr(row, "updated_at") else None,
    }
def _is_low_stock(row: InventoryMaster) -> bool:
    qty = Decimal(str(row.quantity or 0))
    threshold = Decimal(str(getattr(row, "alert_threshold", 0) or 0))
    return bool(row.is_active) and qty <= threshold


def _get_low_stock_severity(row: InventoryMaster) -> str:
    qty = Decimal(str(row.quantity or 0))
    threshold = Decimal(str(getattr(row, "alert_threshold", 0) or 0))

    if threshold <= 0:
        return "warning"

    return "critical" if qty <= (threshold / Decimal("2")) else "warning"


def _clear_low_stock_dismissals_if_resolved(db: Session, row: InventoryMaster):
    if not _is_low_stock(row):
        db.query(InventoryAlertDismissal).filter(
            InventoryAlertDismissal.inventory_master_id == row.id
        ).delete(synchronize_session=False)


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
        q_norm = _normalize_name(q)
        query = query.filter(
            sa_func.lower(InventoryMaster.name).like(f"%{q_norm}%")
            | sa_func.lower(InventoryMaster.category).like(f"%{q_norm}%")
        )

    rows = query.order_by(InventoryMaster.id.asc()).limit(limit).all()

    return {
        "count": len(rows),
        "data": [_serialize_item(r) for r in rows],
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
    return _serialize_item(r)


# =========================================================
# 3) CREATE NEW INVENTORY ITEM
# admin only
# =========================================================
@router.post("/master", operation_id="inventory_create_master_v1")
def create_inventory_master_item(
    payload: InventoryCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    name_norm = _normalize_name(payload.name)
    if not name_norm:
        raise HTTPException(status_code=400, detail="name is required")

    _validate_future_expiration(payload.expiration_date)

    if Decimal(str(payload.quantity)) < 0:
        raise HTTPException(status_code=400, detail="quantity cannot be negative")

    exists = db.query(InventoryMaster).filter(sa_func.lower(InventoryMaster.name) == name_norm).first()
    if exists:
        raise HTTPException(
            status_code=400,
            detail=f"Item already exists: {exists.name} (id={exists.id})",
        )

    row = InventoryMaster(
        name=payload.name.strip(),
        category=_normalize_text(payload.category, "General"),
        unit=payload.unit.strip(),
        quantity=Decimal(str(payload.quantity)),
        alert_threshold=Decimal(str(payload.alert_threshold)),
        expiration_date=payload.expiration_date,
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

    _sync_all_product_availability(db)
    _clear_low_stock_dismissals_if_resolved(db, row)
    
    log_activity(
        db,
        user=admin_user,
        action="Created inventory item",
        module="inventory",
        target_type="inventory_master",
        target_id=row.id,
        details=f"{row.name} | qty={row.quantity} {row.unit} | threshold={row.alert_threshold}"
)
    db.commit()
    db.refresh(row)

    return {
        "message": "created",
        **_serialize_item(row),
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
    admin_user: User = Depends(require_roles("admin")),
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

    if payload.category is not None:
        row.category = _normalize_text(payload.category, "General")

    if payload.unit is not None:
        if not payload.unit.strip():
            raise HTTPException(status_code=400, detail="unit cannot be empty")
        row.unit = payload.unit.strip()

    if payload.alert_threshold is not None:
        row.alert_threshold = Decimal(str(payload.alert_threshold))

    if payload.expiration_date is not None:
        _validate_future_expiration(payload.expiration_date)
        row.expiration_date = payload.expiration_date

    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)

    _sync_all_product_availability(db)
    _clear_low_stock_dismissals_if_resolved(db, row)
    log_activity(
        db,
        user=admin_user,
        action="Updated inventory item",
        module="inventory",
        target_type="inventory_master",
        target_id=row.id,
        details=f"{row.name} updated"
)

    db.commit()
    db.refresh(row)

    return {
        "message": "updated",
        **_serialize_item(row),
    }


# =========================================================
# 5) RESTOCK
# staff/cashier/admin
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

    _sync_all_product_availability(db)
    _clear_low_stock_dismissals_if_resolved(db, row)

    log_activity(
    db,
    user=_,
    action="Restocked inventory item",
    module="inventory",
    target_type="inventory_master",
    target_id=row.id,
    details=f"{row.name} | added={add} {row.unit} | reason={(payload.reason or 'restock').strip()}"
)

    db.commit()
    db.refresh(row)

    return {
        "message": "restocked",
        **_serialize_item(row),
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
   admin_user: User = Depends(require_roles("admin")),
):
    row = _get_item(db, inventory_master_id)

    change = Decimal(str(payload.change_qty))
    if change == 0:
        raise HTTPException(status_code=400, detail="change_qty must not be 0")

    new_qty = Decimal(str(row.quantity)) + change
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Adjustment would make quantity negative")

    row.quantity = new_qty

    if payload.expiration_date is not None:
        _validate_future_expiration(payload.expiration_date)
        row.expiration_date = payload.expiration_date

    if payload.category is not None:
        row.category = _normalize_text(payload.category, "General")

    db.add(
        InventoryMasterMovement(
            inventory_master_id=row.id,
            change_qty=change,
            reason=(payload.reason or "adjustment").strip(),
            ref_order_id=None,
        )
    )

    _sync_all_product_availability(db)
    _clear_low_stock_dismissals_if_resolved(db, row)
    log_activity(
    db,
    user=admin_user,
    action="Adjusted inventory item",
    module="inventory",
    target_type="inventory_master",
    target_id=row.id,
    details=f"{row.name} | change={change} {row.unit} | reason={(payload.reason or 'adjustment').strip()}"
)

    db.commit()
    db.refresh(row)

    return {
        "message": "adjusted",
        **_serialize_item(row),
    }


# =========================================================
# 7) DEACTIVATE / ACTIVATE
# admin only
# =========================================================
class ToggleInventoryActivePayload(BaseModel):
    is_active: bool


@router.patch("/master/{inventory_master_id}/active", operation_id="inventory_toggle_master_active_v1")
def set_inventory_item_active(
    inventory_master_id: int,
    payload: ToggleInventoryActivePayload,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    row = _get_item(db, inventory_master_id)
    row.is_active = bool(payload.is_active)

    _sync_all_product_availability(db)
    _clear_low_stock_dismissals_if_resolved(db, row)
    log_activity(
    db,
    user=admin_user,
    action="Changed inventory active status",
    module="inventory",
    target_type="inventory_master",
    target_id=row.id,
    details=f"{row.name} | is_active={row.is_active}"
)

    db.commit()
    db.refresh(row)

    return {
        "message": "updated",
        **_serialize_item(row),
    }


# =========================================================
# 8) MOVEMENT LOGS PER ITEM
# staff/cashier/admin
# =========================================================
@router.get("/master/{inventory_master_id}/movements", operation_id="inventory_master_movements_v1")
def get_inventory_master_movements(
    inventory_master_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    item = _get_item(db, inventory_master_id)

    try:
        rows = (
            db.query(
                InventoryMasterMovement.id,
                InventoryMasterMovement.inventory_master_id,
                InventoryMasterMovement.change_qty
            )
            .filter(InventoryMasterMovement.inventory_master_id == inventory_master_id)
            .order_by(InventoryMasterMovement.id.desc())
            .limit(limit)
            .all()
        )

        return {
            "inventory_master_id": inventory_master_id,
            "item_name": item.name,
            "count": len(rows),
            "data": [
                {
                    "id": r.id,
                    "change_qty": float(Decimal(str(r.change_qty))),
                    "reason": None,
                    "ref_order_id": None,
                    "created_at": None,
                }
                for r in rows
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Movement debug error: {str(e)}")
# =========================================================
# 9) LOW STOCK ALERTS (ADMIN)
# =========================================================
@router.get("/alerts/low-stock", operation_id="inventory_low_stock_alerts_v1")
def get_low_stock_alerts(
    include_dismissed: bool = False,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    rows = (
        db.query(InventoryMaster)
        .filter(InventoryMaster.is_active == True)
        .order_by(InventoryMaster.name.asc())
        .all()
    )

    low_rows = [row for row in rows if _is_low_stock(row)]
    item_ids = [row.id for row in low_rows]

    dismissed_map = {}
    if item_ids:
        dismissed_rows = (
            db.query(InventoryAlertDismissal)
            .filter(
                InventoryAlertDismissal.user_id == admin_user.id,
                InventoryAlertDismissal.inventory_master_id.in_(item_ids),
            )
            .all()
        )
        dismissed_map = {row.inventory_master_id: row for row in dismissed_rows}

    data = []
    for row in sorted(
        low_rows,
        key=lambda r: (Decimal(str(r.quantity or 0)), r.name.lower())
    ):
        dismissed_row = dismissed_map.get(row.id)
        is_dismissed = dismissed_row is not None

        if is_dismissed and not include_dismissed:
            continue

        data.append({
            "inventory_master_id": row.id,
            "name": row.name,
            "category": row.category,
            "unit": row.unit,
            "quantity": float(Decimal(str(row.quantity or 0))),
            "alert_threshold": float(Decimal(str(getattr(row, "alert_threshold", 0) or 0))),
            "severity": _get_low_stock_severity(row),
            "is_dismissed": is_dismissed,
            "dismissed_at": str(dismissed_row.dismissed_at) if dismissed_row else None,
            "updated_at": str(row.updated_at) if row.updated_at else None,
        })

    return {
        "count": len(data),
        "data": data,
    }


@router.post("/alerts/low-stock/{inventory_master_id}/dismiss", operation_id="inventory_low_stock_alert_dismiss_v1")
def dismiss_low_stock_alert(
    inventory_master_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    row = _get_item(db, inventory_master_id)

    if not _is_low_stock(row):
        return {"message": "Alert already resolved"}

    existing = (
        db.query(InventoryAlertDismissal)
        .filter(
            InventoryAlertDismissal.user_id == admin_user.id,
            InventoryAlertDismissal.inventory_master_id == inventory_master_id,
        )
        .first()
    )

    if not existing:
        db.add(
            InventoryAlertDismissal(
                user_id=admin_user.id,
                inventory_master_id=inventory_master_id,
            )
        )
        log_activity(
    db,
    user=admin_user,
    action="Dismissed low stock alert",
    module="inventory_alert",
    target_type="inventory_master",
    target_id=inventory_master_id,
    details=f"{row.name}"
)
    
        db.commit()

    return {"message": "Alert dismissed successfully"}


@router.post("/alerts/low-stock/{inventory_master_id}/restore", operation_id="inventory_low_stock_alert_restore_v1")
def restore_low_stock_alert(
    inventory_master_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    (
        db.query(InventoryAlertDismissal)
        .filter(
            InventoryAlertDismissal.user_id == admin_user.id,
            InventoryAlertDismissal.inventory_master_id == inventory_master_id,
        )
        .delete(synchronize_session=False)
    )
    row = _get_item(db, inventory_master_id)
    log_activity(
    db,
    user=admin_user,
    action="Restored low stock alert",
    module="inventory_alert",
    target_type="inventory_master",
    target_id=inventory_master_id,
    details=f"{row.name}"
)
    db.commit()

    return {"message": "Alert restored successfully"}