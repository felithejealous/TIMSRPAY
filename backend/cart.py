import uuid

CARTS = {}

def new_cart():
    cart_id = uuid.uuid4().hex[:8]
    CARTS[cart_id] = {"items": [], "total": 0.0}
    return cart_id

def get_cart(cart_id):
    return CARTS.get(cart_id)

def add_item(cart_id, product, size="regular", qty=1, addons=None):
    cart = CARTS.setdefault(cart_id, {"items": [], "total": 0.0})
    addons = addons or []
    addons_total = sum(float(a.get("price",0)) for a in addons)
    unit_price = float(product["price"]) + addons_total
    line_total = unit_price * qty
    item = {
        "line_id": uuid.uuid4().hex[:10],
        "product_id": product["id"],
        "name": product["name"],
        "size": size,
        "qty": qty,
        "unit_price": unit_price,
        "line_total": line_total,
        "addons": addons
    }
    cart["items"].append(item)
    recalc_cart(cart)
    return item

def recalc_cart(cart):
    cart["total"] = round(sum(it["line_total"] for it in cart["items"]), 2)

def clear_cart(cart_id):
    if cart_id in CARTS:
        CARTS[cart_id] = {"items": [], "total": 0.0}