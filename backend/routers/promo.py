import os
import uuid
from decimal import Decimal
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import PromoCode, PromoBanner, PromoCodeRedemption, User
from backend.security import require_roles, get_current_user
from backend.schemas import PromoCodeUpdate


router = APIRouter(prefix="/promo", tags=["Promotions"])
def _parse_optional_datetime(value: Optional[str]):
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format. Use YYYY-MM-DDTHH:MM")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _serialize_code(row: PromoCode):
    discount_value = float(row.discount_value or 0)
    min_order_amount = float(row.min_order_amount or 0)

    if row.discount_type == "percent":
        value_label = f"{int(discount_value) if discount_value.is_integer() else discount_value}% OFF"
    else:
        value_label = f"₱{discount_value:.2f} OFF"

    return {
        "promo_id": row.id,
        "title": row.title,
        "description": row.description,
        "code": row.code,
        "discount_type": row.discount_type,
        "discount_value": discount_value,
        "value_label": value_label,
        "min_order_amount": min_order_amount,
        "usage_limit": row.usage_limit,
        "usage_count": int(row.usage_count or 0),
        "per_user_limit": row.per_user_limit,
        "is_active": bool(row.is_active),
        "valid_from": str(row.valid_from) if row.valid_from else None,
        "valid_until": str(row.valid_until) if row.valid_until else None,
        "created_at": str(row.created_at) if row.created_at else None,
    }


def _serialize_banner(row: PromoBanner):
    return {
        "banner_id": row.id,
        "title": row.title,
        "image_url": row.image_url,
        "link_url": row.link_url,
        "is_active": bool(row.is_active),
        "created_at": str(row.created_at) if row.created_at else None,
    }


@router.get("/summary")
def get_promo_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    active_banners = db.query(PromoBanner).filter(PromoBanner.is_active == True).count()
    active_codes = db.query(PromoCode).filter(PromoCode.is_active == True).count()

    code_rows = db.query(PromoCode).all()
    total_limit = 0
    total_used = 0

    for row in code_rows:
        if row.usage_limit and row.usage_limit > 0:
            total_limit += int(row.usage_limit)
            total_used += int(row.usage_count or 0)

    usage_rate = 0
    if total_limit > 0:
        usage_rate = round((total_used / total_limit) * 100)

    return {
        "active_banners": active_banners,
        "active_codes": active_codes,
        "usage_rate": usage_rate,
    }


@router.get("/codes")
def list_promo_codes(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    query = db.query(PromoCode)

    if active_only:
        query = query.filter(PromoCode.is_active == True)

    rows = query.order_by(PromoCode.id.desc()).all()

    return {
        "count": len(rows),
        "data": [_serialize_code(row) for row in rows],
    }


@router.get("/available/me")
def list_my_available_promos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(PromoCode).filter(PromoCode.is_active == True).order_by(PromoCode.id.desc()).all()

    data = []
    for row in rows:
        used = db.query(PromoCodeRedemption).filter(
            PromoCodeRedemption.promo_code_id == row.id,
            PromoCodeRedemption.user_id == current_user.id,
        ).first()

        item = _serialize_code(row)
        item["already_used_by_me"] = bool(used)
        data.append(item)

    return {
        "count": len(data),
        "data": data,
    }


@router.post("/codes")
def create_promo_code(
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    code: str = Form(...),
    discount_type: str = Form(...),
    discount_value: Decimal = Form(...),
    min_order_amount: Decimal = Form(0),
    usage_limit: Optional[int] = Form(None),
    per_user_limit: Optional[int] = Form(None),
    valid_from: Optional[str] = Form(None),
    valid_until: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    clean_code = (code or "").strip().upper()

    if not clean_code:
        raise HTTPException(status_code=400, detail="Promo code is required")

    if discount_type not in {"percent", "fixed"}:
        raise HTTPException(status_code=400, detail="Invalid discount type")

    if Decimal(str(discount_value)) <= 0:
        raise HTTPException(status_code=400, detail="Discount value must be greater than 0")

    if discount_type == "percent" and Decimal(str(discount_value)) > 100:
        raise HTTPException(status_code=400, detail="Percent discount cannot exceed 100")

    existing = db.query(PromoCode).filter(PromoCode.code == clean_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Promo code already exists")

    parsed_valid_from = _parse_optional_datetime(valid_from)
    parsed_valid_until = _parse_optional_datetime(valid_until)

    if parsed_valid_from and parsed_valid_until and parsed_valid_until < parsed_valid_from:
        raise HTTPException(status_code=400, detail="valid_until must be after valid_from")

    row = PromoCode(
        title=(title or "").strip() or None,
        description=(description or "").strip() or None,
        code=clean_code,
        discount_type=discount_type,
        discount_value=discount_value,
        min_order_amount=min_order_amount or 0,
        usage_limit=usage_limit,
        usage_count=0,
        per_user_limit=per_user_limit,
        valid_from=parsed_valid_from,
        valid_until=parsed_valid_until,
        is_active=True,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "Promo code created",
        "data": _serialize_code(row),
    }

@router.patch("/codes/{promo_id}")
def update_promo_code(
    promo_id: int,
    payload: PromoCodeUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Promo code not found")

    clean_code = (payload.code or "").strip().upper()
    if not clean_code:
        raise HTTPException(status_code=400, detail="Promo code is required")

    if payload.discount_type not in {"percent", "fixed"}:
        raise HTTPException(status_code=400, detail="Invalid discount type")

    discount_value = Decimal(str(payload.discount_value))
    if discount_value <= 0:
        raise HTTPException(status_code=400, detail="Discount value must be greater than 0")

    if payload.discount_type == "percent" and discount_value > 100:
        raise HTTPException(status_code=400, detail="Percent discount cannot exceed 100")

    existing = db.query(PromoCode).filter(
        PromoCode.code == clean_code,
        PromoCode.id != promo_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Another promo code already uses that code")

    parsed_valid_from = _parse_optional_datetime(payload.valid_from)
    parsed_valid_until = _parse_optional_datetime(payload.valid_until)

    if parsed_valid_from and parsed_valid_until and parsed_valid_until < parsed_valid_from:
        raise HTTPException(status_code=400, detail="valid_until must be after valid_from")

    row.title = (payload.title or "").strip() or None
    row.description = (payload.description or "").strip() or None
    row.code = clean_code
    row.discount_type = payload.discount_type
    row.discount_value = discount_value
    row.min_order_amount = Decimal(str(payload.min_order_amount or 0))
    row.usage_limit = payload.usage_limit
    row.per_user_limit = payload.per_user_limit
    row.valid_from = parsed_valid_from
    row.valid_until = parsed_valid_until

    db.commit()
    db.refresh(row)

    return {
        "message": "Promo code updated",
        "data": _serialize_code(row),
    }

@router.patch("/codes/{promo_id}/toggle")
def toggle_promo_code(
    promo_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Promo code not found")

    row.is_active = not bool(row.is_active)
    db.commit()
    db.refresh(row)

    return {
        "message": "Promo code updated",
        "data": _serialize_code(row),
    }


@router.delete("/codes/{promo_id}")
def delete_promo_code(
    promo_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Promo code not found")

    redemption_rows = db.query(PromoCodeRedemption).filter(
        PromoCodeRedemption.promo_code_id == promo_id
    ).all()
    for redemption in redemption_rows:
        db.delete(redemption)

    db.delete(row)
    db.commit()

    return {"message": "Promo code deleted"}


@router.get("/banners")
def list_banners(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    query = db.query(PromoBanner)

    if active_only:
        query = query.filter(PromoBanner.is_active == True)

    rows = query.order_by(PromoBanner.id.desc()).all()

    return {
        "count": len(rows),
        "data": [_serialize_banner(row) for row in rows],
    }


@router.post("/banners")
def create_banner(
    title: Optional[str] = Form(None),
    link_url: Optional[str] = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    uploads_dir = os.path.join("uploads", "promos")
    os.makedirs(uploads_dir, exist_ok=True)

    ext = os.path.splitext(image.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Only jpg, jpeg, png, and webp are allowed")

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(uploads_dir, filename)

    content = image.file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    image_url = f"/uploads/promos/{filename}"

    row = PromoBanner(
        title=(title or "").strip() or None,
        link_url=(link_url or "").strip() or None,
        image_url=image_url,
        is_active=True,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "Banner created",
        "data": _serialize_banner(row),
    }


@router.patch("/banners/{banner_id}/toggle")
def toggle_banner(
    banner_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(PromoBanner).filter(PromoBanner.id == banner_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Banner not found")

    row.is_active = not bool(row.is_active)
    db.commit()
    db.refresh(row)

    return {
        "message": "Banner updated",
        "data": _serialize_banner(row),
    }


@router.delete("/banners/{banner_id}")
def delete_banner(
    banner_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    row = db.query(PromoBanner).filter(PromoBanner.id == banner_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Banner not found")

    image_url = row.image_url or ""
    if image_url.startswith("/uploads/"):
        file_path = image_url.lstrip("/")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

    db.delete(row)
    db.commit()

    return {"message": "Banner deleted"}