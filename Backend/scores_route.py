"""
Assessment scores API.

All endpoints are authenticated and scoped to the current user via the
parent Unit's `user_id`. Uses SQLAlchemy throughout — no raw sqlite3 —
so the ORM identity map, migrations, and tests stay consistent.
"""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import Assessment, Unit
from app import db

scores_bp = Blueprint("scores", __name__)


def _user_unit_or_none(unit_id):
    """Return the Unit if it exists AND belongs to current_user, else None."""
    if unit_id is None:
        return None
    try:
        unit_id = int(unit_id)
    except (TypeError, ValueError):
        return None
    unit = db.session.get(Unit, unit_id)
    if not unit or unit.user_id != current_user.id:
        return None
    return unit


def _user_assessment_or_none(assessment_id):
    """Return the Assessment if its parent Unit belongs to current_user, else None."""
    assessment = db.session.get(Assessment, assessment_id)
    if not assessment:
        return None
    unit = db.session.get(Unit, assessment.unit_id)
    if not unit or unit.user_id != current_user.id:
        return None
    return assessment


def _serialize(a: Assessment) -> dict:
    return {
        "id": a.id,
        "unit_id": a.unit_id,
        "name": a.name or "",
        "score": a.score if a.score is not None else 0,
        "weight": a.weight if a.weight is not None else 0,
    }


@scores_bp.route("/api/scores/<int:semester_id>", methods=["GET"])
@login_required
def get_scores(semester_id):
    """List all assessments under the current user's units for a semester."""
    assessments = (
        Assessment.query
        .join(Unit, Assessment.unit_id == Unit.id)
        .filter(Unit.user_id == current_user.id, Unit.semester_id == semester_id)
        .all()
    )
    return jsonify([_serialize(a) for a in assessments])


@scores_bp.route("/api/scores", methods=["POST"])
@login_required
def create_score():
    data = request.get_json(silent=True) or {}

    unit = _user_unit_or_none(data.get("unit_id"))
    if not unit:
        return jsonify({"success": False, "message": "Unit not found."}), 404

    assessment = Assessment(
        unit_id=unit.id,
        name=(data.get("name") or "Assessment"),
        score=float(data.get("score") or 0),
        weight=float(data.get("weight") or 0),
    )
    db.session.add(assessment)
    db.session.commit()
    return jsonify(_serialize(assessment)), 201


@scores_bp.route("/api/scores/<int:assessment_id>", methods=["PUT"])
@login_required
def update_score(assessment_id):
    assessment = _user_assessment_or_none(assessment_id)
    if not assessment:
        return jsonify({"success": False, "message": "Not found."}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        assessment.name = data["name"] or ""
    if "score" in data:
        try:
            assessment.score = float(data["score"]) if data["score"] is not None else 0
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "Score must be a number."}), 400
    if "weight" in data:
        try:
            assessment.weight = float(data["weight"]) if data["weight"] is not None else 0
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "Weight must be a number."}), 400

    db.session.commit()
    return jsonify({"success": True, "assessment": _serialize(assessment)})


@scores_bp.route("/api/scores/<int:assessment_id>", methods=["DELETE"])
@login_required
def delete_score(assessment_id):
    assessment = _user_assessment_or_none(assessment_id)
    if not assessment:
        return jsonify({"success": False, "message": "Not found."}), 404

    db.session.delete(assessment)
    db.session.commit()
    return jsonify({"success": True, "message": "Assessment deleted."})
