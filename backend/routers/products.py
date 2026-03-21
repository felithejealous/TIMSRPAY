from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from backend.database import SessionLocal
from backend.models import Product, ProductRecipe, InventoryMaster, User, Category
from backend.security import require_roles

router = APIRouter(prefix="/products", tags=["Products"])


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
    points_per_unit: Optional[int] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None
    is_available: Optional[bool] = None


class ProductCreate(BaseModel):
    name: str
    price: float
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
def _serialize_product(p: Product, category_name: Optional[str] = None):
    return {
        "product_id": p.id,
        "name": p.name,
        "price": float(p.price),
        "points_per_unit": int(getattr(p, "points_per_unit", 0) or 0),
        "is_active": bool(getattr(p, "is_active", True)),
        "is_available": bool(getattr(p, "is_available", True)),
        "category_id": getattr(p, "category_id", None),
        "category_name": category_name,
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
            _serialize_product(product, category.name if category else None)
            for product, category in rows
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
    row = (
        db.query(Product, Category)
        .outerjoin(Category, Category.id == Product.category_id)
        .filter(Product.id == product_id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    product, category = row
    return _serialize_product(product, category.name if category else None)


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
        category_id=category.id if category else None,
        points_per_unit=payload.points_per_unit,
        is_active=payload.is_active,
        is_available=payload.is_available,
    )

    db.add(p)
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

    db.commit()
    return {"message": "Recipe replaced", "product_id": product_id, "count": len(payload.items)}