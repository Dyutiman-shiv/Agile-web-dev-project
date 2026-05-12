from datetime import datetime
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import exists
from sqlalchemy.orm import joinedload
from models import StudySession, Task, ICalCalendar, StudySessionSegment
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

    has_segments = exists().where(StudySessionSegment.session_id == StudySession.id)

    sessions = (
        StudySession.query.filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= start_dt,
            StudySession.start_time < end_dt,
            ~has_segments,
        ).all()
    )

    segments = (
        StudySessionSegment.query.options(
            joinedload(StudySessionSegment.session).joinedload(StudySession.unit)
        )
        .join(StudySession, StudySessionSegment.session_id == StudySession.id)
        .filter(StudySession.user_id == current_user.id)
        .filter(StudySessionSegment.segment_start < end_dt)
        .filter(StudySessionSegment.segment_end > start_dt)
        .all()
    )

    tasks = Task.query.filter(
        Task.user_id == current_user.id,
        Task.due_date >= start_dt,
        Task.due_date < end_dt,
    ).all()

    events = (
        [s.to_dict() for s in sessions]
        + [seg.to_calendar_dict() for seg in segments]
        + [t.to_dict() for t in tasks]
    )
    return jsonify(events)


@cal_bp.route("/api/events", methods=["POST"])
@login_required
def create_event():
    data = request.get_json()
    event_type = data.get("type", "session")

    if event_type == "session":
        if not data.get("title") or not data.get("start"):
            return jsonify({"success": False, "message": "Subject and start time required."}), 400
        unit_id = data.get("unit_id")
        event = StudySession(
            user_id=current_user.id,
            subject=data["title"],
            start_time=datetime.fromisoformat(data["start"]),
            duration_minutes=int(data.get("duration", 60)),
            notes=data.get("notes", ""),
            color=data.get("color", "#6366f1"),
            unit_id=int(unit_id) if unit_id else None,
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
        if "unit_id" in data:
            event.unit_id = int(data["unit_id"]) if data["unit_id"] else None
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

@cal_bp.route("/api/events/bulk", methods=["POST"])
@login_required
def bulk_add_events():
    data = request.get_json()

    created = []

    for item in data:
        if not item.get("title") or not item.get("start"):
            continue

        start_time = datetime.fromisoformat(item["start"])
        
        existing = Task.query.filter_by(
            user_id=current_user.id,
            title=item["title"],
            due_date=start_time
            ).first()

        if existing:
            continue

        event = Task(
            user_id=current_user.id,
            title=item["title"],
            due_date=datetime.fromisoformat(item["start"]),
            description="Imported from iCal",
            completed=False,
        )

        db.session.add(event)
        created.append(event)

    db.session.commit()

    return jsonify({
        "success": True,
        "count": len(created)
    })


# ---------- Calendar Settings Page ----------
@cal_bp.route("/calendar/settings")
@login_required
def calendar_settings_view():
    return render_template("calendar_settings.html")


# ---------- iCal Calendar CRUD ----------
@cal_bp.route("/api/ical-calendars")
@login_required
def list_ical_calendars():
    cals = ICalCalendar.query.filter_by(user_id=current_user.id).all()
    return jsonify([c.to_dict() for c in cals])


@cal_bp.route("/api/ical-calendars", methods=["POST"])
@login_required
def create_ical_calendar():
    data = request.get_json()
    name = (data.get("name") or "").strip()
    url = (data.get("url") or "").strip()
    color = (data.get("color") or "#3b82f6").strip()

    if not name or not url:
        return jsonify({"success": False, "message": "Name and URL are required."}), 400
    if len(name) > 120 or len(url) > 512:
        return jsonify({"success": False, "message": "Name or URL too long."}), 400

    cal = ICalCalendar(user_id=current_user.id, name=name, url=url, color=color)
    db.session.add(cal)
    db.session.commit()
    return jsonify({"success": True, "calendar": cal.to_dict()}), 201


@cal_bp.route("/api/ical-calendars/<int:cal_id>", methods=["PUT"])
@login_required
def update_ical_calendar(cal_id):
    cal = db.session.get(ICalCalendar, cal_id)
    if not cal or cal.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    data = request.get_json()
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"success": False, "message": "Name cannot be empty."}), 400
        cal.name = name
    if "url" in data:
        url = (data["url"] or "").strip()
        if not url:
            return jsonify({"success": False, "message": "URL cannot be empty."}), 400
        cal.url = url
    if "color" in data:
        cal.color = (data["color"] or "#3b82f6").strip()
    if "visible" in data:
        cal.visible = bool(data["visible"])

    db.session.commit()
    return jsonify({"success": True, "calendar": cal.to_dict()})


@cal_bp.route("/api/ical-calendars/<int:cal_id>", methods=["DELETE"])
@login_required
def delete_ical_calendar(cal_id):
    cal = db.session.get(ICalCalendar, cal_id)
    if not cal or cal.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    db.session.delete(cal)
    db.session.commit()
    return jsonify({"success": True, "message": "Calendar deleted."})
