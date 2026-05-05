from datetime import datetime, timedelta
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from models import StudySession, Task, Semester
from app import db
import re

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/api/dashboard/get_today_tasks/<today>", methods=["GET"])
@login_required
def get_today_tasks(today):

    if re.match(r"^\d{4}-\d{2}-\d{2}$", str(today)) is None:
        return jsonify({"success": False, "message": "Date must be in YYYY-MM-DD format."}), 400
    
    today = today + "T00:00"
    today = datetime.strptime(today, '%Y-%m-%dT%H:%M')
    
    tasks = Task.query.filter(Task.due_date >= today,
                              Task.due_date < today + timedelta(days=1),
                               Task.user_id == current_user.id).all()
    return jsonify([task.to_dict() for task in tasks])

@dashboard_bp.route("/api/dashboard/get_current_semester", methods=["GET"])
@login_required
def get_current_semester():

    semesters = Semester.query.filter(Semester.user_id == current_user.id).order_by(Semester.start_date.desc()).all()
    
    for semester in semesters:
        if semester.is_current:
            return jsonify({"semester": semester.to_dict()}), 200

    if semesters:
        return jsonify({"semester": semesters[0].to_dict()}), 200

    return jsonify({"semester": None}), 200
