from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import Task, Semester, Post, StudySession
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
    
    tasks_dict = [task.to_dict() for task in tasks]
    
    sorted_tasks = sorted(tasks_dict, key=lambda x: x['start'], reverse=False)
    return jsonify(sorted_tasks), 200

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


@dashboard_bp.route("/api/dashboard/feed", methods=["GET"])
@login_required
def get_dashboard_feed():

    user_group_ids = [group.group_id for group in current_user.group_memberships]
    
    if not user_group_ids:
        return jsonify([]), 200


    feed_posts = Post.query.filter(Post.group_id.in_(user_group_ids))\
                           .order_by(Post.created_at.desc())\
                           .limit(20)\
                           .all()
    
    if feed_posts:
        print(f'Some posts: {feed_posts[0].to_dict()}')
    return jsonify([post.to_dict() for post in feed_posts]), 200


@dashboard_bp.route("/api/dashboard/active-session", methods=["GET"])
@login_required
def get_active_session():
    active_session = StudySession.query.filter_by(
        user_id=current_user.id, 
        status="active"
    ).all()
    
    if not active_session:
        return jsonify(None), 200
    
    sorted_sessions = sorted(active_session, key=lambda x: x.updated_at, reverse=True)
    active_session = sorted_sessions[0] # Get the most recent active session
        
    return jsonify(active_session.to_dict()), 200


