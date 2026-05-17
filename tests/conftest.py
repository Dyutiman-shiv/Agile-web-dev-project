"""
Shared pytest fixtures for the test suite.
Uses an in-memory SQLite database so tests are fast and isolated.
"""

from pathlib import Path
import sys
import os
import uuid
import pytest

# Ensure Backend/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "Backend"))

_TESTS_ROOT = Path(__file__).resolve().parent


def pytest_collection_modifyitems(config, items):
    """Tag tests by top-level folder under ``tests/`` for ``-m startup|unit|integration``."""
    for item in items:
        raw = getattr(item, "path", None)
        path = Path(raw) if raw is not None else Path(item.fspath)
        try:
            rel = path.resolve().relative_to(_TESTS_ROOT)
        except ValueError:
            continue
        parts = rel.parts
        if not parts:
            continue
        top = parts[0]
        if top == "startup_checks":
            item.add_marker(pytest.mark.startup)
        elif top == "unit_testing":
            item.add_marker(pytest.mark.unit)
        elif top == "integration_testing":
            item.add_marker(pytest.mark.integration)


@pytest.fixture(scope="session")
def app():
    """Create a Flask app configured for testing (in-memory DB, no scheduler)."""
    os.environ["SCHEDULER_ENABLED"] = "0"

    from app import create_app, db

    app = create_app(testing=True)

    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()


@pytest.fixture(autouse=True)
def _clean_tables(app):
    """Wipe all table data between tests for full isolation."""
    from flask import g
    from app import db

    yield  # run the test first

    # Clear Flask-Login's cached user so it doesn't leak into the next test.
    # (g is app-context-scoped; the session-scoped fixture keeps one open.)
    g.pop("_login_user", None)

    for table in reversed(db.metadata.sorted_tables):
        db.session.execute(table.delete())
    db.session.commit()
    db.session.expire_all()


@pytest.fixture()
def client(app):
    """A Flask test client."""
    return app.test_client()


@pytest.fixture()
def auth_client(app):
    """A test client already logged in as a fresh user."""
    from app import db
    from models import User, NotificationPreference

    with app.app_context():
        uid = uuid.uuid4().hex[:8]
        user = User(username=f"testuser_{uid}", email=f"test_{uid}@example.com")
        user.set_password("password123")
        db.session.add(user)
        db.session.flush()
        db.session.add(NotificationPreference(user_id=user.id))
        db.session.commit()

        client = app.test_client()
        client.post("/login", json={
            "email": f"test_{uid}@example.com",
            "password": "password123",
        })
        client._user = user
        yield client


def make_user(db, username, email, password="password123"):
    """Helper to create a user with notification prefs. Returns the User."""
    from models import User, NotificationPreference

    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    db.session.add(NotificationPreference(user_id=user.id))
    db.session.commit()
    return user
