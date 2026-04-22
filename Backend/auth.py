from flask import Blueprint, render_template, redirect, url_for, request, flash, jsonify, current_app
from flask_login import login_user, logout_user, login_required, current_user
from models import User, Semester
from app import db

def _redirect_destination(user):
    """Return home or semester setup depending on whether the user has semesters."""
    if Semester.query.filter_by(user_id=user.id).count() == 0:
        return url_for("semesters.semester_setup_view")
    return url_for("auth.dashboard")


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/")
def index():
    if current_user.is_authenticated:
        return redirect(url_for("auth.dashboard"))
    return redirect(url_for("auth.login"))


# @auth_bp.route("/home")
# @login_required
# def home():
#     users = User.query.all()
#     return render_template("home.html", users=users)

@auth_bp.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", )


# ---------- Standard Login ----------
@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("auth.dashboard"))

    if request.method == "POST":
        # Support both form submissions and AJAX JSON
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form

        email = data.get("email", "").strip().lower()
        password = data.get("password", "")
        remember = data.get("remember") in ("true", "on", True, "True")

        user = User.query.filter_by(email=email).first()

        if user is None or not user.check_password(password):
            if request.is_json:
                return jsonify({"success": False, "message": "Invalid email or password."}), 401
            flash("Invalid email or password.", "danger")
            return render_template("login.html"), 401

        login_user(user, remember=remember)
        dest = _redirect_destination(user)
        if request.is_json:
            return jsonify({"success": True, "redirect": dest})
        return redirect(dest)

    return render_template("login.html")


# ---------- Standard Signup ----------
@auth_bp.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("auth.dashboard"))

    if request.method == "POST":
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form

        username = data.get("username", "").strip()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")
        confirm = data.get("confirm_password", "")

        errors = []
        if not username or len(username) < 3:
            errors.append("Username must be at least 3 characters.")
        if not email:
            errors.append("Email is required.")
        if len(password) < 8:
            errors.append("Password must be at least 8 characters.")
        if password != confirm:
            errors.append("Passwords do not match.")
        if User.query.filter_by(email=email).first():
            errors.append("An account with this email already exists.")
        if User.query.filter_by(username=username).first():
            errors.append("This username is already taken.")

        if errors:
            if request.is_json:
                return jsonify({"success": False, "message": " ".join(errors)}), 400
            for e in errors:
                flash(e, "danger")
            return render_template("signup.html"), 400

        user = User(username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        login_user(user, remember=False)
        dest = _redirect_destination(user)
        if request.is_json:
            return jsonify({"success": True, "redirect": dest})
        return redirect(dest)

    return render_template("signup.html")


# ---------- Logout ----------
@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.", "info")
    return redirect(url_for("auth.login"))


# ---------- Google OAuth ----------
@auth_bp.route("/login/google")
def google_login():
    oauth = current_app.extensions.get("oauth")
    if oauth is None:
        flash("Google login is not configured.", "warning")
        return redirect(url_for("auth.login"))
    redirect_uri = url_for("auth.google_callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.route("/login/google/callback")
def google_callback():
    oauth = current_app.extensions.get("oauth")
    if oauth is None:
        flash("Google login is not configured.", "warning")
        return redirect(url_for("auth.login"))

    token = oauth.google.authorize_access_token()
    user_info = token.get("userinfo")
    if user_info is None:
        user_info = oauth.google.userinfo()

    google_id = user_info["sub"]
    email = user_info["email"].lower()
    name = user_info.get("name", email.split("@")[0])
    picture = user_info.get("picture", "")

    # Find user by google_id or email
    user = User.query.filter_by(google_id=google_id).first()
    if user is None:
        user = User.query.filter_by(email=email).first()
        if user is None:
            # Create new user from Google profile
            # Ensure unique username
            base_username = name.replace(" ", "_").lower()
            username = base_username
            counter = 1
            while User.query.filter_by(username=username).first():
                username = f"{base_username}_{counter}"
                counter += 1

            user = User(
                username=username,
                email=email,
                google_id=google_id,
                profile_picture=picture,
            )
            db.session.add(user)
        else:
            # Link existing email account to Google
            user.google_id = google_id
            if picture:
                user.profile_picture = picture
        db.session.commit()

    login_user(user, remember=True)
    return redirect(_redirect_destination(user))


# ---------- Placeholder pages ----------
@auth_bp.route("/sessions")
@login_required
def sessions_view():
    return render_template("sessions.html")


@auth_bp.route("/stats")
@login_required
def stats_view():
    return render_template("stats.html")


@auth_bp.route("/scores")
@login_required
def scores_view():
    return render_template("scores.html")
