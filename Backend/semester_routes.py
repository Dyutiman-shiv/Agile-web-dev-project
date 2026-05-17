from datetime import date
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from models import Semester
from app import db

semester_bp = Blueprint("semesters", __name__)


@semester_bp.route("/api/semesters")
@login_required
def list_semesters():
    semesters = (
        Semester.query
        .filter_by(user_id=current_user.id)
        .order_by(Semester.start_date)
        .all()
    )
    return jsonify([s.to_dict() for s in semesters])


@semester_bp.route("/api/semesters/current")
@login_required
def current_semester():
    today = date.today()
    sem = (
        Semester.query
        .filter(
            Semester.user_id == current_user.id,
            Semester.start_date <= today,
            Semester.end_date >= today,
        )
        .first()
    )
    if not sem:
        return jsonify(None)
    return jsonify(sem.to_dict())


@semester_bp.route("/api/semesters", methods=["POST"])
@login_required
def create_semester():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    start = data.get("start_date")
    end = data.get("end_date")

    if not name or not start or not end:
        return jsonify({"success": False, "message": "Name, start date and end date are required."}), 400

    try:
        start_date = date.fromisoformat(start)
        end_date = date.fromisoformat(end)
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid date format."}), 400

    if end_date <= start_date:
        return jsonify({"success": False, "message": "End date must be after start date."}), 400

    sem = Semester(
        user_id=current_user.id,
        name=name,
        start_date=start_date,
        end_date=end_date,
    )
    db.session.add(sem)
    db.session.commit()
    return jsonify({"success": True, "semester": sem.to_dict()}), 201


@semester_bp.route("/api/semesters/<int:sem_id>", methods=["PUT"])
@login_required
def update_semester(sem_id):
    sem = db.session.get(Semester, sem_id)
    if not sem or sem.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"success": False, "message": "Name cannot be empty."}), 400
        sem.name = name
    if "start_date" in data:
        try:
            sem.start_date = date.fromisoformat(data["start_date"])
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": "Invalid start date."}), 400
    if "end_date" in data:
        try:
            sem.end_date = date.fromisoformat(data["end_date"])
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": "Invalid end date."}), 400

    if sem.end_date <= sem.start_date:
        return jsonify({"success": False, "message": "End date must be after start date."}), 400
    
    if "wam" in data:
        try:
            sem.wam = float(data["wam"]) if data["wam"] is not None else None
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": "Invalid WAM value."}), 400

    db.session.commit()
    return jsonify({"success": True, "semester": sem.to_dict()})


@semester_bp.route("/api/semesters/<int:sem_id>", methods=["DELETE"])
@login_required
def delete_semester(sem_id):
    sem = db.session.get(Semester, sem_id)
    if not sem or sem.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404
    db.session.delete(sem)
    db.session.commit()
    return jsonify({"success": True, "message": "Semester deleted."})


# ---------- Onboarding ----------
@semester_bp.route("/setup/semesters")
@login_required
def semester_setup_view():
    return render_template("semester_setup.html")


@semester_bp.route("/api/setup/semesters", methods=["POST"])
@login_required
def bulk_create_semesters():
    data = request.get_json(silent=True) or {}
    semesters = data if isinstance(data, list) else data.get("semesters", [])
    created = []

    for item in semesters:
        name = (item.get("name") or "").strip()
        start = item.get("start_date")
        end = item.get("end_date")
        if not name or not start or not end:
            continue
        try:
            start_date = date.fromisoformat(start)
            end_date = date.fromisoformat(end)
        except (ValueError, TypeError):
            continue
        if end_date <= start_date:
            continue
        sem = Semester(
            user_id=current_user.id,
            name=name,
            start_date=start_date,
            end_date=end_date,
        )
        db.session.add(sem)
        created.append(sem)

    db.session.commit()
    return jsonify({"success": True, "count": len(created)}), 201


# ---------- Academic Settings Page ----------
@semester_bp.route("/settings/academic")
@login_required
def academic_settings_view():
    return render_template("academic_settings.html")
