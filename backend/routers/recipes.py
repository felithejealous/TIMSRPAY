from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Product, AddOn, InventoryMaster, ProductRecipe, AddOnRecipe
from schemas import (
    ProductRecipeCreate, ProductRecipeUpdate,
    AddOnRecipeCreate, AddOnRecipeUpdate
)

router = APIRouter(prefix="/recipes", tags=["Recipes"])

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
# GUARDS
# -----------------------
def require_admin(
    x_role: str = Header(default="", alias="X-Role", description="admin")
):
    if (x_role or "").strip().lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin only (set header X-Role: admin)")
    return True

# -----------------------
# PRODUCT RECIPES
# -----------------------
@router.get("/products/{product_id}")
def list_product_recipe(product_id: int, db: Session = Depends(get_db)):
    rows = db.query(ProductRecipe, InventoryMaster).join(
        InventoryMaster, InventoryMaster.id == ProductRecipe.inventory_master_id
    ).filter(ProductRecipe.product_id == product_id).all()

    return {
        "product_id": product_id,
        "data": [
            {
                "product_recipe_id": pr.id,
                "inventory_master_id": inv.id,
                "name": inv.name,
                "unit": inv.unit,
                "qty_used": float(Decimal(str(pr.qty_used or 0))),
            }
            for pr, inv in rows
        ]
    }

@router.post("/products")
def add_product_recipe(payload: ProductRecipeCreate, db: Session = Depends(get_db), _: bool = Depends(require_admin)):
    p = db.query(Product).filter(Product.id == payload.product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    inv = db.query(InventoryMaster).filter(InventoryMaster.id == payload.inventory_master_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="InventoryMaster not found")

    # avoid duplicates
    exists = db.query(ProductRecipe).filter(
        ProductRecipe.product_id == payload.product_id,
        ProductRecipe.inventory_master_id == payload.inventory_master_id
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Recipe row already exists (use PATCH)")

    row = ProductRecipe(
        product_id=payload.product_id,
        inventory_master_id=payload.inventory_master_id,
        qty_used=Decimal(str(payload.qty_used))
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"product_recipe_id": row.id}

@router.patch("/products/{product_recipe_id}")
def update_product_recipe(product_recipe_id: int, payload: ProductRecipeUpdate, db: Session = Depends(get_db), _: bool = Depends(require_admin)):
    row = db.query(ProductRecipe).filter(ProductRecipe.id == product_recipe_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="ProductRecipe not found")

    row.qty_used = Decimal(str(payload.qty_used))
    db.commit()
    db.refresh(row)
    return {"product_recipe_id": row.id, "updated": True}

@router.delete("/products/{product_recipe_id}")
def delete_product_recipe(product_recipe_id: int, db: Session = Depends(get_db), _: bool = Depends(require_admin)):
    row = db.query(ProductRecipe).filter(ProductRecipe.id == product_recipe_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="ProductRecipe not found")
    db.delete(row)
    db.commit()
    return {"deleted": True}

# -----------------------
# ADD-ON RECIPES
# -----------------------
@router.get("/addons/{add_on_id}")
def list_addon_recipe(add_on_id: int, db: Session = Depends(get_db)):
    rows = db.query(AddOnRecipe, InventoryMaster).join(
        InventoryMaster, InventoryMaster.id == AddOnRecipe.inventory_master_id
    ).filter(AddOnRecipe.add_on_id == add_on_id).all()

    return {
        "add_on_id": add_on_id,
        "data": [
            {
                "addon_recipe_id": ar.id,
                "inventory_master_id": inv.id,
                "name": inv.name,
                "unit": inv.unit,
                "qty_used": float(Decimal(str(ar.qty_used or 0))),
            }
            for ar, inv in rows
        ]
    }

@router.post("/addons")
def add_addon_recipe(payload: AddOnRecipeCreate, db: Session = Depends(get_db), _: bool = Depends(require_admin)):
    ao = db.query(AddOn).filter(AddOn.id == payload.add_on_id).first()
    if not ao:
        raise HTTPException(status_code=404, detail="AddOn not found")

    inv = db.query(InventoryMaster).filter(InventoryMaster.id == payload.inventory_master_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="InventoryMaster not found")

    exists = db.query(AddOnRecipe).filter(
        AddOnRecipe.add_on_id == payload.add_on_id,
        AddOnRecipe.inventory_master_id == payload.inventory_master_id
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Add-on recipe row already exists (use PATCH)")

    row = AddOnRecipe(
        add_on_id=payload.add_on_id,
        inventory_master_id=payload.inventory_master_id,
        qty_used=Decimal(str(payload.qty_used))
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"addon_recipe_id": row.id}

@router.patch("/addons/{addon_recipe_id}")
def update_addon_recipe(addon_recipe_id: int, payload: AddOnRecipeUpdate, db: Session = Depends(get_db), _: bool = Depends(require_admin)):
    row = db.query(AddOnRecipe).filter(AddOnRecipe.id == addon_recipe_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="AddOnRecipe not found")
    row.qty_used = Decimal(str(payload.qty_used))
    db.commit()
    db.refresh(row)
    return {"addon_recipe_id": row.id, "updated": True}

@router.delete("/addons/{addon_recipe_id}")
def delete_addon_recipe(addon_recipe_id: int, db: Session = Depends(get_db), _: bool = Depends(require_admin)):
    row = db.query(AddOnRecipe).filter(AddOnRecipe.id == addon_recipe_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="AddOnRecipe not found")
    db.delete(row)
    db.commit()
    return {"deleted": True}
