from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, Numeric, DateTime, Text
from sqlalchemy.sql import func
from database import Base

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
    is_active = Column(Boolean, default=True)

    # ADD  (already exists in dB, just missing in SLAlchemy model)
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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    order_type = Column(String(20), nullable=False)  # kiosk/online
    status = Column(String(20), default="pending")
    total_amount = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime(timezone=False), server_default=func.now())
    subtotal = Column(Numeric(12, 2), default=0)
    vat_amount = Column(Numeric(12, 2), default=0)
    vat_rate = Column(Numeric(5, 2), default=12.00)


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(12, 2), nullable=False)

class AddOn(Base):
    __tablename__ = "add_ons"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    addon_type = Column(String(20), nullable=False, default="ADDON")  # SIZE/ADDON
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
    reward_id = Column(Integer, ForeignKey("rewards.id"), nullable=True)  # nullable for EARN
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    points_change = Column(Integer, nullable=False)
    transaction_type = Column(String(10), nullable=False)  # "EARN" / "REDEEM"
    created_at = Column(DateTime(timezone=False), server_default=func.now())

class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    amount = Column(Numeric(12, 2), nullable=False)
    transaction_type = Column(String(20), nullable=False)  # TOPUP / PAYMENT
    created_at = Column(DateTime(timezone=False), server_default=func.now())

class InventoryMaster(Base):
    __tablename__ = "inventory_master"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    unit = Column(String(20), nullable=False, default="pcs")
    quantity = Column(Numeric(12, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())


class ProductRecipe(Base):
    __tablename__ = "product_recipe"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    inventory_master_id = Column(Integer, ForeignKey("inventory_master.id"), nullable=False)
    qty_used = Column(Numeric(12, 2), nullable=False)

