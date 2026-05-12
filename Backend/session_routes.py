from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import StudySession, ChecklistItem
from app import db

session_bp = Blueprint("sessions", __name__)

@session_bp.route("/api/sessions/active", methods=["GET"])
@login_required
def get_active_sessions():
    """Get all active (unfinished) sessions for the current user."""
    sessions = (
        StudySession.query
        .filter_by(user_id=current_user.id, status="active")
        .order_by(StudySession.start_time.desc())
        .all()
    )
    return jsonify([s.to_dict() for s in sessions])

@session_bp.route("/api/sessions/<int:session_id>/resume", methods=["POST"])
@login_required
def resume_session(session_id):
    """Resume an active session that was previously saved but not completed."""
    session = db.session.get(StudySession, session_id)
    if not session or session.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404
    
    if session.status != "active":
        return jsonify({"success": False, "message": "This session has already been completed."}), 400
    
    # Return the session data to resume
    return jsonify({
        "success": True,
        "session": session.to_dict(),
        "elapsed_seconds": (datetime.utcnow() - session.start_time).total_seconds()
    })

@session_bp.route("/api/sessions/<int:session_id>", methods=["PUT"])
@login_required
def update_session(session_id):
    session = db.session.get(StudySession, session_id)
    if not session or session.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    data = request.get_json()
    if "name" in data:
        session.subject = (data["name"] or "").strip() or session.subject
    if "unit_id" in data:
        session.unit_id = int(data["unit_id"]) if data["unit_id"] else None
    if "color" in data:
        session.color = data["color"]
    if "notes" in data:
        session.notes = data["notes"]
    if "status" in data:
        session.status = data["status"]

    db.session.commit()
    return jsonify({"success": True, "session": session.to_dict()})

@session_bp.route("/api/sessions", methods=["POST"])
@login_required
def create_session():
    data = request.get_json()

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Session name is required."}), 400

    checklist = data.get("checklist", [])
    if not checklist:
        return jsonify({"success": False, "message": "At least one checklist item is required."}), 400

    start_iso = data.get("start_time")
    if not start_iso:
        return jsonify({"success": False, "message": "Start time is required."}), 400

    duration = int(data.get("duration_minutes", 0))
    timer_mode = data.get("timer_mode", "stopwatch")
    color = data.get("color", "#6366f1")
    notes = data.get("notes", "")
    unit_id = data.get("unit_id")

    session = StudySession(
        user_id=current_user.id,
        subject=name,
        start_time=datetime.fromisoformat(start_iso),
        duration_minutes=duration,
        notes=notes,
        color=color,
        timer_mode=timer_mode,
        unit_id=int(unit_id) if unit_id else None,
    )
    db.session.add(session)
    db.session.flush()  # get session.id before adding checklist items

    for item in checklist:
        title = (item.get("title") or "").strip()
        if not title:
            continue
        ci = ChecklistItem(
            session_id=session.id,
            title=title,
            completed=bool(item.get("completed", False)),
        )
        db.session.add(ci)

    db.session.commit()
    return jsonify({"success": True, "session": session.to_dict()}), 201


@session_bp.route("/api/sessions")
@login_required
def list_sessions():
    limit = request.args.get("limit", 50, type=int)
    sessions = (
        StudySession.query
        .filter_by(user_id=current_user.id)
        .order_by(StudySession.start_time.desc())
        .limit(limit)
        .all()
    )
    return jsonify([s.to_dict() for s in sessions])


@session_bp.route("/api/sessions/<int:session_id>")
@login_required
def get_session(session_id):
    session = db.session.get(StudySession, session_id)
    if not session or session.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404
    return jsonify(session.to_dict())


@session_bp.route("/api/sessions/<int:session_id>", methods=["DELETE"])
@login_required
def delete_session(session_id):
    session = db.session.get(StudySession, session_id)
    if not session or session.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404
    db.session.delete(session)
    db.session.commit()
    return jsonify({"success": True, "message": "Session deleted."})


# NEW ENDPOINT: Update checklist item completion status
@session_bp.route("/api/sessions/<int:session_id>/checklist/<int:item_id>", methods=["PUT"])
@login_required
def update_checklist_item(session_id, item_id):
    """Update a single checklist item's completed status (tick/untick)."""
    session = db.session.get(StudySession, session_id)
    if not session or session.user_id != current_user.id:
        return jsonify({"success": False, "message": "Session not found."}), 404
    
    checklist_item = db.session.get(ChecklistItem, item_id)
    if not checklist_item or checklist_item.session_id != session_id:
        return jsonify({"success": False, "message": "Checklist item not found."}), 404
    
    data = request.get_json()
    if "completed" in data:
        checklist_item.completed = bool(data["completed"])
        db.session.commit()
        return jsonify({"success": True, "completed": checklist_item.completed})
    
    return jsonify({"success": False, "message": "No valid fields to update."}), 400


