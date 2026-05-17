"""
Group RBAC tests — verify owner / admin / member / non-member permission matrix.
"""
import pytest
from tests.conftest import make_user


# ── Shared helpers ────────────────────────────────────────────────────────────

def _login(client, email, password="password123"):
    # Flask-Login caches the user in flask.g which persists across requests in the
    # shared test app context. Clear it so the next request reloads from the session.
    from flask import g as _flask_g
    _flask_g.pop("_login_user", None)
    resp = client.post("/login", json={"email": email, "password": password})
    assert resp.status_code in (200, 302), f"Login failed for {email}: {resp.status_code}"
    return resp


def _logout(client):
    client.get("/logout")


def _create_group(client, name="Test Group"):
    resp = client.post("/api/groups", json={"name": name})
    assert resp.status_code == 201, f"Group creation failed: {resp.get_json()}"
    return resp.get_json()["id"]


def _create_post(client, group_id, content="Hello world"):
    resp = client.post(f"/api/groups/{group_id}/posts", data={"content": content})
    assert resp.status_code == 201
    return resp.get_json()["post"]["id"]


def _setup_owner_and_group(app, suffix="a"):
    """Create an owner user, log them in, create a group. Returns (client, group_id, owner_user)."""
    from app import db
    owner = make_user(db, f"owner_{suffix}", f"owner_{suffix}@test.com")
    client = app.test_client()
    _login(client, f"owner_{suffix}@test.com")
    group_id = _create_group(client)
    return client, group_id, owner


def _add_member_to_group(app, db, group_id, username, email, role="member"):
    """Create a user and add them directly as a group member."""
    from models import GroupMembership
    user = make_user(db, username, email)
    db.session.add(GroupMembership(user_id=user.id, group_id=group_id, role=role))
    db.session.commit()
    return user


# ── Post visibility / access ──────────────────────────────────────────────────

def test_non_member_blocked_from_viewing_posts(app):
    """Non-member gets 403 when fetching group posts."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "nm1")

    other = make_user(db, "outsider_nm1", "outsider_nm1@test.com")
    other_client = app.test_client()
    _login(other_client, "outsider_nm1@test.com")

    resp = other_client.get(f"/api/groups/{group_id}/posts")
    assert resp.status_code == 403


def test_non_member_blocked_from_creating_post(app):
    """Non-member gets 403 when posting to a group."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "nm2")

    other = make_user(db, "outsider_nm2", "outsider_nm2@test.com")
    other_client = app.test_client()
    _login(other_client, "outsider_nm2@test.com")

    resp = other_client.post(f"/api/groups/{group_id}/posts", data={"content": "Hello"})
    assert resp.status_code == 403


def test_member_can_view_and_create_post(app):
    """Member can fetch posts and create a new one."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "mem1")
    member = _add_member_to_group(app, db, group_id, "member_mem1", "member_mem1@test.com")

    member_client = app.test_client()
    _login(member_client, "member_mem1@test.com")

    resp = member_client.get(f"/api/groups/{group_id}/posts")
    assert resp.status_code == 200

    resp = member_client.post(f"/api/groups/{group_id}/posts", data={"content": "Hi!"})
    assert resp.status_code == 201


# ── Post edit / delete ────────────────────────────────────────────────────────

def test_member_can_edit_own_post(app):
    """Author can edit their own post."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "edit1")
    member = _add_member_to_group(app, db, group_id, "member_edit1", "member_edit1@test.com")

    member_client = app.test_client()
    _login(member_client, "member_edit1@test.com")
    post_id = _create_post(member_client, group_id, "Original")

    resp = member_client.put(f"/api/posts/{post_id}", json={"content": "Updated"})
    assert resp.status_code == 200
    assert resp.get_json()["post"]["content"] == "Updated"


def test_member_cannot_edit_others_post(app):
    """Member gets 403 trying to edit another member's post."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "edit2")
    post_id = _create_post(owner_client, group_id, "Owner's post")

    other_member = _add_member_to_group(app, db, group_id, "member_edit2", "member_edit2@test.com")
    other_client = app.test_client()
    _login(other_client, "member_edit2@test.com")

    resp = other_client.put(f"/api/posts/{post_id}", json={"content": "Hacked"})
    assert resp.status_code == 403


def test_admin_cannot_edit_others_post(app):
    """Admin gets 403 trying to edit another user's post (admins may only DELETE)."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "edit3")

    member = _add_member_to_group(app, db, group_id, "member_edit3", "member_edit3@test.com")
    member_client = app.test_client()
    _login(member_client, "member_edit3@test.com")
    post_id = _create_post(member_client, group_id, "Member's post")

    admin = _add_member_to_group(app, db, group_id, "admin_edit3", "admin_edit3@test.com", role="admin")
    admin_client = app.test_client()
    _login(admin_client, "admin_edit3@test.com")

    resp = admin_client.put(f"/api/posts/{post_id}", json={"content": "Admin edit attempt"})
    assert resp.status_code == 403


def test_member_can_delete_own_post(app):
    """Author can delete their own post."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "del1")
    member = _add_member_to_group(app, db, group_id, "member_del1", "member_del1@test.com")

    member_client = app.test_client()
    _login(member_client, "member_del1@test.com")
    post_id = _create_post(member_client, group_id, "My post")

    resp = member_client.delete(f"/api/posts/{post_id}")
    assert resp.status_code == 200


def test_admin_can_delete_others_post(app):
    """Admin can delete another member's post."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "del2")

    member = _add_member_to_group(app, db, group_id, "member_del2", "member_del2@test.com")
    member_client = app.test_client()
    _login(member_client, "member_del2@test.com")
    post_id = _create_post(member_client, group_id, "Member's post")

    admin = _add_member_to_group(app, db, group_id, "admin_del2", "admin_del2@test.com", role="admin")
    admin_client = app.test_client()
    _login(admin_client, "admin_del2@test.com")

    resp = admin_client.delete(f"/api/posts/{post_id}")
    assert resp.status_code == 200


def test_plain_member_cannot_delete_others_post(app):
    """Plain member gets 403 trying to delete another member's post."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "del3")
    post_id = _create_post(owner_client, group_id, "Owner post")

    member = _add_member_to_group(app, db, group_id, "member_del3", "member_del3@test.com")
    member_client = app.test_client()
    _login(member_client, "member_del3@test.com")

    resp = member_client.delete(f"/api/posts/{post_id}")
    assert resp.status_code == 403


# ── Role management ───────────────────────────────────────────────────────────

def test_owner_can_promote_member_to_admin(app):
    """Owner can change a member's role to admin."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "role1")
    member = _add_member_to_group(app, db, group_id, "member_role1", "member_role1@test.com")

    resp = owner_client.patch(
        f"/api/groups/{group_id}/members/{member.id}/role",
        json={"role": "admin"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["member"]["role"] == "admin"


def test_owner_can_demote_admin_to_member(app):
    """Owner can change an admin's role back to member."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "role2")
    admin = _add_member_to_group(app, db, group_id, "admin_role2", "admin_role2@test.com", role="admin")

    resp = owner_client.patch(
        f"/api/groups/{group_id}/members/{admin.id}/role",
        json={"role": "member"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["member"]["role"] == "member"


def test_admin_cannot_change_roles(app):
    """Admin gets 403 when trying to promote/demote members."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "role3")
    admin = _add_member_to_group(app, db, group_id, "admin_role3", "admin_role3@test.com", role="admin")
    member = _add_member_to_group(app, db, group_id, "member_role3", "member_role3@test.com")

    admin_client = app.test_client()
    _login(admin_client, "admin_role3@test.com")

    resp = admin_client.patch(
        f"/api/groups/{group_id}/members/{member.id}/role",
        json={"role": "admin"},
    )
    assert resp.status_code == 403


def test_owner_role_cannot_be_changed(app):
    """Attempting to change the owner's role is rejected."""
    from app import db
    owner_client, group_id, owner = _setup_owner_and_group(app, "role4")

    resp = owner_client.patch(
        f"/api/groups/{group_id}/members/{owner.id}/role",
        json={"role": "member"},
    )
    assert resp.status_code == 403


# ── Member removal ────────────────────────────────────────────────────────────

def test_admin_can_remove_member(app):
    """Admin can remove a plain member from the group."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "rem1")
    admin = _add_member_to_group(app, db, group_id, "admin_rem1", "admin_rem1@test.com", role="admin")
    member = _add_member_to_group(app, db, group_id, "member_rem1", "member_rem1@test.com")

    admin_client = app.test_client()
    _login(admin_client, "admin_rem1@test.com")

    resp = admin_client.delete(f"/api/groups/{group_id}/members/{member.id}")
    assert resp.status_code == 200


def test_owner_cannot_be_removed(app):
    """Attempting to remove the owner is rejected."""
    from app import db
    owner_client, group_id, owner = _setup_owner_and_group(app, "rem2")
    admin = _add_member_to_group(app, db, group_id, "admin_rem2", "admin_rem2@test.com", role="admin")

    admin_client = app.test_client()
    _login(admin_client, "admin_rem2@test.com")

    resp = admin_client.delete(f"/api/groups/{group_id}/members/{owner.id}")
    assert resp.status_code == 403


def test_plain_member_cannot_remove_others(app):
    """Plain member gets 403 trying to remove another member."""
    from app import db
    owner_client, group_id, owner = _setup_owner_and_group(app, "rem3")
    member_a = _add_member_to_group(app, db, group_id, "member_rem3a", "member_rem3a@test.com")
    member_b = _add_member_to_group(app, db, group_id, "member_rem3b", "member_rem3b@test.com")

    client_a = app.test_client()
    _login(client_a, "member_rem3a@test.com")

    resp = client_a.delete(f"/api/groups/{group_id}/members/{member_b.id}")
    assert resp.status_code == 403


# ── Leave group ───────────────────────────────────────────────────────────────

def test_member_can_leave_group(app):
    """Member can leave a group they belong to."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "leave1")
    member = _add_member_to_group(app, db, group_id, "member_leave1", "member_leave1@test.com")

    member_client = app.test_client()
    _login(member_client, "member_leave1@test.com")

    resp = member_client.post(f"/api/groups/{group_id}/leave")
    assert resp.status_code == 200


def test_owner_cannot_leave_group(app):
    """Owner gets 403 when trying to leave their own group."""
    owner_client, group_id, _ = _setup_owner_and_group(app, "leave2")

    resp = owner_client.post(f"/api/groups/{group_id}/leave")
    assert resp.status_code == 403


# ── Audit log ─────────────────────────────────────────────────────────────────

def test_admin_delete_post_is_audit_logged(app):
    """When admin deletes another user's post, a moderation log entry is created."""
    from app import db
    from models import GroupModerationLog

    owner_client, group_id, _ = _setup_owner_and_group(app, "audit1")
    member = _add_member_to_group(app, db, group_id, "member_audit1", "member_audit1@test.com")

    member_client = app.test_client()
    _login(member_client, "member_audit1@test.com")
    post_id = _create_post(member_client, group_id, "Member post")

    # Re-activate the owner as current user before the delete request.
    _login(owner_client, "owner_audit1@test.com")
    owner_client.delete(f"/api/posts/{post_id}")

    log_entry = GroupModerationLog.query.filter_by(
        group_id=group_id, action="delete_post", target_post_id=post_id
    ).first()
    assert log_entry is not None


def test_remove_member_is_audit_logged(app):
    """When a member is removed, a moderation log entry is created."""
    from app import db
    from models import GroupModerationLog

    owner_client, group_id, owner = _setup_owner_and_group(app, "audit2")
    member = _add_member_to_group(app, db, group_id, "member_audit2", "member_audit2@test.com")

    owner_client.delete(f"/api/groups/{group_id}/members/{member.id}")

    log_entry = GroupModerationLog.query.filter_by(
        group_id=group_id, action="remove_member", target_user_id=member.id
    ).first()
    assert log_entry is not None


def test_audit_log_visible_to_admin(app):
    """Admin can view the group audit log."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "audit3")
    admin = _add_member_to_group(app, db, group_id, "admin_audit3", "admin_audit3@test.com", role="admin")

    admin_client = app.test_client()
    _login(admin_client, "admin_audit3@test.com")

    resp = admin_client.get(f"/api/groups/{group_id}/audit-log")
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_audit_log_hidden_from_plain_member(app):
    """Plain member cannot view the audit log."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "audit4")
    member = _add_member_to_group(app, db, group_id, "member_audit4", "member_audit4@test.com")

    member_client = app.test_client()
    _login(member_client, "member_audit4@test.com")

    resp = member_client.get(f"/api/groups/{group_id}/audit-log")
    assert resp.status_code == 403


# ── Likes / comments require membership ──────────────────────────────────────

def test_non_member_cannot_like_post(app):
    """Non-member cannot like a post."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "like1")
    post_id = _create_post(owner_client, group_id)

    outsider = make_user(db, "outsider_like1", "outsider_like1@test.com")
    out_client = app.test_client()
    _login(out_client, "outsider_like1@test.com")

    resp = out_client.post(f"/api/posts/{post_id}/like")
    assert resp.status_code == 403


def test_non_member_cannot_comment(app):
    """Non-member cannot comment on a post."""
    from app import db
    owner_client, group_id, _ = _setup_owner_and_group(app, "cmt1")
    post_id = _create_post(owner_client, group_id)

    outsider = make_user(db, "outsider_cmt1", "outsider_cmt1@test.com")
    out_client = app.test_client()
    _login(out_client, "outsider_cmt1@test.com")

    resp = out_client.post(f"/api/posts/{post_id}/comments", json={"content": "Hi"})
    assert resp.status_code == 403
