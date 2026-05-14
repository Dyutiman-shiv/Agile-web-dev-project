from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import StudySession, ChecklistItem, StudySessionSegment
from app import db


def _parse_client_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    s = str(value).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _append_study_segment_from_payload(session, data):
    """Persist one calendar sitting when the client sends segment_* fields."""
    ss = data.get("segment_started_at")
    se = data.get("segment_ended_at")
    raw_el = data.get("segment_elapsed_seconds")
    if not ss or not se or raw_el is None:
        return
    try:
        elapsed = int(raw_el)
    except (TypeError, ValueError):
        return
    if elapsed < 1:
        return
    t_start = _parse_client_datetime(ss)
    t_end = _parse_client_datetime(se)
    if not t_start or not t_end:
        return
    if t_end < t_start:
        t_end = t_start
    db.session.add(
        StudySessionSegment(
            session_id=session.id,
            segment_start=t_start,
            segment_end=t_end,
            elapsed_seconds=elapsed,
        )
    )


session_bp = Blueprint("sessions", __name__)

@session_bp.route("/api/sessions/active", methods=["GET"])
@login_required
def get_active_sessions():
    """Get all active (unfinished) sessions for the current user."""
    sessions = (
        StudySession.query
        .filter_by(user_id=current_user.id, status="active")
        .filter(StudySession.continued_as_session_id.is_(None))
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

    if session.continued_as_session_id:
        return jsonify({
            "success": False,
            "message": "This session was continued with a new timer. Resume the latest entry in history.",
        }), 400

    if session.status != "active":
        return jsonify({"success": False, "message": "This session has already been completed."}), 400

    if session.accumulated_seconds is not None:
        elapsed = int(session.accumulated_seconds)
    else:
        elapsed = int((datetime.utcnow() - session.start_time).total_seconds())

    return jsonify({
        "success": True,
        "session": session.to_dict(),
        "elapsed_seconds": elapsed,
    })

@session_bp.route("/api/sessions/<int:session_id>", methods=["PUT"])
@login_required
def update_session(session_id):
    session = db.session.get(StudySession, session_id)
    if not session or session.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    data = request.get_json() or {}
    if "name" in data:
        session.subject = (data["name"] or "").strip() or session.subject
    if "unit_id" in data:
        session.unit_id = int(data["unit_id"]) if data["unit_id"] else None
    if "color" in data:
        session.color = data["color"]
    if "notes" in data:
        session.notes = data["notes"]
    if "duration_minutes" in data:
        session.duration_minutes = max(1, int(data["duration_minutes"]))
    if "accumulated_seconds" in data:
        try:
            session.accumulated_seconds = max(0, int(data["accumulated_seconds"]))
        except (TypeError, ValueError):
            pass
    if "status" in data:
        st = data["status"]
        if st in ("active", "completed"):
            session.status = st

    # Sync checklist completion/titles for existing rows (client sends full in-memory list).
    checklist = data.get("checklist")
    if isinstance(checklist, list):
        for raw in checklist:
            item_id = raw.get("id")
            if not item_id:
                continue
            ci = db.session.get(ChecklistItem, int(item_id))
            if not ci or ci.session_id != session.id:
                continue
            title = (raw.get("title") or "").strip()
            if title:
                ci.title = title
            ci.completed = bool(raw.get("completed", False))

    # Cannot be "completed" in DB if any checklist row is still open.
    rows = list(session.checklist_items)
    if rows and not all(ci.completed for ci in rows) and session.status == "completed":
        session.status = "active"

    _append_study_segment_from_payload(session, data)

    db.session.commit()
    return jsonify({"success": True, "session": session.to_dict()})

@session_bp.route("/api/sessions", methods=["POST"])
@login_required
def create_session():
    data = request.get_json() or {}

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

    parent = None
    continued_raw = data.get("continued_from_session_id")
    if continued_raw is not None:
        try:
            parent = db.session.get(StudySession, int(continued_raw))
        except (TypeError, ValueError):
            parent = None
        if not parent or parent.user_id != current_user.id:
            return jsonify({"success": False, "message": "Invalid continuation session."}), 400
        if parent.status != "active":
            return jsonify({"success": False, "message": "That session is no longer active."}), 400
        if parent.continued_as_session_id:
            return jsonify({"success": False, "message": "That session already has a new timer continuation."}), 400
        duration = max(1, duration)

    acc_val = None
    if "accumulated_seconds" in data:
        try:
            acc_val = max(0, int(data["accumulated_seconds"]))
        except (TypeError, ValueError):
            acc_val = None

    named_checklist = [item for item in checklist if (item.get("title") or "").strip()]
    all_tasks_done = len(named_checklist) > 0 and all(
        bool(item.get("completed", False)) for item in named_checklist
    )
    session_status = "completed" if all_tasks_done else "active"

    session = StudySession(
        user_id=current_user.id,
        subject=name,
        start_time=datetime.fromisoformat(start_iso),
        duration_minutes=max(1, duration),
        notes=notes,
        color=color,
        timer_mode=timer_mode,
        unit_id=int(unit_id) if unit_id else None,
        status=session_status,
        accumulated_seconds=acc_val,
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

    if parent:
        parent.continued_as_session_id = session.id

    _append_study_segment_from_payload(session, data)

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

    for other in StudySession.query.filter_by(continued_as_session_id=session_id).all():
        other.continued_as_session_id = None

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

