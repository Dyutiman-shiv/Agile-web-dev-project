"""
HTTP smoke tests — hit every route and verify no 500 errors.
"""


# ── Unauthenticated routes ──────────────────────────────────────────────

def test_login_page(client):
    resp = client.get("/login")
    assert resp.status_code == 200


def test_signup_page(client):
    resp = client.get("/signup")
    assert resp.status_code == 200


def test_root_redirects(client):
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code in (302, 308)


def test_unauth_redirects_to_login(client):
    """Protected pages should redirect unauthenticated users."""
    protected = ["/home", "/calendar", "/sessions", "/stats", "/profile",
                 "/notifications", "/notifications/settings"]
    for url in protected:
        resp = client.get(url, follow_redirects=False)
        assert resp.status_code in (302, 308, 401), f"{url} returned {resp.status_code}"


# ── Authenticated page routes ───────────────────────────────────────────

def test_home_page(auth_client):
    resp = auth_client.get("/home")
    assert resp.status_code == 200


def test_calendar_page(auth_client):
    resp = auth_client.get("/calendar")
    assert resp.status_code == 200


def test_sessions_page(auth_client):
    resp = auth_client.get("/sessions")
    assert resp.status_code == 200


def test_stats_page(auth_client):
    resp = auth_client.get("/stats")
    assert resp.status_code == 200


def test_profile_page(auth_client):
    resp = auth_client.get("/profile")
    assert resp.status_code == 200


def test_notifications_page(auth_client):
    resp = auth_client.get("/notifications")
    assert resp.status_code == 200


def test_notification_settings_page(auth_client):
    resp = auth_client.get("/notifications/settings")
    assert resp.status_code == 200


def test_calendar_settings_page(auth_client):
    resp = auth_client.get("/calendar/settings")
    assert resp.status_code == 200


# ── Authenticated API routes ────────────────────────────────────────────

def test_api_semesters(auth_client):
    resp = auth_client.get("/api/semesters")
    assert resp.status_code == 200
    assert resp.is_json


def test_api_units(auth_client):
    resp = auth_client.get("/api/units")
    assert resp.status_code == 200
    assert resp.is_json


def test_api_sessions(auth_client):
    resp = auth_client.get("/api/sessions")
    assert resp.status_code == 200
    assert resp.is_json


def test_api_notifications(auth_client):
    resp = auth_client.get("/api/notifications")
    assert resp.status_code == 200
    assert resp.is_json


def test_api_notification_prefs(auth_client):
    resp = auth_client.get("/api/notifications/preferences")
    assert resp.status_code == 200
    assert resp.is_json


def test_api_unread_count(auth_client):
    resp = auth_client.get("/api/notifications/unread-count")
    assert resp.status_code == 200
    assert resp.is_json
