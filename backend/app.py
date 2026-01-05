import os
from flask import Flask
from flask_migrate import Migrate
from flask_cors import CORS
from models import db
import routes  # we'll create this next

def create_app():
    app = Flask(__name__)
    # Load DB connection from environment
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    migrate = Migrate(app, db)
    CORS(app)

    # Register routes
    routes.init_app(app)

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)