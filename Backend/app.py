import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = "auth.login"  # type: ignore[assignment]

base_dir = os.path.dirname(os.path.abspath(__file__))


def _ensure_study_session_columns():
    """Add columns introduced after first deploy (SQLite)."""
    from sqlalchemy import inspect, text

    engine = db.engine
    if engine.dialect.name != "sqlite":
        return
    try:
        inspector = inspect(engine)
        if "study_sessions" not in inspector.get_table_names():
            return
        cols = {c["name"] for c in inspector.get_columns("study_sessions")}
        alters = []
        if "accumulated_seconds" not in cols:
            alters.append(
                "ALTER TABLE study_sessions ADD COLUMN accumulated_seconds INTEGER"
            )
        if "continued_as_session_id" not in cols:
            alters.append(
                "ALTER TABLE study_sessions ADD COLUMN continued_as_session_id INTEGER"
            )
        if not alters:
            return
        with engine.begin() as conn:
            for stmt in alters:
                conn.execute(text(stmt))
    except Exception:
        # Non-fatal: create_all may still match models on fresh DBs
        pass


def _ensure_study_session_segments_table():
    """Create study_session_segments on existing SQLite DBs."""
    from sqlalchemy import inspect, text

    engine = db.engine
    if engine.dialect.name != "sqlite":
        return
    try:
        inspector = inspect(engine)
        if "study_session_segments" in inspector.get_table_names():
            return
        ddl = """
        CREATE TABLE study_session_segments (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            segment_start DATETIME NOT NULL,
            segment_end DATETIME NOT NULL,
            elapsed_seconds INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES study_sessions (id) ON DELETE CASCADE
        )
        """
        with engine.begin() as conn:
            conn.execute(text(ddl))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_study_session_segments_session_id "
                "ON study_session_segments (session_id)"
            ))
    except Exception:
        pass


def create_app(testing=False):
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

    from notification_routes import notif_bp
    app.register_blueprint(notif_bp)

    # Ensure uploads folder exists
    os.makedirs(app.config.get("UPLOAD_FOLDER", "uploads"), exist_ok=True)

    from models import User

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    with app.app_context():
        db.create_all()
        if not testing:
            _ensure_study_session_columns()
            _ensure_study_session_segments_table()

    from calendar_api import calendar_api
    app.register_blueprint(calendar_api)

    # Start background scheduler (guard against double-start in debug reloader)
    scheduler_enabled = os.environ.get("SCHEDULER_ENABLED", "1") != "0"
    if scheduler_enabled and not app.config.get("TESTING"):
        if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
            from scheduler import init_scheduler
            init_scheduler(app)

    return app
