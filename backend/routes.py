from flask import request, jsonify, abort
from models import db, Product, Order
import cart as cart_module
import json

def init_app(app):

    @app.route("/api/products", methods=["GET"])
    def list_products():
        products = Product.query.all()
        return jsonify([p.to_dict() for p in products])

    @app.route("/api/products/<int:product_id>", methods=["GET"])
    def product_detail(product_id):
        product = Product.query.get(product_id)
        if not product:
            abort(404)
        return jsonify(product.to_dict())

    @app.route("/api/cart", methods=["POST"])
    def create_cart():
        cart_id = cart_module.new_cart()
        return jsonify({"cart_id": cart_id}), 201

    @app.route("/api/cart/<cart_id>", methods=["GET"])
    def get_cart(cart_id):
        c = cart_module.get_cart(cart_id)
        if not c:
            abort(404)
        return jsonify(c)

    @app.route("/api/cart/<cart_id>/items", methods=["POST"])
    def add_cart_item(cart_id):
        payload = request.get_json() or {}
        product_id = payload.get("product_id")
        qty = int(payload.get("qty", 1))
        size = payload.get("size", "regular")
        addons = payload.get("addons", [])
        if not product_id:
            return jsonify({"error":"product_id required"}), 400
        product = Product.query.get(product_id)
        if not product:
            return jsonify({"error":"Product not found"}), 404
        item = cart_module.add_item(cart_id, product.to_dict(), size=size, qty=qty, addons=addons)
        return jsonify(item), 201

    @app.route("/api/cart/<cart_id>/checkout", methods=["POST"])
    def checkout(cart_id):
        c = cart_module.get_cart(cart_id)
        if not c:
            return jsonify({"error":"cart not found"}), 404
        order = Order(
            cart_id=cart_id,
            items_json=json.dumps(c["items"]),
            total=c["total"],
            status="created"
        )
        db.session.add(order)
        db.session.commit()
        cart_module.clear_cart(cart_id)
        return jsonify(order.to_dict()), 201