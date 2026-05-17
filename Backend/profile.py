import os
import uuid
from flask import Blueprint, render_template, request, jsonify, current_app, url_for
from flask_login import login_required, current_user, logout_user
from werkzeug.utils import secure_filename
from models import User
from app import db
from utils import allowed_file

profile_bp = Blueprint("profile", __name__)


@profile_bp.route("/profile")
@login_required
def profile_view():
    return render_template("profile.html")


@profile_bp.route("/profile/update", methods=["POST"])
@login_required
def profile_update():
    username = request.form.get("username", "").strip()
    errors = []

    if username and username != current_user.username:
        if len(username) < 3:
            errors.append("Username must be at least 3 characters.")
        elif User.query.filter(User.username == username, User.id != current_user.id).first():
            errors.append("This username is already taken.")
        else:
            current_user.username = username

    # Handle profile picture upload
    if "profile_picture" in request.files:
        file = request.files["profile_picture"]
        if file and file.filename:
            if not allowed_file(file.filename):
                errors.append("Invalid file type. Use png, jpg, gif, or webp.")
            else:
                upload_folder = current_app.config["UPLOAD_FOLDER"]
                os.makedirs(upload_folder, exist_ok=True)

                # Delete old uploaded picture if it was a local file
                if current_user.profile_picture and current_user.profile_picture.startswith("/static/uploads/"):
                    old_path = os.path.join(upload_folder, os.path.basename(current_user.profile_picture))
                    if os.path.exists(old_path):
                        os.remove(old_path)

                ext = secure_filename(file.filename).rsplit(".", 1)[1].lower()
                filename = f"{uuid.uuid4().hex}.{ext}"
                file.save(os.path.join(upload_folder, filename))
                current_user.profile_picture = url_for("static", filename=f"uploads/{filename}")

    if errors:
        return jsonify({"success": False, "message": " ".join(errors)}), 400

    db.session.commit()
    return jsonify({
        "success": True,
        "message": "Profile updated.",
        "username": current_user.username,
        "profile_picture": current_user.profile_picture or "",
    })


@profile_bp.route("/profile/password", methods=["POST"])
@login_required
def profile_password():
    data = request.get_json() if request.is_json else request.form
    current_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")
    confirm_pw = data.get("confirm_password", "")

    if current_user.password_hash and not current_user.check_password(current_pw):
        return jsonify({"success": False, "message": "Current password is incorrect."}), 400
    if len(new_pw) < 8:
        return jsonify({"success": False, "message": "New password must be at least 8 characters."}), 400
    if new_pw != confirm_pw:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    current_user.set_password(new_pw)
    db.session.commit()
    return jsonify({"success": True, "message": "Password updated successfully."})


@profile_bp.route("/profile/delete", methods=["POST"])
@login_required
def profile_delete():
    data = request.get_json() if request.is_json else request.form
    password = data.get("password", "")

    # Google-only users don't have a password — require typing "DELETE"
    if current_user.password_hash:
        if not current_user.check_password(password):
            return jsonify({"success": False, "message": "Incorrect password."}), 400
    else:
        if password != "DELETE":
            return jsonify({"success": False, "message": "Type DELETE to confirm."}), 400

    # Delete uploaded picture file
    if current_user.profile_picture and current_user.profile_picture.startswith("/static/uploads/"):
        upload_folder = current_app.config["UPLOAD_FOLDER"]
        old_path = os.path.join(upload_folder, os.path.basename(current_user.profile_picture))
        if os.path.exists(old_path):
            os.remove(old_path)

    db.session.delete(current_user)
    db.session.commit()
    logout_user()
    return jsonify({"success": True, "message": "Account deleted.", "redirect": "/"})
