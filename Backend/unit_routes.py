from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from models import Unit, StudySession
from app import db
from sqlalchemy import func

unit_bp = Blueprint("units", __name__)


@unit_bp.route("/units")
@login_required
def units_view():
    return render_template("units.html")


@unit_bp.route("/api/units")
@login_required
def list_units():
    q = Unit.query.filter_by(user_id=current_user.id)

    semester_id = request.args.get("semester_id", type=int)
    if semester_id:
        q = q.filter_by(semester_id=semester_id)

    archived = request.args.get("archived")
    if archived == "false":
        q = q.filter_by(archived=False)
    elif archived == "true":
        q = q.filter_by(archived=True)

    units = q.order_by(Unit.name).all()
    print([u.to_dict() for u in units])
    return jsonify([u.to_dict() for u in units])


@unit_bp.route("/api/units", methods=["POST"])
@login_required
def create_unit():
    data = request.get_json()
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Unit name is required."}), 400

    code = (data.get("code") or "").strip() or None
    color = (data.get("color") or "#6366f1").strip()
    semester_id = data.get("semester_id")
    
    if data.get("credits") is not None:
        try:
            unit_credits = int(data["credits"])
            if unit_credits < 0:
                raise ValueError
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": "Number of credits must be a non-negative integer."}), 400
    else:
        unit_credits = 6

    print(unit_credits)

    unit = Unit(
        user_id=current_user.id,
        name=name,
        code=code,
        color=color,
        number_credits=unit_credits,
        semester_id=semester_id if semester_id else None
    )
    db.session.add(unit)
    db.session.commit()
    return jsonify({"success": True, "unit": unit.to_dict()}), 201


@unit_bp.route("/api/units/<int:unit_id>", methods=["PUT"])
@login_required
def update_unit(unit_id):
    unit = db.session.get(Unit, unit_id)
    if not unit or unit.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    data = request.get_json()
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"success": False, "message": "Name cannot be empty."}), 400
        unit.name = name
    if "code" in data:
        unit.code = (data["code"] or "").strip() or None
    if "credits" in data:
        unit.number_credits = data["credits"] if isinstance(data["credits"], int) and data["credits"] >= 0 else unit.number_credits
    if "color" in data:
        unit.color = (data["color"] or "#6366f1").strip()
    if "semester_id" in data:
        unit.semester_id = data["semester_id"] if data["semester_id"] else None
    if "archived" in data:
        unit.archived = bool(data["archived"])
    print(unit.to_dict())
    db.session.commit()
    return jsonify({"success": True, "unit": unit.to_dict()})


@unit_bp.route("/api/units/<int:unit_id>", methods=["DELETE"])
@login_required
def delete_unit(unit_id):
    unit = db.session.get(Unit, unit_id)
    if not unit or unit.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    # Nullify references instead of cascading
    StudySession.query.filter_by(user_id=current_user.id, unit_id=unit_id).update({"unit_id": None})

    from models import Task
    Task.query.filter_by(user_id=current_user.id, unit_id=unit_id).update({"unit_id": None})

    db.session.delete(unit)
    db.session.commit()
    return jsonify({"success": True, "message": "Unit deleted."})


@unit_bp.route("/api/units/<int:unit_id>/stats")
@login_required
def unit_stats(unit_id):
    unit = db.session.get(Unit, unit_id)
    if not unit or unit.user_id != current_user.id:
        return jsonify({"success": False, "message": "Not found."}), 404

    sessions = StudySession.query.filter_by(user_id=current_user.id, unit_id=unit_id).all()
    total_minutes = sum(s.duration_minutes for s in sessions)
    count = len(sessions)
    avg = round(total_minutes / count) if count else 0

    return jsonify({
        "unit_id": unit_id,
        "total_hours": round(total_minutes / 60, 1),
        "session_count": count,
        "avg_minutes": avg,
    })
