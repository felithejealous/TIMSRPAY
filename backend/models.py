from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, Numeric, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from backend.database import Base
from sqlalchemy.orm import relationship

class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(150), unique=True, index=True, nullable=True)
    password_hash = Column(Text, nullable=True)

    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    role = relationship("Role")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())

    google_id = Column(String(100), unique=True, nullable=True)
    oauth_provider = Column(String(50), nullable=True)
    profile_picture = Column(Text, nullable=True)


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    balance = Column(Numeric(12, 2), default=0)
    wallet_code = Column(String(6), unique=True, index=True, nullable=True)

    pin_hash = Column(Text, nullable=True)


class RewardWallet(Base):
    __tablename__ = "reward_wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    total_points = Column(Integer, default=0)


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    name = Column(String(150), nullable=False)
    price = Column(Numeric(12, 2), nullable=False)

    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    is_available = Column(Boolean, default=True, nullable=False)
    points_per_unit = Column(Integer, default=0, nullable=False)


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True, nullable=False)
    quantity = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    change_quantity = Column("change_qty", Integer, nullable=False)
    reason = Column(String(50), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    order_type = Column(String(20), nullable=False)
    payment_method = Column(String(20), nullable=True)
    customer_name = Column(String(150), nullable=True)
    processed_by_staff_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    status = Column(String(20), default="pending")
    total_amount = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime(timezone=False), server_default=func.now())
    subtotal = Column(Numeric(12, 2), default=0)
    vat_amount = Column(Numeric(12, 2), default=0)
    vat_rate = Column(Numeric(5, 2), default=12.00)

    promo_code_id = Column(Integer, ForeignKey("promo_codes.id"), nullable=True)
    promo_code_text = Column(String(50), nullable=True)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    discount_type = Column(String(20), nullable=True)
    discount_value = Column(Numeric(12, 2), nullable=True)
    
    amount_received = Column(Numeric(12, 2), nullable=True)
    change_amount = Column(Numeric(12, 2), nullable=True)

    earned_points = Column(Integer, nullable=False, default=0)
    points_synced = Column(Boolean, nullable=False, default=False)
    points_claim_expires_at = Column(DateTime(timezone=False), nullable=True)
    points_claimed_at = Column(DateTime(timezone=False), nullable=True)
    points_claimed_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    points_claimed_by_staff_id = Column(Integer, nullable=True)
    points_claim_method = Column(String(20), nullable=True)

    paid_at = Column(DateTime(timezone=False), nullable=True)
    completed_at = Column(DateTime(timezone=False), nullable=True)
    cancelled_at = Column(DateTime(timezone=False), nullable=True)
    cancel_reason = Column(Text, nullable=True)


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text, nullable=True)


class AddOn(Base):
    __tablename__ = "add_ons"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    addon_type = Column(String(20), nullable=False, default="ADDON")
    price = Column(Numeric(10, 2), nullable=False, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())


class OrderItemAddOn(Base):
    __tablename__ = "order_item_add_ons"
    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False)
    add_on_id = Column(Integer, ForeignKey("add_ons.id"), nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    price_at_time = Column(Numeric(10, 2), nullable=False, default=0)


class AddOnRecipe(Base):
    __tablename__ = "add_on_recipes"
    id = Column(Integer, primary_key=True, index=True)
    add_on_id = Column(Integer, ForeignKey("add_ons.id", ondelete="CASCADE"), nullable=False)
    inventory_master_id = Column(Integer, ForeignKey("inventory_master.id"), nullable=False)
    qty_used = Column(Numeric(12, 4), nullable=False, default=1)


class Reward(Base):
    __tablename__ = "rewards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    points_required = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)


class RewardTransaction(Base):
    __tablename__ = "reward_transactions"
    id = Column(Integer, primary_key=True, index=True)
    reward_wallet_id = Column(Integer, ForeignKey("reward_wallets.id"), nullable=False)
    reward_id = Column(Integer, ForeignKey("rewards.id"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    points_change = Column(Integer, nullable=False)
    transaction_type = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now())


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    amount = Column(Numeric(12, 2), nullable=False)
    transaction_type = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now())


class InventoryMaster(Base):
    __tablename__ = "inventory_master"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    category = Column(String(20), nullable=False, default="General")
    unit = Column(String(20), nullable=False, default="pcs")
    quantity = Column(Numeric(12, 2), nullable=False, default=0)
    alert_threshold = Column(Numeric(12, 2), nullable=False, default=10)
    expiration_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())


class InventoryMasterMovement(Base):
    __tablename__ = "inventory_master_movements"

    id = Column(Integer, primary_key=True, index=True)
    inventory_master_id = Column(Integer, ForeignKey("inventory_master.id"), nullable=False)
    change_qty = Column(Numeric(12, 4), nullable=False)
    reason = Column(String(50), nullable=False)
    ref_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())

class InventoryAlertDismissal(Base):
    __tablename__ = "inventory_alert_dismissals"
    __table_args__ = (
        UniqueConstraint("user_id", "inventory_master_id", name="uq_inventory_alert_dismissals_user_item"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_master_id = Column(Integer, ForeignKey("inventory_master.id", ondelete="CASCADE"), nullable=False, index=True)
    dismissed_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
class ProductRecipe(Base):
    __tablename__ = "product_recipe"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    inventory_master_id = Column(Integer, ForeignKey("inventory_master.id"), nullable=False)
    qty_used = Column(Numeric(12, 2), nullable=False)


class RewardRedemptionToken(Base):
    __tablename__ = "reward_redemption_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    token = Column(String(80), unique=True, index=True, nullable=False)
    required_points = Column(Integer, nullable=False, default=2800)

    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

    is_used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", backref="reward_redemption_tokens")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, unique=True)
    is_active = Column(Boolean, default=True)


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    shift_date = Column(DateTime(timezone=False), nullable=True)

    scheduled_start = Column(DateTime(timezone=False), nullable=True)
    scheduled_end = Column(DateTime(timezone=False), nullable=True)

    time_in = Column(DateTime(timezone=False), nullable=False, server_default=func.now())
    time_out = Column(DateTime(timezone=False), nullable=True)

    attendance_status = Column(String(30), nullable=True)   # present | absent | late | overtime | undertime
    total_hours = Column(Numeric(10, 2), nullable=True, default=0)
    overtime_hours = Column(Numeric(10, 2), nullable=True, default=0)
    undertime_hours = Column(Numeric(10, 2), nullable=True, default=0)
    late_minutes = Column(Integer, nullable=True, default=0)

    absence_reason = Column(Text, nullable=True)
    terminal_name = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    approval_status = Column(String(20), nullable=True, default="approved")  # pending | approved | rejected

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), nullable=False)

class ClosingChecklist(Base):
    __tablename__ = "closing_checklists"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    checklist_date = Column(DateTime(timezone=False), nullable=False, index=True)

    wipe_counters = Column(Boolean, nullable=False, default=False)
    refill_bins = Column(Boolean, nullable=False, default=False)
    final_cash_register = Column(Boolean, nullable=False, default=False)
    pos_devices_charging = Column(Boolean, nullable=False, default=False)

    submitted_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), nullable=False)

class StaffProfile(Base):
    __tablename__ = "staff_profiles"

    user_id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    position = Column(String(100), nullable=True)

    staff_code = Column(String(50), unique=True, nullable=True, index=True)

    scheduled_start_time = Column(String(10), nullable=True)   # ex. 08:00
    scheduled_end_time = Column(String(10), nullable=True)     # ex. 17:00


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    token_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=False), nullable=False)

    attempts = Column(Integer, nullable=False, default=0)

    is_used = Column(Boolean, nullable=False, default=False)
    used_at = Column(DateTime(timezone=False), nullable=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)

class LoginRateLimit(Base):
    __tablename__ = "login_rate_limits"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(150), nullable=False, index=True)
    ip_address = Column(String(100), nullable=False, index=True)

    failed_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=False), nullable=True)
    last_attempt_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), nullable=False)

class RewardManualOTP(Base):
    __tablename__ = "reward_manual_otp"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    otp_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=False), nullable=False)

    attempt_count = Column(Integer, nullable=False, default=0)
    last_attempt_at = Column(DateTime(timezone=False), nullable=True)

    is_used = Column(Boolean, nullable=False, default=False)
    used_at = Column(DateTime(timezone=False), nullable=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)


class RewardOrderClaim(Base):
    __tablename__ = "reward_order_claims"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True)

    claimed_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    claimed_by_staff_id = Column(Integer, nullable=True)

    claim_method = Column(String(20), nullable=False, default="manual_otp")
    claimed_at = Column(DateTime(timezone=False), server_default=func.now())


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    body = Column(Text, nullable=False)

    image_url = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    is_pinned = Column(Boolean, nullable=False, default=False)

    publish_at = Column(DateTime, nullable=True)
    expire_at = Column(DateTime, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, onupdate=func.now(), nullable=True)


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    phone = Column(String(50), nullable=True)


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=True)
    description = Column(Text, nullable=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    discount_type = Column(String(20), nullable=False, default="percent")
    discount_value = Column(Numeric(12, 2), nullable=False, default=0)
    min_order_amount = Column(Numeric(12, 2), nullable=False, default=0)
    usage_limit = Column(Integer, nullable=True)
    usage_count = Column(Integer, nullable=False, default=0)
    per_user_limit = Column(Integer, nullable=True, default=1)
    is_active = Column(Boolean, nullable=False, default=True)
    valid_from = Column(DateTime, nullable=True)
    valid_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class PromoBanner(Base):
    __tablename__ = "promo_banners"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=True)
    image_url = Column(Text, nullable=False)
    link_url = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

class PromoCodeRedemption(Base):
    __tablename__ = "promo_code_redemptions"

    id = Column(Integer, primary_key=True, index=True)
    promo_code_id = Column(Integer, ForeignKey("promo_codes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True)
    redeemed_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)

class Inquiry(Base):
    __tablename__ = "inquiries"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(150), nullable=False, index=True)
    subject = Column(String(200), nullable=True)
    message = Column(Text, nullable=False)

    status = Column(String(20), nullable=False, default="pending")  # pending | replied | closed
    admin_reply = Column(Text, nullable=True)
    replied_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    replied_at = Column(DateTime(timezone=False), nullable=True)

    is_visible = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), nullable=False)
class ProductFeedback(Base):
    __tablename__ = "product_feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)

    customer_name = Column(String(150), nullable=False)
    email = Column(String(150), nullable=True)
    product_name = Column(String(150), nullable=True)

    rating = Column(Integer, nullable=False)  # 1 to 5
    title = Column(String(200), nullable=True)
    comment = Column(Text, nullable=False)

    admin_reply = Column(Text, nullable=True)
    replied_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    replied_at = Column(DateTime(timezone=False), nullable=True)

    is_approved = Column(Boolean, nullable=False, default=False)
    is_featured = Column(Boolean, nullable=False, default=False)
    is_visible = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), nullable=False)
class FAQ(Base):
    __tablename__ = "faq"

    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)

    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    is_pinned = Column(Boolean, nullable=False, default=False)

    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), nullable=False)

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    user_email = Column(String(150), nullable=True)
    role_name = Column(String(50), nullable=True)

    action = Column(String(100), nullable=False)
    module = Column(String(50), nullable=False)
    target_type = Column(String(50), nullable=True)
    target_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)