from datetime import datetime, timezone
from collections import defaultdict
import threading
import time as _time
from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from models import (
    Group, Post, Comment, PostLike, GroupMembership,
    GroupInvitation, User, Notification, GroupModerationLog,
)
from app import db
import uuid
import os

groups_bp = Blueprint("group", __name__)

# ── Permission helpers ────────────────────────────────────────────────────────

def _get_membership(user_id, group_id):
    return GroupMembership.query.filter_by(user_id=user_id, group_id=group_id).first()


def _is_owner(group, user_id):
    return group.owner_id == user_id


def _is_admin_or_owner(group, user_id):
    if group.owner_id == user_id:
        return True
    m = _get_membership(user_id, group.id)
    return m is not None and m.role == "admin"


def _is_member(user_id, group_id):
    return _get_membership(user_id, group_id) is not None


# ── Rate limiting (in-memory) ─────────────────────────────────────────────────

_rl_store: dict = defaultdict(list)
_rl_lock = threading.Lock()

_INVITE_PER_MIN_USER = 10
_INVITE_PER_HOUR_USER = 60
_INVITE_PER_MIN_IP = 30

# Max friend codes per bulk-invite request (UI matches this).
_MAX_BULK_INVITE_CODES = 15


def _check_rate_limit(user_key: str, ip_key: str):
    now = _time.time()
    with _rl_lock:
        for key in (user_key, ip_key):
            _rl_store[key] = [t for t in _rl_store[key] if now - t < 3600]

        u_ts = _rl_store[user_key]
        ip_ts = _rl_store[ip_key]

        if sum(1 for t in u_ts if now - t < 60) >= _INVITE_PER_MIN_USER:
            return False, "Too many invites per minute. Please wait before sending more."
        if len(u_ts) >= _INVITE_PER_HOUR_USER:
            return False, "Hourly invite limit reached. Please try again later."
        if sum(1 for t in ip_ts if now - t < 60) >= _INVITE_PER_MIN_IP:
            return False, "Too many requests from this network. Please wait a moment."

        _rl_store[user_key].append(now)
        _rl_store[ip_key].append(now)
        return True, None


# ── Notification helper ───────────────────────────────────────────────────────

def _notify(user_id, notif_type, title, message, link=None):
    db.session.add(Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        message=message,
        link=link,
    ))


# ── Moderation log helper ─────────────────────────────────────────────────────

def _mod_log(group_id, actor_id, action, target_user_id=None, target_post_id=None, reason=None):
    db.session.add(GroupModerationLog(
        group_id=group_id,
        actor_id=actor_id,
        action=action,
        target_user_id=target_user_id,
        target_post_id=target_post_id,
        reason=reason,
    ))


# ── File upload helper ────────────────────────────────────────────────────────

def _allowed_file(filename):
    allowed = current_app.config.get(
        "ALLOWED_EXTENSIONS",
        {"png", "jpg", "jpeg", "gif", "webp", "mp4", "webm", "mov"},
    )
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed


def _save_upload(file, subfolder):
    """Save an uploaded file and return its relative path, or None on failure."""
    if not _allowed_file(file.filename):
        return None, "File format not allowed."
    ext = file.filename.rsplit(".", 1)[1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], subfolder)
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, filename))
    return f"uploads/{subfolder}/{filename}", None


def _delete_upload(relative_path, subfolder):
    if not relative_path:
        return
    fname = relative_path.split("/")[-1]
    full = os.path.join(current_app.config["UPLOAD_FOLDER"], subfolder, fname)
    if os.path.exists(full):
        os.remove(full)


# ═══════════════════════════════════════════════════════════════════
# GROUP CRUD
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/groups", methods=["POST"])
@login_required
def create_group():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()

    if not name:
        return jsonify({"success": False, "message": "Group name is required."}), 400

    group = Group(name=name, description=description, owner_id=current_user.id)
    db.session.add(group)
    db.session.flush()

    db.session.add(GroupMembership(user_id=current_user.id, group_id=group.id, role="owner"))
    db.session.commit()

    return jsonify(group.to_dict()), 201


@groups_bp.route("/api/groups", methods=["GET"])
@login_required
def get_user_groups():
    memberships = GroupMembership.query.filter_by(user_id=current_user.id).all()
    groups = []
    for m in memberships:
        data = m.group.to_dict(include_members=True)
        data["my_role"] = m.role
        data["is_owner"] = m.group.owner_id == current_user.id
        groups.append(data)
    return jsonify(groups), 200


@groups_bp.route("/api/groups/<int:group_id>", methods=["PUT"])
@login_required
def update_group(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"success": False, "message": "Group not found."}), 404
    if not _is_owner(group, current_user.id):
        return jsonify({"success": False, "message": "Only the group owner can edit group settings."}), 403

    old_cover = group.cover_picture
    group.name = (request.form.get("name") or group.name).strip() or group.name
    group.description = request.form.get("description", group.description)

    file = request.files.get("cover")
    if file:
        path, err = _save_upload(file, "group_covers")
        if err:
            return jsonify({"success": False, "message": err}), 400
        _delete_upload(old_cover, "group_covers")
        group.cover_picture = path

    db.session.commit()
    return jsonify({"success": True, "group": group.to_dict()}), 200


@groups_bp.route("/api/groups/<int:group_id>", methods=["DELETE"])
@login_required
def delete_group(group_id):
    group = Group.query.get_or_404(group_id)
    if not _is_owner(group, current_user.id):
        return jsonify({"success": False, "message": "Only the group owner can delete this group."}), 403
    db.session.delete(group)
    db.session.commit()
    return jsonify({"success": True}), 200


@groups_bp.route("/api/groups/<int:group_id>")
@login_required
def render_group_detail(group_id):
    group = Group.query.get_or_404(group_id)
    membership = _get_membership(current_user.id, group_id)
    if not membership:
        return jsonify({"success": False, "message": "You must be a member to access this group."}), 403
    return render_template(
        "group_detail.html",
        group=group,
        my_role=membership.role,
        is_owner=group.owner_id == current_user.id,
    )


# ═══════════════════════════════════════════════════════════════════
# MEMBERS
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/groups/<int:group_id>/members", methods=["GET"])
@login_required
def get_members(group_id):
    group = Group.query.get_or_404(group_id)
    if not _is_member(current_user.id, group_id):
        return jsonify({"success": False, "message": "You must be a member to view group members."}), 403
    return jsonify([m.to_dict() for m in group.members]), 200


@groups_bp.route("/api/groups/<int:group_id>/members/<int:user_id>", methods=["DELETE"])
@login_required
def remove_member(group_id, user_id):
    group = Group.query.get_or_404(group_id)

    if not _is_admin_or_owner(group, current_user.id):
        return jsonify({"success": False, "message": "Only admins or the owner can remove members."}), 403
    if user_id == group.owner_id:
        return jsonify({"success": False, "message": "The group owner cannot be removed."}), 403
    if user_id == current_user.id:
        return jsonify({"success": False, "message": "Use the leave endpoint to remove yourself."}), 400

    membership = _get_membership(user_id, group_id)
    if not membership:
        return jsonify({"success": False, "message": "User is not a member of this group."}), 404

    _mod_log(group_id, current_user.id, "remove_member", target_user_id=user_id)
    db.session.delete(membership)
    db.session.commit()
    return jsonify({"success": True, "message": "Member removed."}), 200


@groups_bp.route("/api/groups/<int:group_id>/members/<int:user_id>/role", methods=["PATCH"])
@login_required
def change_member_role(group_id, user_id):
    group = Group.query.get_or_404(group_id)

    if not _is_owner(group, current_user.id):
        return jsonify({"success": False, "message": "Only the group owner can promote or demote admins."}), 403
    if user_id == group.owner_id:
        return jsonify({"success": False, "message": "The owner's role cannot be changed."}), 403

    membership = _get_membership(user_id, group_id)
    if not membership:
        return jsonify({"success": False, "message": "User is not a member of this group."}), 404

    data = request.get_json() or {}
    new_role = (data.get("role") or "").strip().lower()
    if new_role not in ("admin", "member"):
        return jsonify({"success": False, "message": "Role must be 'admin' or 'member'."}), 400

    action = "promote_admin" if new_role == "admin" else "demote_admin"
    membership.role = new_role
    _mod_log(group_id, current_user.id, action, target_user_id=user_id)
    db.session.commit()
    return jsonify({"success": True, "member": membership.to_dict()}), 200


@groups_bp.route("/api/groups/<int:group_id>/leave", methods=["POST"])
@login_required
def leave_group(group_id):
    group = Group.query.get_or_404(group_id)

    if group.owner_id == current_user.id:
        return jsonify({
            "success": False,
            "message": "The owner cannot leave the group. Delete the group if you wish to remove it.",
        }), 403

    membership = _get_membership(current_user.id, group_id)
    if not membership:
        return jsonify({"success": False, "message": "You are not a member of this group."}), 404

    db.session.delete(membership)
    db.session.commit()
    return jsonify({"success": True, "message": "You have left the group."}), 200


# ═══════════════════════════════════════════════════════════════════
# AUDIT LOG
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/groups/<int:group_id>/audit-log", methods=["GET"])
@login_required
def get_audit_log(group_id):
    group = Group.query.get_or_404(group_id)
    if not _is_admin_or_owner(group, current_user.id):
        return jsonify({"success": False, "message": "Only admins or the owner can view the audit log."}), 403

    logs = (
        GroupModerationLog.query
        .filter_by(group_id=group_id)
        .order_by(GroupModerationLog.created_at.desc())
        .all()
    )
    return jsonify([log.to_dict() for log in logs]), 200


# ═══════════════════════════════════════════════════════════════════
# POSTS
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/groups/<int:group_id>/posts", methods=["GET"])
@login_required
def get_posts(group_id):
    group = Group.query.get_or_404(group_id)
    if not _is_member(current_user.id, group_id):
        return jsonify({"success": False, "message": "You must be a group member to view posts."}), 403
    return jsonify([p.to_dict() for p in group.posts]), 200


@groups_bp.route("/api/groups/<int:group_id>/posts", methods=["POST"])
@login_required
def create_post(group_id):
    if not _is_member(current_user.id, group_id):
        return jsonify({"success": False, "message": "You must be a group member to create posts."}), 403

    content = (request.form.get("content") or "").strip()
    if not content:
        return jsonify({"success": False, "message": "Post content is required."}), 400

    article_url = request.form.get("article_url")
    media = request.files.get("media")
    media_path = None
    media_type = None

    if media:
        media.seek(0, os.SEEK_END)
        file_size = media.tell()
        media.seek(0)
        if file_size > current_app.config["MAX_CONTENT_LENGTH"]:
            return jsonify({"success": False, "message": "File size exceeds the 20 MB limit."}), 400

        path, err = _save_upload(media, "post_media")
        if err:
            return jsonify({"success": False, "message": err}), 400

        media_path = path
        if media.mimetype.startswith("image"):
            media_type = "image"
        elif media.mimetype.startswith("video"):
            media_type = "video"

    post = Post(
        content=content,
        article_url=article_url,
        media_url=media_path,
        media_type=media_type,
        user_id=current_user.id,
        group_id=group_id,
    )
    db.session.add(post)
    db.session.commit()
    return jsonify({"message": "Post created.", "post": post.to_dict()}), 201


@groups_bp.route("/api/posts/<int:post_id>", methods=["PUT"])
@login_required
def edit_post(post_id):
    post = Post.query.get_or_404(post_id)

    if post.user_id != current_user.id:
        return jsonify({"success": False, "message": "You can only edit your own posts."}), 403

    data = request.get_json() or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"success": False, "message": "Post content cannot be empty."}), 400

    post.content = content
    if "article_url" in data:
        post.article_url = data["article_url"]

    db.session.commit()
    return jsonify({"success": True, "post": post.to_dict()}), 200


@groups_bp.route("/api/posts/<int:post_id>", methods=["DELETE"])
@login_required
def delete_post(post_id):
    post = Post.query.get_or_404(post_id)
    group_id = post.group_id
    group = db.session.get(Group, group_id)

    is_author = post.user_id == current_user.id
    is_moderator = group and _is_admin_or_owner(group, current_user.id)

    if not is_author and not is_moderator:
        return jsonify({
            "success": False,
            "message": "You can only delete your own posts. Group admins may remove others' posts.",
        }), 403

    if not is_author and is_moderator:
        _mod_log(group_id, current_user.id, "delete_post",
                 target_user_id=post.user_id, target_post_id=post_id)

    old_media = post.media_url
    db.session.delete(post)
    db.session.commit()

    _delete_upload(old_media, "post_media")
    return jsonify({"success": True, "group_id": group_id}), 200


# ═══════════════════════════════════════════════════════════════════
# COMMENTS
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/posts/<int:post_id>/comments", methods=["POST"])
@login_required
def add_comment(post_id):
    post = Post.query.get_or_404(post_id)
    if not _is_member(current_user.id, post.group_id):
        return jsonify({"success": False, "message": "You must be a group member to comment."}), 403

    content = (request.json.get("content") or "").strip()
    if not content:
        return jsonify({"success": False, "message": "Comment cannot be empty."}), 400

    comment = Comment(content=content, post_id=post_id, user_id=current_user.id)
    db.session.add(comment)
    db.session.commit()
    db.session.refresh(comment)
    return jsonify({"success": True, "comment": comment.to_dict()}), 201


@groups_bp.route("/api/comments/<int:comment_id>", methods=["DELETE"])
@login_required
def delete_comment(comment_id):
    comment = Comment.query.get_or_404(comment_id)
    post_id = comment.post_id
    if comment.user_id != current_user.id:
        return jsonify({"success": False, "message": "You can only delete your own comments."}), 403
    db.session.delete(comment)
    db.session.commit()
    return jsonify({"success": True, "post_id": post_id}), 200


# ═══════════════════════════════════════════════════════════════════
# LIKES
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/posts/<int:post_id>/like", methods=["POST"])
@login_required
def toggle_like(post_id):
    post = Post.query.get_or_404(post_id)
    if not _is_member(current_user.id, post.group_id):
        return jsonify({"success": False, "message": "You must be a group member to like posts."}), 403

    like = PostLike.query.filter_by(user_id=current_user.id, post_id=post_id).first()
    if like:
        db.session.delete(like)
        status = "unliked"
    else:
        db.session.add(PostLike(user_id=current_user.id, post_id=post_id))
        status = "liked"

    db.session.commit()
    total = PostLike.query.filter_by(post_id=post_id).count()
    return jsonify({"success": True, "status": status, "total_likes": total, "post_id": post_id}), 200


# ═══════════════════════════════════════════════════════════════════
# INVITATIONS
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/groups/<int:group_id>/invite-by-code", methods=["POST"])
@login_required
def invite_by_code(group_id):
    group = Group.query.get_or_404(group_id)

    if not _is_admin_or_owner(group, current_user.id):
        return jsonify({"success": False, "message": "Only admins or the owner can invite new members."}), 403

    if not current_app.config.get("TESTING", False):
        user_key = f"invite:user:{current_user.id}"
        ip_key = f"invite:ip:{request.remote_addr}"
        allowed, reason = _check_rate_limit(user_key, ip_key)
        if not allowed:
            return jsonify({"success": False, "message": reason}), 429

    data = request.get_json() or {}
    raw_code = (data.get("friend_code") or "").strip().upper()
    if not raw_code:
        return jsonify({"success": False, "message": "Friend code is required."}), 400

    target = User.query.filter_by(friend_code=raw_code).first()
    if not target:
        return jsonify({"success": False, "message": "No user found with that friend code."}), 404

    if target.id == current_user.id:
        return jsonify({"success": False, "message": "You cannot invite yourself."}), 400

    if _is_member(target.id, group_id):
        return jsonify({"success": False, "message": "This user is already a member of the group."}), 400

    existing = GroupInvitation.query.filter_by(
        receiver_id=target.id,
        group_id=group_id,
        status="pending",
    ).first()
    if existing:
        return jsonify({
            "success": False,
            "message": "This user has already been invited to the group and has not responded yet.",
        }), 400

    invitation = GroupInvitation(
        group_id=group_id,
        sender_id=current_user.id,
        receiver_id=target.id,
    )
    db.session.add(invitation)
    db.session.flush()

    _notify(
        user_id=target.id,
        notif_type="group_invite",
        title=f"Group invitation from {current_user.username}",
        message=f'{current_user.username} invited you to join "{group.name}".',
        link="/groups#invitations",
    )

    db.session.commit()
    return jsonify({"success": True, "message": "Invitation sent.", "invitation": invitation.to_dict()}), 201


@groups_bp.route("/api/groups/<int:group_id>/invite-bulk", methods=["POST"])
@login_required
def invite_bulk_by_codes(group_id):
    """Invite up to 15 users by friend code in one request. One rate-limit slot for the whole batch."""
    group = Group.query.get_or_404(group_id)

    if not _is_admin_or_owner(group, current_user.id):
        return jsonify({"success": False, "message": "Only admins or the owner can invite new members."}), 403

    if not current_app.config.get("TESTING", False):
        user_key = f"invite:user:{current_user.id}"
        ip_key = f"invite:ip:{request.remote_addr}"
        allowed, reason = _check_rate_limit(user_key, ip_key)
        if not allowed:
            return jsonify({"success": False, "message": reason}), 429

    data = request.get_json() or {}
    raw_list = data.get("friend_codes")
    if not isinstance(raw_list, list):
        return jsonify({"success": False, "message": "friend_codes must be a list."}), 400

    seen_codes = set()
    codes = []
    for item in raw_list:
        rc = (str(item) if item is not None else "").strip().upper()
        if not rc or rc in seen_codes:
            continue
        seen_codes.add(rc)
        codes.append(rc)

    if not codes:
        return jsonify({"success": False, "message": "Add at least one friend code."}), 400

    if len(codes) > _MAX_BULK_INVITE_CODES:
        return jsonify({
            "success": False,
            "message": f"You can invite at most {_MAX_BULK_INVITE_CODES} people at once.",
        }), 400

    results = []
    sent = 0
    receivers_in_batch = set()

    for raw_code in codes:
        if len(raw_code) != 8:
            results.append({
                "friend_code": raw_code,
                "success": False,
                "message": "Friend codes must be exactly 8 characters.",
            })
            continue

        target = User.query.filter_by(friend_code=raw_code).first()
        if not target:
            results.append({
                "friend_code": raw_code,
                "success": False,
                "message": "No user found with that friend code.",
            })
            continue

        if target.id == current_user.id:
            results.append({
                "friend_code": raw_code,
                "success": False,
                "message": "You cannot invite yourself.",
            })
            continue

        if target.id in receivers_in_batch:
            results.append({
                "friend_code": raw_code,
                "success": False,
                "message": "Duplicate user in this invite list.",
            })
            continue

        if _is_member(target.id, group_id):
            results.append({
                "friend_code": raw_code,
                "success": False,
                "message": "This user is already a member of the group.",
            })
            continue

        existing = GroupInvitation.query.filter_by(
            receiver_id=target.id,
            group_id=group_id,
            status="pending",
        ).first()
        if existing:
            results.append({
                "friend_code": raw_code,
                "success": False,
                "message": "This user has already been invited and has not responded yet.",
            })
            continue

        invitation = GroupInvitation(
            group_id=group_id,
            sender_id=current_user.id,
            receiver_id=target.id,
        )
        db.session.add(invitation)
        db.session.flush()

        _notify(
            user_id=target.id,
            notif_type="group_invite",
            title=f"Group invitation from {current_user.username}",
            message=f'{current_user.username} invited you to join "{group.name}".',
            link="/groups#invitations",
        )

        receivers_in_batch.add(target.id)
        sent += 1
        results.append({
            "friend_code": raw_code,
            "success": True,
            "invitation": invitation.to_dict(),
        })

    db.session.commit()

    failed = len(results) - sent
    if sent == 0 and failed > 0:
        msg = "No invitations were sent."
    elif failed == 0:
        msg = f"Sent {sent} invitation(s)." if sent != 1 else "Invitation sent."
    else:
        msg = f"Sent {sent} invitation(s); {failed} could not be sent."

    return jsonify({
        "success": sent > 0,
        "message": msg,
        "sent": sent,
        "failed": failed,
        "results": results,
    }), 200


@groups_bp.route("/api/groups/invitations/pending", methods=["GET"])
@login_required
def get_pending_invitations():
    invitations = (
        GroupInvitation.query
        .filter_by(receiver_id=current_user.id, status="pending")
        .order_by(GroupInvitation.created_at.desc())
        .all()
    )
    return jsonify([i.to_dict() for i in invitations]), 200


@groups_bp.route("/api/groups/invitations/sent", methods=["GET"])
@login_required
def get_sent_invitations():
    invitations = (
        GroupInvitation.query
        .filter_by(sender_id=current_user.id, status="pending")
        .order_by(GroupInvitation.created_at.desc())
        .all()
    )
    return jsonify([i.to_dict() for i in invitations]), 200


@groups_bp.route("/api/groups/invitations/<int:invite_id>/cancel", methods=["POST"])
@login_required
def cancel_invitation(invite_id):
    invite = GroupInvitation.query.get_or_404(invite_id)

    if invite.sender_id != current_user.id:
        return jsonify({"success": False, "message": "You can only cancel invitations you sent."}), 403
    if invite.status != "pending":
        return jsonify({"success": False, "message": f"This invitation is already {invite.status}."}), 400

    invite.status = "cancelled"
    db.session.commit()
    return jsonify({"success": True, "message": "Invitation cancelled."}), 200


@groups_bp.route("/api/groups/invitations/<int:invite_id>/accept", methods=["POST"])
@login_required
def accept_invitation(invite_id):
    invite = GroupInvitation.query.get_or_404(invite_id)

    if invite.receiver_id != current_user.id:
        return jsonify({"success": False, "message": "This invitation was not sent to you."}), 403
    if invite.status != "pending":
        return jsonify({"success": False, "message": f"This invitation is already {invite.status}."}), 400

    invite.status = "accepted"

    if not _is_member(current_user.id, invite.group_id):
        db.session.add(GroupMembership(
            user_id=current_user.id,
            group_id=invite.group_id,
            role="member",
        ))

    _notify(
        user_id=invite.sender_id,
        notif_type="group_invite_accepted",
        title="Invitation accepted",
        message=f'{current_user.username} accepted your invitation to "{invite.group.name}".',
        link="/groups",
    )

    db.session.commit()
    return jsonify({"success": True, "message": "You have joined the group."}), 200


@groups_bp.route("/api/groups/invitations/<int:invite_id>/decline", methods=["POST"])
@login_required
def decline_invitation(invite_id):
    invite = GroupInvitation.query.get_or_404(invite_id)

    if invite.receiver_id != current_user.id:
        return jsonify({"success": False, "message": "This invitation was not sent to you."}), 403
    if invite.status != "pending":
        return jsonify({"success": False, "message": f"This invitation is already {invite.status}."}), 400

    invite.status = "declined"

    _notify(
        user_id=invite.sender_id,
        notif_type="group_invite_declined",
        title="Invitation declined",
        message=f'{current_user.username} declined your invitation to "{invite.group.name}".',
        link="/groups",
    )

    db.session.commit()
    return jsonify({"success": True, "message": "Invitation declined."}), 200


# ═══════════════════════════════════════════════════════════════════
# USER – FRIEND CODE
# ═══════════════════════════════════════════════════════════════════

@groups_bp.route("/api/users/me/friend-code", methods=["GET"])
@login_required
def get_my_friend_code():
    return jsonify({"friend_code": current_user.friend_code}), 200
