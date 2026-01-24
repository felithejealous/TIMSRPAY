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
class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int
    price: Decimal  # price per item at time of order


class OrderCreate(BaseModel):
    user_id: int
    order_type: str  # "kiosk" or "online"
    items: List[OrderItemCreate]
    payment_method: Optional[str] = None  # optional for now
