"""
Background scheduler jobs for generating time-based notifications.
All queries are scoped to individual users — notifications are account-specific.
"""

from datetime import datetime, timedelta
from app import db
from models import Task, StudySession, Semester, Notification, NotificationPreference, User


def _get_prefs(user_id):
    """Return user's notification preferences (or None if not set)."""
    return NotificationPreference.query.filter_by(user_id=user_id).first()


def _create_notification(user_id, ntype, title, message, link=None):
    """Insert a notification row."""
    notif = Notification(
        user_id=user_id,
        type=ntype,
        title=title,
        message=message,
        link=link,
    )
    db.session.add(notif)
    db.session.flush()
    return notif


def check_task_due_reminders(app):
    """Tasks due within the next 24 hours that haven't been notified yet."""
    with app.app_context():
        now = datetime.utcnow()
        window = now + timedelta(hours=24)

        tasks = Task.query.filter(
            Task.due_date >= now,
            Task.due_date <= window,
            Task.completed == False,
            Task.notified_due == False,
        ).all()

        for task in tasks:
            prefs = _get_prefs(task.user_id)
            if prefs and not prefs.task_due_reminders:
                continue

            hours_left = max(1, int((task.due_date - now).total_seconds() / 3600))
            _create_notification(
                user_id=task.user_id,
                ntype="task_due",
                title="Task due soon",
                message=f'"{task.title}" is due in ~{hours_left}h',
                link="/calendar",
            )
            task.notified_due = True

        db.session.commit()


def check_task_overdue(app):
    """Tasks past their due date that haven't been marked overdue yet."""
    with app.app_context():
        now = datetime.utcnow()

        tasks = Task.query.filter(
            Task.due_date < now,
            Task.completed == False,
            Task.notified_overdue == False,
        ).all()

        for task in tasks:
            prefs = _get_prefs(task.user_id)
            if prefs and not prefs.task_overdue_alerts:
                continue

            _create_notification(
                user_id=task.user_id,
                ntype="task_overdue",
                title="Task overdue",
                message=f'"{task.title}" is past its due date',
                link="/calendar",
            )
            task.notified_overdue = True

        db.session.commit()


def check_semester_alerts(app):
    """Semesters starting or ending within 7 days."""
    with app.app_context():
        from datetime import date
        today = date.today()
        week_ahead = today + timedelta(days=7)

        # Starting soon
        semesters_starting = Semester.query.filter(
            Semester.start_date >= today,
            Semester.start_date <= week_ahead,
        ).all()

        for sem in semesters_starting:
            prefs = _get_prefs(sem.user_id)
            if prefs and not prefs.semester_alerts:
                continue

            # Avoid duplicate: check if similar notification exists today
            existing = Notification.query.filter(
                Notification.user_id == sem.user_id,
                Notification.type == "semester_alert",
                Notification.message.contains(sem.name),
                Notification.created_at >= datetime.combine(today, datetime.min.time()),
            ).first()
            if existing:
                continue

            days_until = (sem.start_date - today).days
            _create_notification(
                user_id=sem.user_id,
                ntype="semester_alert",
                title="Semester starting soon",
                message=f'"{sem.name}" starts in {days_until} day{"s" if days_until != 1 else ""}',
                link="/settings/academic",
            )

        # Ending soon
        semesters_ending = Semester.query.filter(
            Semester.end_date >= today,
            Semester.end_date <= week_ahead,
        ).all()

        for sem in semesters_ending:
            prefs = _get_prefs(sem.user_id)
            if prefs and not prefs.semester_alerts:
                continue

            existing = Notification.query.filter(
                Notification.user_id == sem.user_id,
                Notification.type == "semester_alert",
                Notification.message.contains(sem.name),
                Notification.message.contains("ends"),
                Notification.created_at >= datetime.combine(today, datetime.min.time()),
            ).first()
            if existing:
                continue

            days_until = (sem.end_date - today).days
            _create_notification(
                user_id=sem.user_id,
                ntype="semester_alert",
                title="Semester ending soon",
                message=f'"{sem.name}" ends in {days_until} day{"s" if days_until != 1 else ""}',
                link="/settings/academic",
            )

        db.session.commit()


def check_session_reminders(app):
    """Study sessions starting within the next 30 minutes."""
    with app.app_context():
        now = datetime.utcnow()
        window = now + timedelta(minutes=30)

        sessions = StudySession.query.filter(
            StudySession.start_time >= now,
            StudySession.start_time <= window,
        ).all()

        for sess in sessions:
            prefs = _get_prefs(sess.user_id)
            if prefs and not prefs.session_reminders:
                continue

            # Avoid duplicate: check if already notified for this session
            existing = Notification.query.filter(
                Notification.user_id == sess.user_id,
                Notification.type == "session_reminder",
                Notification.message.contains(sess.subject),
                Notification.created_at >= now - timedelta(hours=1),
            ).first()
            if existing:
                continue

            mins_until = max(1, int((sess.start_time - now).total_seconds() / 60))
            _create_notification(
                user_id=sess.user_id,
                ntype="session_reminder",
                title="Session starting soon",
                message=f'"{sess.subject}" starts in ~{mins_until} min',
                link="/sessions",
            )

        db.session.commit()


def cleanup_old_notifications(app):
    """Remove notifications older than 30 days."""
    with app.app_context():
        cutoff = datetime.utcnow() - timedelta(days=30)
        Notification.query.filter(Notification.created_at < cutoff).delete()
        db.session.commit()


def init_scheduler(app):
    """Initialize and start APScheduler with all notification jobs."""
    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler()
    scheduler.add_job(check_task_due_reminders, "interval", minutes=15, args=[app], id="task_due")
    scheduler.add_job(check_task_overdue, "interval", minutes=30, args=[app], id="task_overdue")
    scheduler.add_job(check_semester_alerts, "cron", hour=0, minute=5, args=[app], id="semester_alerts")
    scheduler.add_job(check_session_reminders, "interval", minutes=10, args=[app], id="session_reminders")
    scheduler.add_job(cleanup_old_notifications, "cron", hour=3, minute=0, args=[app], id="cleanup")
    scheduler.start()
    app._scheduler = scheduler
