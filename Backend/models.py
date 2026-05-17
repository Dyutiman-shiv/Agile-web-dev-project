import secrets
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date, timezone
from app import db

FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _gen_friend_code():
    return "".join(secrets.choice(FRIEND_CODE_ALPHABET) for _ in range(8))


class User(db.Model):  # type: ignore[name-defined]
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=True)   # nullable for Google-only users
    google_id = db.Column(db.String(256), unique=True, nullable=True)
    profile_picture = db.Column(db.String(512), nullable=True)
    friend_code = db.Column(db.String(8), unique=True, nullable=False, index=True, default=_gen_friend_code)

    # Relationships
    study_sessions = db.relationship("StudySession", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    tasks = db.relationship("Task", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    ical_calendars = db.relationship("ICalCalendar", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    semesters = db.relationship("Semester", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    units = db.relationship("Unit", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    notifications = db.relationship("Notification", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    notification_prefs = db.relationship("NotificationPreference", backref="user", uselist=False, cascade="all, delete-orphan")
    group_memberships = db.relationship("GroupMembership", back_populates="user")
    liked_posts = db.relationship("PostLike", back_populates="user", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "profile_picture": self.profile_picture,
            "friend_code": self.friend_code,
        }

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
    status = db.Column(db.String(20), nullable=False, default="active")  # "active" or "completed"
    # Total focused seconds saved across partial ends (drives resume; avoids wall-clock drift).
    accumulated_seconds = db.Column(db.Integer, nullable=True)
    # When user starts a "new timer" continuation, points from parent row to the new session row.
    continued_as_session_id = db.Column(db.Integer, db.ForeignKey("study_sessions.id"), nullable=True)
    repeat_type = db.Column(db.String(20), nullable=False, default="none")
    repeat_until = db.Column(db.Date, nullable=True)

    # Relationship to checklist items
    checklist_items = db.relationship("ChecklistItem", backref="session", lazy="select", cascade="all, delete-orphan")
    unit = db.relationship("Unit", foreign_keys=[unit_id])
    segments = db.relationship(
        "StudySessionSegment",
        back_populates="session",
        lazy="dynamic",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="StudySessionSegment.segment_start",
    )

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
            "status": self.status,
            "accumulated_seconds": self.accumulated_seconds,
            "continued_as_session_id": self.continued_as_session_id,
            "repeat_type": self.repeat_type,
            "repeat_until": self.repeat_until.isoformat() if self.repeat_until else "",
        }


class StudySessionSegment(db.Model):  # type: ignore[name-defined]
    """One logged sitting (wall-clock interval + timer seconds) for calendar accuracy."""

    __tablename__ = "study_session_segments"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey("study_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_start = db.Column(db.DateTime, nullable=False)
    segment_end = db.Column(db.DateTime, nullable=False)
    elapsed_seconds = db.Column(db.Integer, nullable=False, default=0)

    session = db.relationship("StudySession", back_populates="segments")

    def to_calendar_dict(self):
        s = self.session
        dur_min = max(1, (int(self.elapsed_seconds) + 59) // 60)
        return {
            "id": self.id,
            "type": "session_segment",
            "session_id": s.id,
            "title": s.subject,
            "start": self.segment_start.isoformat(),
            "duration": dur_min,
            "notes": s.notes or "",
            "color": s.color,
            "timer_mode": s.timer_mode,
            "unit_id": s.unit_id,
            "unit_name": s.unit.name if s.unit else None,
            "unit_code": s.unit.code if s.unit else None,
            "readonly": True,
            "segment_end": self.segment_end.isoformat(),
        }


class Task(db.Model):  # type: ignore[name-defined]
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.DateTime, nullable=False)
    completed = db.Column(db.Boolean, nullable=False, default=False)
    duration_minutes = db.Column(db.Integer, nullable=True, default=30)
    color = db.Column(db.String(20), nullable=False, default="#f59e0b")
    unit_id = db.Column(db.Integer, db.ForeignKey("units.id"), nullable=True)
    repeat_type = db.Column(db.String(20), nullable=False, default="none")
    repeat_until = db.Column(db.Date, nullable=True)
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
            "duration": self.duration_minutes,
            "color": self.color,
            "unit_id": self.unit_id,
            "unit_name": self.unit.name if self.unit else None,
            "unit_code": self.unit.code if self.unit else None,
            "repeat_type": self.repeat_type,
            "repeat_until": self.repeat_until.isoformat() if self.repeat_until else "",
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
    wam = db.Column(db.Float, nullable=True)

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
            "wam": self.wam,
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
    number_credits = db.Column(db.Integer, nullable=True, default=6)
    archived = db.Column(db.Boolean, nullable=False, default=False)

    # Relationships

    assessments = db.relationship("Assessment", backref="unit_assessments")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self, include_assessments=False):
        data = {
            "id": self.id,
            "name": self.name,
            "code": self.code or "",
            "color": self.color,
            "number_credits": self.number_credits,
            "archived": self.archived,
            "semester_id": self.semester_id,
            "semester_name": self.semester.name if self.semester else None,
        }

        # Calculate Unit Score

        score = 0

        for assessment in self.assessments:

            assess_score = assessment.score if assessment.score else 0
            assess_weight = assessment.weight if assessment.weight else 0

            score += (assess_score * assess_weight)/ 100

        data["score"] = score

        if include_assessments:

            data["assessments"] = [a.id for a in self.assessments]

        return data

    
class Assessment(db.Model):
    __tablename__ = "assessments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    score = db.Column(db.Float)
    weight = db.Column(db.Float)
    due_date = db.Column(db.DateTime)

    unit_id = db.Column(db.Integer, db.ForeignKey("units.id"), nullable=False)



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
    
class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    cover_picture = db.Column(db.Text, nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=db.func.now())

    # Relationships
    owner = db.relationship("User", backref="owned_groups")
    members = db.relationship("GroupMembership", back_populates="group", cascade="all, delete-orphan")
    posts = db.relationship("Post", backref="group", cascade="all, delete-orphan")

    def to_dict(self, include_members=False):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "cover_picture":self.cover_picture,
            "owner_id": self.owner_id,
            "created_at": self.created_at.isoformat(),
            "posts": [p.id for p in self.posts]
        }

        if include_members:
            data["members"] = [m.user_id for m in self.members]

        return data
    

class GroupMembership(db.Model):
    __tablename__ = "group_memberships"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), primary_key=True)

    role = db.Column(db.String(20), default="member")  # (admin/member) ?
    joined_at = db.Column(db.DateTime, default=db.func.now())

    user = db.relationship("User", back_populates="group_memberships")
    group = db.relationship("Group", back_populates="members")

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "username": self.user.username,
            "profile_picture": self.user.profile_picture,
            "group_id": self.group_id,
            "role": self.role,
            "joined_at": self.joined_at.isoformat(),
        }


class Post(db.Model):
    __tablename__ = "posts"

    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    media_url = db.Column(db.Text, nullable=True)
    media_type = db.Column(db.String(20), nullable=True)
    article_url = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Foreign keys
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False)

    # Relationships
    author = db.relationship("User", backref="posts")
    comments = db.relationship("Comment", backref="post", cascade="all, delete-orphan")
    likes = db.relationship("PostLike", back_populates="post", cascade="all, delete-orphan")

    def to_dict(self):
        return  {
            "id": self.id,
            "content": self.content,
            "media_url": self.media_url,
            "media_type": self.media_type,
            "article_url": self.article_url,
            "created_at": self.created_at.isoformat(),
            "author_name": self.author.username,
            "author_id": self.author.id,
            "author_picture": self.author.profile_picture,
            "comments": [c.to_dict() for c in self.comments],
            "likes": [l.user_id for l in self.likes],
            "group": self.group.to_dict() if self.group else None
        }


class Comment(db.Model):
    __tablename__ = "comments"

    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Foreign keys
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id"), nullable=False)

    # Relationships
    author = db.relationship("User", backref="comments")

    def to_dict(self):
        
        return {
            "id": self.id,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "author_name": self.author.username,
            "author_id": self.author.id,
            "post_id": self.post_id,
            "author_picture": self.author.profile_picture 
        }
    
class PostLike(db.Model):

    __tablename__ = "post_likes"

    user_id = db.Column(db.Integer,
                        db.ForeignKey("users.id"),
                        primary_key=True)

    post_id = db.Column(db.Integer,
                        db.ForeignKey("posts.id"),
                        primary_key=True)

    created_at = db.Column(db.DateTime,
                           default=db.func.now()
                           )

    # Relationships
    user = db.relationship("User", back_populates="liked_posts", foreign_keys=[user_id])
    post = db.relationship("Post", back_populates="likes", foreign_keys=[post_id])

    def to_dict(self):
        
        return {
            "user_id": self.user_id,
            "post_id": self.post_id,
            "created_at": self.created_at.isoformat(),
        }
    
class GroupInvitation(db.Model):
    __tablename__ = "group_invitations"

    id = db.Column(db.Integer, primary_key=True)

    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    status = db.Column(db.String(20), default="pending")  # pending / accepted / declined / cancelled
    created_at = db.Column(db.DateTime, default=db.func.now())

    # Relationships
    group = db.relationship("Group")
    sender = db.relationship("User", foreign_keys=[sender_id])
    receiver = db.relationship("User", foreign_keys=[receiver_id])

    def to_dict(self):
        return {
            "id": self.id,
            "group_id": self.group_id,
            "group_name": self.group.name,
            "group_cover": self.group.cover_picture,
            "sender_id": self.sender_id,
            "sender_username": self.sender.username,
            "sender_picture": self.sender.profile_picture,
            "receiver_id": self.receiver_id,
            "receiver_username": self.receiver.username,
            "receiver_picture": self.receiver.profile_picture,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }


class GroupModerationLog(db.Model):
    __tablename__ = "group_moderation_logs"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    action = db.Column(db.String(50), nullable=False)  # remove_member / delete_post / promote_admin / demote_admin
    target_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    target_post_id = db.Column(db.Integer, db.ForeignKey("posts.id"), nullable=True)
    reason = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    group = db.relationship("Group")
    actor = db.relationship("User", foreign_keys=[actor_id])
    target_user = db.relationship("User", foreign_keys=[target_user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "group_id": self.group_id,
            "actor_id": self.actor_id,
            "actor_username": self.actor.username,
            "action": self.action,
            "target_user_id": self.target_user_id,
            "target_username": self.target_user.username if self.target_user else None,
            "target_post_id": self.target_post_id,
            "reason": self.reason,
            "created_at": self.created_at.isoformat(),
        }