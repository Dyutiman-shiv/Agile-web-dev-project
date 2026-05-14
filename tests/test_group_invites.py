"""
Group invite tests — friend code generation, invite-by-code lifecycle,
accept/decline flows, notifications, and duplicate-invite rejection.
"""
from tests.conftest import make_user

FRIEND_CODE_ALPHABET = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _create_group(client, name="Invite Test Group"):
    resp = client.post("/api/groups", json={"name": name})
    assert resp.status_code == 201
    return resp.get_json()["id"]


def _invite_by_code(client, group_id, friend_code):
    return client.post(
        f"/api/groups/{group_id}/invite-by-code",
        json={"friend_code": friend_code},
    )


# ── Friend code generation ─────────────────────────────────────────────────────

def test_friend_code_is_generated_on_user_creation(app):
    """Every new user gets a non-null, non-empty friend code."""
    from app import db
    user = make_user(db, "fc_user1", "fc_user1@test.com")
    assert user.friend_code is not None
    assert len(user.friend_code) > 0


def test_friend_code_is_8_characters(app):
    """Friend code is exactly 8 characters long."""
    from app import db
    user = make_user(db, "fc_user2", "fc_user2@test.com")
    assert len(user.friend_code) == 8


def test_friend_code_uses_safe_alphabet(app):
    """Friend code only contains characters from the ambiguity-safe alphabet."""
    from app import db
    user = make_user(db, "fc_user3", "fc_user3@test.com")
    for ch in user.friend_code:
        assert ch in FRIEND_CODE_ALPHABET, f"Unexpected character '{ch}' in friend code"


def test_friend_codes_are_unique_across_users(app):
    """Two different users have different friend codes."""
    from app import db
    alice = make_user(db, "fc_alice", "fc_alice@test.com")
    bob = make_user(db, "fc_bob", "fc_bob@test.com")
    assert alice.friend_code != bob.friend_code


def test_friend_code_endpoint_returns_own_code(app):
    """GET /api/users/me/friend-code returns the logged-in user's code."""
    from app import db
    user = make_user(db, "fc_me", "fc_me@test.com")
    client = app.test_client()
    _login(client, "fc_me@test.com")

    resp = client.get("/api/users/me/friend-code")
    assert resp.status_code == 200
    assert resp.get_json()["friend_code"] == user.friend_code


# ── Invite by code — success path ─────────────────────────────────────────────

def test_admin_can_invite_by_friend_code(app):
    """Group admin sends a successful invite using target's friend code."""
    from app import db
    owner = make_user(db, "inv_owner1", "inv_owner1@test.com")
    target = make_user(db, "inv_target1", "inv_target1@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner1@test.com")
    group_id = _create_group(owner_client)

    resp = _invite_by_code(owner_client, group_id, target.friend_code)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["success"] is True
    assert data["invitation"]["receiver_id"] == target.id


def test_invite_is_case_insensitive(app):
    """Friend code submitted in lowercase is normalized and still resolves correctly."""
    from app import db
    owner = make_user(db, "inv_owner2", "inv_owner2@test.com")
    target = make_user(db, "inv_target2", "inv_target2@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner2@test.com")
    group_id = _create_group(owner_client)

    resp = _invite_by_code(owner_client, group_id, target.friend_code.lower())
    assert resp.status_code == 201


# ── Invite by code — rejection cases ─────────────────────────────────────────

def test_plain_member_cannot_invite_by_code(app):
    """Plain member gets 403 when trying to invite someone."""
    from app import db
    from models import GroupMembership

    owner = make_user(db, "inv_owner3", "inv_owner3@test.com")
    member = make_user(db, "inv_member3", "inv_member3@test.com")
    target = make_user(db, "inv_target3", "inv_target3@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner3@test.com")
    group_id = _create_group(owner_client)

    db.session.add(GroupMembership(user_id=member.id, group_id=group_id, role="member"))
    db.session.commit()

    member_client = app.test_client()
    _login(member_client, "inv_member3@test.com")

    resp = _invite_by_code(member_client, group_id, target.friend_code)
    assert resp.status_code == 403


def test_invite_self_is_rejected(app):
    """An admin cannot invite themselves."""
    from app import db
    owner = make_user(db, "inv_owner4", "inv_owner4@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner4@test.com")
    group_id = _create_group(owner_client)

    resp = _invite_by_code(owner_client, group_id, owner.friend_code)
    assert resp.status_code == 400


def test_invite_existing_member_is_rejected(app):
    """Inviting a user who is already a member returns 400."""
    from app import db
    from models import GroupMembership

    owner = make_user(db, "inv_owner5", "inv_owner5@test.com")
    member = make_user(db, "inv_member5", "inv_member5@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner5@test.com")
    group_id = _create_group(owner_client)

    db.session.add(GroupMembership(user_id=member.id, group_id=group_id, role="member"))
    db.session.commit()

    resp = _invite_by_code(owner_client, group_id, member.friend_code)
    assert resp.status_code == 400


def test_duplicate_pending_invite_is_rejected(app):
    """Second invite to the same user while one is still pending returns 400."""
    from app import db
    owner = make_user(db, "inv_owner6", "inv_owner6@test.com")
    target = make_user(db, "inv_target6", "inv_target6@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner6@test.com")
    group_id = _create_group(owner_client)

    resp1 = _invite_by_code(owner_client, group_id, target.friend_code)
    assert resp1.status_code == 201

    resp2 = _invite_by_code(owner_client, group_id, target.friend_code)
    assert resp2.status_code == 400


def test_duplicate_invite_rejected_even_from_different_sender(app):
    """Second admin also gets 400 when trying to invite an already-pending user."""
    from app import db
    from models import GroupMembership

    owner = make_user(db, "inv_owner7", "inv_owner7@test.com")
    admin2 = make_user(db, "inv_admin7", "inv_admin7@test.com")
    target = make_user(db, "inv_target7", "inv_target7@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner7@test.com")
    group_id = _create_group(owner_client)
    _invite_by_code(owner_client, group_id, target.friend_code)

    db.session.add(GroupMembership(user_id=admin2.id, group_id=group_id, role="admin"))
    db.session.commit()

    admin2_client = app.test_client()
    _login(admin2_client, "inv_admin7@test.com")

    resp = _invite_by_code(admin2_client, group_id, target.friend_code)
    assert resp.status_code == 400
    assert "already been invited" in resp.get_json()["message"]


def test_invite_unknown_code_returns_404(app):
    """Using a friend code that does not match any user returns 404."""
    from app import db
    owner = make_user(db, "inv_owner8", "inv_owner8@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner8@test.com")
    group_id = _create_group(owner_client)

    resp = _invite_by_code(owner_client, group_id, "XXXXXXXX")
    assert resp.status_code == 404


# ── Pending invitations list ───────────────────────────────────────────────────

def test_pending_invitations_visible_to_receiver(app):
    """Invited user can see the pending invitation in their inbox."""
    from app import db
    owner = make_user(db, "inv_owner9", "inv_owner9@test.com")
    target = make_user(db, "inv_target9", "inv_target9@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner9@test.com")
    group_id = _create_group(owner_client)
    _invite_by_code(owner_client, group_id, target.friend_code)

    target_client = app.test_client()
    _login(target_client, "inv_target9@test.com")

    resp = target_client.get("/api/groups/invitations/pending")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["group_id"] == group_id


def test_pending_list_does_not_show_others_invitations(app):
    """User only sees their own invitations, not invitations for other users."""
    from app import db
    owner = make_user(db, "inv_owner10", "inv_owner10@test.com")
    target_a = make_user(db, "inv_target10a", "inv_target10a@test.com")
    target_b = make_user(db, "inv_target10b", "inv_target10b@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner10@test.com")
    group_id = _create_group(owner_client)
    _invite_by_code(owner_client, group_id, target_a.friend_code)

    target_b_client = app.test_client()
    _login(target_b_client, "inv_target10b@test.com")

    resp = target_b_client.get("/api/groups/invitations/pending")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 0


# ── Accept / decline lifecycle ────────────────────────────────────────────────

def test_accept_invite_makes_user_a_member(app):
    """Accepting an invitation creates a membership for the receiver."""
    from app import db
    from models import GroupMembership

    owner = make_user(db, "inv_owner11", "inv_owner11@test.com")
    target = make_user(db, "inv_target11", "inv_target11@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner11@test.com")
    group_id = _create_group(owner_client)
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target11@test.com")

    resp = target_client.post(f"/api/groups/invitations/{invite_id}/accept")
    assert resp.status_code == 200

    membership = GroupMembership.query.filter_by(user_id=target.id, group_id=group_id).first()
    assert membership is not None
    assert membership.role == "member"


def test_decline_invite_does_not_create_membership(app):
    """Declining an invitation leaves the user as a non-member."""
    from app import db
    from models import GroupMembership

    owner = make_user(db, "inv_owner12", "inv_owner12@test.com")
    target = make_user(db, "inv_target12", "inv_target12@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner12@test.com")
    group_id = _create_group(owner_client)
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target12@test.com")

    resp = target_client.post(f"/api/groups/invitations/{invite_id}/decline")
    assert resp.status_code == 200

    membership = GroupMembership.query.filter_by(user_id=target.id, group_id=group_id).first()
    assert membership is None


def test_accepted_invite_no_longer_in_pending(app):
    """After accepting, the invitation does not appear in the pending list."""
    from app import db
    owner = make_user(db, "inv_owner13", "inv_owner13@test.com")
    target = make_user(db, "inv_target13", "inv_target13@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner13@test.com")
    group_id = _create_group(owner_client)
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target13@test.com")
    target_client.post(f"/api/groups/invitations/{invite_id}/accept")

    resp = target_client.get("/api/groups/invitations/pending")
    assert len(resp.get_json()) == 0


def test_cannot_accept_others_invite(app):
    """A different user cannot accept an invite meant for someone else."""
    from app import db
    owner = make_user(db, "inv_owner14", "inv_owner14@test.com")
    target = make_user(db, "inv_target14", "inv_target14@test.com")
    intruder = make_user(db, "inv_intruder14", "inv_intruder14@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner14@test.com")
    group_id = _create_group(owner_client)
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    intruder_client = app.test_client()
    _login(intruder_client, "inv_intruder14@test.com")
    resp = intruder_client.post(f"/api/groups/invitations/{invite_id}/accept")
    assert resp.status_code == 403


def test_cannot_act_on_non_pending_invite_twice(app):
    """Accepting an already-accepted invitation returns 400."""
    from app import db
    owner = make_user(db, "inv_owner15", "inv_owner15@test.com")
    target = make_user(db, "inv_target15", "inv_target15@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner15@test.com")
    group_id = _create_group(owner_client)
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target15@test.com")
    target_client.post(f"/api/groups/invitations/{invite_id}/accept")

    resp = target_client.post(f"/api/groups/invitations/{invite_id}/accept")
    assert resp.status_code == 400


# ── Notifications ─────────────────────────────────────────────────────────────

def test_invite_creates_notification_for_receiver(app):
    """Sending an invite creates a group_invite notification for the target."""
    from app import db
    from models import Notification

    owner = make_user(db, "inv_owner16", "inv_owner16@test.com")
    target = make_user(db, "inv_target16", "inv_target16@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner16@test.com")
    group_id = _create_group(owner_client)
    _invite_by_code(owner_client, group_id, target.friend_code)

    notif = Notification.query.filter_by(user_id=target.id, type="group_invite").first()
    assert notif is not None
    assert "invited" in notif.message.lower()


def test_accept_creates_notification_for_sender(app):
    """Accepting an invite creates a group_invite_accepted notification for the sender."""
    from app import db
    from models import Notification

    owner = make_user(db, "inv_owner17", "inv_owner17@test.com")
    target = make_user(db, "inv_target17", "inv_target17@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner17@test.com")
    group_id = _create_group(owner_client)
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target17@test.com")
    target_client.post(f"/api/groups/invitations/{invite_id}/accept")

    notif = Notification.query.filter_by(user_id=owner.id, type="group_invite_accepted").first()
    assert notif is not None


def test_decline_creates_notification_for_sender(app):
    """Declining an invite creates a group_invite_declined notification for the sender."""
    from app import db
    from models import Notification

    owner = make_user(db, "inv_owner18", "inv_owner18@test.com")
    target = make_user(db, "inv_target18", "inv_target18@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner18@test.com")
    group_id = _create_group(owner_client)
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target18@test.com")
    target_client.post(f"/api/groups/invitations/{invite_id}/decline")

    notif = Notification.query.filter_by(user_id=owner.id, type="group_invite_declined").first()
    assert notif is not None


# ── Sent invitations + cancel ─────────────────────────────────────────────────

def test_sent_invitations_visible_to_sender(app):
    """Sender sees pending invitations they sent."""
    from app import db
    owner = make_user(db, "inv_owner_s1", "inv_owner_s1@test.com")
    target = make_user(db, "inv_target_s1", "inv_target_s1@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner_s1@test.com")
    group_id = _create_group(owner_client, name="Sent Invites Group 1")
    _invite_by_code(owner_client, group_id, target.friend_code)

    resp = owner_client.get("/api/groups/invitations/sent")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["group_id"] == group_id
    assert data[0]["receiver_id"] == target.id
    assert data[0]["receiver_username"] == target.username


def test_sent_list_excludes_other_users_sent_invites(app):
    """A user does not see invitations another user sent."""
    from app import db
    from models import GroupMembership

    owner = make_user(db, "inv_owner_s2", "inv_owner_s2@test.com")
    admin = make_user(db, "inv_admin_s2", "inv_admin_s2@test.com")
    target = make_user(db, "inv_target_s2", "inv_target_s2@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner_s2@test.com")
    group_id = _create_group(owner_client, name="Sent Invites Group 2")

    db.session.add(GroupMembership(user_id=admin.id, group_id=group_id, role="admin"))
    db.session.commit()

    _invite_by_code(owner_client, group_id, target.friend_code)

    admin_client = app.test_client()
    _login(admin_client, "inv_admin_s2@test.com")
    resp = admin_client.get("/api/groups/invitations/sent")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 0


def test_sender_can_cancel_pending_invite(app):
    """Sender successfully cancels a pending invitation."""
    from app import db
    owner = make_user(db, "inv_owner_c1", "inv_owner_c1@test.com")
    target = make_user(db, "inv_target_c1", "inv_target_c1@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner_c1@test.com")
    group_id = _create_group(owner_client, name="Cancel Group 1")
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    resp = owner_client.post(f"/api/groups/invitations/{invite_id}/cancel")
    assert resp.status_code == 200
    assert resp.get_json()["success"] is True


def test_cancelled_invite_disappears_from_sent_and_pending(app):
    """After cancel, invite is not in sender's sent list nor receiver's pending list."""
    from app import db
    owner = make_user(db, "inv_owner_c2", "inv_owner_c2@test.com")
    target = make_user(db, "inv_target_c2", "inv_target_c2@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner_c2@test.com")
    group_id = _create_group(owner_client, name="Cancel Group 2")
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    owner_client.post(f"/api/groups/invitations/{invite_id}/cancel")

    sent_resp = owner_client.get("/api/groups/invitations/sent")
    assert len(sent_resp.get_json()) == 0

    target_client = app.test_client()
    _login(target_client, "inv_target_c2@test.com")
    pending_resp = target_client.get("/api/groups/invitations/pending")
    assert len(pending_resp.get_json()) == 0


def test_only_sender_can_cancel_invite(app):
    """A non-sender (including the receiver) gets 403 when cancelling."""
    from app import db
    owner = make_user(db, "inv_owner_c3", "inv_owner_c3@test.com")
    target = make_user(db, "inv_target_c3", "inv_target_c3@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner_c3@test.com")
    group_id = _create_group(owner_client, name="Cancel Group 3")
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target_c3@test.com")
    resp = target_client.post(f"/api/groups/invitations/{invite_id}/cancel")
    assert resp.status_code == 403


def test_cannot_cancel_non_pending_invite(app):
    """Cancelling an already-accepted invite returns 400."""
    from app import db
    owner = make_user(db, "inv_owner_c4", "inv_owner_c4@test.com")
    target = make_user(db, "inv_target_c4", "inv_target_c4@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner_c4@test.com")
    group_id = _create_group(owner_client, name="Cancel Group 4")
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    target_client = app.test_client()
    _login(target_client, "inv_target_c4@test.com")
    target_client.post(f"/api/groups/invitations/{invite_id}/accept")

    _login(owner_client, "inv_owner_c4@test.com")
    resp = owner_client.post(f"/api/groups/invitations/{invite_id}/cancel")
    assert resp.status_code == 400


def test_can_reinvite_after_cancel(app):
    """After cancelling a pending invite, the same user can be invited again."""
    from app import db
    owner = make_user(db, "inv_owner_c5", "inv_owner_c5@test.com")
    target = make_user(db, "inv_target_c5", "inv_target_c5@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_owner_c5@test.com")
    group_id = _create_group(owner_client, name="Cancel Group 5")
    invite_resp = _invite_by_code(owner_client, group_id, target.friend_code)
    invite_id = invite_resp.get_json()["invitation"]["id"]

    owner_client.post(f"/api/groups/invitations/{invite_id}/cancel")

    resp = _invite_by_code(owner_client, group_id, target.friend_code)
    assert resp.status_code == 201


# ── Bulk invite by friend codes ───────────────────────────────────────────────

def _invite_bulk(client, group_id, codes):
    return client.post(
        f"/api/groups/{group_id}/invite-bulk",
        json={"friend_codes": codes},
    )


def test_bulk_invite_sends_multiple_pending_invites(app):
    """Owner can invite several users in one bulk request."""
    from app import db
    from models import GroupInvitation

    owner = make_user(db, "inv_bulk_o1", "inv_bulk_o1@test.com")
    t1 = make_user(db, "inv_bulk_t1", "inv_bulk_t1@test.com")
    t2 = make_user(db, "inv_bulk_t2", "inv_bulk_t2@test.com")
    t3 = make_user(db, "inv_bulk_t3", "inv_bulk_t3@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_bulk_o1@test.com")
    group_id = _create_group(owner_client, name="Bulk Group 1")

    resp = _invite_bulk(
        owner_client,
        group_id,
        [t1.friend_code, t2.friend_code, t3.friend_code],
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["sent"] == 3
    assert data["failed"] == 0
    assert len(data["results"]) == 3
    assert all(r["success"] for r in data["results"])

    pending = GroupInvitation.query.filter_by(group_id=group_id, status="pending").count()
    assert pending == 3


def test_bulk_invite_rejects_more_than_15_codes(app):
    """Bulk endpoint returns 400 when more than 15 codes are submitted."""
    from app import db
    owner = make_user(db, "inv_bulk_o2", "inv_bulk_o2@test.com")
    owner_client = app.test_client()
    _login(owner_client, "inv_bulk_o2@test.com")
    group_id = _create_group(owner_client, name="Bulk Group 2")

    codes = [f"CODE{i:04d}" for i in range(16)]
    resp = _invite_bulk(owner_client, group_id, codes)
    assert resp.status_code == 400


def test_bulk_invite_plain_member_forbidden(app):
    """A plain member cannot use bulk invite."""
    from app import db
    from models import GroupMembership

    owner = make_user(db, "inv_bulk_o3", "inv_bulk_o3@test.com")
    member = make_user(db, "inv_bulk_m3", "inv_bulk_m3@test.com")
    t1 = make_user(db, "inv_bulk_t4", "inv_bulk_t4@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_bulk_o3@test.com")
    group_id = _create_group(owner_client, name="Bulk Group 3")

    db.session.add(GroupMembership(user_id=member.id, group_id=group_id, role="member"))
    db.session.commit()

    member_client = app.test_client()
    _login(member_client, "inv_bulk_m3@test.com")
    resp = _invite_bulk(member_client, group_id, [t1.friend_code])
    assert resp.status_code == 403


def test_bulk_invite_deduplicates_duplicate_codes_in_request(app):
    """Duplicate friend codes in the JSON list are only processed once."""
    from app import db
    from models import GroupInvitation

    owner = make_user(db, "inv_bulk_o4", "inv_bulk_o4@test.com")
    t1 = make_user(db, "inv_bulk_t5", "inv_bulk_t5@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_bulk_o4@test.com")
    group_id = _create_group(owner_client, name="Bulk Group 4")

    code = t1.friend_code
    resp = _invite_bulk(owner_client, group_id, [code, code.lower(), code])
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["sent"] == 1
    assert GroupInvitation.query.filter_by(group_id=group_id, receiver_id=t1.id, status="pending").count() == 1


def test_bulk_invite_partial_success(app):
    """Bulk returns per-code failures and still sends valid invites."""
    from app import db
    from models import GroupInvitation

    owner = make_user(db, "inv_bulk_o5", "inv_bulk_o5@test.com")
    t1 = make_user(db, "inv_bulk_t6", "inv_bulk_t6@test.com")

    owner_client = app.test_client()
    _login(owner_client, "inv_bulk_o5@test.com")
    group_id = _create_group(owner_client, name="Bulk Group 5")

    resp = _invite_bulk(
        owner_client,
        group_id,
        [t1.friend_code, "ZZZZZZZZ"],
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["sent"] == 1
    assert data["failed"] == 1
    assert GroupInvitation.query.filter_by(receiver_id=t1.id, group_id=group_id, status="pending").count() == 1
