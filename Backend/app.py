import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = "auth.login"  # type: ignore[assignment]

base_dir = os.path.dirname(os.path.abspath(__file__))

def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(base_dir, "..", "Frontend", "templates"),
        static_folder=os.path.join(base_dir, "..", "Frontend", "static"),
    )

    from config import Config
    app.config.from_object(Config)

    db.init_app(app)
    login_manager.init_app(app)

    # Register Google OAuth
    if app.config["GOOGLE_CLIENT_ID"]:
        from authlib.integrations.flask_client import OAuth

        oauth = OAuth(app)
        oauth.register(
            name="google",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
        app.extensions["oauth"] = oauth
    else:
        app.extensions["oauth"] = None

    from auth import auth_bp
    app.register_blueprint(auth_bp)

    from profile import profile_bp
    app.register_blueprint(profile_bp)

    from calendar_routes import cal_bp
    app.register_blueprint(cal_bp)

    from session_routes import session_bp
    app.register_blueprint(session_bp)

    # Ensure uploads folder exists
    os.makedirs(app.config.get("UPLOAD_FOLDER", "uploads"), exist_ok=True)

    from models import User

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    with app.app_context():
        db.create_all()
    
    from calendar_api import calendar_api
    app.register_blueprint(calendar_api)

    return app
