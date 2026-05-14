from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import StudySession, Task, Unit, Semester
from app import db
from sqlalchemy import func

stats_bp = Blueprint("stats", __name__)


def _get_date_range(args):
    """Return (start_dt, end_dt) based on period query param."""
    period = args.get("period", "all")
    today = date.today()

    if period == "week":
        start = today - timedelta(days=today.weekday())  # Monday
        end = start + timedelta(days=7)
    elif period == "month":
        start = today.replace(day=1)
        if today.month == 12:
            end = today.replace(year=today.year + 1, month=1, day=1)
        else:
            end = today.replace(month=today.month + 1, day=1)
    elif period == "semester":
        sem_id = args.get("semester_id", type=int)
        if sem_id:
            sem = db.session.get(Semester, sem_id)
            if sem and sem.user_id == current_user.id:
                return datetime.combine(sem.start_date, datetime.min.time()), datetime.combine(sem.end_date + timedelta(days=1), datetime.min.time())
        # Fallback: find current semester
        sem = Semester.query.filter(
            Semester.user_id == current_user.id,
            Semester.start_date <= today,
            Semester.end_date >= today,
        ).first()
        if sem:
            return datetime.combine(sem.start_date, datetime.min.time()), datetime.combine(sem.end_date + timedelta(days=1), datetime.min.time())
        # No current semester → fall back to all
        return None, None
    else:
        return None, None

    return datetime.combine(start, datetime.min.time()), datetime.combine(end, datetime.min.time())


def _base_query(args):
    """Return a filtered query on StudySession for the current user + date range."""
    q = StudySession.query.filter_by(user_id=current_user.id)
    start_dt, end_dt = _get_date_range(args)
    if start_dt:
        q = q.filter(StudySession.start_time >= start_dt)
    if end_dt:
        q = q.filter(StudySession.start_time < end_dt)
    return q


@stats_bp.route("/api/stats/summary")
@login_required
def stats_summary():
    sessions = _base_query(request.args).order_by(StudySession.start_time).all()

    total_minutes = sum(s.duration_minutes for s in sessions)
    count = len(sessions)
    avg = round(total_minutes / count) if count else 0

    # Streak calculation
    if not sessions:
        current_streak = 0
        longest_streak = 0
    else:
        session_days = sorted(set(s.start_time.date() for s in sessions))
        current_streak = 1
        longest_streak = 1
        streak = 1
        for i in range(1, len(session_days)):
            if (session_days[i] - session_days[i - 1]).days == 1:
                streak += 1
                longest_streak = max(longest_streak, streak)
            else:
                streak = 1
        longest_streak = max(longest_streak, streak)

        # Current streak (must include today or yesterday)
        today = date.today()
        if session_days[-1] < today - timedelta(days=1):
            current_streak = 0
        else:
            current_streak = 1
            for i in range(len(session_days) - 2, -1, -1):
                if (session_days[i + 1] - session_days[i]).days == 1:
                    current_streak += 1
                else:
                    break

    return jsonify({
        "total_hours": round(total_minutes / 60, 1),
        "session_count": count,
        "avg_minutes": avg,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
    })


@stats_bp.route("/api/stats/hours-by-unit")
@login_required
def hours_by_unit():
    sessions = _base_query(request.args).all()
    unit_map = {}  # unit_id -> {name, code, color, minutes}

    for s in sessions:
        uid = s.unit_id or 0
        if uid not in unit_map:
            if s.unit:
                unit_map[uid] = {"name": s.unit.name, "code": s.unit.code or "", "color": s.unit.color, "minutes": 0}
            else:
                unit_map[uid] = {"name": "Uncategorized", "code": "", "color": "#9ca3af", "minutes": 0}
        unit_map[uid]["minutes"] += s.duration_minutes

    result = []
    for uid, data in unit_map.items():
        result.append({
            "unit_id": uid if uid else None,
            "name": data["name"],
            "code": data["code"],
            "color": data["color"],
            "hours": round(data["minutes"] / 60, 1),
        })
    result.sort(key=lambda x: x["hours"], reverse=True)
    return jsonify(result)


@stats_bp.route("/api/stats/daily-trend")
@login_required
def daily_trend():
    sessions = _base_query(request.args).order_by(StudySession.start_time).all()
    day_map = {}  # "YYYY-MM-DD" -> minutes

    for s in sessions:
        key = s.start_time.date().isoformat()
        day_map[key] = day_map.get(key, 0) + s.duration_minutes

    result = [{"date": k, "hours": round(v / 60, 2)} for k, v in sorted(day_map.items())]
    return jsonify(result)


@stats_bp.route("/api/stats/hourly-heatmap")
@login_required
def hourly_heatmap():
    sessions = _base_query(request.args).all()
    # 7 days × 24 hours grid
    grid = [[0] * 24 for _ in range(7)]

    for s in sessions:
        dow = s.start_time.weekday()  # 0=Mon
        hour = s.start_time.hour
        grid[dow][hour] += s.duration_minutes

    # Flat rows {day, hour, minutes} with day 0=Mon — matches Frontend/static/js/stats.js loadHeatmap
    result = []
    for d in range(7):
        for h in range(24):
            minutes = grid[d][h]
            if minutes:
                result.append({"day": d, "hour": h, "minutes": int(minutes)})
    return jsonify(result)


@stats_bp.route("/api/stats/task-completion")
@login_required
def task_completion():
    q = Task.query.filter_by(user_id=current_user.id)
    start_dt, end_dt = _get_date_range(request.args)
    if start_dt:
        q = q.filter(Task.due_date >= start_dt)
    if end_dt:
        q = q.filter(Task.due_date < end_dt)

    tasks = q.all()
    unit_map = {}

    for t in tasks:
        uid = t.unit_id or 0
        if uid not in unit_map:
            name = t.unit.name if t.unit else "Uncategorized"
            unit_map[uid] = {"name": name, "total": 0, "completed": 0}
        unit_map[uid]["total"] += 1
        if t.completed:
            unit_map[uid]["completed"] += 1

    result = [{"unit_id": uid if uid else None, "name": d["name"], "total": d["total"], "completed": d["completed"]} for uid, d in unit_map.items()]
    result.sort(key=lambda x: x["total"], reverse=True)
    return jsonify(result)
