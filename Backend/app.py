import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = "auth.login"  # type: ignore[assignment]

base_dir = os.path.dirname(os.path.abspath(__file__))

def create_app(testing=False, db_uri=None):
    app = Flask(
        __name__,
        template_folder=os.path.join(base_dir, "..", "Frontend", "templates"),
        static_folder=os.path.join(base_dir, "..", "Frontend", "static"),
    )

    from config import Config
    app.config.from_object(Config)

    if testing:
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        app.config["WTF_CSRF_ENABLED"] = False

    if db_uri is not None:
        app.config["SQLALCHEMY_DATABASE_URI"] = db_uri
        app.config["WTF_CSRF_ENABLED"] = False

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

    from semester_routes import semester_bp
    app.register_blueprint(semester_bp)

    from unit_routes import unit_bp
    app.register_blueprint(unit_bp)

    from stats_routes import stats_bp
    app.register_blueprint(stats_bp)


    from dashboard_routes import dashboard_bp
    app.register_blueprint(dashboard_bp)

    from notification_routes import notif_bp
    app.register_blueprint(notif_bp)

    from group_routes import groups_bp
    app.register_blueprint(groups_bp)


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


    from scores_route import scores_bp
    app.register_blueprint(scores_bp)
    

    # Start background scheduler (guard against double-start in debug reloader)
    scheduler_enabled = os.environ.get("SCHEDULER_ENABLED", "1") != "0"
    if scheduler_enabled and not app.config.get("TESTING"):
        if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
            from scheduler import init_scheduler
            init_scheduler(app)

    return app
