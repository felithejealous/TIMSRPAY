from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from decimal import Decimal

from datetime import datetime

class CustomerNotificationOut(BaseModel):
    id: int
    title: str
    message: str
    notif_type: str
    priority: str
    is_read: bool
    is_dismissed: bool
    is_sticky: bool
    action_url: Optional[str] = None
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CustomerNotificationDismiss(BaseModel):
    is_dismissed: bool = True


class CustomerNotificationRead(BaseModel):
    is_read: bool = True

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
    notes: Optional[str] = Field(default=None, max_length=500)

class OrderCreate(BaseModel):
    user_id: Optional[int] = None
    order_type: OrderType
    items: List[OrderItemCreate]

    payment_method: Optional[str] = None
    wallet_email: Optional[EmailStr] = None
    wallet_code: Optional[str] = Field(default=None, min_length=6, max_length=6)
    wallet_pin: Optional[str] = Field(default=None, min_length=4, max_length=6)
    promo_code: Optional[str] = Field(default=None, min_length=3, max_length=50)

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
class PromoCodeToggle(BaseModel):
    is_active: bool
class PromoBannerToggle(BaseModel):
    is_active: bool
class PromoCodeCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = None
    code: str = Field(min_length=3, max_length=50)
    discount_type: Literal["percent", "fixed"]
    discount_value: Decimal = Field(gt=0)
    min_order_amount: Decimal = Field(default=0, ge=0)
    usage_limit: Optional[int] = Field(default=None, ge=1)
    per_user_limit: Optional[int] = Field(default=None, ge=1)
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
class PromoCodeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = None
    code: str = Field(min_length=3, max_length=50)
    discount_type: Literal["percent", "fixed"]
    discount_value: Decimal = Field(gt=0)
    min_order_amount: Decimal = Field(default=0, ge=0)
    usage_limit: Optional[int] = Field(default=None, ge=1)
    per_user_limit: Optional[int] = Field(default=None, ge=1)
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None

# =========================
# INQUIRIES
# =========================
class InquiryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    subject: Optional[str] = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=3000)
class InquiryPublicCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    subject: Optional[str] = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=3000)
class InquiryCustomerCreate(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=3000)
class InquiryReply(BaseModel):
    admin_reply: str = Field(min_length=1, max_length=3000)
    status: Optional[Literal["pending", "replied", "closed"]] = "replied"
class InquiryStatusUpdate(BaseModel):
    status: Literal["pending", "replied", "closed"]
# =========================
# PRODUCT FEEDBACK
# =========================
class ProductFeedbackCreate(BaseModel):
    user_id: Optional[int] = None
    order_id: Optional[int] = None
    product_id: Optional[int] = None

    customer_name: str = Field(min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    product_name: Optional[str] = Field(default=None, max_length=150)

    rating: int = Field(ge=1, le=5)
    title: Optional[str] = Field(default=None, max_length=200)
    comment: str = Field(min_length=1, max_length=3000)


class ProductFeedbackReply(BaseModel):
    admin_reply: str = Field(min_length=1, max_length=3000)


class ProductFeedbackModerate(BaseModel):
    is_approved: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_visible: Optional[bool] = None


# =========================
# FAQ
# =========================
class FAQCreate(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    answer: str = Field(min_length=1, max_length=5000)
    display_order: int = Field(default=0, ge=0)
    is_active: Optional[bool] = True
    is_pinned: Optional[bool] = False


class FAQUpdate(BaseModel):
    question: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    answer: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    display_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    is_pinned: Optional[bool] = None
# =========================
# REWARD CATALOG MANAGEMENT
# =========================
class RewardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=5000)
    image_url: Optional[str] = None
    points_required: int = Field(ge=1)
    reward_type: str = Field(default="free_drink", max_length=30)
    product_id: Optional[int] = None
    size_label: Optional[str] = Field(default=None, max_length=30)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)

class RewardUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=5000)
    image_url: Optional[str] = None
    points_required: Optional[int] = Field(default=None, ge=1)
    reward_type: Optional[str] = Field(default=None, max_length=30)
    product_id: Optional[int] = None
    size_label: Optional[str] = Field(default=None, max_length=30)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0)