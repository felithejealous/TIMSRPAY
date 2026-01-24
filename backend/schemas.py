from pydantic import BaseModel, EmailStr
from typing import List, Optional
from decimal import Decimal


# ---------- AUTH ----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterResponse(BaseModel):
    user_id: int
    email: str


# ---------- ORDERS ----------
class OrderItemAddOnCreate(BaseModel):
    add_on_id: int
    qty: int = 1


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int

    # per item customization
    size: Optional[str] = "Small"  # "Small" | "Medium" | "Large"
    add_ons: Optional[List[OrderItemAddOnCreate]] = []


class OrderCreate(BaseModel):
    user_id: int
    order_type: str  # "kiosk" or "online"
    items: List[OrderItemCreate]
    payment_method: Optional[str] = None  # e.g. "wallet" | "cash"
