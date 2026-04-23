"""
Seed fake notifications for user 'dyutiman shiv'.
Run from Backend/:  python seed_notifications.py
"""

from datetime import datetime, timedelta
from app import create_app, db
from models import User, Notification

NOTIFICATIONS = [
    {
        "type": "task_due",
        "title": "Task due soon: Review Chapter 5",
        "message": "Your task 'Review Chapter 5' for CITS3403 is due in 2 hours.",
        "link": "/sessions",
        "read": False,
        "minutes_ago": 5,
    },
    {
        "type": "task_overdue",
        "title": "Overdue: Submit Lab Report",
        "message": "Your task 'Submit Lab Report' for MATH1011 was due yesterday.",
        "link": "/sessions",
        "read": False,
        "minutes_ago": 45,
    },
    {
        "type": "session_reminder",
        "title": "Study session in 15 minutes",
        "message": "Your study session 'Algorithms Practice' starts at 2:30 PM.",
        "link": "/sessions",
        "read": False,
        "minutes_ago": 120,
    },
    {
        "type": "semester_alert",
        "title": "Semester 1 ends in 7 days",
        "message": "Your current semester ends on April 27. Make sure all tasks are complete!",
        "link": "/calendar",
        "read": False,
        "minutes_ago": 300,
    },
    {
        "type": "timer_done",
        "title": "Timer finished: Deep Work Block",
        "message": "Your 50-minute focus session just ended. Great work!",
        "link": "/sessions",
        "read": True,
        "minutes_ago": 600,
    },
    {
        "type": "task_due",
        "title": "Task due tomorrow: Project Wireframes",
        "message": "Your task 'Project Wireframes' for CITS3403 is due tomorrow at 11:59 PM.",
        "link": "/sessions",
        "read": False,
        "minutes_ago": 1440,
    },
    {
        "type": "session_reminder",
        "title": "Group study session today",
        "message": "Reminder: 'CITS3403 Group Meeting' starts at 4:00 PM in Reid Library.",
        "link": "/calendar",
        "read": True,
        "minutes_ago": 2000,
    },
    {
        "type": "task_overdue",
        "title": "Overdue: Database ER Diagram",
        "message": "Your task 'Database ER Diagram' was due 3 days ago. Please complete it ASAP.",
        "link": "/sessions",
        "read": True,
        "minutes_ago": 4320,
    },
    {
        "type": "semester_alert",
        "title": "New semester starts soon",
        "message": "Semester 2 begins on July 21. Set up your units and schedule!",
        "link": "/calendar",
        "read": False,
        "minutes_ago": 7200,
    },
    {
        "type": "timer_done",
        "title": "Pomodoro complete: Lecture Revision",
        "message": "Your 25-minute Pomodoro for 'Lecture Revision' is done. Take a 5-min break!",
        "link": "/sessions",
        "read": True,
        "minutes_ago": 10080,
    },
]


def seed():
    app = create_app()
    with app.app_context():
        user = User.query.filter_by(username="dyutiman shiv").first()
        if not user:
            print("ERROR: User 'dyutiman shiv' not found. Create the account first.")
            return

        now = datetime.utcnow()
        count = 0
        for item in NOTIFICATIONS:
            notif = Notification(
                user_id=user.id,
                type=item["type"],
                title=item["title"],
                message=item["message"],
                link=item.get("link"),
                read=item["read"],
            )
            notif.created_at = now - timedelta(minutes=item["minutes_ago"])
            db.session.add(notif)
            count += 1

        db.session.commit()
        print(f"Seeded {count} notifications for '{user.username}' (id={user.id}).")


if __name__ == "__main__":
    seed()
