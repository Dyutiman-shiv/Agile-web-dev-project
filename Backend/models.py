from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date
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
    semesters = db.relationship("Semester", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    units = db.relationship("Unit", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    notifications = db.relationship("Notification", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    notification_prefs = db.relationship("NotificationPreference", backref="user", uselist=False, cascade="all, delete-orphan")

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
    unit_id = db.Column(db.Integer, db.ForeignKey("units.id"), nullable=True)

    # Relationship to checklist items
    checklist_items = db.relationship("ChecklistItem", backref="session", lazy="select", cascade="all, delete-orphan")
    unit = db.relationship("Unit", foreign_keys=[unit_id])

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
            "unit_id": self.unit_id,
            "unit_name": self.unit.name if self.unit else None,
            "unit_code": self.unit.code if self.unit else None,
        }


class Task(db.Model):  # type: ignore[name-defined]
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.DateTime, nullable=False)
    completed = db.Column(db.Boolean, nullable=False, default=False)
    unit_id = db.Column(db.Integer, db.ForeignKey("units.id"), nullable=True)
    notified_due = db.Column(db.Boolean, nullable=False, default=False)
    notified_overdue = db.Column(db.Boolean, nullable=False, default=False)

    unit = db.relationship("Unit", foreign_keys=[unit_id])

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
            "unit_id": self.unit_id,
            "unit_name": self.unit.name if self.unit else None,
            "unit_code": self.unit.code if self.unit else None,
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


class Semester(db.Model):  # type: ignore[name-defined]
    __tablename__ = "semesters"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)

    units = db.relationship("Unit", backref="semester", lazy="select", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    @property
    def is_current(self):
        today = date.today()
        return self.start_date <= today <= self.end_date

    def week_number(self, d=None):
        d = d or date.today()
        if d < self.start_date or d > self.end_date:
            return None
        return (d - self.start_date).days // 7 + 1

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "is_current": self.is_current,
            "week_number": self.week_number(),
        }


class Unit(db.Model):  # type: ignore[name-defined]
    __tablename__ = "units"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    semester_id = db.Column(db.Integer, db.ForeignKey("semesters.id"), nullable=True)
    name = db.Column(db.String(120), nullable=False)
    code = db.Column(db.String(20), nullable=True)
    color = db.Column(db.String(20), nullable=False, default="#6366f1")
    archived = db.Column(db.Boolean, nullable=False, default=False)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code or "",
            "color": self.color,
            "archived": self.archived,
            "semester_id": self.semester_id,
            "semester_name": self.semester.name if self.semester else None,
        }
<<<<<<< HEAD
    
class Assessment(db.Model):
    __tablename__ = "assessments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    score = db.Column(db.Float)
    weight = db.Column(db.Float)

    unit_id = db.Column(db.Integer, db.ForeignKey("units.id"), nullable=False)
=======


class Notification(db.Model):  # type: ignore[name-defined]
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    type = db.Column(db.String(40), nullable=False)  # task_due, task_overdue, session_reminder, semester_alert, timer_done
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.String(500), nullable=False, default="")
    link = db.Column(db.String(200), nullable=True)
    read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "link": self.link,
            "read": self.read,
            "created_at": self.created_at.isoformat(),
        }


class NotificationPreference(db.Model):  # type: ignore[name-defined]
    __tablename__ = "notification_preferences"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True, index=True)
    session_reminders = db.Column(db.Boolean, nullable=False, default=True)
    task_due_reminders = db.Column(db.Boolean, nullable=False, default=True)
    task_overdue_alerts = db.Column(db.Boolean, nullable=False, default=True)
    semester_alerts = db.Column(db.Boolean, nullable=False, default=True)
    timer_done_push = db.Column(db.Boolean, nullable=False, default=True)
    browser_push_enabled = db.Column(db.Boolean, nullable=False, default=False)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "session_reminders": self.session_reminders,
            "task_due_reminders": self.task_due_reminders,
            "task_overdue_alerts": self.task_overdue_alerts,
            "semester_alerts": self.semester_alerts,
            "timer_done_push": self.timer_done_push,
            "browser_push_enabled": self.browser_push_enabled,
        }
>>>>>>> main
