"""
Shared fixtures for Selenium end-to-end tests.

Uses a real Werkzeug HTTP server (not app.test_client()) so ChromeDriver
connects to an actual TCP listener on localhost. The app is backed by a
session-scoped temporary SQLite file so all requests share the same DB.
"""

import os
import sys
import sqlite3
import tempfile
import threading
import uuid

import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# Ensure Backend/ is importable from within the selenium_testing sub-package.
_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "Backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)


# ---------------------------------------------------------------------------
# App + live server
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def e2e_app():
    """Flask app backed by a real temp-file SQLite DB for Selenium tests."""
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)
    db_uri = f"sqlite:///{db_path}"

    # Scores blueprint uses raw sqlite3; point it at the same file.
    os.environ["SCORES_DB_PATH"] = db_path
    os.environ["SCHEDULER_ENABLED"] = "0"

    from app import create_app, db

    flask_app = create_app(db_uri=db_uri)

    # Ensure the raw-sqlite assessments table exists in the test DB.
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS assessments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                unit_id INTEGER,
                name TEXT,
                score REAL,
                weight REAL
            )
        """)

    yield flask_app

    with flask_app.app_context():
        db.drop_all()

    # SQLite on Windows holds a file lock briefly after the last connection
    # closes, so we attempt cleanup but don't fail the suite if it's locked.
    try:
        os.unlink(db_path)
    except OSError:
        pass
    os.environ.pop("SCORES_DB_PATH", None)


@pytest.fixture(scope="session")
def live_server_url(e2e_app):
    """Spin up a real Werkzeug server in a daemon thread; return base URL."""
    from werkzeug.serving import make_server

    srv = make_server("127.0.0.1", 0, e2e_app)
    port = srv.server_address[1]
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()

    yield f"http://127.0.0.1:{port}"

    srv.shutdown()


# ---------------------------------------------------------------------------
# Seeded test user (created once for the session)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def seeded_user(e2e_app):
    """Insert a user into the E2E DB and return its credentials."""
    from app import db
    from models import User, NotificationPreference

    uid = uuid.uuid4().hex[:8]
    email = f"e2e_{uid}@example.com"
    password = "E2ePassword1!"

    with e2e_app.app_context():
        user = User(username=f"e2euser_{uid}", email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.flush()
        db.session.add(NotificationPreference(user_id=user.id))
        db.session.commit()

    return {"email": email, "password": password}


# ---------------------------------------------------------------------------
# WebDriver
# ---------------------------------------------------------------------------

@pytest.fixture()
def driver():
    """Headless Chrome WebDriver; quit after every test."""
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1280,800")
    drv = webdriver.Chrome(options=opts)
    drv.implicitly_wait(5)
    yield drv
    drv.quit()
