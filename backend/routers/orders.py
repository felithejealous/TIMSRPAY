from typing import Optional, Set, List, Dict
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
from backend.models import ProductFeedback
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func as sa_func

from backend.database import SessionLocal
from backend.models import (
    Order,
    OrderItem,
    Product,
    RewardWallet,
    RewardTransaction,
    AddOn,
    OrderItemAddOn,
    InventoryMaster,
    ProductRecipe,
    AddOnRecipe,
    InventoryMasterMovement,
    Wallet,
    WalletTransaction,
    User,
    CustomerProfile,
    PromoCode,
    PromoCodeRedemption,
    StaffProfile,
)
from backend.schemas import OrderCreate
from backend.security import get_current_user, require_roles

router = APIRouter(prefix="/orders", tags=["Orders"])

VAT_RATE = Decimal("0.12")
REQUIRED_POINTS = 2800
ORDER_POINTS_CLAIM_WINDOW_HOURS = 24
ORDER_DISPLAY_OFFSET = 900
PLACEHOLDER_CUSTOMER_NAMES = {
    "teopay customer",
    "wallet customer",
    "walk-in customer",
    "guest",
    "guest customer",
    "customer",
}

def compute_initial_status(order_type: str, payment_method: str) -> str:
    order_type = (order_type or "").strip().lower()
    payment_method = (payment_method or "").strip().lower()

    if payment_method == "wallet":
        return "paid"
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


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _display_order_id(order_id: int) -> str:
    return f"#TM-{ORDER_DISPLAY_OFFSET + int(order_id)}"


def _sync_all_product_availability(db: Session):
    from backend.routers.products import sync_all_product_availability
    sync_all_product_availability(db, commit=False)


class OrderItemPayload(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    size: Optional[str] = "small"
    add_ons: Optional[List[int]] = None
    notes: Optional[str] = Field(default=None,  max_length=500)

class WalletPayPayload(BaseModel):
    wallet_email: Optional[str] = None
    wallet_code: Optional[str] = None
    wallet_pin: str = Field(min_length=4, max_length=6)
class BaseOrderPayload(BaseModel):
    order_type: Optional[str] = None
    payment_method: Optional[str] = "cash"
    items: List[OrderItemPayload]
    wallet_email: Optional[str] = None
    wallet_code: Optional[str] = None
    wallet_pin: Optional[str] = None
    promo_code: Optional[str] = None
    user_id: Optional[int] = None
class CashPayPayload(BaseModel):
    amount_received: Decimal = Field(gt=0)

class KioskOrderCreate(BaseOrderPayload):
    customer_name: str = Field(min_length=1, max_length=150)


class OnlineOrderCreate(BaseModel):
    payment_method: Optional[str] = "cash"
    items: List[OrderItemPayload]
    wallet_email: Optional[str] = None
    wallet_code: Optional[str] = None
    wallet_pin: Optional[str] = None
    promo_code: Optional[str] = None


class CashierOrderCreate(BaseOrderPayload):
    customer_name: str = Field(min_length=1, max_length=150)


class OrderStatusUpdate(BaseModel):
    status: str


class CancelPayload(BaseModel):
    reason: str

@router.get("/")
def list_orders(
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    customer_user = aliased(User)
    staff_user = aliased(User)
    staff_profile = aliased(StaffProfile)

    q = (
        db.query(Order, customer_user, CustomerProfile, staff_user, staff_profile)
        .outerjoin(customer_user, customer_user.id == Order.user_id)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == customer_user.id)
        .outerjoin(staff_user, staff_user.id == Order.processed_by_staff_id)
        .outerjoin(staff_profile, staff_profile.user_id == staff_user.id)
    )

    if status:
        q = q.filter(Order.status == status.strip().lower())

    rows = q.order_by(Order.id.desc()).limit(limit).all()

    result = []
    for order, user, profile, processed_by_user, processed_by_profile in rows:
        item_rows = (
            db.query(OrderItem, Product)
            .join(Product, Product.id == OrderItem.product_id)
            .filter(OrderItem.order_id == order.id)
            .all()
        )

        item_names = [f"{int(oi.quantity)}x {p.name}" for oi, p in item_rows]

        item_details = [
            {
                "order_item_id": oi.id,
                "product_id": p.id,
                "name": p.name,
                "qty": int(oi.quantity),
                "notes": getattr(oi, "notes", None),
            }
            for oi, p in item_rows
        ]

        payment_method = getattr(order, "payment_method", None)
        if not payment_method:
            wallet_payment = (
                db.query(WalletTransaction)
                .filter(
                    WalletTransaction.order_id == order.id,
                    WalletTransaction.transaction_type == "PAYMENT",
                )
                .first()
            )
            payment_method = "TeoPay" if wallet_payment else "Cash"

        if getattr(order, "customer_name", None):
            customer_name = order.customer_name
        elif profile and getattr(profile, "full_name", None):
            customer_name = profile.full_name
        elif user and getattr(user, "email", None):
            customer_name = user.email
        else:
            customer_name = f"Guest #{order.id}"

        if processed_by_profile and getattr(processed_by_profile, "full_name", None):
            processed_by_staff_name = processed_by_profile.full_name
        elif processed_by_user and getattr(processed_by_user, "email", None):
            processed_by_staff_name = processed_by_user.email
        else:
            processed_by_staff_name = None

        refund_info = get_order_refund_summary(db, order.id)

        result.append({
            "order_id": order.id,
            "display_id": _display_order_id(order.id),
            "user_id": order.user_id,
            "customer_name": customer_name,
            "customer_email": getattr(user, "email", None) if user else None,
            "processed_by_staff_id": getattr(order, "processed_by_staff_id", None),
            "processed_by_staff_name": processed_by_staff_name,
            "order_type": order.order_type,
            "status": order.status,
            "payment_method": payment_method,
            "created_at": str(order.created_at),
            "subtotal": float(order.subtotal or 0),
            "vat_amount": float(order.vat_amount or 0),
            "discount_amount": float(getattr(order, "discount_amount", 0) or 0),
            "promo_code_text": getattr(order, "promo_code_text", None),
            "total_amount": float(order.total_amount or 0),
            "earned_points": int(getattr(order, "earned_points", 0) or 0),
            "points_synced": bool(getattr(order, "points_synced", False)),
            "items_summary": ", ".join(item_names) if item_names else "No items",
            "is_refunded": refund_info["is_refunded"],
            "refund_count": refund_info["refund_count"],
            "refund_amount": refund_info["refund_amount"],
            "last_refund_at": refund_info["last_refund_at"],
            "has_item_notes": any(bool((getattr(oi, "notes", "") or "").strip()) for oi, _ in item_rows),
            "item_details": item_details,
        })

    return {"count": len(result), "data": result}
#===========
#HELPER FOR ORDER HSITORYYYY
#==============================
@router.get("/my")
def list_my_orders(
    limit: int = Query(default=50, ge=1, le=100),
    days: int = Query(default=30, ge=1, le=365),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = datetime.utcnow() - timedelta(days=days)

    q = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .filter(Order.created_at >= cutoff)
    )

    if status:
        q = q.filter(Order.status == status.strip().lower())

    rows = (
        q.order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit)
        .all()
    )

    result = []

    for order in rows:
        feedback_exists = (
            db.query(ProductFeedback.id)
                .filter(
                    ProductFeedback.order_id == order.id,
                    ProductFeedback.user_id == current_user.id
                )
                .first()
                is not None
        )
        item_rows = (
            db.query(OrderItem, Product)
            .join(Product, Product.id == OrderItem.product_id)
            .filter(OrderItem.order_id == order.id)
            .all()
        )

        first_product_name = item_rows[0][1].name if item_rows else "Order Item"
        items_summary = ", ".join(
            [f"{int(oi.quantity)}x {p.name}" for oi, p in item_rows]
        ) if item_rows else "No items"

        result.append({
            "order_id": order.id,
            "display_id": _display_order_id(order.id),
            "order_type": order.order_type,
            "status": order.status,
            "payment_method": (order.payment_method or "cash"),
            "customer_name": getattr(order, "customer_name", None),
            "created_at": str(order.created_at),
            "product_name": first_product_name,
            "items_summary": items_summary,
            "item_count": sum(int(oi.quantity) for oi, _ in item_rows) if item_rows else 0,
            "price": float(order.total_amount or 0),
            "total_amount": float(order.total_amount or 0),
            "earned_points": int(getattr(order, "earned_points", 0) or 0),
            "points_synced": bool(getattr(order, "points_synced", False)),
            "has_feedback": feedback_exists,
        })

    return result
#==========================
#REFUNNNNFSSS
#========================
@router.get("/refunds")
def list_refunded_orders(
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    customer_user = aliased(User)
    staff_user = aliased(User)
    staff_profile = aliased(StaffProfile)

    q = (
        db.query(Order, customer_user, CustomerProfile, staff_user, staff_profile)
        .outerjoin(customer_user, customer_user.id == Order.user_id)
        .outerjoin(CustomerProfile, CustomerProfile.user_id == customer_user.id)
        .outerjoin(staff_user, staff_user.id == Order.processed_by_staff_id)
        .outerjoin(staff_profile, staff_profile.user_id == staff_user.id)
        .order_by(Order.id.desc())
        .limit(limit)
    )

    rows = q.all()
    result = []

    for order, user, profile, processed_by_user, processed_by_profile in rows:
        refund_info = get_order_refund_summary(db, order.id)
        if not refund_info["is_refunded"]:
            continue

        payment_method = getattr(order, "payment_method", None)
        if not payment_method:
            wallet_payment = (
                db.query(WalletTransaction)
                .filter(
                    WalletTransaction.order_id == order.id,
                    WalletTransaction.transaction_type == "PAYMENT",
                )
                .first()
            )
            payment_method = "TeoPay" if wallet_payment else "Cash"

        if getattr(order, "customer_name", None):
            customer_name = order.customer_name
        elif profile and getattr(profile, "full_name", None):
            customer_name = profile.full_name
        elif user and getattr(user, "email", None):
            customer_name = user.email
        else:
            customer_name = f"Guest #{order.id}"

        if processed_by_profile and getattr(processed_by_profile, "full_name", None):
            processed_by_staff_name = processed_by_profile.full_name
        elif processed_by_user and getattr(processed_by_user, "email", None):
            processed_by_staff_name = processed_by_user.email
        else:
            processed_by_staff_name = None

        result.append({
            "order_id": order.id,
            "display_id": _display_order_id(order.id),
            "customer_name": customer_name,
            "customer_email": getattr(user, "email", None) if user else None,
            "processed_by_staff_id": getattr(order, "processed_by_staff_id", None),
            "processed_by_staff_name": processed_by_staff_name,
            "order_type": order.order_type,
            "status": order.status,
            "payment_method": payment_method,
            "created_at": str(order.created_at),
            "refund_amount": refund_info["refund_amount"],
            "refund_count": refund_info["refund_count"],
            "last_refund_at": refund_info["last_refund_at"],
        })

    return {"count": len(result), "data": result}


@router.patch("/{order_id}/status")
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    allowed: Set[str] = {"pending", "unpaid"}

    new_status = (payload.status or "").strip().lower()
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {sorted(list(allowed))}",
        )

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in {"cancelled", "completed"}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update status of '{order.status}' order",
        )

    order.status = new_status
    db.commit()
    db.refresh(order)

    return {"order_id": order.id, "status": order.status}


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
            raise HTTPException(
                status_code=400,
                detail=f"Packaging item missing/inactive in InventoryMaster: {name}",
            )
        return row

    cup = _get_active_invm_by_name(cup_item_name)
    need_cup = Decimal(qty)

    if Decimal(str(cup.quantity)) < need_cup:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough stock for {cup.name} (need {need_cup} pcs)",
        )

    cup.quantity = Decimal(str(cup.quantity)) - need_cup
    db.add(
        InventoryMasterMovement(
            inventory_master_id=cup.id,
            change_qty=-need_cup,
            reason="packaging_cup",
            ref_order_id=order_id,
        )
    )

    straw = _get_active_invm_by_name("Straw")
    need_straw = Decimal(qty)

    if Decimal(str(straw.quantity)) < need_straw:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough stock for Straw (need {need_straw} pcs)",
        )

    straw.quantity = Decimal(str(straw.quantity)) - need_straw
    db.add(
        InventoryMasterMovement(
            inventory_master_id=straw.id,
            change_qty=-need_straw,
            reason="packaging_straw",
            ref_order_id=order_id,
        )
    )


def verify_pin(pin: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            pin.encode("utf-8"),
            salt,
            iters,
            dklen=len(expected),
        )
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def verify_wallet_by_identifier_pin(
    db: Session,
    wallet_code: Optional[str],
    email: Optional[str],
    pin: str,
) -> Wallet:
    wallet_code = (wallet_code or "").strip().upper()
    email = (email or "").strip().lower()
    pin = (pin or "").strip()

    if not wallet_code and not email:
        raise HTTPException(
            status_code=400,
            detail="wallet_code or wallet_email is required for wallet payment",
        )

    if not pin or not pin.isdigit() or not (4 <= len(pin) <= 6):
        raise HTTPException(status_code=400, detail="wallet_pin must be 4-6 digits")

    wallet = None

    if wallet_code:
        wallet = db.query(Wallet).filter(Wallet.wallet_code == wallet_code).first()

    if not wallet and email:
        user = db.query(User).filter(User.email == email).first()
        if user:
            wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()

    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    if not getattr(wallet, "pin_hash", None):
        raise HTTPException(status_code=400, detail="Wallet PIN not set")

    if not verify_pin(pin, wallet.pin_hash):
        raise HTTPException(status_code=401, detail="Invalid wallet PIN")

    return wallet


def deduct_inventory_master_for_item(
    db: Session,
    product_id: int,
    qty: int,
    order_id: int,
    selected_addon_ids: Optional[List[int]] = None,
):
    selected_addon_ids = selected_addon_ids or []

    pr_rows = db.query(ProductRecipe).filter(ProductRecipe.product_id == product_id).all()

    for pr in pr_rows:
        invm = (
            db.query(InventoryMaster)
            .filter(InventoryMaster.id == pr.inventory_master_id)
            .first()
        )
        if not invm or invm.is_active is False:
            raise HTTPException(
                status_code=400,
                detail="Inventory master item missing/inactive in product recipe",
            )

        need = Decimal(str(pr.qty_used)) * Decimal(qty)

        if Decimal(str(invm.quantity)) < need:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough inventory for '{invm.name}' (need {need} {invm.unit})",
            )

        invm.quantity = Decimal(str(invm.quantity)) - need

        db.add(
            InventoryMasterMovement(
                inventory_master_id=invm.id,
                change_qty=-need,
                reason="product_recipe",
                ref_order_id=order_id,
            )
        )

    if selected_addon_ids:
        ar_rows = (
            db.query(AddOnRecipe)
            .filter(AddOnRecipe.add_on_id.in_(selected_addon_ids))
            .all()
        )

        for ar in ar_rows:
            invm = (
                db.query(InventoryMaster)
                .filter(InventoryMaster.id == ar.inventory_master_id)
                .first()
            )
            if not invm or invm.is_active is False:
                raise HTTPException(
                    status_code=400,
                    detail="Inventory master item missing/inactive in add-on recipe",
                )

            need = Decimal(str(ar.qty_used)) * Decimal(qty)

            if Decimal(str(invm.quantity)) < need:
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough inventory for '{invm.name}' (need {need} {invm.unit})",
                )

            invm.quantity = Decimal(str(invm.quantity)) - need

            db.add(
                InventoryMasterMovement(
                    inventory_master_id=invm.id,
                    change_qty=-need,
                    reason="addon_recipe",
                    ref_order_id=order_id,
                )
            )


def sync_order_rewards_if_eligible(db: Session, order: Order):
    if not order:
        return

    if not order.user_id:
        return

    payment_method = (getattr(order, "payment_method", "") or "").strip().lower()
    if payment_method != "wallet":
        return

    if order.status not in {"paid", "completed"}:
        return

    if bool(getattr(order, "points_synced", False)):
        return

    existing_earned = (
        db.query(sa_func.coalesce(sa_func.sum(RewardTransaction.points_change), 0))
        .filter(
            RewardTransaction.order_id == order.id,
            RewardTransaction.transaction_type == "EARN",
            RewardTransaction.points_change > 0,
        )
        .scalar()
        or 0
    )

    if int(existing_earned) > 0:
        order.points_synced = True
        order.points_claim_expires_at = None

        if hasattr(order, "points_claimed_user_id") and not getattr(order, "points_claimed_user_id", None):
            order.points_claimed_user_id = int(order.user_id)
        if hasattr(order, "points_claimed_at") and not getattr(order, "points_claimed_at", None):
            order.points_claimed_at = sa_func.now()
        if hasattr(order, "points_claim_method") and not getattr(order, "points_claim_method", None):
            order.points_claim_method = "wallet_auto"
        return

    rows = (
        db.query(OrderItem, Product)
        .join(Product, Product.id == OrderItem.product_id)
        .filter(OrderItem.order_id == order.id)
        .all()
    )

    earned_points = 0
    for oi, p in rows:
        ppu = int(getattr(p, "points_per_unit", 0) or 0)
        earned_points += ppu * int(oi.quantity)

    rw = db.query(RewardWallet).filter(RewardWallet.user_id == order.user_id).first()
    if not rw:
        rw = RewardWallet(user_id=order.user_id, total_points=0)
        db.add(rw)
        db.flush()

    current = int(rw.total_points or 0)

    if current < REQUIRED_POINTS:
        new_total = current + int(earned_points)
        capped_total = min(REQUIRED_POINTS, new_total)
        actual_added = capped_total - current
    else:
        actual_added = 0

    rw.total_points = min(REQUIRED_POINTS, current + int(earned_points))

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

    order.earned_points = int(earned_points)
    order.points_synced = True
    order.points_claim_expires_at = None

    if hasattr(order, "points_claimed_user_id"):
        order.points_claimed_user_id = int(order.user_id)
    if hasattr(order, "points_claimed_at"):
        order.points_claimed_at = sa_func.now()
    if hasattr(order, "points_claim_method"):
        order.points_claim_method = "wallet_auto"


def resolve_customer_name(
    db: Session,
    user_id: Optional[int],
    explicit_customer_name: Optional[str] = None,
) -> Optional[str]:
    explicit_customer_name = (explicit_customer_name or "").strip()

    explicit_lower = explicit_customer_name.lower()
    is_placeholder_name = (
        not explicit_customer_name
        or explicit_lower in PLACEHOLDER_CUSTOMER_NAMES
    )

    if not is_placeholder_name:
        return explicit_customer_name

    if user_id:
        profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == user_id).first()
        if profile and getattr(profile, "full_name", None):
            return profile.full_name.strip()

        user = db.query(User).filter(User.id == user_id).first()
        if user and getattr(user, "email", None):
            return user.email.strip()

    return explicit_customer_name or None


def get_order_refund_summary(db: Session, order_id: int) -> Dict[str, object]:
    refund_txs = (
        db.query(WalletTransaction)
        .filter(
            WalletTransaction.order_id == order_id,
            WalletTransaction.transaction_type == "REFUND",
        )
        .order_by(WalletTransaction.created_at.desc(), WalletTransaction.id.desc())
        .all()
    )

    total_refund = Decimal("0")
    last_refund_at = None

    for tx in refund_txs:
        total_refund += Decimal(str(tx.amount or 0))
        if last_refund_at is None:
            last_refund_at = getattr(tx, "created_at", None)

    return {
        "is_refunded": len(refund_txs) > 0,
        "refund_count": len(refund_txs),
        "refund_amount": float(total_refund),
        "last_refund_at": str(last_refund_at) if last_refund_at else None,
    }

def validate_and_compute_promo(
    db: Session,
    promo_code_text: Optional[str],
    base_total: Decimal,
    user_id: Optional[int] = None,
    payment_method: Optional[str] = None,
    order_type: Optional[str] = None,
) -> Dict[str, object]:
    promo_code_text = (promo_code_text or "").strip().upper()

    if not promo_code_text:
        return {
            "promo": None,
            "discount_amount": Decimal("0.00"),
            "discount_type": None,
            "discount_value": None,
            "promo_code_text": None,
        }

    promo = db.query(PromoCode).filter(PromoCode.code == promo_code_text).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promo code not found")

    if not bool(getattr(promo, "is_active", False)):
        raise HTTPException(status_code=400, detail="Promo code is inactive")

    now = _utcnow()

    if promo.valid_from:
        valid_from = _as_utc(promo.valid_from)
        if valid_from and now < valid_from:
            raise HTTPException(status_code=400, detail="Promo code is not active yet")

    if promo.valid_until:
        valid_until = _as_utc(promo.valid_until)
        if valid_until and now > valid_until:
            raise HTTPException(status_code=400, detail="Promo code has expired")

    usage_limit = getattr(promo, "usage_limit", None)
    usage_count = int(getattr(promo, "usage_count", 0) or 0)
    if usage_limit is not None and usage_count >= int(usage_limit):
        raise HTTPException(status_code=400, detail="Promo code usage limit reached")

    if not user_id:
        raise HTTPException(status_code=400, detail="Promo code requires a customer account")

    order_type_clean = (order_type or "").strip().lower()
    payment_method_clean = (payment_method or "").strip().lower()

    # Existing public/online behavior stays strict:
    # promo still requires wallet payment outside cashier/staff-assisted flow.
    if order_type_clean != "cashier" and payment_method_clean != "wallet":
        raise HTTPException(
            status_code=400,
            detail="Promo code requires TeoPay wallet payment"
        )
    per_user_limit = getattr(promo, "per_user_limit", None)
    if per_user_limit is not None:
        used_count = (
            db.query(PromoCodeRedemption)
            .filter(
                PromoCodeRedemption.promo_code_id == promo.id,
                PromoCodeRedemption.user_id == user_id,
            )
            .count()
        )
        if used_count >= int(per_user_limit):
            raise HTTPException(status_code=400, detail="You have already reached the limit for this promo")

    min_order_amount = _money(getattr(promo, "min_order_amount", 0) or 0)
    if base_total < min_order_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum order amount for this promo is ₱{min_order_amount:.2f}",
        )

    discount_type = (promo.discount_type or "").strip().lower()
    discount_value = _money(getattr(promo, "discount_value", 0) or 0)

    if discount_type == "percent":
        if discount_value > Decimal("100.00"):
            raise HTTPException(status_code=400, detail="Invalid promo percent value")
        discount_amount = (base_total * (discount_value / Decimal("100"))).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
    elif discount_type == "fixed":
        discount_amount = discount_value
    else:
        raise HTTPException(status_code=400, detail="Invalid promo discount type")

    if discount_amount > base_total:
        discount_amount = base_total

    discount_amount = _money(discount_amount)

    return {
        "promo": promo,
        "discount_amount": discount_amount,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "promo_code_text": promo.code,
    }


def _create_order_core(
    db: Session,
    order_type: str,
    user_id: Optional[int],
    items: List[OrderItemPayload],
    payment_method: str,
    wallet_email: Optional[str],
    wallet_code: Optional[str],
    wallet_pin: Optional[str],
    promo_code: Optional[str] = None,
    customer_name: Optional[str] = None,
):
    total_before_discount = Decimal("0")
    earned_points = 0
    potential_points = 0

    order_type = (order_type or "").strip().lower()
    payment_method = (payment_method or "cash").strip().lower()
    if order_type == "cashier" and (promo_code or "").strip() and not user_id:
        raise HTTPException(
            status_code=400,
            detail="Staff-assisted promo requires a linked customer account"
        )

    if order_type not in {"kiosk", "online", "cashier"}:
        raise HTTPException(status_code=400, detail="order_type must be kiosk|online|cashier")

    if payment_method not in {"cash", "wallet"}:
        raise HTTPException(status_code=400, detail="payment_method must be 'cash' or 'wallet'")

    if payment_method == "wallet":
        if not wallet_pin or not (wallet_email or wallet_code):
            raise HTTPException(
                status_code=400,
                detail="wallet_pin and wallet_email or wallet_code are required for wallet payment",
            )

    size_rows = (
        db.query(AddOn)
        .filter(AddOn.addon_type == "SIZE", AddOn.is_active == True)
        .all()
    )
    size_price_map: Dict[str, Decimal] = {
        s.name.strip().lower(): Decimal(str(s.price)) for s in size_rows
    }
    size_price_map.setdefault("small", Decimal("0"))
    size_price_map.setdefault("medium", Decimal("10"))
    size_price_map.setdefault("large", Decimal("20"))

    addon_ids: List[int] = []
    for it in items:
        if it.add_ons:
            addon_ids.extend([int(x) for x in it.add_ons])

    addons_by_id: Dict[int, AddOn] = {}
    if addon_ids:
        addons = db.query(AddOn).filter(AddOn.id.in_(list(set(addon_ids)))).all()
        addons_by_id = {a.id: a for a in addons}

    for it in items:
        if int(it.quantity) <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be > 0")

        product = db.query(Product).filter(Product.id == int(it.product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")

        if hasattr(product, "is_active") and product.is_active is False:
            raise HTTPException(status_code=400, detail=f"Product '{product.name}' is inactive")

        if hasattr(product, "is_available") and product.is_available is False:
            raise HTTPException(status_code=400, detail=f"Product '{product.name}' is currently unavailable/out of stock")

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
                    raise HTTPException(
                        status_code=400,
                        detail=f"Add-on '{addon.name}' is not type ADDON (SIZE should be sent via 'size')",
                    )

                addon_total += Decimal(str(addon.price))

        unit_price = base_price + size_upcharge + addon_total
        total_before_discount += unit_price * Decimal(int(it.quantity))

        ppu = int(getattr(product, "points_per_unit", 0) or 0)
        potential_points += ppu * int(it.quantity)
        if user_id:
            earned_points += ppu * int(it.quantity)

    total_before_discount = _money(total_before_discount)

    promo_result = validate_and_compute_promo(
        db=db,
        promo_code_text=promo_code,
        base_total=total_before_discount,
        user_id=user_id,
        payment_method=payment_method,
        order_type=order_type,
    )
    promo_row = promo_result["promo"]

    discount_amount = _money(promo_result["discount_amount"])
    final_total = _money(total_before_discount - discount_amount)

    subtotal = (final_total / (Decimal("1") + VAT_RATE)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    vat_amount = _money(final_total - subtotal)

    initial_status = compute_initial_status(order_type, payment_method)
    order_points_snapshot = int(earned_points if user_id else potential_points)

    resolved_customer_name = resolve_customer_name(
        db=db,
        user_id=user_id,
        explicit_customer_name=customer_name,
    )

    order = Order(
        user_id=user_id,
        order_type=order_type,
        payment_method=payment_method,
        customer_name=resolved_customer_name,
        status=initial_status,
        subtotal=subtotal,
        vat_amount=vat_amount,
        vat_rate=Decimal("12.00"),
        total_amount=final_total,
        promo_code_id=(promo_row.id if promo_row else None),
        promo_code_text=promo_result["promo_code_text"],
        discount_amount=discount_amount,
        discount_type=promo_result["discount_type"],
        discount_value=promo_result["discount_value"],
        earned_points=order_points_snapshot,
        points_synced=False,
        points_claim_expires_at=(
            None if payment_method == "wallet"
            else _utcnow() + timedelta(hours=ORDER_POINTS_CLAIM_WINDOW_HOURS)
        ),
    )
    db.add(order)
    db.flush()

    if payment_method == "wallet":
        wallet = verify_wallet_by_identifier_pin(db, wallet_code, wallet_email, wallet_pin)
        pay_with_wallet(db, wallet.user_id, order.id, final_total)
        order.status = "paid"

        if not user_id:
            order.user_id = int(wallet.user_id)
            user_id = int(wallet.user_id)

        # Always resolve the final customer name from the real wallet owner
        order.customer_name = resolve_customer_name(
            db=db,
            user_id=int(wallet.user_id),
            explicit_customer_name=customer_name,
        )

        earned_points = 0
        for it in items:
            product = db.query(Product).filter(Product.id == int(it.product_id)).first()
            if product:
                ppu = int(getattr(product, "points_per_unit", 0) or 0)
                earned_points += ppu * int(it.quantity)

        order.earned_points = int(earned_points)
        order.points_claim_expires_at = None

    if promo_row and not order.user_id:
        raise HTTPException(
            status_code=400,
            detail="Promo code can only be used by customers with an account",
        )

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
                    raise HTTPException(
                        status_code=400,
                        detail=f"Add-on '{addon.name}' is not type ADDON (SIZE should be sent via 'size')",
                    )
                addon_total += Decimal(str(addon.price))

        unit_price = base_price + size_upcharge + addon_total

        cleaned_notes = (it.notes or "").strip() if hasattr(it, "notes") else ""
        order_item = OrderItem(
            order_id=order.id,
            product_id=int(it.product_id),
            quantity=int(it.quantity),
            price=unit_price,
            notes=cleaned_notes or None,
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

    if promo_row:
        promo_row.usage_count = int(getattr(promo_row, "usage_count", 0) or 0) + 1
        if order.user_id:
            db.add(
                PromoCodeRedemption(
                    promo_code_id=promo_row.id,
                    user_id=int(order.user_id),
                    order_id=order.id,
                )
            )

    if order.user_id and order.status in {"paid", "completed"}:
        sync_order_rewards_if_eligible(db, order)

    _sync_all_product_availability(db)

    db.commit()
    db.refresh(order)

    return {
        "order_id": order.id,
        "order_type": order.order_type,
        "user_id": order.user_id,
        "customer_name": getattr(order, "customer_name", None),
        "payment_method": payment_method,
        "status": order.status,
        "subtotal": float(order.subtotal),
        "vat_rate": float(order.vat_rate),
        "vat_amount": float(order.vat_amount),
        "discount_amount": float(getattr(order, "discount_amount", 0) or 0),
        "promo_code_text": getattr(order, "promo_code_text", None),
        "discount_type": getattr(order, "discount_type", None),
        "discount_value": (
            float(getattr(order, "discount_value", 0) or 0)
            if getattr(order, "discount_value", None) is not None
            else None
        ),
        "total_amount": float(order.total_amount),
        "earned_points": int(getattr(order, "earned_points", 0) or 0),
        "points_synced": bool(getattr(order, "points_synced", False)),
        "claim_expires_at": (
            str(getattr(order, "points_claim_expires_at", None))
            if getattr(order, "points_claim_expires_at", None)
            else None
        ),
    }


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
                    notes=(getattr(it, "notes", None)or None),
                )
            )

        return _create_order_core(
            db=db,
            order_type=(payload.order_type or "kiosk"),
            user_id=getattr(payload, "user_id", None),
            items=items,
            payment_method=(payload.payment_method or "cash"),
            wallet_email=getattr(payload, "wallet_email", None),
            wallet_code=getattr(payload, "wallet_code", None),
            wallet_pin=getattr(payload, "wallet_pin", None),
            promo_code=getattr(payload, "promo_code", None),
            customer_name=getattr(payload, "customer_name", None),
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


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
            wallet_code=payload.wallet_code,
            wallet_pin=payload.wallet_pin,
            promo_code=payload.promo_code,
            customer_name=payload.customer_name,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


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
            wallet_code=payload.wallet_code,
            wallet_pin=payload.wallet_pin,
            promo_code=payload.promo_code,
            customer_name=None,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


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
            wallet_code=payload.wallet_code,
            wallet_pin=payload.wallet_pin,
            promo_code=payload.promo_code,
            customer_name=payload.customer_name,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/{order_id}/cancel-my-order")
def cancel_my_order(
    order_id: int,
    payload: CancelPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        reason = (payload.reason or "").strip()
        if len(reason) < 3:
            raise HTTPException(status_code=400, detail="reason is required (min 3 chars)")

        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if int(order.user_id or 0) != int(current_user.id):
            raise HTTPException(status_code=403, detail="You can only cancel your own order")

        if (order.order_type or "").strip().lower() != "online":
            raise HTTPException(status_code=400, detail="Only online orders can be cancelled by customer")

        if order.status == "cancelled":
            raise HTTPException(status_code=400, detail="Order already cancelled")

        if order.status == "completed":
            raise HTTPException(status_code=400, detail="Completed orders can no longer be cancelled")

        if order.status == "paid":
            raise HTTPException(status_code=400, detail="Paid orders can no longer be cancelled by customer")

        if order.status not in {"pending", "unpaid"}:
            raise HTTPException(status_code=400, detail="Only pending/unpaid orders can be cancelled by customer")

        redemption = db.query(PromoCodeRedemption).filter(
            PromoCodeRedemption.order_id == order_id
        ).first()
        if redemption:
            promo = db.query(PromoCode).filter(PromoCode.id == redemption.promo_code_id).first()
            if promo and int(getattr(promo, "usage_count", 0) or 0) > 0:
                promo.usage_count = int(promo.usage_count) - 1
            db.delete(redemption)

        movs = db.query(InventoryMasterMovement).filter(
            InventoryMasterMovement.ref_order_id == order_id
        ).all()

        for m in movs:
            change = Decimal(str(m.change_qty))
            if change < 0:
                invm = db.query(InventoryMaster).filter(
                    InventoryMaster.id == m.inventory_master_id
                ).first()
                if invm:
                    invm.quantity = Decimal(str(invm.quantity)) + abs(change)

                    db.add(
                        InventoryMasterMovement(
                            inventory_master_id=invm.id,
                            change_qty=abs(change),
                            reason="customer_cancel_reversal",
                            ref_order_id=order_id,
                        )
                    )

        order.status = "cancelled"

        if hasattr(order, "cancel_reason"):
            order.cancel_reason = f"Customer cancelled: {reason}"

        if hasattr(order, "cancelled_at"):
            order.cancelled_at = sa_func.now()

        _sync_all_product_availability(db)

        db.commit()
        db.refresh(order)

        return {
            "order_id": order.id,
            "status": order.status,
            "cancel_reason": getattr(order, "cancel_reason", reason),
            "cancelled_by": "customer",
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


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

        redemption = db.query(PromoCodeRedemption).filter(
            PromoCodeRedemption.order_id == order_id
        ).first()
        if redemption:
            promo = db.query(PromoCode).filter(PromoCode.id == redemption.promo_code_id).first()
            if promo and int(getattr(promo, "usage_count", 0) or 0) > 0:
                promo.usage_count = int(promo.usage_count) - 1
            db.delete(redemption)

        movs = db.query(InventoryMasterMovement).filter(
            InventoryMasterMovement.ref_order_id == order_id
        ).all()

        for m in movs:
            change = Decimal(str(m.change_qty))
            if change < 0:
                invm = db.query(InventoryMaster).filter(
                    InventoryMaster.id == m.inventory_master_id
                ).first()
                if invm:
                    invm.quantity = Decimal(str(invm.quantity)) + abs(change)

                    db.add(
                        InventoryMasterMovement(
                            inventory_master_id=invm.id,
                            change_qty=abs(change),
                            reason="staff_cancel_reversal",
                            ref_order_id=order_id,
                        )
                    )

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

                order.points_synced = False

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
            order.cancel_reason = f"Staff cancelled: {reason}"

        if hasattr(order, "cancelled_at"):
            order.cancelled_at = sa_func.now()

        _sync_all_product_availability(db)

        db.commit()
        db.refresh(order)

        return {
            "order_id": order.id,
            "status": order.status,
            "cancel_reason": getattr(order, "cancel_reason", reason),
            "refunded_wallet": refunded_wallet,
            "cancelled_by": "staff",
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
    payload = CancelPayload(reason="VOID/ Counter Cancellation")
    return cancel_order(order_id=order_id, payload=payload, db=db, _=True)


@router.post("/{order_id}/complete")
def complete_order(
    order_id: int,
    db: Session = Depends(get_db),
   current_staff: User = Depends(require_roles("staff", "cashier", "admin")),
):
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.status == "cancelled":
            raise HTTPException(status_code=400, detail="Cannot complete a cancelled order")
        if order.status == "completed":
            raise HTTPException(status_code=400, detail="Order already completed")
        if order.status != "paid":
            raise HTTPException(status_code=400, detail="Only paid orders can be marked as completed")

        order.status = "completed"

        if hasattr(order, "completed_at"):
            order.completed_at = sa_func.now()

        payment_method = (getattr(order, "payment_method", "") or "").strip().lower()

        if payment_method == "wallet":
            sync_order_rewards_if_eligible(db, order)
        else:
            if not bool(getattr(order, "points_synced", False)) and int(getattr(order, "earned_points", 0) or 0) > 0:
                if not getattr(order, "points_claim_expires_at", None):
                    order.points_claim_expires_at = _utcnow() + timedelta(hours=ORDER_POINTS_CLAIM_WINDOW_HOURS)

        db.commit()
        db.refresh(order)

        return {"order_id": order.id, "status": order.status}

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/{order_id}/pay-cash")
def pay_cash_order(
    order_id: int,
    payload: Optional[CashPayPayload] = None,
    db: Session = Depends(get_db),
    current_staff: User = Depends(require_roles("cashier", "staff", "admin")),
):
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.status in {"cancelled", "completed"}:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot pay order with status '{order.status}'",
            )
        if order.status == "paid":
            raise HTTPException(status_code=400, detail="Order already paid")
        if order.status not in {"pending", "unpaid"}:
            raise HTTPException(status_code=400, detail="Only pending/unpaid orders can be marked as paid")

        total_amount = _money(order.total_amount or 0)

        amount_received = None
        change_amount = None

        if payload is not None:
            amount_received = _money(payload.amount_received)
            if amount_received < total_amount:
                raise HTTPException(status_code=400, detail="Insufficient payment amount.")
            change_amount = _money(amount_received - total_amount)

        order.payment_method = "cash"
        order.status = "paid"
        order.processed_by_staff_id = int(current_staff.id)

        if amount_received is not None:
            order.amount_received = amount_received
            order.change_amount = change_amount
        else:
            order.amount_received = None
            order.change_amount = None

        if hasattr(order, "paid_at"):
            order.paid_at = sa_func.now()

        order.points_synced = bool(getattr(order, "points_synced", False))

        if not order.points_synced and int(getattr(order, "earned_points", 0) or 0) > 0:
            if not getattr(order, "points_claim_expires_at", None):
                order.points_claim_expires_at = _utcnow() + timedelta(hours=ORDER_POINTS_CLAIM_WINDOW_HOURS)
        if not getattr(order, "processed_by_staff_id", None):
            order.processed_by_staff_id = int(current_staff.id)
        db.commit()
        db.refresh(order)

        return {
            "order_id": order.id,
            "status": order.status,
            "payment_method": order.payment_method,
            "amount_received": float(order.amount_received) if order.amount_received is not None else None,
            "change_amount": float(order.change_amount) if order.change_amount is not None else None,
            "earned_points": int(getattr(order, "earned_points", 0) or 0),
            "points_synced": bool(getattr(order, "points_synced", False)),
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

@router.post("/{order_id}/pay-wallet")
def pay_wallet_order(
    order_id: int,
    payload: WalletPayPayload,
    db: Session = Depends(get_db),
   current_staff: User = Depends(require_roles("cashier", "staff", "admin")),
):
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.status in {"cancelled", "completed"}:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot pay order with status '{order.status}'",
            )

        if order.status == "paid":
            raise HTTPException(status_code=400, detail="Order already paid")

        if order.status not in {"pending", "unpaid"}:
            raise HTTPException(status_code=400, detail="Only pending/unpaid orders can be paid")

        wallet = verify_wallet_by_identifier_pin(
            db=db,
            wallet_code=payload.wallet_code,
            email=payload.wallet_email,
            pin=payload.wallet_pin,
        )

        pay_with_wallet(
            db=db,
            user_id=int(wallet.user_id),
            order_id=order.id,
            amount=Decimal(str(order.total_amount or 0)),
        )

        order.payment_method = "wallet"
        order.status = "paid"
        order.processed_by_staff_id = int(current_staff.id)

        if hasattr(order, "paid_at"):
            order.paid_at = sa_func.now()

        if not order.user_id:
            order.user_id = int(wallet.user_id)

        if not getattr(order, "customer_name", None):
            order.customer_name = resolve_customer_name(db, user_id=int(wallet.user_id))

        earned_points = 0
        rows = (
            db.query(OrderItem, Product)
            .join(Product, Product.id == OrderItem.product_id)
            .filter(OrderItem.order_id == order.id)
            .all()
        )

        for oi, p in rows:
            ppu = int(getattr(p, "points_per_unit", 0) or 0)
            earned_points += ppu * int(oi.quantity)

        order.earned_points = int(earned_points)
        order.points_claim_expires_at = None

        sync_order_rewards_if_eligible(db, order)

        db.commit()
        db.refresh(order)

        return {
            "order_id": order.id,
            "status": order.status,
            "payment_method": order.payment_method,
            "user_id": order.user_id,
            "customer_name": order.customer_name,
            "earned_points": int(getattr(order, "earned_points", 0) or 0),
            "points_synced": bool(getattr(order, "points_synced", False)),
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
def get_order_refund_summary(db: Session, order_id: int) -> Dict[str, object]:
    refund_txs = (
        db.query(WalletTransaction)
        .filter(
            WalletTransaction.order_id == order_id,
            WalletTransaction.transaction_type == "REFUND",
        )
        .order_by(WalletTransaction.created_at.desc(), WalletTransaction.id.desc())
        .all()
    )

    total_refund = Decimal("0")
    last_refund_at = None

    for tx in refund_txs:
        total_refund += Decimal(str(tx.amount or 0))
        if last_refund_at is None:
            last_refund_at = getattr(tx, "created_at", None)

    return {
        "is_refunded": len(refund_txs) > 0,
        "refund_count": len(refund_txs),
        "refund_amount": float(total_refund),
        "last_refund_at": str(last_refund_at) if last_refund_at else None,
    }
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
            addons.append({
                "add_on_id": ao.id,
                "name": ao.name,
                "qty": int(oia.qty),
                "price": float(oia.price_at_time),
                "line_total": float(line),
            })

        receipt_items.append({
            "order_item_id": oi.id,
            "product_id": p.id,
            "name": p.name,
            "qty": int(oi.quantity),
            "unit_price": float(oi.price),
            "line_total": float(Decimal(str(oi.price)) * Decimal(int(oi.quantity))),
            "notes": getattr(oi, "notes", None),
            "add_ons": addons,
            "add_ons_total": float(addons_total),
        })

    potential_points = 0
    for oi, p in rows:
        ppu = int(getattr(p, "points_per_unit", 0) or 0)
        potential_points += ppu * int(oi.quantity)

    earned_points = int(getattr(order, "earned_points", 0) or 0)
    points_synced = bool(getattr(order, "points_synced", False))
    points_status = "synced" if points_synced else ("claimable" if int(potential_points) > 0 else "none")

    refund_info = get_order_refund_summary(db, order.id)

    payment_method = getattr(order, "payment_method", None)
    if not payment_method:
        wallet_payment = (
            db.query(WalletTransaction)
            .filter(
                WalletTransaction.order_id == order.id,
                WalletTransaction.transaction_type == "PAYMENT",
            )
            .first()
        )
        payment_method = "wallet" if wallet_payment else "cash"

    resolved_customer_name = getattr(order, "customer_name", None)
    if not resolved_customer_name and getattr(order, "user_id", None):
        resolved_customer_name = resolve_customer_name(db, user_id=order.user_id)

    claim_message = None
    if points_status == "synced":
        claim_message = "Rewards points already added to the customer account."
    elif points_status == "claimable":
        claim_message = "Rewards points can still be claimed for this order."
    else:
        claim_message = "No rewards points available for this order."

    return {
        "order_id": order.id,
        "display_id": _display_order_id(order.id),
        "user_id": order.user_id,
        "customer_name": resolved_customer_name or "Walk-in Customer",
        "order_type": order.order_type,
        "status": order.status,
        "payment_method": payment_method,
        "created_at": str(order.created_at),

        "items": receipt_items,
        "subtotal": float(order.subtotal),
        "vat_rate": float(order.vat_rate),
        "vat_amount": float(order.vat_amount),
        "discount_amount": float(getattr(order, "discount_amount", 0) or 0),
        "promo_code_text": getattr(order, "promo_code_text", None),
        "discount_type": getattr(order, "discount_type", None),
        "discount_value": (
            float(getattr(order, "discount_value", 0) or 0)
            if getattr(order, "discount_value", None) is not None
            else None
        ),
        "total_amount": float(order.total_amount),

        "earned_points": int(earned_points),
        "potential_points": int(potential_points),
        "points_status": points_status,
        "points_synced": bool(getattr(order, "points_synced", False)),
        "points_claimed_user_id": getattr(order, "points_claimed_user_id", None),
        "points_claimed_by_staff_id": getattr(order, "points_claimed_by_staff_id", None),
        "points_claim_method": getattr(order, "points_claim_method", None),
        "points_claimed_at": (
            str(getattr(order, "points_claimed_at", None))
            if getattr(order, "points_claimed_at", None)
            else None
        ),
        "claim_expires_at": (
            str(getattr(order, "points_claim_expires_at", None))
            if getattr(order, "points_claim_expires_at", None)
            else None
        ),
        "claim_message": claim_message,
        "amount_received": (
             float(getattr(order, "amount_received", 0) or 0)
             if getattr(order, "amount_received", None) is not None
            else None
            ),
        "change_amount": (
            float(getattr(order, "change_amount", 0) or 0)
            if getattr(order, "change_amount", None) is not None
            else None
            ),

        "is_refunded": refund_info["is_refunded"],
        "refund_count": refund_info["refund_count"],
        "refund_amount": refund_info["refund_amount"],
        "last_refund_at": refund_info["last_refund_at"],
    }