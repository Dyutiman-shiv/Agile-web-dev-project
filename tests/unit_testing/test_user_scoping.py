"""
User-scoping tests — verify that one user cannot access another user's data.
"""

from tests.conftest import make_user


def _setup_users(app):
    """Create two users (alice, bob) inside an app context."""
    from app import db
    make_user(db, "alice", "alice@test.com")
    make_user(db, "bob", "bob@test.com")


def _login(client, email, password="password123"):
    resp = client.post("/login", json={"email": email, "password": password})
    assert resp.status_code in (200, 302), f"Login failed for {email}: status={resp.status_code}"
    return resp


def _logout(client):
    client.get("/logout")


def test_semesters_isolated(app):
    """User A's semesters should not appear in User B's list."""
    _setup_users(app)
    client = app.test_client()

    # Alice creates a semester
    _login(client, "alice@test.com")
    resp = client.post("/api/semesters", json={
        "name": "Alice Sem 1",
        "start_date": "2026-03-01",
        "end_date": "2026-06-30",
    })
    assert resp.status_code == 201
    _logout(client)

    # Bob should see zero semesters
    _login(client, "bob@test.com")
    resp = client.get("/api/semesters")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 0


def test_units_isolated(app):
    """User A's units should not appear in User B's list."""
    _setup_users(app)
    client = app.test_client()

    _login(client, "alice@test.com")
    resp = client.post("/api/units", json={
        "name": "Math 101",
        "code": "MATH101",
        "color": "#6366f1",
    })
    assert resp.status_code == 201
    _logout(client)

    _login(client, "bob@test.com")
    resp = client.get("/api/units")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 0


def test_sessions_isolated(app):
    """User A's study sessions should not appear in User B's list."""
    _setup_users(app)
    client = app.test_client()

    _login(client, "alice@test.com")
    resp = client.post("/api/sessions", json={
        "name": "Study Math",
        "start_time": "2026-04-20T10:00:00",
        "duration_minutes": 60,
        "checklist": [{"title": "Review ch1"}],
    })
    assert resp.status_code == 201
    _logout(client)

    _login(client, "bob@test.com")
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 0


def test_notifications_isolated(app):
    """User A's notifications should not appear for User B."""
    from app import db
    from models import Notification, User

    _setup_users(app)

    user_a = User.query.filter_by(email="alice@test.com").first()
    notif = Notification(
        user_id=user_a.id,
        type="task_due",
        title="Test notification",
        message="Test message",
    )
    db.session.add(notif)
    db.session.commit()

    client = app.test_client()
    _login(client, "bob@test.com")
    resp = client.get("/api/notifications")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["notifications"]) == 0


def test_cannot_delete_other_users_semester(app):
    """User B should not be able to delete User A's semester."""
    _setup_users(app)
    client = app.test_client()

    # Alice creates a semester
    _login(client, "alice@test.com")
    resp = client.post("/api/semesters", json={
        "name": "Private Sem",
        "start_date": "2026-03-01",
        "end_date": "2026-06-30",
    })
    assert resp.status_code == 201
    sem_id = resp.get_json()["semester"]["id"]
    _logout(client)

    # Bob tries to delete it — should get 404 (not found in his scope)
    _login(client, "bob@test.com")
    resp = client.delete(f"/api/semesters/{sem_id}")
    assert resp.status_code == 404
