from datetime import datetime
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from models import StudySession, Task
from app import db

cal_bp = Blueprint("cal", __name__)


@cal_bp.route("/calendar")
@login_required
def calendar_view():
    return render_template("calendar.html")


@cal_bp.route("/api/events")
@login_required
def get_events():
    start = request.args.get("start")
    end = request.args.get("end")

    if not start or not end:
        return jsonify({"success": False, "message": "start and end required"}), 400

    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)

    sessions = StudySession.query.filter(
        StudySession.user_id == current_user.id,
        StudySession.start_time >= start_dt,
        StudySession.start_time < end_dt,
    ).all()

    tasks = Task.query.filter(
        Task.user_id == current_user.id,
        Task.due_date >= start_dt,
        Task.due_date < end_dt,
    ).all()

    events = [s.to_dict() for s in sessions] + [t.to_dict() for t in tasks]
    return jsonify(events)


@cal_bp.route("/api/events", methods=["POST"])
@login_required
def create_event():
    data = request.get_json()
    event_type = data.get("type", "session")

    if event_type == "session":
        if not data.get("title") or not data.get("start"):
            return jsonify({"success": False, "message": "Subject and start time required."}), 400
        event = StudySession(
            user_id=current_user.id,
            subject=data["title"],
            start_time=datetime.fromisoformat(data["start"]),
            duration_minutes=int(data.get("duration", 60)),
            notes=data.get("notes", ""),
            color=data.get("color", "#6366f1"),
        )
    elif event_type == "task":
        if not data.get("title") or not data.get("start"):
            return jsonify({"success": False, "message": "Title and due date required."}), 400
        event = Task(
            user_id=current_user.id,
            title=data["title"],
            due_date=datetime.fromisoformat(data["start"]),
            description=data.get("description", ""),
            completed=bool(data.get("completed", False)),
        )
    else:
        return jsonify({"success": False, "message": "Invalid event type."}), 400

    db.session.add(event)
    db.session.commit()
    return jsonify({"success": True, "event": event.to_dict()}), 201


@cal_bp.route("/api/events/<int:event_id>", methods=["PUT"])
@login_required
def update_event(event_id):
    data = request.get_json()
    event_type = data.get("type", "session")

    if event_type == "session":
        event = db.session.get(StudySession, event_id)
        if not event or event.user_id != current_user.id:
            return jsonify({"success": False, "message": "Not found."}), 404
        if data.get("title"):
            event.subject = data["title"]
        if data.get("start"):
            event.start_time = datetime.fromisoformat(data["start"])
        if "duration" in data:
            event.duration_minutes = int(data["duration"])
        if "notes" in data:
            event.notes = data["notes"]
        if "color" in data:
            event.color = data["color"]
    elif event_type == "task":
        event = db.session.get(Task, event_id)
        if not event or event.user_id != current_user.id:
            return jsonify({"success": False, "message": "Not found."}), 404
        if data.get("title"):
            event.title = data["title"]
        if data.get("start"):
            event.due_date = datetime.fromisoformat(data["start"])
        if "description" in data:
            event.description = data["description"]
        if "completed" in data:
            event.completed = bool(data["completed"])
    else:
        return jsonify({"success": False, "message": "Invalid type."}), 400

    db.session.commit()
    return jsonify({"success": True, "event": event.to_dict()})


@cal_bp.route("/api/events/<int:event_id>", methods=["DELETE"])
@login_required
def delete_event(event_id):
    event_type = request.args.get("type", "session")

    if event_type == "session":
        event = db.session.get(StudySession, event_id)
    elif event_type == "task":
        event = db.session.get(Task, event_id)
    else:
        return jsonify({"success": False, "message": "Invalid type."}), 400

    if not event or event.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    db.session.delete(event)
    db.session.commit()
    return jsonify({"success": True, "message": "Deleted."})
