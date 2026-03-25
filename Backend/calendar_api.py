from flask import Blueprint, Response
from flask_login import current_user
from datetime import datetime, timedelta
from models import StudySession, Task

calendar_bp = Blueprint("calendar", __name__)

@calendar_bp.route("/calendar.ics")
def generate_calendar():
    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    user_id = 1

    sessions = StudySession.query.filter_by(user_id=user_id).all()
    tasks = Task.query.filter_by(user_id=user_id).all()

    events = ""

    for session in sessions:
        start = session.start_time
        end = start + timedelta(minutes=session.duration_minutes)

        events += f"""BEGIN:VEVENT
UID:session-{session.id}@planify
DTSTAMP:{now}
DTSTART:{start.strftime("%Y%m%dT%H%M%SZ")}
DTEND:{end.strftime("%Y%m%dT%H%M%SZ")}
SUMMARY:{session.subject}
DESCRIPTION:{session.notes or ""}
END:VEVENT
"""

    for task in tasks:
        start = task.due_date
        end = start + timedelta(hours=1)

        events += f"""BEGIN:VEVENT
UID:task-{task.id}@planify
DTSTAMP:{now}
DTSTART:{start.strftime("%Y%m%dT%H%M%SZ")}
DTEND:{end.strftime("%Y%m%dT%H%M%SZ")}
SUMMARY:{task.title}
DESCRIPTION:{task.description or ""}
END:VEVENT
"""

    if not events:
        events = f"""BEGIN:VEVENT
UID:test@planify
DTSTAMP:{now}
DTSTART:20260330T090000Z
DTEND:20260330T100000Z
SUMMARY:Fallback Event
DESCRIPTION:No data found
END:VEVENT
"""

    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Planify//EN
CALSCALE:GREGORIAN
{events}END:VCALENDAR
"""

    return Response(ics_content, mimetype="text/calendar")