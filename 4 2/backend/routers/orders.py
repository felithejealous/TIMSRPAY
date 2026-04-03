from typing import Optional, Set, List, Dict
from decimal import Decimal
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

import hashlib
import hmac

from backend.database import SessionLocal
from backend.models import (
    Order, OrderItem, Product,
    RewardWallet, RewardTransaction,
    AddOn, OrderItemAddOn,
    InventoryMaster, ProductRecipe, AddOnRecipe,
    InventoryMasterMovement,
    Wallet, WalletTransaction,
    User,
)

# keep your original schema import (legacy endpoint uses it)
from backend.schemas import OrderCreate

# JWT guards
from backend.security import get_current_user, require_roles

router = APIRouter(prefix="/orders", tags=["Orders"])

VAT_RATE = Decimal("0.12")  # VAT included in displayed prices
REQUIRED_POINTS = 2800
ORDER_POINTS_CLAIM_WINDOW_HOURS = 24


def compute_initial_status(order_type: str, payment_method: str) -> str:
    order_type = (order_type or "").strip().lower()
    payment_method = (payment_method or "").strip().lower()

    # wallet payments become paid only AFTER successful deduction
    if payment_method == "wallet":
        return "pending"

    # cashier cash is considered paid immediately
    if order_type == "cashier":
        return "paid"

    # kiosk/online cash: unpaid yet
    return "pending"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _utcnow():
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ---------------------------
# REQUEST MODELS (NEW) - for kiosk/online/cashier flows
# ---------------------------
class OrderItemPayload(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    size: Optional[str] = "small"
    add_ons: Optional[List[int]] = None


class BaseOrderPayload(BaseModel):
    order_type: Optional[str] = None
    payment_method: Optional[str] = "cash"  # cash | wallet
    items: List[OrderItemPayload]

    wallet_email: Optional[str] = None
    wallet_pin: Optional[str] = None

    user_id: Optional[int] = None


class KioskOrderCreate(BaseOrderPayload):
    pass


class OnlineOrderCreate(BaseOrderPayload):
    # NOTE: ignored (we use current_user.id)
    user_id: Optional[int] = None


class CashierOrderCreate(BaseOrderPayload):
    pass


# ---------------------------
# STAFF: LIST ORDERS (QUEUE)  staff/cashier/admin only
# ---------------------------
@router.get("/")
def list_orders(
    status: Optional[str] = None,
    limit: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    q = db.query(Order)

    if status:
        q = q.filter(Order.status == status.strip().lower())

    orders = q.order_by(Order.id.desc()).limit(limit).all()

    return [
        {
            "order_id": o.id,
            "user_id": o.user_id,
            "order_type": o.order_type,
            "status": o.status,
            "created_at": str(o.created_at),
            "total_amount": float(o.total_amount),
            "earned_points": int(getattr(o, "earned_points", 0) or 0),
            "points_synced": bool(getattr(o, "points_synced", False)),
        }
        for o in orders
    ]


# ---------------------------
# STAFF: UPDATE ORDER STATUS staff/cashier/admin only
# ---------------------------
class OrderStatusUpdate(BaseModel):
    status: str


@router.patch("/{order_id}/status")
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    # design choice: limited to these statuses (paid is handled by /pay-cash, completed by /complete)
    allowed: Set[str] = {"pending", "unpaid"}

    new_status = (payload.status or "").strip().lower()
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {sorted(list(allowed))}")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in {"cancelled", "completed"}:
        raise HTTPException(status_code=400, detail=f"Cannot update status of '{order.status}' order")

    order.status = new_status
    db.commit()
    db.refresh(order)

    return {"order_id": order.id, "status": order.status}


@router.post("/{order_id}/complete")
def complete_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot complete a cancelled order")
    if order.status == "completed":
        raise HTTPException(status_code=400, detail="Order already completed")

    order.status = "completed"

    if hasattr(order, "completed_at"):
        order.completed_at = sa_func.now()

    db.commit()
    db.refresh(order)
    return {"order_id": order.id, "status": order.status}


# ---------------------------
# WALLET PAYMENT HELPER
# ---------------------------
def pay_with_wallet(db: Session, user_id: int, order_id: int, amount: Decimal):
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        raise HTTPException(status_code=400, detail="Wallet not found")

    bal = Decimal(str(wallet.balance))
    if bal < amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")

    wallet.balance = bal - amount

    db.add(
        WalletTransaction(
            wallet_id=wallet.id,
            order_id=order_id,
            amount=amount,
            transaction_type="PAYMENT",
        )
    )


# ---------------------------
# HELPER: DEDUCT PACKAGING (Cup by size + Straw)
# ---------------------------
def deduct_packaging_for_item(
    db: Session,
    order_id: int,
    qty: int,
    size_name: str,
):
    size_name = (size_name or "small").strip().lower()
    cup_name_map = {
        "small": "Cup-small",
        "medium": "Cup-medium",
        "large": "Cup-large",
    }
    cup_item_name = cup_name_map.get(size_name, "Cup-small")

    def _get_active_invm_by_name(name: str) -> InventoryMaster:
        row = (
            db.query(InventoryMaster)
            .filter(
                sa_func.lower(InventoryMaster.name) == name.strip().lower(),
                InventoryMaster.is_active == True,
            )
            .first()
        )
        if not row:
            raise HTTPException(status_code=400, detail=f"Packaging item missing/inactive in InventoryMaster: {name}")
        return row

    # CUP
    cup = _get_active_invm_by_name(cup_item_name)
    need_cup = Decimal(qty)

    if Decimal(str(cup.quantity)) < need_cup:
        raise HTTPException(status_code=400, detail=f"Not enough stock for {cup.name} (need {need_cup} pcs)")

    cup.quantity = Decimal(str(cup.quantity)) - need_cup
    db.add(
        InventoryMasterMovement(
            inventory_master_id=cup.id,
            change_qty=-need_cup,
            reason="packaging_cup",
            ref_order_id=order_id,
        )
    )

    # STRAW
    straw = _get_active_invm_by_name("Straw")
    need_straw = Decimal(qty)

    if Decimal(str(straw.quantity)) < need_straw:
        raise HTTPException(status_code=400, detail=f"Not enough stock for Straw (need {need_straw} pcs)")

    straw.quantity = Decimal(str(straw.quantity)) - need_straw
    db.add(
        InventoryMasterMovement(
            inventory_master_id=straw.id,
            change_qty=-need_straw,
            reason="packaging_straw",
            ref_order_id=order_id,
        )
    )


# -----------------------
# PBKDF2 PIN VERIFY (same format as wallet.py)
# -----------------------
def verify_pin(pin: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, iters, dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def verify_wallet_by_email_pin(db: Session, email: str, pin: str) -> Wallet:
    email = (email or "").strip().lower()
    pin = (pin or "").strip()

    if not email:
        raise HTTPException(status_code=400, detail="wallet_email is required for wallet payment")
    if not pin or not pin.isdigit() or not (4 <= len(pin) <= 6):
        raise HTTPException(status_code=400, detail="wallet_pin must be 4-6 digits")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Wallet user not found (email)")

    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    if not getattr(wallet, "pin_hash", None):
        raise HTTPException(status_code=400, detail="Wallet PIN not set")

    if not verify_pin(pin, wallet.pin_hash):
        raise HTTPException(status_code=401, detail="Invalid wallet PIN")

    return wallet


# ---------------------------
# INVENTORY MASTER DEDUCTION (RECIPES) + MOVEMENT LOGS
# ---------------------------
def deduct_inventory_master_for_item(
    db: Session,
    product_id: int,
    qty: int,
    order_id: int,
    selected_addon_ids: Optional[List[int]] = None,
):
    selected_addon_ids = selected_addon_ids or []

    # PRODUCT RECIPE
    pr_rows = db.query(ProductRecipe).filter(ProductRecipe.product_id == product_id).all()

    for pr in pr_rows:
        invm = db.query(InventoryMaster).filter(InventoryMaster.id == pr.inventory_master_id).first()
        if not invm or invm.is_active is False:
            raise HTTPException(status_code=400, detail="Inventory master item missing/inactive in product recipe")

        need = Decimal(str(pr.qty_used)) * Decimal(qty)

        if Decimal(str(invm.quantity)) < need:
            raise HTTPException(status_code=400, detail=f"Not enough inventory for '{invm.name}' (need {need} {invm.unit})")

        invm.quantity = Decimal(str(invm.quantity)) - need

        db.add(
            InventoryMasterMovement(
                inventory_master_id=invm.id,
                change_qty=-need,
                reason="product_recipe",
                ref_order_id=order_id,
            )
        )

    # ADDON RECIPE
    if selected_addon_ids:
        ar_rows = db.query(AddOnRecipe).filter(AddOnRecipe.add_on_id.in_(selected_addon_ids)).all()

        for ar in ar_rows:
            invm = db.query(InventoryMaster).filter(InventoryMaster.id == ar.inventory_master_id).first()
            if not invm or invm.is_active is False:
                raise HTTPException(status_code=400, detail="Inventory master item missing/inactive in add-on recipe")

            need = Decimal(str(ar.qty_used)) * Decimal(qty)

            if Decimal(str(invm.quantity)) < need:
                raise HTTPException(status_code=400, detail=f"Not enough inventory for '{invm.name}' (need {need} {invm.unit})")

            invm.quantity = Decimal(str(invm.quantity)) - need

            db.add(
                InventoryMasterMovement(
                    inventory_master_id=invm.id,
                    change_qty=-need,
                    reason="addon_recipe",
                    ref_order_id=order_id,
                )
            )


# ---------------------------
# CORE ORDER CREATOR (shared by kiosk/online/cashier + legacy)
# ---------------------------
def _create_order_core(
    db: Session,
    order_type: str,
    user_id: Optional[int],
    items: List[OrderItemPayload],
    payment_method: str,
    wallet_email: Optional[str],
    wallet_pin: Optional[str],
):
    total = Decimal("0")
    earned_points = 0
    potential_points = 0

    order_type = (order_type or "").strip().lower()
    payment_method = (payment_method or "cash").strip().lower()

    if order_type not in {"kiosk", "online", "cashier"}:
        raise HTTPException(status_code=400, detail="order_type must be kiosk|online|cashier")

    if payment_method not in {"cash", "wallet"}:
        raise HTTPException(status_code=400, detail="payment_method must be 'cash' or 'wallet'")

    if payment_method == "wallet":
        if not wallet_email or not wallet_pin:
            raise HTTPException(status_code=400, detail="wallet_email and wallet_pin are required for wallet payment")

    # preload SIZE add-ons
    size_rows = db.query(AddOn).filter(AddOn.addon_type == "SIZE", AddOn.is_active == True).all()
    size_price_map: Dict[str, Decimal] = {s.name.strip().lower(): Decimal(str(s.price)) for s in size_rows}
    size_price_map.setdefault("small", Decimal("0"))
    size_price_map.setdefault("medium", Decimal("10"))
    size_price_map.setdefault("large", Decimal("20"))

    # preload ADDON rows
    addon_ids: List[int] = []
    for it in items:
        if it.add_ons:
            addon_ids.extend([int(x) for x in it.add_ons])

    addons_by_id: Dict[int, AddOn] = {}
    if addon_ids:
        addons = db.query(AddOn).filter(AddOn.id.in_(list(set(addon_ids)))).all()
        addons_by_id = {a.id: a for a in addons}

    # validate items + compute total + compute potential/earned points
    for it in items:
        if int(it.quantity) <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be > 0")

        product = db.query(Product).filter(Product.id == int(it.product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")

        if hasattr(product, "is_active") and product.is_active is False:
            raise HTTPException(status_code=400, detail=f"Product '{product.name}' is inactive")

        base_price = Decimal(str(product.price))

        size_name = (it.size or "small").strip().lower()
        size_upcharge = size_price_map.get(size_name, Decimal("0"))

        addon_total = Decimal("0")
        if it.add_ons:
            for addon_id in it.add_ons:
                addon_id = int(addon_id)
                addon = addons_by_id.get(addon_id)
                if not addon:
                    raise HTTPException(status_code=404, detail=f"Add-on {addon_id} not found")
                if addon.is_active is False:
                    raise HTTPException(status_code=400, detail=f"Add-on '{addon.name}' is inactive")
                if addon.addon_type != "ADDON":
                    raise HTTPException(status_code=400, detail=f"Add-on '{addon.name}' is not type ADDON (SIZE should be sent via 'size')")
                addon_total += Decimal(str(addon.price))

        unit_price = base_price + size_upcharge + addon_total
        total += unit_price * Decimal(int(it.quantity))

        ppu = int(getattr(product, "points_per_unit", 0) or 0)
        potential_points += ppu * int(it.quantity)
        if user_id:
            earned_points += ppu * int(it.quantity)

    # VAT breakdown
    subtotal = total / (Decimal("1") + VAT_RATE)
    vat_amount = total - subtotal

    initial_status = compute_initial_status(order_type, payment_method)

    # snapshot to show on receipt:
    # - guest cash: store POTENTIAL points (claimable)
    # - logged-in user: store EARNED points
    order_points_snapshot = int(earned_points if user_id else potential_points)

    order = Order(
        user_id=user_id,
        order_type=order_type,
        status=initial_status,
        subtotal=subtotal,
        vat_amount=vat_amount,
        vat_rate=Decimal("12.00"),
        total_amount=total,
        earned_points=order_points_snapshot,
        points_synced=False,
        points_claim_expires_at=(_utcnow() + timedelta(hours=ORDER_POINTS_CLAIM_WINDOW_HOURS)) if not user_id else None,
    )
    db.add(order)
    db.flush()

    # payment
    if payment_method == "wallet":
        wallet = verify_wallet_by_email_pin(db, wallet_email, wallet_pin)
        pay_with_wallet(db, wallet.user_id, order.id, total)
        order.status = "paid"

        # if guest but wallet paid, tie order to wallet owner and convert potential->earned
        if not user_id:
            order.user_id = int(wallet.user_id)
            user_id = int(wallet.user_id)

            earned_points = 0
            for it in items:
                product = db.query(Product).filter(Product.id == int(it.product_id)).first()
                if product:
                    ppu = int(getattr(product, "points_per_unit", 0) or 0)
                    earned_points += ppu * int(it.quantity)

            order.earned_points = int(earned_points)
            order.points_claim_expires_at = None

    # create order items + add-ons + deductions
    for it in items:
        product = db.query(Product).filter(Product.id == int(it.product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")

        base_price = Decimal(str(product.price))
        size_name = (it.size or "small").strip().lower()
        size_upcharge = size_price_map.get(size_name, Decimal("0"))

        selected_addon_ids = [int(x) for x in (it.add_ons or [])]

        addon_total = Decimal("0")
        if selected_addon_ids:
            for addon_id in selected_addon_ids:
                addon = addons_by_id.get(int(addon_id))
                if not addon:
                    raise HTTPException(status_code=404, detail=f"Add-on {addon_id} not found")
                if addon.addon_type != "ADDON":
                    raise HTTPException(status_code=400, detail=f"Add-on '{addon.name}' is not type ADDON (SIZE should be sent via 'size')")
                addon_total += Decimal(str(addon.price))

        unit_price = base_price + size_upcharge + addon_total

        order_item = OrderItem(
            order_id=order.id,
            product_id=int(it.product_id),
            quantity=int(it.quantity),
            price=unit_price,
        )
        db.add(order_item)
        db.flush()

        if selected_addon_ids:
            for addon_id in selected_addon_ids:
                addon = addons_by_id[int(addon_id)]
                db.add(
                    OrderItemAddOn(
                        order_item_id=order_item.id,
                        add_on_id=int(addon.id),
                        qty=1,
                        price_at_time=Decimal(str(addon.price)),
                    )
                )

        deduct_packaging_for_item(
            db=db,
            order_id=order.id,
            qty=int(it.quantity),
            size_name=(it.size or "small"),
        )

        deduct_inventory_master_for_item(
            db=db,
            product_id=int(it.product_id),
            qty=int(it.quantity),
            order_id=order.id,
            selected_addon_ids=selected_addon_ids,
        )

    # apply points to reward wallet (cap at 2800)
    if user_id and int(earned_points) > 0:
        rw = db.query(RewardWallet).filter(RewardWallet.user_id == user_id).first()
        if not rw:
            rw = RewardWallet(user_id=user_id, total_points=0)
            db.add(rw)
            db.flush()

        current = int(rw.total_points or 0)

        if current < REQUIRED_POINTS:
            new_total = current + int(earned_points)
            capped_total = min(REQUIRED_POINTS, new_total)
            actual_added = capped_total - current

            rw.total_points = capped_total

            if actual_added > 0:
                db.add(
                    RewardTransaction(
                        reward_wallet_id=rw.id,
                        reward_id=None,
                        order_id=order.id,
                        points_change=int(actual_added),
                        transaction_type="EARN",
                    )
                )

            if actual_added > 0:
                order.earned_points = int(actual_added)
                order.points_synced = True
                order.points_claim_expires_at = None
                order.points_claimed_user_id = int(user_id)
                order.points_claimed_at = sa_func.now()
                order.points_claim_method = "wallet_auto" if payment_method == "wallet" else "auto"

    db.commit()
    db.refresh(order)

    return {
        "order_id": order.id,
        "order_type": order.order_type,
        "user_id": order.user_id,
        "payment_method": payment_method,
        "status": order.status,
        "subtotal": float(order.subtotal),
        "vat_rate": float(order.vat_rate),
        "vat_amount": float(order.vat_amount),
        "total_amount": float(order.total_amount),
        "earned_points": int(getattr(order, "earned_points", 0) or 0),
        "points_synced": bool(getattr(order, "points_synced", False)),
        "claim_expires_at": (
            str(getattr(order, "points_claim_expires_at", None))
            if getattr(order, "points_claim_expires_at", None)
            else None
        ),
    }


# ---------------------------
# LEGACY CREATE ORDER (keep for now)
# NOTE: public unless you add auth
# ---------------------------
@router.post("/")
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    try:
        items: List[OrderItemPayload] = []
        for it in payload.items:
            items.append(
                OrderItemPayload(
                    product_id=int(it.product_id),
                    quantity=int(it.quantity),
                    size=(getattr(it, "size", None) or "small"),
                    add_ons=[int(x) for x in (getattr(it, "add_ons", None) or [])] or None,
                )
            )

        return _create_order_core(
            db=db,
            order_type=(payload.order_type or "kiosk"),
            user_id=getattr(payload, "user_id", None),
            items=items,
            payment_method=(payload.payment_method or "cash"),
            wallet_email=getattr(payload, "wallet_email", None),
            wallet_pin=getattr(payload, "wallet_pin", None),
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ---------------------------
# NEW: KIOSK ORDER (guest-friendly) public
# ---------------------------
@router.post("/kiosk")
def create_kiosk_order(payload: KioskOrderCreate, db: Session = Depends(get_db)):
    try:
        return _create_order_core(
            db=db,
            order_type="kiosk",
            user_id=payload.user_id,
            items=payload.items,
            payment_method=payload.payment_method or "cash",
            wallet_email=payload.wallet_email,
            wallet_pin=payload.wallet_pin,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ---------------------------
# NEW: ONLINE ORDER requires JWT (customer)
# NOTE: ignores payload.user_id and uses current_user.id (self-only)
# ---------------------------
@router.post("/online")
def create_online_order(
    payload: OnlineOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return _create_order_core(
            db=db,
            order_type="online",
            user_id=current_user.id,
            items=payload.items,
            payment_method=payload.payment_method or "cash",
            wallet_email=payload.wallet_email,
            wallet_pin=payload.wallet_pin,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ---------------------------
# NEW: CASHIER ORDER cashier/staff/admin only
# ---------------------------
@router.post("/cashier")
def create_cashier_order(
    payload: CashierOrderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "staff", "admin")),
):
    try:
        return _create_order_core(
            db=db,
            order_type="cashier",
            user_id=payload.user_id,
            items=payload.items,
            payment_method=payload.payment_method or "cash",
            wallet_email=payload.wallet_email,
            wallet_pin=payload.wallet_pin,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ---------------------------
# CANCEL + VOID staff/cashier/admin only
# ---------------------------
class CancelPayload(BaseModel):
    reason: str


@router.post("/{order_id}/cancel")
def cancel_order(
    order_id: int,
    payload: CancelPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    try:
        reason = (payload.reason or "").strip()
        if len(reason) < 3:
            raise HTTPException(status_code=400, detail="reason is required (min 3 chars)")

        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.status == "cancelled":
            raise HTTPException(status_code=400, detail="Order already cancelled")
        if order.status == "completed":
            raise HTTPException(status_code=400, detail="Cannot cancel a completed order")

        # Reverse inventory master movements linked to this order
        movs = db.query(InventoryMasterMovement).filter(
            InventoryMasterMovement.ref_order_id == order_id
        ).all()

        for m in movs:
            change = Decimal(str(m.change_qty))
            if change < 0:
                invm = db.query(InventoryMaster).filter(InventoryMaster.id == m.inventory_master_id).first()
                if invm:
                    invm.quantity = Decimal(str(invm.quantity)) + abs(change)

                    db.add(
                        InventoryMasterMovement(
                            inventory_master_id=invm.id,
                            change_qty=abs(change),
                            reason="cancel_reversal",
                            ref_order_id=order_id,
                        )
                    )

        # Reverse points: only reverse what was actually credited (transactions)
        earned_sum = (
            db.query(sa_func.coalesce(sa_func.sum(RewardTransaction.points_change), 0))
            .filter(
                RewardTransaction.order_id == order_id,
                RewardTransaction.transaction_type == "EARN",
            )
            .scalar()
            or 0
        )
        earned_sum = int(earned_sum)

        if earned_sum > 0 and order.user_id:
            rw = db.query(RewardWallet).filter(RewardWallet.user_id == order.user_id).first()
            if rw:
                rw.total_points = max(0, int(rw.total_points or 0) - earned_sum)

                db.add(
                    RewardTransaction(
                        reward_wallet_id=rw.id,
                        reward_id=None,
                        order_id=order_id,
                        points_change=-earned_sum,
                        transaction_type="EARN",
                    )
                )

        # refund wallet if paid via wallet
        pay_txs = db.query(WalletTransaction).filter(
            WalletTransaction.order_id == order_id,
            WalletTransaction.transaction_type == "PAYMENT",
        ).all()

        refunded_wallet = False
        for pay_tx in pay_txs:
            wallet = db.query(Wallet).filter(Wallet.id == pay_tx.wallet_id).first()
            if wallet:
                wallet.balance = Decimal(str(wallet.balance)) + Decimal(str(pay_tx.amount))
                refunded_wallet = True

                db.add(
                    WalletTransaction(
                        wallet_id=wallet.id,
                        order_id=order_id,
                        amount=Decimal(str(pay_tx.amount)),
                        transaction_type="REFUND",
                    )
                )

        order.status = "cancelled"
        if hasattr(order, "cancel_reason"):
            order.cancel_reason = reason
        if hasattr(order, "cancelled_at"):
            order.cancelled_at = sa_func.now()

        db.commit()
        db.refresh(order)

        return {
            "order_id": order.id,
            "status": order.status,
            "cancel_reason": reason,
            "refunded_wallet": refunded_wallet,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/{order_id}/void")
def void_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    payload = CancelPayload(reason="VOID")
    return cancel_order(order_id=order_id, payload=payload, db=db, _=True)


# ---------------------------
# CASHIER: MARK ORDER AS PAID (CASH) cashier/staff/admin only
# ---------------------------
@router.post("/{order_id}/pay-cash")
def pay_cash_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "staff", "admin")),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in {"cancelled", "completed"}:
        raise HTTPException(status_code=400, detail=f"Cannot pay order with status '{order.status}'")
    if order.status == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    if order.status not in {"pending", "unpaid"}:
        raise HTTPException(status_code=400, detail="Only pending/unpaid orders can be marked as paid")

    order.status = "paid"
    if hasattr(order, "paid_at"):
        order.paid_at = sa_func.now()

    db.commit()
    db.refresh(order)

    return {"order_id": order.id, "status": order.status}

# ---------------------------
# RECEIPT VIEW public (or make staff-only if you want)
# ---------------------------
@router.get("/{order_id}/receipt")
def get_receipt(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    rows = (
        db.query(OrderItem, Product)
        .join(Product, Product.id == OrderItem.product_id)
        .filter(OrderItem.order_id == order_id)
        .all()
    )

    receipt_items = []
    for oi, p in rows:
        add_on_rows = (
            db.query(OrderItemAddOn, AddOn)
            .join(AddOn, AddOn.id == OrderItemAddOn.add_on_id)
            .filter(OrderItemAddOn.order_item_id == oi.id)
            .all()
        )

        addons = []
        addons_total = Decimal("0")
        for oia, ao in add_on_rows:
            line = Decimal(str(oia.price_at_time)) * Decimal(int(oia.qty))
            addons_total += line
            addons.append(
                {
                    "add_on_id": ao.id,
                    "name": ao.name,
                    "qty": int(oia.qty),
                    "price": float(oia.price_at_time),
                    "line_total": float(line),
                }
            )

        receipt_items.append(
            {
                "order_item_id": oi.id,
                "product_id": p.id,
                "name": p.name,
                "qty": int(oi.quantity),
                "unit_price": float(oi.price),
                "line_total": float(Decimal(str(oi.price)) * Decimal(int(oi.quantity))),
                "add_ons": addons,
                "add_ons_total": float(addons_total),
            }
        )

    potential_points = 0
    for oi, p in rows:
        ppu = int(getattr(p, "points_per_unit", 0) or 0)
        potential_points += ppu * int(oi.quantity)

    earned_points = int(getattr(order, "earned_points", 0) or 0)
    points_synced = bool(getattr(order, "points_synced", False))

    points_status = "synced" if points_synced else ("claimable" if int(potential_points) > 0 else "none")

    return {
        "order_id": order.id,
        "user_id": order.user_id,
        "order_type": order.order_type,
        "status": order.status,
        "created_at": str(order.created_at),
        "items": receipt_items,
        "subtotal": float(order.subtotal),
        "vat_rate": float(order.vat_rate),
        "vat_amount": float(order.vat_amount),
        "total_amount": float(order.total_amount),
        "earned_points": int(earned_points),
        "potential_points": int(potential_points),
        "points_status": points_status,
        "claim_expires_at": (
            str(getattr(order, "points_claim_expires_at", None))
            if getattr(order, "points_claim_expires_at", None)
            else None
        ),
    }

# for customers to view their own recent orders (or staff to view their own orders if they also order as customers)
@router.get("/my")
def my_orders(
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.id.desc())
        .limit(limit)
        .all()
    )

    result = []

    for o in orders:
        items = (
            db.query(OrderItem, Product)
            .join(Product, Product.id == OrderItem.product_id)
            .filter(OrderItem.order_id == o.id)
            .all()
        )

        for oi, p in items:
            result.append({
                "order_id": o.id,
                "product_name": p.name,
                "price": float(oi.price),
                "qty": oi.quantity
            })

    return result

