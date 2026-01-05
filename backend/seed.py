from app import create_app
from models import db, Product

app = create_app()
with app.app_context():
    products = [
        {"name":"Classic Teo D' Mango","description":"Tropical mango slush with creamy ice cream...","price":60.00,"color":"#e67e22"},
        {"name":"Strawberry","description":"Fruity blend with berry base...","price":60.00,"color":"#e91e63"},
        {"name":"Ube","description":"Purple yam with creamy milk...","price":60.00,"color":"#9c27b0"},
        {"name":"Avocado","description":"Tropical Avocado with creamy ice cream...","price":60.00,"color":"#68ee51"},
        {"name":"Buko","description":"Coconut base...","price":60.00,"color":"#1edfe9"},
        {"name":"Lychee","description":"Lychee blend...","price":60.00,"color":"#f4a7cf"}
    ]
    for p in products:
        if not Product.query.filter_by(name=p["name"]).first():
            prod = Product(**p)
            db.session.add(prod)
    db.session.commit()
    print("Products seeded.")