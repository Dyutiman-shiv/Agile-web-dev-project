from datetime import datetime, timedelta, date, timezone
import calendar
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import exists
from sqlalchemy.orm import joinedload
from models import StudySession, Task, ICalCalendar, StudySessionSegment
from app import db
from utils import parse_client_datetime

cal_bp = Blueprint("cal", __name__)


@cal_bp.route("/calendar")
@login_required
def calendar_view():
    return render_template("calendar.html")


def parse_repeat_until(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None

def to_naive_utc(dt):
    """Match SQLite naive datetimes: clients may send offset-aware ISO strings."""
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return dt
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def validate_repeat_dates(repeat_type, repeat_until, start_dt):
    if repeat_type != "none":
        if not repeat_until:
            return "Please choose a repeat until date."
        if repeat_until < start_dt.date():
            return "Repeat until date cannot be before the start date."
    return None
    
def add_repeat_occurrences(event, start_dt, end_dt, date_attr):
    repeat_type = getattr(event, "repeat_type", "none") or "none"
    original_dt = to_naive_utc(getattr(event, date_attr))
    repeat_until = getattr(event, "repeat_until", None)

    if original_dt is None:
        return []

    if repeat_type == "none":
        if start_dt <= original_dt < end_dt:
            return [event.to_dict()]
        return []

    occurrences = []
    current_dt = original_dt

    while current_dt < start_dt:
        if repeat_type == "daily":
            current_dt = current_dt + timedelta(days=1)
        elif repeat_type == "weekly":
            current_dt = current_dt + timedelta(weeks=1)
        elif repeat_type == "monthly":
            month = current_dt.month + 1
            year = current_dt.year
            if month > 12:
                month = 1
                year += 1

            last_day = calendar.monthrange(year, month)[1]
            day = min(original_dt.day, last_day)
            current_dt = current_dt.replace(year=year, month=month, day=day)
        else:
            break

    while current_dt < end_dt:
        if repeat_until and current_dt.date() > repeat_until:
             break
        
        item = event.to_dict()

        if item["type"] == "session":
            item["start"] = current_dt.isoformat()
        else:
            item["start"] = current_dt.isoformat()

        item["id"] = f"{item['id']}-{current_dt.date().isoformat()}"
        item["original_id"] = event.id
        item["original_start"] = original_dt.isoformat()
        item["is_repeated_occurrence"] = True

        occurrences.append(item)

        if repeat_type == "daily":
            current_dt = current_dt + timedelta(days=1)
        elif repeat_type == "weekly":
            current_dt = current_dt + timedelta(weeks=1)
        elif repeat_type == "monthly":
            month = current_dt.month + 1
            year = current_dt.year
            if month > 12:
                month = 1
                year += 1

            last_day = calendar.monthrange(year, month)[1]
            day = min(original_dt.day, last_day)
            current_dt = current_dt.replace(year=year, month=month, day=day)
        else:
            break

    return occurrences

@cal_bp.route("/api/events")
@login_required
def get_events():
    start = request.args.get("start")
    end = request.args.get("end")

    if not start or not end:
        return jsonify({"success": False, "message": "start and end required"}), 400

    start_dt = to_naive_utc(parse_client_datetime(start))
    end_dt = to_naive_utc(parse_client_datetime(end))
    if not start_dt or not end_dt:
        return jsonify({"success": False, "message": "Invalid start/end format."}), 400

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
        Task.due_date < end_dt,
    ).all()

    events = []
    for session in sessions:
        events.extend(add_repeat_occurrences(session, start_dt, end_dt, "start_time"))

    events.extend(seg.to_calendar_dict() for seg in segments)

    for task in tasks:
        events.extend(add_repeat_occurrences(task, start_dt, end_dt, "due_date"))

    return jsonify(events)


@cal_bp.route("/api/events", methods=["POST"])
@login_required
def create_event():
    data = request.get_json(silent=True) or {}
    event_type = data.get("type", "session")
    repeat_type = data.get("repeat_type", "none")
    repeat_until = parse_repeat_until(data.get("repeat_until"))

    start_dt = parse_client_datetime(data.get("start"))
    if data.get("start") and not start_dt:
        return jsonify({"success": False, "message": "Invalid start time format."}), 400
    if start_dt:
        repeat_error = validate_repeat_dates(repeat_type, repeat_until, start_dt)
        if repeat_error:
            return jsonify({"success": False, "message": repeat_error}), 400

    if event_type == "session":
        if not data.get("title") or not start_dt:
            return jsonify({"success": False, "message": "Subject and start time required."}), 400
        unit_id = data.get("unit_id")
        event = StudySession(
            user_id=current_user.id,
            subject=data["title"],
            start_time=start_dt,
            duration_minutes=int(data.get("duration", 60)),
            notes=data.get("notes", ""),
            color=data.get("color", "#6366f1"),
            unit_id=int(unit_id) if unit_id else None,
            repeat_type=repeat_type,
            repeat_until=repeat_until,
        )
    elif event_type == "task":
        if not data.get("title") or not start_dt:
            return jsonify({"success": False, "message": "Title and due date required."}), 400
        event = Task(
            user_id=current_user.id,
            title=data["title"],
            due_date=start_dt,
            description=data.get("description", ""),
            duration_minutes=int(data.get("duration", 30)),
            color=data.get("color", "#f59e0b"),
            completed=bool(data.get("completed", False)),
            repeat_type=repeat_type,
            repeat_until=repeat_until,
        )
    else:
        return jsonify({"success": False, "message": "Invalid event type."}), 400

    db.session.add(event)
    db.session.commit()
    return jsonify({"success": True, "event": event.to_dict()}), 201


@cal_bp.route("/api/events/<int:event_id>", methods=["PUT"])
@login_required
def update_event(event_id):
    data = request.get_json(silent=True) or {}
    event_type = data.get("type", "session")
    repeat_type = data.get("repeat_type", "none")
    repeat_until = parse_repeat_until(data.get("repeat_until"))

    new_start = parse_client_datetime(data.get("start")) if data.get("start") else None
    if data.get("start") and not new_start:
        return jsonify({"success": False, "message": "Invalid start time format."}), 400

    if event_type == "session":
        event = db.session.get(StudySession, event_id)
        if not event or event.user_id != current_user.id:
            return jsonify({"success": False, "message": "Not found."}), 404
        anchor = new_start or event.start_time
        repeat_error = validate_repeat_dates(repeat_type, repeat_until, anchor)
        if repeat_error:
            return jsonify({"success": False, "message": repeat_error}), 400
        if data.get("title"):
            event.subject = data["title"]
        if new_start:
            event.start_time = new_start
        if "duration" in data:
            event.duration_minutes = int(data["duration"])
        if "notes" in data:
            event.notes = data["notes"]
        if "color" in data:
            event.color = data["color"]
        if "unit_id" in data:
            event.unit_id = int(data["unit_id"]) if data["unit_id"] else None
        if "repeat_type" in data:
            event.repeat_type = data["repeat_type"]
        if "repeat_until" in data:
            event.repeat_until = parse_repeat_until(data["repeat_until"])
    elif event_type == "task":
        event = db.session.get(Task, event_id)
        if not event or event.user_id != current_user.id:
            return jsonify({"success": False, "message": "Not found."}), 404
        anchor = new_start or event.due_date
        repeat_error = validate_repeat_dates(repeat_type, repeat_until, anchor)
        if repeat_error:
            return jsonify({"success": False, "message": repeat_error}), 400
        if data.get("title"):
            event.title = data["title"]
        if new_start:
            event.due_date = new_start
        if "description" in data:
            event.description = data["description"]
        if "completed" in data:
            event.completed = bool(data["completed"])
        if "duration" in data:
            event.duration_minutes = int(data["duration"])
        if "color" in data:
            event.color = data["color"]
        if "repeat_type" in data:
            event.repeat_type = data["repeat_type"]
        if "repeat_until" in data:
            event.repeat_until = parse_repeat_until(data["repeat_until"])
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
    data = request.get_json(silent=True) or []
    if not isinstance(data, list):
        return jsonify({"success": False, "message": "Expected a list of events."}), 400

    created = []

    for item in data:
        if not isinstance(item, dict) or not item.get("title") or not item.get("start"):
            continue

        start_time = parse_client_datetime(item["start"])
        if not start_time:
            continue

        existing = Task.query.filter_by(
            user_id=current_user.id,
            title=item["title"],
            due_date=start_time,
        ).first()

        if existing:
            continue

        event = Task(
            user_id=current_user.id,
            title=item["title"],
            due_date=start_time,
            description="Imported from iCal",
            completed=False,
        )

        db.session.add(event)
        created.append(event)

    db.session.commit()

    return jsonify({"success": True, "count": len(created)})


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
    data = request.get_json(silent=True) or {}
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

    data = request.get_json(silent=True) or {}
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
