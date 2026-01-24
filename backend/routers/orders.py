from typing import Optional, Set
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import SessionLocal
from models import (
    Order, OrderItem, Product,
    InventoryItem, StockMovement,
    RewardWallet, RewardTransaction,
    InventoryMaster, ProductRecipe,   # ✅ NEW
)

from schemas import OrderCreate

router = APIRouter(prefix="/orders", tags=["Orders"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------
# STAFF: LIST ORDERS (QUEUE)
# ---------------------------
@router.get("/")
def list_orders(status: Optional[str] = None, limit: int = 30, db: Session = Depends(get_db)):
    q = db.query(Order)
    if status:
        q = q.filter(Order.status == status)

    orders = q.order_by(Order.id.desc()).limit(limit).all()

    return [
        {
            "order_id": o.id,
            "user_id": o.user_id,
            "order_type": o.order_type,
            "status": o.status,
            "created_at": str(o.created_at),
            "total_amount": float(o.total_amount),
        }
        for o in orders
    ]


# ---------------------------
# STAFF: UPDATE ORDER STATUS
# ---------------------------
class OrderStatusUpdate(BaseModel):
    status: str


@router.patch("/{order_id}/status")
def update_order_status(order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)):
    allowed: Set[str] = {"pending", "paid", "preparing", "completed", "cancelled"}

    if payload.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {sorted(list(allowed))}"
        )

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.status = payload.status
    db.commit()
    db.refresh(order)

    return {"order_id": order.id, "status": order.status}


# ---------------------------
# CREATE ORDER (KIOSK/ONLINE)
# ---------------------------
@router.post("/")
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    VAT_RATE = 0.12  # VAT included in displayed prices

    try:
        # We'll compute total based on DB product prices (safer than trusting client price)
        total = 0.0
        earned_points = 0

        # 1) validate items + compute total + points
        for it in payload.items:
            if it.quantity <= 0:
                raise HTTPException(status_code=400, detail="Quantity must be > 0")

            product = db.query(Product).filter(Product.id == it.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")

            # block inactive (soft deleted)
            if hasattr(product, "is_active") and product.is_active is False:
                raise HTTPException(status_code=400, detail=f"Product '{product.name}' is inactive")

            # Use DB price as base price
            unit_price = float(product.price)
            line_total = unit_price * int(it.quantity)
            total += line_total

            # points_per_unit logic
            ppu = int(getattr(product, "points_per_unit", 0) or 0)
            earned_points += ppu * int(it.quantity)

        # Breakdown (VAT INCLUDED)
        subtotal = total / (1 + VAT_RATE)
        vat_amount = total - subtotal

        # 2) create order (save VAT breakdown in DB)
        order = Order(
            user_id=payload.user_id,
            order_type=payload.order_type,
            status="paid",
            subtotal=subtotal,
            vat_amount=vat_amount,
            vat_rate=12.00,
            total_amount=total
        )
        db.add(order)
        db.flush()  # get order.id without full commit

        # 3) create order_items + deduct product inventory + deduct ingredient inventory + stock movements
        for it in payload.items:
            product = db.query(Product).filter(Product.id == it.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")

            unit_price = float(product.price)
            qty = int(it.quantity)

            # create order item
            db.add(OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=qty,
                price=unit_price
            ))

            # ---- A) deduct product stock (your current system)
            inv = db.query(InventoryItem).filter(InventoryItem.product_id == product.id).first()
            if not inv:
                raise HTTPException(status_code=400, detail=f"No inventory record for product {product.id}")

            if inv.quantity < qty:
                raise HTTPException(status_code=400, detail=f"Not enough stock for product {product.name}")

            inv.quantity -= qty

            db.add(StockMovement(
                inventory_item_id=inv.id,
                change_quantity=-qty,  # mapped to DB column "change_qty"
                reason="sale"
            ))

            # ---- B) ✅ NEW: deduct ingredients via recipe (Cup/Straw now, grams later)
            # If no recipe rows yet for this product, skip (no error)
            recipe_rows = (
                db.query(ProductRecipe, InventoryMaster)
                .join(InventoryMaster, InventoryMaster.id == ProductRecipe.inventory_master_id)
                .filter(ProductRecipe.product_id == product.id)
                .all()
            )

            for pr, im in recipe_rows:
                need = Decimal(str(pr.qty_used)) * Decimal(qty)

                have = Decimal(str(im.quantity))
                if have < need:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Not enough ingredient stock: {im.name} (need {need} {im.unit}, have {im.quantity} {im.unit})"
                    )

                im.quantity = have - need

                # optional: log ingredient deduction as stock_movement too (if you want later)
                # (right now okay na kahit wala)

        # 4) apply points to reward wallet + log transaction
        if earned_points > 0:
            rw = db.query(RewardWallet).filter(RewardWallet.user_id == payload.user_id).first()

            # auto-create reward wallet if missing
            if not rw:
                rw = RewardWallet(user_id=payload.user_id, total_points=0)
                db.add(rw)
                db.flush()

            rw.total_points = int(rw.total_points or 0) + int(earned_points)

            db.add(RewardTransaction(
                reward_wallet_id=rw.id,
                reward_id=None,
                order_id=order.id,
                points_change=int(earned_points),
                transaction_type="EARN"
            ))

        db.commit()
        db.refresh(order)

        return {
            "order_id": order.id,
            "subtotal": float(order.subtotal) if order.subtotal is not None else None,
            "vat_rate": float(order.vat_rate) if order.vat_rate is not None else 12.00,
            "vat_amount": float(order.vat_amount) if order.vat_amount is not None else None,
            "total_amount": float(order.total_amount),
            "earned_points": int(earned_points)
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ---------------------------
# RECEIPT VIEW (KIOSK/STAFF)
# ---------------------------
@router.get("/{order_id}/receipt")
def get_receipt(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    items = (
        db.query(OrderItem, Product)
        .join(Product, Product.id == OrderItem.product_id)
        .filter(OrderItem.order_id == order_id)
        .all()
    )

    receipt_items = []
    for oi, p in items:
        receipt_items.append({
            "product_id": p.id,
            "name": p.name,
            "qty": int(oi.quantity),
            "price": float(oi.price),
            "line_total": float(oi.price) * int(oi.quantity)
        })

    earned = db.query(RewardTransaction).filter(
        RewardTransaction.order_id == order_id,
        RewardTransaction.transaction_type == "EARN"
    ).first()

    earned_points = int(earned.points_change) if earned else 0

    return {
        "order_id": order.id,
        "order_type": order.order_type,
        "status": order.status,
        "created_at": str(order.created_at),
        "items": receipt_items,
        "subtotal": float(order.subtotal) if order.subtotal is not None else None,
        "vat_rate": float(order.vat_rate) if order.vat_rate is not None else 12.00,
        "vat_amount": float(order.vat_amount) if order.vat_amount is not None else None,
        "total_amount": float(order.total_amount),
        "earned_points": earned_points
    }
