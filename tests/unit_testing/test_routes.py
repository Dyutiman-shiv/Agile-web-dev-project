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
    protected = ["/dashboard", "/calendar", "/sessions", "/stats", "/profile",
                 "/notifications", "/notifications/settings"]
    for url in protected:
        resp = client.get(url, follow_redirects=False)
        assert resp.status_code in (302, 308, 401), f"{url} returned {resp.status_code}"


# ── Authenticated page routes ───────────────────────────────────────────

def test_home_page(auth_client):
    resp = auth_client.get("/dashboard")
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


def test_resume_returns_accumulated_seconds(auth_client):
    resp = auth_client.post("/api/sessions", json={
        "name": "Accum test",
        "start_time": "2026-06-01T10:00:00",
        "duration_minutes": 12,
        "accumulated_seconds": 720,
        "checklist": [{"title": "Task", "completed": False}],
    })
    assert resp.status_code == 201
    sid = resp.get_json()["session"]["id"]
    r2 = auth_client.post(f"/api/sessions/{sid}/resume")
    assert r2.status_code == 200
    assert r2.get_json()["elapsed_seconds"] == 720


def test_new_timer_continuation_links_parent(auth_client):
    r1 = auth_client.post("/api/sessions", json={
        "name": "Parent",
        "start_time": "2026-05-01T08:00:00",
        "duration_minutes": 20,
        "accumulated_seconds": 300,
        "checklist": [{"title": "A", "completed": False}],
    })
    assert r1.status_code == 201
    pid = r1.get_json()["session"]["id"]
    r2 = auth_client.post("/api/sessions", json={
        "continued_from_session_id": pid,
        "name": "Parent",
        "start_time": "2026-05-10T14:00:00",
        "duration_minutes": 1,
        "accumulated_seconds": 0,
        "checklist": [{"title": "A", "completed": False}],
    })
    assert r2.status_code == 201
    child_id = r2.get_json()["session"]["id"]
    rows = auth_client.get("/api/sessions").get_json()
    parent = next(s for s in rows if s["id"] == pid)
    assert parent.get("continued_as_session_id") == child_id


def test_calendar_lists_session_segments(auth_client):
    r = auth_client.post("/api/sessions", json={
        "name": "Calendar segment",
        "start_time": "2020-01-01T09:00:00",
        "duration_minutes": 30,
        "accumulated_seconds": 1800,
        "checklist": [{"title": "t", "completed": True}],
        "segment_started_at": "2026-07-10T14:00:00",
        "segment_ended_at": "2026-07-10T14:30:00",
        "segment_elapsed_seconds": 1800,
    })
    assert r.status_code == 201
    ev = auth_client.get(
        "/api/events",
        query_string={"start": "2026-07-10T00:00:00", "end": "2026-07-11T00:00:00"},
    ).get_json()
    seg_types = [x.get("type") for x in ev if x.get("type") == "session_segment"]
    assert len(seg_types) >= 1
