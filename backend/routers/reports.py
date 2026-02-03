from typing import Optional
from datetime import date, datetime, time, timedelta
from decimal import Decimal
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, desc, and_

from database import SessionLocal
from models import (
    Order, OrderItem, Product,
    Wallet, WalletTransaction,
    InventoryMaster, InventoryMasterMovement,
    InventoryItem, StockMovement,
    User, RewardTransaction
)

router = APIRouter(prefix="/reports", tags=["Reports"])

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
# ADMIN GUARD (TEMP HEADER)
# -----------------------
def require_admin(
    x_role: str = Header(
        default="",
        alias="X-Role",
        description="admin"
    )
):
    if (x_role or "").strip().lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin only (set header X-Role: admin)")
    return True

# -----------------------
# Helpers (dates)
# -----------------------
def _parse_date(s: Optional[str], field_name: str) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s)  # YYYY-MM-DD
    except Exception:
        raise HTTPException(status_code=400, detail=f"{field_name} must be YYYY-MM-DD")

def _start_dt(d: date) -> datetime:
    return datetime.combine(d, time.min)

def _end_dt_exclusive(d: date) -> datetime:
    # exclusive end: next day 00:00
    return datetime.combine(d + timedelta(days=1), time.min)

def _money(x) -> float:
    return float(Decimal(str(x or 0)))

def _validate_tx_type(tx_type: Optional[str]) -> Optional[str]:
    if not tx_type:
        return None
    t = tx_type.strip().upper()
    allowed = {"TOPUP", "PAYMENT", "REFUND"}
    if t not in allowed:
        raise HTTPException(status_code=400, detail=f"tx_type must be one of {sorted(list(allowed))}")
    return t

# ============================================================
#  A) SALES SUMMARY (today / custom range)
# ============================================================
@router.get("/sales/summary", operation_id="reports_sales_summary_v1_unique")
def sales_summary(
    start_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    s = _parse_date(start_date, "start_date")
    e = _parse_date(end_date, "end_date")

    # default today
    if not s or not e:
        today = date.today()
        s = s or today
        e = e or today

    if e < s:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    start_dt = _start_dt(s)
    end_dt = _end_dt_exclusive(e)

    q = db.query(Order).filter(
        Order.created_at >= start_dt,
        Order.created_at < end_dt,
        Order.status.in_(["paid", "completed"]),
    )

    total_orders = q.count()

    sums = db.query(
        sa_func.coalesce(sa_func.sum(Order.total_amount), 0),
        sa_func.coalesce(sa_func.sum(Order.subtotal), 0),
        sa_func.coalesce(sa_func.sum(Order.vat_amount), 0),
    ).filter(
        Order.created_at >= start_dt,
        Order.created_at < end_dt,
        Order.status.in_(["paid", "completed"]),
    ).first()

    gross_sales = _money(sums[0])
    subtotal_total = _money(sums[1])
    vat_total = _money(sums[2])

    avg_order_value = (gross_sales / float(total_orders)) if total_orders > 0 else 0.0

    return {
        "range": {"start_date": str(s), "end_date": str(e)},
        "total_orders": total_orders,
        "gross_sales": gross_sales,
        "subtotal_total": subtotal_total,
        "vat_total": vat_total,
        "avg_order_value": avg_order_value,
    }

# ============================================================
#  B) SALES BY DAY (for charts)
# ============================================================
@router.get("/sales/daily", operation_id="reports_sales_daily_v1")
def sales_daily(
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    end = date.today()
    start = end - timedelta(days=days - 1)

    start_dt = _start_dt(start)
    end_dt = _end_dt_exclusive(end)

    rows = db.query(
        sa_func.date(Order.created_at).label("d"),
        sa_func.count(Order.id).label("cnt"),
        sa_func.coalesce(sa_func.sum(Order.total_amount), 0).label("sum_total"),
    ).filter(
        Order.created_at >= start_dt,
        Order.created_at < end_dt,
        Order.status.in_(["paid", "completed"]),
    ).group_by(
        sa_func.date(Order.created_at)
    ).order_by(
        sa_func.date(Order.created_at).asc()
    ).all()

    by_date = {str(r.d): {"total_orders": int(r.cnt), "gross_sales": _money(r.sum_total)} for r in rows}

    out = []
    cur = start
    while cur <= end:
        key = str(cur)
        item = by_date.get(key, {"total_orders": 0, "gross_sales": 0.0})
        out.append({"date": key, **item})
        cur += timedelta(days=1)

    return {"days": days, "data": out}

# ============================================================
#  C) TOP PRODUCTS
# ============================================================
@router.get("/products/top", operation_id="reports_top_products_v1")
def top_products(
    limit: int = Query(default=10, ge=1, le=50),
    start_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    s = _parse_date(start_date, "start_date")
    e = _parse_date(end_date, "end_date")

    if not s or not e:
        today = date.today()
        e = e or today
        s = s or (today - timedelta(days=6))

    if e < s:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    start_dt = _start_dt(s)
    end_dt = _end_dt_exclusive(e)

    rows = db.query(
        Product.id.label("product_id"),
        Product.name.label("name"),
        sa_func.coalesce(sa_func.sum(OrderItem.quantity), 0).label("qty_sold"),
        sa_func.coalesce(sa_func.sum(OrderItem.price * OrderItem.quantity), 0).label("revenue"),
    ).join(
        OrderItem, OrderItem.product_id == Product.id
    ).join(
        Order, Order.id == OrderItem.order_id
    ).filter(
        Order.created_at >= start_dt,
        Order.created_at < end_dt,
        Order.status.in_(["paid", "completed"]),
    ).group_by(
        Product.id, Product.name
    ).order_by(
        desc("qty_sold")
    ).limit(limit).all()

    return {
        "range": {"start_date": str(s), "end_date": str(e)},
        "limit": limit,
        "data": [
            {
                "product_id": int(r.product_id),
                "name": r.name,
                "qty_sold": int(r.qty_sold),
                "revenue": _money(r.revenue),
            }
            for r in rows
        ]
    }

# ============================================================
#  D) WALLET SUMMARY
# ============================================================
@router.get("/wallet/summary", operation_id="reports_wallet_summary_v1")
def wallet_summary(
    start_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    s = _parse_date(start_date, "start_date")
    e = _parse_date(end_date, "end_date")

    if not s or not e:
        today = date.today()
        s = s or today
        e = e or today

    if e < s:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    if not hasattr(WalletTransaction, "created_at"):
        raise HTTPException(status_code=400, detail="WalletTransaction.created_at is missing (needed for date filters).")

    start_dt = _start_dt(s)
    end_dt = _end_dt_exclusive(e)

    rows = db.query(
        WalletTransaction.transaction_type.label("t"),
        sa_func.coalesce(sa_func.sum(WalletTransaction.amount), 0).label("sum_amt"),
        sa_func.count(WalletTransaction.id).label("cnt"),
    ).filter(
        WalletTransaction.created_at >= start_dt,
        WalletTransaction.created_at < end_dt,
    ).group_by(
        WalletTransaction.transaction_type
    ).all()

    by_type = {r.t: {"count": int(r.cnt), "amount": _money(r.sum_amt)} for r in rows}

    return {
        "range": {"start_date": str(s), "end_date": str(e)},
        "by_type": {
            "TOPUP": by_type.get("TOPUP", {"count": 0, "amount": 0.0}),
            "PAYMENT": by_type.get("PAYMENT", {"count": 0, "amount": 0.0}),
            "REFUND": by_type.get("REFUND", {"count": 0, "amount": 0.0}),
        }
    }

# ============================================================
#  E) INVENTORY MASTER USAGE
# ============================================================
@router.get("/inventory/master-usage", operation_id="reports_inventory_master_usage_v1")
def inventory_master_usage(
    start_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    limit: int = Query(default=30, ge=1, le=200),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    s = _parse_date(start_date, "start_date")
    e = _parse_date(end_date, "end_date")

    if not s or not e:
        today = date.today()
        e = e or today
        s = s or (today - timedelta(days=6))

    if e < s:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    start_dt = _start_dt(s)
    end_dt = _end_dt_exclusive(e)

    if hasattr(InventoryMasterMovement, "created_at"):
        base_filter = and_(
            InventoryMasterMovement.created_at >= start_dt,
            InventoryMasterMovement.created_at < end_dt,
            InventoryMasterMovement.change_qty < 0,
        )

        rows = db.query(
            InventoryMaster.id.label("inventory_master_id"),
            InventoryMaster.name.label("name"),
            InventoryMaster.unit.label("unit"),
            sa_func.coalesce(sa_func.sum(InventoryMasterMovement.change_qty), 0).label("sum_change"),
        ).join(
            InventoryMaster, InventoryMaster.id == InventoryMasterMovement.inventory_master_id
        ).filter(
            base_filter
        ).group_by(
            InventoryMaster.id, InventoryMaster.name, InventoryMaster.unit
        ).order_by(
            sa_func.sum(InventoryMasterMovement.change_qty).asc()
        ).limit(limit).all()
    else:
        rows = db.query(
            InventoryMaster.id.label("inventory_master_id"),
            InventoryMaster.name.label("name"),
            InventoryMaster.unit.label("unit"),
            sa_func.coalesce(sa_func.sum(InventoryMasterMovement.change_qty), 0).label("sum_change"),
        ).join(
            InventoryMaster, InventoryMaster.id == InventoryMasterMovement.inventory_master_id
        ).join(
            Order, Order.id == InventoryMasterMovement.ref_order_id
        ).filter(
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
            InventoryMasterMovement.change_qty < 0,
        ).group_by(
            InventoryMaster.id, InventoryMaster.name, InventoryMaster.unit
        ).order_by(
            sa_func.sum(InventoryMasterMovement.change_qty).asc()
        ).limit(limit).all()

    return {
        "range": {"start_date": str(s), "end_date": str(e)},
        "limit": limit,
        "data": [
            {
                "inventory_master_id": int(r.inventory_master_id),
                "name": r.name,
                "unit": r.unit,
                "used_qty": float(abs(Decimal(str(r.sum_change or 0)))),
            }
            for r in rows
        ]
    }

# ============================================================
#  F) LOW STOCK
# ============================================================
@router.get("/inventory/low-stock", operation_id="reports_inventory_low_stock_v1")
def low_stock(
    threshold: float = Query(default=10.0, ge=0),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    th = Decimal(str(threshold))

    rows = db.query(InventoryMaster).filter(
        InventoryMaster.is_active == True,
        InventoryMaster.quantity <= th
    ).order_by(InventoryMaster.quantity.asc()).all()

    return {
        "threshold": float(th),
        "data": [
            {
                "inventory_master_id": int(r.id),
                "name": r.name,
                "unit": r.unit,
                "quantity": float(Decimal(str(r.quantity))),
            }
            for r in rows
        ]
    }

# ============================================================
# DASHBOARD OVERVIEW (uses the endpoints above)
# ============================================================
@router.get("/dashboard/overview", operation_id="reports_dashboard_overview_v1")
def dashboard_overview(
    low_stock_threshold: float = Query(default=10.0, ge=0),
    top_limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    today = date.today()
    last7_start = today - timedelta(days=6)

    # NOTE: calling functions directly is fine; operation_id fix is handled by decorators above
    s_today = sales_summary(start_date=str(today), end_date=str(today), db=db, _=True)
    s_7d = sales_summary(start_date=str(last7_start), end_date=str(today), db=db, _=True)
    daily = sales_daily(days=7, db=db, _=True)
    top_products_7d = top_products(limit=top_limit, start_date=str(last7_start), end_date=str(today), db=db, _=True)
    wallet_today = wallet_summary(start_date=str(today), end_date=str(today), db=db, _=True)
    low = low_stock(threshold=low_stock_threshold, db=db, _=True)

    return {
        "date": str(today),
        "sales_today": s_today,
        "sales_last_7_days": s_7d,
        "sales_daily_last_7_days": daily["data"],
        "top_products_last_7_days": top_products_7d["data"],
        "wallet_today": wallet_today,
        "low_stock": {
            "threshold": low["threshold"],
            "count": len(low["data"]),
            "items": low["data"],
        }
    }

# ============================================================
# LOGS: WALLET TRANSACTIONS
# ============================================================
@router.get("/logs/wallet-transactions", operation_id="reports_logs_wallet_transactions_v1")
def wallet_transactions_log(
    start_date: Optional[str] = None,   # YYYY-MM-DD
    end_date: Optional[str] = None,     # YYYY-MM-DD
    tx_type: Optional[str] = None,      # TOPUP | PAYMENT | REFUND
    user_id: Optional[int] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    tx_type = _validate_tx_type(tx_type)

    q = (
        db.query(WalletTransaction, Wallet, User)
        .join(Wallet, Wallet.id == WalletTransaction.wallet_id)
        .join(User, User.id == Wallet.user_id)
    )

    if start_date and hasattr(WalletTransaction, "created_at"):
        sd = _parse_date(start_date, "start_date")
        q = q.filter(WalletTransaction.created_at >= _start_dt(sd))
    if end_date and hasattr(WalletTransaction, "created_at"):
        ed = _parse_date(end_date, "end_date")
        q = q.filter(WalletTransaction.created_at < _end_dt_exclusive(ed))

    if tx_type:
        q = q.filter(WalletTransaction.transaction_type == tx_type)

    if user_id:
        q = q.filter(User.id == user_id)

    total = q.count()

    rows = (
        q.order_by(WalletTransaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    data = []
    for tx, w, u in rows:
        data.append({
            "wallet_transaction_id": tx.id,
            "transaction_type": tx.transaction_type,
            "amount": float(Decimal(str(tx.amount))),
            "order_id": tx.order_id,
            "wallet_id": w.id,
            "user_id": u.id,
            "email": getattr(u, "email", None),
            "created_at": str(getattr(tx, "created_at", "")) if hasattr(tx, "created_at") else None,
        })

    return {"total": total, "limit": limit, "offset": offset, "data": data}

# ============================================================
# LOGS: ORDER CANCELLATIONS
# ============================================================
@router.get("/logs/order-cancellations", operation_id="reports_logs_order_cancellations_v1")
def order_cancellations_log(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    q = db.query(Order).filter(Order.status == "cancelled")

    # prefer cancelled_at if exists
    date_col = Order.cancelled_at if hasattr(Order, "cancelled_at") else Order.created_at

    if start_date:
        sd = _parse_date(start_date, "start_date")
        q = q.filter(date_col >= _start_dt(sd))
    if end_date:
        ed = _parse_date(end_date, "end_date")
        q = q.filter(date_col < _end_dt_exclusive(ed))

    total = q.count()

    orders = (
        q.order_by(Order.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    data = []
    for o in orders:
        refunded = db.query(sa_func.coalesce(sa_func.sum(WalletTransaction.amount), 0)).filter(
            WalletTransaction.order_id == o.id,
            WalletTransaction.transaction_type == "REFUND"
        ).scalar() or 0

        points_reversed = db.query(sa_func.coalesce(sa_func.sum(RewardTransaction.points_change), 0)).filter(
            RewardTransaction.order_id == o.id,
            RewardTransaction.transaction_type == "EARN",
            RewardTransaction.points_change < 0
        ).scalar() or 0

        data.append({
            "order_id": o.id,
            "user_id": o.user_id,
            "order_type": o.order_type,
            "status": o.status,
            "total_amount": float(Decimal(str(o.total_amount))),
            "cancel_reason": getattr(o, "cancel_reason", None),
            "cancelled_at": str(getattr(o, "cancelled_at", "")) if hasattr(o, "cancelled_at") else None,
            "created_at": str(getattr(o, "created_at", "")),
            "wallet_refunded_amount": float(Decimal(str(refunded))),
            "points_reversed": int(abs(int(points_reversed))) if points_reversed else 0,
        })

    return {"total": total, "limit": limit, "offset": offset, "data": data}

# ============================================================
# LOGS: INVENTORY MOVEMENTS (master or product)
# ============================================================
@router.get("/logs/inventory-movements", operation_id="reports_logs_inventory_movements_v1")
def inventory_movements_log(
    kind: str = Query(default="master", description="master | product"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    kind = (kind or "").strip().lower()

    if kind == "master":
        q = (
            db.query(InventoryMasterMovement, InventoryMaster)
            .join(InventoryMaster, InventoryMaster.id == InventoryMasterMovement.inventory_master_id)
        )

        if start_date and hasattr(InventoryMasterMovement, "created_at"):
            sd = _parse_date(start_date, "start_date")
            q = q.filter(InventoryMasterMovement.created_at >= _start_dt(sd))
        if end_date and hasattr(InventoryMasterMovement, "created_at"):
            ed = _parse_date(end_date, "end_date")
            q = q.filter(InventoryMasterMovement.created_at < _end_dt_exclusive(ed))

        total = q.count()
        rows = (
            q.order_by(InventoryMasterMovement.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        data = []
        for m, invm in rows:
            data.append({
                "movement_id": m.id,
                "inventory_master_id": invm.id,
                "name": invm.name,
                "unit": getattr(invm, "unit", None),
                "change_qty": float(Decimal(str(m.change_qty))),
                "reason": m.reason,
                "ref_order_id": getattr(m, "ref_order_id", None),
                "created_at": str(getattr(m, "created_at", "")) if hasattr(m, "created_at") else None,
            })

        return {"kind": "master", "total": total, "limit": limit, "offset": offset, "data": data}

    if kind == "product":
        q = (
            db.query(StockMovement, InventoryItem, Product)
            .join(InventoryItem, InventoryItem.id == StockMovement.inventory_item_id)
            .join(Product, Product.id == InventoryItem.product_id)
        )

        if start_date and hasattr(StockMovement, "created_at"):
            sd = _parse_date(start_date, "start_date")
            q = q.filter(StockMovement.created_at >= _start_dt(sd))
        if end_date and hasattr(StockMovement, "created_at"):
            ed = _parse_date(end_date, "end_date")
            q = q.filter(StockMovement.created_at < _end_dt_exclusive(ed))

        total = q.count()
        rows = (
            q.order_by(StockMovement.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        data = []
        for sm, inv, p in rows:
            data.append({
                "movement_id": sm.id,
                "inventory_item_id": inv.id,
                "product_id": p.id,
                "product_name": p.name,
                "change_quantity": int(sm.change_quantity),
                "reason": sm.reason,
                "created_at": str(getattr(sm, "created_at", "")) if hasattr(sm, "created_at") else None,
            })

        return {"kind": "product", "total": total, "limit": limit, "offset": offset, "data": data}

    raise HTTPException(status_code=400, detail="kind must be 'master' or 'product'")

# ============================================================
# ===================== CSV EXPORT ENDPOINTS =================
# ============================================================

@router.get("/csv/wallet-transactions", operation_id="reports_csv_wallet_transactions_v1")
def wallet_transactions_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    tx_type: Optional[str] = None,
    user_id: Optional[int] = None,
    order_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    tx_type = _validate_tx_type(tx_type)

    q = (
        db.query(WalletTransaction, Wallet, User)
        .join(Wallet, Wallet.id == WalletTransaction.wallet_id)
        .join(User, User.id == Wallet.user_id)
        .order_by(WalletTransaction.id.desc())
    )

    if start_date and hasattr(WalletTransaction, "created_at"):
        sd = _parse_date(start_date, "start_date")
        q = q.filter(WalletTransaction.created_at >= _start_dt(sd))
    if end_date and hasattr(WalletTransaction, "created_at"):
        ed = _parse_date(end_date, "end_date")
        q = q.filter(WalletTransaction.created_at < _end_dt_exclusive(ed))

    if tx_type:
        q = q.filter(WalletTransaction.transaction_type == tx_type)
    if user_id:
        q = q.filter(User.id == user_id)
    if order_id:
        q = q.filter(WalletTransaction.order_id == order_id)

    rows = q.all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "wallet_id", "user_id", "email", "order_id", "amount", "tx_type", "created_at"])

    for tx, wallet, user in rows:
        w.writerow([
            tx.id,
            wallet.id,
            user.id,
            getattr(user, "email", ""),
            tx.order_id if tx.order_id is not None else "",
            str(tx.amount),
            tx.transaction_type,
            str(getattr(tx, "created_at", "")) if hasattr(tx, "created_at") else "",
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="wallet_transactions.csv"'}
    )

@router.get("/csv/orders", operation_id="reports_csv_orders_v1")
def orders_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    q = (
        db.query(Order, OrderItem, Product)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .order_by(Order.id.desc(), OrderItem.id.asc())
    )

    if start_date:
        sd = _parse_date(start_date, "start_date")
        q = q.filter(Order.created_at >= _start_dt(sd))
    if end_date:
        ed = _parse_date(end_date, "end_date")
        q = q.filter(Order.created_at < _end_dt_exclusive(ed))

    if status:
        q = q.filter(Order.status == status.strip().lower())
    if order_type:
        q = q.filter(Order.order_type == order_type.strip().lower())

    rows = q.all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "order_id", "user_id", "order_type", "status", "created_at",
        "subtotal", "vat_amount", "total_amount",
        "order_item_id", "product_id", "product_name", "qty",
        "unit_price", "line_total"
    ])

    for o, oi, p in rows:
        qty = int(oi.quantity)
        unit_price = Decimal(str(oi.price))
        line_total = unit_price * Decimal(qty)
        w.writerow([
            o.id, o.user_id, o.order_type, o.status, str(o.created_at),
            str(o.subtotal), str(o.vat_amount), str(o.total_amount),
            oi.id, p.id, p.name, qty,
            str(unit_price), str(line_total)
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="orders_sales.csv"'}
    )

@router.get("/csv/low-stock", operation_id="reports_csv_low_stock_v1")
def low_stock_csv(
    threshold: float = Query(default=10.0, ge=0),
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    th = Decimal(str(threshold))
    rows = db.query(InventoryMaster).filter(
        InventoryMaster.is_active == True,
        InventoryMaster.quantity <= th
    ).order_by(InventoryMaster.quantity.asc()).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["inventory_master_id", "name", "unit", "quantity"])

    for r in rows:
        w.writerow([r.id, r.name, getattr(r, "unit", ""), str(r.quantity)])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="low_stock.csv"'}
    )

@router.get("/csv/inventory-movements", operation_id="reports_csv_inventory_movements_v1")
def inventory_movements_csv(
    kind: str = Query(default="master", description="master | product"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_admin),
):
    kind = (kind or "").strip().lower()

    if kind == "master":
        q = (
            db.query(InventoryMasterMovement, InventoryMaster)
            .join(InventoryMaster, InventoryMaster.id == InventoryMasterMovement.inventory_master_id)
            .order_by(InventoryMasterMovement.id.desc())
        )

        if start_date and hasattr(InventoryMasterMovement, "created_at"):
            sd = _parse_date(start_date, "start_date")
            q = q.filter(InventoryMasterMovement.created_at >= _start_dt(sd))
        if end_date and hasattr(InventoryMasterMovement, "created_at"):
            ed = _parse_date(end_date, "end_date")
            q = q.filter(InventoryMasterMovement.created_at < _end_dt_exclusive(ed))

        rows = q.all()

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["movement_id", "inventory_master_id", "name", "unit", "change_qty", "reason", "ref_order_id", "created_at"])

        for m, invm in rows:
            w.writerow([
                m.id, invm.id, invm.name, getattr(invm, "unit", ""),
                str(m.change_qty), m.reason, getattr(m, "ref_order_id", ""), str(getattr(m, "created_at", "")) if hasattr(m, "created_at") else ""
            ])

        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="inventory_master_movements.csv"'}
        )

    if kind == "product":
        q = (
            db.query(StockMovement, InventoryItem, Product)
            .join(InventoryItem, InventoryItem.id == StockMovement.inventory_item_id)
            .join(Product, Product.id == InventoryItem.product_id)
            .order_by(StockMovement.id.desc())
        )

        if start_date and hasattr(StockMovement, "created_at"):
            sd = _parse_date(start_date, "start_date")
            q = q.filter(StockMovement.created_at >= _start_dt(sd))
        if end_date and hasattr(StockMovement, "created_at"):
            ed = _parse_date(end_date, "end_date")
            q = q.filter(StockMovement.created_at < _end_dt_exclusive(ed))

        rows = q.all()

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["movement_id", "inventory_item_id", "product_id", "product_name", "change_quantity", "reason", "created_at"])

        for sm, inv, p in rows:
            w.writerow([
                sm.id, inv.id, p.id, p.name,
                int(sm.change_quantity), sm.reason,
                str(getattr(sm, "created_at", "")) if hasattr(sm, "created_at") else ""
            ])

        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="inventory_product_movements.csv"'}
        )

    raise HTTPException(status_code=400, detail="kind must be 'master' or 'product'")
