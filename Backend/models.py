from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from app import db


class User(db.Model):  # type: ignore[name-defined]
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=True)   # nullable for Google-only users
    google_id = db.Column(db.String(256), unique=True, nullable=True)
    profile_picture = db.Column(db.String(512), nullable=True)

    # Relationships
    study_sessions = db.relationship("StudySession", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    tasks = db.relationship("Task", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    ical_calendars = db.relationship("ICalCalendar", backref="user", lazy="dynamic", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    # Flask-Login integration
    @property
    def is_active(self):
        return True

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.id)

    def __repr__(self):
        return f"<User {self.username}>"


class StudySession(db.Model):  # type: ignore[name-defined]
    __tablename__ = "study_sessions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    subject = db.Column(db.String(120), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False, default=60)
    notes = db.Column(db.Text, nullable=True)
    color = db.Column(db.String(20), nullable=False, default="#6366f1")
    timer_mode = db.Column(db.String(20), nullable=True)  # "stopwatch" or "countdown"

    # Relationship to checklist items
    checklist_items = db.relationship("ChecklistItem", backref="session", lazy="select", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "type": "session",
            "title": self.subject,
            "start": self.start_time.isoformat(),
            "duration": self.duration_minutes,
            "notes": self.notes or "",
            "color": self.color,
            "timer_mode": self.timer_mode,
            "checklist": [ci.to_dict() for ci in self.checklist_items],
        }


class Task(db.Model):  # type: ignore[name-defined]
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.DateTime, nullable=False)
    completed = db.Column(db.Boolean, nullable=False, default=False)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "type": "task",
            "title": self.title,
            "start": self.due_date.isoformat(),
            "description": self.description or "",
            "completed": self.completed,
            "color": "#10b981" if self.completed else "#f59e0b",
        }


class ChecklistItem(db.Model):  # type: ignore[name-defined]
    __tablename__ = "checklist_items"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("study_sessions.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    completed = db.Column(db.Boolean, nullable=False, default=False)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "completed": self.completed,
        }


class ICalCalendar(db.Model):  # type: ignore[name-defined]
    __tablename__ = "ical_calendars"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    url = db.Column(db.String(512), nullable=False)
    color = db.Column(db.String(20), nullable=False, default="#3b82f6")
    visible = db.Column(db.Boolean, nullable=False, default=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "url": self.url,
            "color": self.color,
            "visible": self.visible,
        }
