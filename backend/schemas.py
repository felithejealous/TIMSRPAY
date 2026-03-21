from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from decimal import Decimal

class WalletSetPin(BaseModel):
    user_id: int
    pin: str = Field(min_length=4, max_length=6)

class WalletVerifyPin(BaseModel):
    email: EmailStr
    pin: str = Field(min_length=4, max_length=6)

class WalletPayByEmail(BaseModel):
    email: EmailStr
    pin: str = Field(min_length=4, max_length=6)
    order_id: int

# ---------- AUTH ----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterResponse(BaseModel):
    user_id: int
    email: str


# ---------- ORDERS ----------
OrderType = Literal["kiosk", "online", "cashier"]

class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    price: Optional[Decimal] = None
    size: Optional[Literal["small", "medium", "large"]] = None
    sugar_level: Optional[Literal["0", "25", "50", "100"]] = None
    add_ons: List[int] = Field(default_factory=list)


class OrderCreate(BaseModel):
    user_id: Optional[int] = None
    order_type: OrderType
    items: List[OrderItemCreate]

    payment_method: Optional[str] = None
    wallet_email: Optional[EmailStr] = None
    wallet_code: Optional[str] = Field(default=None, min_length=6, max_length=6)
    wallet_pin: Optional[str] = Field(default=None, min_length=4, max_length=6)

    customer_name: Optional[str] = Field(default=None, max_length=150)


# =========================
# INVENTORY MASTER
# =========================
class InventoryMasterCreate(BaseModel):
    name: str = Field(min_length=1)
    unit: str = Field(min_length=1, description="pcs | ml | g")
    quantity: Decimal = Field(default=0, ge=0)
    is_active: bool = True

class InventoryMasterUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None

class InventoryMasterRestock(BaseModel):
    add_qty: Decimal = Field(gt=0)
    reason: str = Field(default="restock", min_length=1)

# =========================
# RECIPES
# =========================
class ProductRecipeCreate(BaseModel):
    product_id: int
    inventory_master_id: int
    qty_used: Decimal = Field(gt=0)

class ProductRecipeUpdate(BaseModel):
    qty_used: Decimal = Field(gt=0)

class AddOnRecipeCreate(BaseModel):
    add_on_id: int
    inventory_master_id: int
    qty_used: Decimal = Field(gt=0)

class AddOnRecipeUpdate(BaseModel):
    qty_used: Decimal = Field(gt=0)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    user_id: int
    email: str
    role: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str

class ResetPasswordResponse(BaseModel):
    message: str