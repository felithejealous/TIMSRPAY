from typing import Optional, List, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from backend.database import SessionLocal
from backend.models import Product, ProductRecipe, InventoryMaster, User, Category, AddOn, Order, OrderItem
from backend.security import require_roles

router = APIRouter(prefix="/products", tags=["Products"])

PACKAGING_SMALL_CUP_NAME = "Cup-small"
PACKAGING_STRAW_NAME = "Straw"


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
class ProductPatch(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    points_per_unit: Optional[int] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None
    is_available: Optional[bool] = None


class ProductCreate(BaseModel):
    name: str
    price: float
    description: Optional[str] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    points_per_unit: int = 0
    is_active: bool = True
    is_available: bool = True


class RecipeItem(BaseModel):
    inventory_master_id: int
    qty_used: float


class RecipeReplace(BaseModel):
    items: List[RecipeItem]


# -----------------------
# HELPERS
# -----------------------
def _serialize_addon(a: AddOn):
    return {
        "add_on_id": a.id,
        "name": a.name,
        "price": float(a.price),
        "addon_type": a.addon_type,
        "is_active": bool(getattr(a, "is_active", True)),
    }


def _serialize_product(
    p: Product,
    category_name: Optional[str] = None,
    add_ons: Optional[List[dict]] = None,
):
    return {
        "product_id": p.id,
        "name": p.name,
        "price": float(p.price),
        "description": getattr(p, "description", None),
        "image_url": getattr(p, "image_url", None),
        "points_per_unit": int(getattr(p, "points_per_unit", 0) or 0),
        "is_active": bool(getattr(p, "is_active", True)),
        "is_available": bool(getattr(p, "is_available", True)),
        "category_id": getattr(p, "category_id", None),
        "category_name": category_name,
        "add_ons": add_ons or [],
    }


def _get_valid_category(db: Session, category_id: Optional[int]) -> Optional[Category]:
    if category_id is None:
        return None

    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=400, detail="Invalid or inactive category")
    return category


def _normalize_name(value: str) -> str:
    return (value or "").strip().lower()


def _build_inventory_map(db: Session) -> Dict[int, InventoryMaster]:
    rows = db.query(InventoryMaster).all()
    return {row.id: row for row in rows}


def _find_inventory_by_name(db: Session, name: str) -> Optional[InventoryMaster]:
    return (
        db.query(InventoryMaster)
        .filter(sa_func.lower(InventoryMaster.name) == _normalize_name(name))
        .first()
    )


def _has_required_packaging_stock(db: Session) -> bool:
    cup_small = _find_inventory_by_name(db, PACKAGING_SMALL_CUP_NAME)
    straw = _find_inventory_by_name(db, PACKAGING_STRAW_NAME)

    if not cup_small or not bool(getattr(cup_small, "is_active", False)):
        return False
    if not straw or not bool(getattr(straw, "is_active", False)):
        return False

    if float(cup_small.quantity or 0) < 1:
        return False
    if float(straw.quantity or 0) < 1:
        return False

    return True


def _is_product_stock_available(
    db: Session,
    product: Product,
    recipe_rows: List[ProductRecipe],
    inventory_map: Dict[int, InventoryMaster],
) -> bool:
    if not bool(getattr(product, "is_active", True)):
        return False

    if not _has_required_packaging_stock(db):
        return False

    if not recipe_rows:
        return True

    for recipe in recipe_rows:
        inv_item = inventory_map.get(recipe.inventory_master_id)
        if not inv_item:
            return False
        if not bool(getattr(inv_item, "is_active", False)):
            return False

        current_qty = float(inv_item.quantity or 0)
        required_qty = float(recipe.qty_used or 0)

        if current_qty < required_qty:
            return False

    return True


def _get_public_addons(db: Session) -> List[dict]:
    rows = (
        db.query(AddOn)
        .filter(AddOn.is_active == True, AddOn.addon_type == "ADDON")
        .order_by(AddOn.name.asc())
        .all()
    )
    return [_serialize_addon(row) for row in rows]


def sync_product_availability_for_product(
    db: Session,
    product_id: int,
    commit: bool = False,
) -> Optional[bool]:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return None

    recipe_rows = (
        db.query(ProductRecipe)
        .filter(ProductRecipe.product_id == product_id)
        .all()
    )
    inventory_map = _build_inventory_map(db)

    computed_available = _is_product_stock_available(
        db=db,
        product=product,
        recipe_rows=recipe_rows,
        inventory_map=inventory_map,
    )

    product.is_available = bool(computed_available)
    db.flush()

    if commit:
        db.commit()
        db.refresh(product)

    return bool(product.is_available)


def sync_all_product_availability(db: Session, commit: bool = False) -> int:
    products = db.query(Product).all()
    inventory_map = _build_inventory_map(db)

    recipe_rows = db.query(ProductRecipe).all()
    recipe_map: Dict[int, List[ProductRecipe]] = {}

    for row in recipe_rows:
        recipe_map.setdefault(int(row.product_id), []).append(row)

    updated_count = 0

    for product in products:
        computed_available = _is_product_stock_available(
            db=db,
            product=product,
            recipe_rows=recipe_map.get(int(product.id), []),
            inventory_map=inventory_map,
        )

        current_available = bool(getattr(product, "is_available", True))
        if current_available != bool(computed_available):
            product.is_available = bool(computed_available)
            updated_count += 1

    db.flush()

    if commit:
        db.commit()

    return updated_count


# ============================================================
# PUBLIC ADD-ONS
# ============================================================
@router.get("/add-ons/public")
def list_public_addons(db: Session = Depends(get_db)):
    rows = _get_public_addons(db)
    return {"count": len(rows), "data": rows}


# ============================================================
# LIST ACTIVE CATEGORIES (staff/cashier/admin)
# ============================================================
@router.get("/categories")
def list_categories(
    active_only: bool = Query(default=True),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    query = db.query(Category)

    if active_only:
        query = query.filter(Category.is_active == True)

    rows = query.order_by(Category.id.asc()).all()

    return {
        "count": len(rows),
        "data": [
            {
                "category_id": c.id,
                "name": c.name,
                "is_active": bool(getattr(c, "is_active", True)),
            }
            for c in rows
        ],
    }


# ============================================================
# CUSTOMER MENU: active + available only (PUBLIC)
# ============================================================
@router.get("/menu")
def get_menu(db: Session = Depends(get_db)):
    sync_all_product_availability(db, commit=True)

    public_addons = _get_public_addons(db)

    rows = (
        db.query(Product, Category)
        .outerjoin(Category, Category.id == Product.category_id)
        .filter(Product.is_active == True, Product.is_available == True)
        .order_by(Product.id.asc())
        .all()
    )

    return {
        "count": len(rows),
        "data": [
            _serialize_product(
                product,
                category.name if category else None,
                add_ons=public_addons,
            )
            for product, category in rows
        ],
    }

#--------------------------------------
#_____________MENNUU
#========================
@router.get("/best-sellers/monthly")
def get_monthly_best_sellers(
    limit: int = Query(default=4, ge=1, le=12),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    if now.month == 12:
        next_month_start = datetime(now.year + 1, 1, 1)
    else:
        next_month_start = datetime(now.year, now.month + 1, 1)

    sold_qty_expr = sa_func.coalesce(sa_func.sum(OrderItem.quantity), 0)
    sales_amount_expr = sa_func.coalesce(
        sa_func.sum(OrderItem.quantity * OrderItem.price),
        0
    )

    rows = (
        db.query(
            Product,
            Category,
            sold_qty_expr.label("sold_qty"),
            sales_amount_expr.label("sales_amount"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .outerjoin(Category, Category.id == Product.category_id)
        .filter(Product.is_active == True)
        .filter(Order.status.in_(["paid", "completed"]))
        .filter(Order.created_at >= month_start)
        .filter(Order.created_at < next_month_start)
        .group_by(Product.id, Category.id)
        .order_by(
            sold_qty_expr.desc(),
            sales_amount_expr.desc(),
            Product.name.asc(),
        )
        .limit(limit)
        .all()
    )

    month_label = now.strftime("%B %Y")

    return {
        "month": month_label,
        "count": len(rows),
        "data": [
            {
                "product_id": product.id,
                "name": product.name,
                "price": float(product.price or 0),
                "description": getattr(product, "description", None),
                "image_url": getattr(product, "image_url", None),
                "category_id": getattr(product, "category_id", None),
                "category_name": category.name if category else None,
                "sold_qty": int(sold_qty or 0),
                "sales_amount": float(sales_amount or 0),
            }
            for product, category, sold_qty, sales_amount in rows
        ],
    }
# ============================================================
# LIST PRODUCTS (staff/cashier/admin)
# ============================================================
@router.get("/")
def list_products(
    active_only: bool = Query(default=False),
    q: Optional[str] = Query(default=None, description="search by name"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    sync_all_product_availability(db, commit=True)

    query = db.query(Product, Category).outerjoin(Category, Category.id == Product.category_id)

    if active_only:
        query = query.filter(Product.is_active == True)

    if q:
        q_clean = q.strip()
        query = query.filter(Product.name.ilike(f"%{q_clean}%"))

    rows = query.order_by(Product.id.asc()).limit(limit).all()

    return {
        "count": len(rows),
        "data": [
            _serialize_product(product, category.name if category else None)
            for product, category in rows
        ],
    }


# ============================================================
# GET SINGLE PRODUCT (PUBLIC)
# ============================================================
@router.get("/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    sync_product_availability_for_product(db, product_id, commit=True)

    row = (
        db.query(Product, Category)
        .outerjoin(Category, Category.id == Product.category_id)
        .filter(Product.id == product_id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    product, category = row
    public_addons = _get_public_addons(db)

    return _serialize_product(
        product,
        category.name if category else None,
        add_ons=public_addons,
    )


# ============================================================
# CREATE PRODUCT (staff/cashier/admin)
# ============================================================
@router.post("/")
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    name = (payload.name or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    if payload.price < 0:
        raise HTTPException(status_code=400, detail="price must be >= 0")

    if payload.points_per_unit < 0:
        raise HTTPException(status_code=400, detail="points_per_unit must be >= 0")

    if payload.category_id is None:
        raise HTTPException(status_code=400, detail="category_id is required")

    existing = db.query(Product).filter(sa_func.lower(Product.name) == name.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product name already exists")

    category = _get_valid_category(db, payload.category_id)

    p = Product(
        name=name,
        price=payload.price,
        description=(payload.description.strip() if payload.description else None),
        image_url=(payload.image_url.strip() if payload.image_url else None),
        category_id=category.id if category else None,
        points_per_unit=payload.points_per_unit,
        is_active=payload.is_active,
        is_available=payload.is_available,
    )

    db.add(p)
    db.flush()

    sync_product_availability_for_product(db, p.id, commit=False)

    db.commit()
    db.refresh(p)

    return {
        "message": "created",
        **_serialize_product(p, category.name if category else None),
    }


# ============================================================
# PATCH PRODUCT (staff/cashier/admin)
# ============================================================
@router.patch("/{product_id}")
def patch_product(
    product_id: int,
    payload: ProductPatch,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    category_name = None

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")

        dup = db.query(Product).filter(
            sa_func.lower(Product.name) == name.lower(),
            Product.id != product_id
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail="Product name already exists")

        p.name = name

    if payload.price is not None:
        if payload.price < 0:
            raise HTTPException(status_code=400, detail="price must be >= 0")
        p.price = payload.price

    if payload.description is not None:
        p.description = payload.description.strip() or None

    if payload.image_url is not None:
        p.image_url = payload.image_url.strip() or None

    if payload.points_per_unit is not None:
        if payload.points_per_unit < 0:
            raise HTTPException(status_code=400, detail="points_per_unit must be >= 0")
        p.points_per_unit = payload.points_per_unit

    if payload.category_id is not None:
        category = _get_valid_category(db, payload.category_id)
        p.category_id = category.id
        category_name = category.name

    if payload.is_active is not None:
        p.is_active = bool(payload.is_active)

    if payload.is_available is not None:
        p.is_available = bool(payload.is_available)

    sync_product_availability_for_product(db, product_id, commit=False)

    db.commit()
    db.refresh(p)

    if category_name is None and p.category_id is not None:
        category_row = db.query(Category).filter(Category.id == p.category_id).first()
        category_name = category_row.name if category_row else None

    return _serialize_product(p, category_name)


# ============================================================
# RECIPE VIEW (staff/cashier/admin)
# ============================================================
@router.get("/{product_id}/recipe")
def get_recipe(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    rows = (
        db.query(ProductRecipe, InventoryMaster)
        .join(InventoryMaster, InventoryMaster.id == ProductRecipe.inventory_master_id)
        .filter(ProductRecipe.product_id == product_id)
        .order_by(ProductRecipe.id.asc())
        .all()
    )

    return {
        "product_id": product_id,
        "count": len(rows),
        "data": [
            {
                "product_recipe_id": pr.id,
                "inventory_master_id": invm.id,
                "ingredient_name": invm.name,
                "unit": invm.unit,
                "qty_used": float(pr.qty_used),
            }
            for pr, invm in rows
        ],
    }


# ============================================================
# RECIPE REPLACE (staff/cashier/admin)
# ============================================================
@router.put("/{product_id}/recipe")
def replace_recipe(
    product_id: int,
    payload: RecipeReplace,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("staff", "cashier", "admin")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    if not payload.items:
        raise HTTPException(status_code=400, detail="items cannot be empty")

    inv_ids = [int(x.inventory_master_id) for x in payload.items]
    inv_rows = db.query(InventoryMaster).filter(InventoryMaster.id.in_(inv_ids)).all()
    inv_map = {r.id: r for r in inv_rows}

    for x in payload.items:
        if int(x.inventory_master_id) not in inv_map:
            raise HTTPException(status_code=400, detail=f"Invalid inventory_master_id: {x.inventory_master_id}")
        if float(x.qty_used) <= 0:
            raise HTTPException(status_code=400, detail="qty_used must be > 0")

    db.query(ProductRecipe).filter(ProductRecipe.product_id == product_id).delete(synchronize_session=False)

    for x in payload.items:
        db.add(
            ProductRecipe(
                product_id=product_id,
                inventory_master_id=int(x.inventory_master_id),
                qty_used=float(x.qty_used),
            )
        )

    sync_product_availability_for_product(db, product_id, commit=False)

    db.commit()
    return {"message": "Recipe replaced", "product_id": product_id, "count": len(payload.items)}