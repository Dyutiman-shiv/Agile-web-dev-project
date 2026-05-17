from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from models import Notification, NotificationPreference
from app import db

notif_bp = Blueprint("notifications", __name__)


def _ensure_prefs(user_id):
    """Return existing prefs or create defaults."""
    prefs = NotificationPreference.query.filter_by(user_id=user_id).first()
    if prefs is None:
        prefs = NotificationPreference(user_id=user_id)
        db.session.add(prefs)
        db.session.commit()
    return prefs


# ---------- List Notifications ----------
@notif_bp.route("/api/notifications")
@login_required
def list_notifications():
    unread_only = request.args.get("unread_only", "false").lower() == "true"
    limit = request.args.get("limit", 30, type=int)
    offset = request.args.get("offset", 0, type=int)

    query = Notification.query.filter_by(user_id=current_user.id)
    if unread_only:
        query = query.filter_by(read=False)
    query = query.order_by(Notification.created_at.desc())

    total = query.count()
    notifications = query.offset(offset).limit(limit).all()

    return jsonify({
        "notifications": [n.to_dict() for n in notifications],
        "total": total,
        "unread": Notification.query.filter_by(user_id=current_user.id, read=False).count(),
    })


# ---------- Unread Count ----------
@notif_bp.route("/api/notifications/unread-count")
@login_required
def unread_count():
    count = Notification.query.filter_by(user_id=current_user.id, read=False).count()
    return jsonify({"count": count})


# ---------- Mark Single Read ----------
@notif_bp.route("/api/notifications/<int:notif_id>/read", methods=["PUT"])
@login_required
def mark_read(notif_id):
    notif = db.session.get(Notification, notif_id)
    if not notif or notif.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404
    notif.read = True
    db.session.commit()
    return jsonify({"success": True})


# ---------- Mark All Read ----------
@notif_bp.route("/api/notifications/mark-all-read", methods=["POST"])
@login_required
def mark_all_read():
    Notification.query.filter_by(user_id=current_user.id, read=False).update({"read": True})
    db.session.commit()
    return jsonify({"success": True})


# ---------- Delete Single ----------
@notif_bp.route("/api/notifications/<int:notif_id>", methods=["DELETE"])
@login_required
def delete_notification(notif_id):
    notif = db.session.get(Notification, notif_id)
    if not notif or notif.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404
    db.session.delete(notif)
    db.session.commit()
    return jsonify({"success": True})


# ---------- Clear All Read ----------
@notif_bp.route("/api/notifications/clear", methods=["DELETE"])
@login_required
def clear_read():
    Notification.query.filter_by(user_id=current_user.id, read=True).delete()
    db.session.commit()
    return jsonify({"success": True})


# ---------- Preferences ----------
@notif_bp.route("/api/notifications/preferences")
@login_required
def get_preferences():
    prefs = _ensure_prefs(current_user.id)
    return jsonify(prefs.to_dict())


@notif_bp.route("/api/notifications/preferences", methods=["PUT"])
@login_required
def update_preferences():
    prefs = _ensure_prefs(current_user.id)
    data = request.get_json(silent=True) or {}
    for field in ("session_reminders", "task_due_reminders", "task_overdue_alerts",
                  "semester_alerts", "timer_done_push", "browser_push_enabled"):
        if field in data:
            setattr(prefs, field, bool(data[field]))
    db.session.commit()
    return jsonify({"success": True, **prefs.to_dict()})


# ---------- Page Routes ----------
@notif_bp.route("/notifications")
@login_required
def notifications_page():
    return render_template("notifications.html")


@notif_bp.route("/notifications/settings")
@login_required
def notification_settings_page():
    return render_template("notification_settings.html")
