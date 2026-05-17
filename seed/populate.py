"""
Populate the SQLite database with a rich demo scenario (groups, invites, academics, scores, notifications).

Run from project root:
    python -m seed.populate
    python -m seed.populate --force

Requires Backend/app.db (or whatever SQLALCHEMY_DATABASE_URI points to). Scheduler is disabled for the process.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "Backend"
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("SCHEDULER_ENABLED", "0")

from sqlalchemy import or_  # noqa: E402

from app import apply_sqlite_light_migrations, create_app, db  # noqa: E402
from models import (  # noqa: E402
    Assessment,
    ChecklistItem,
    Comment,
    Group,
    GroupInvitation,
    GroupMembership,
    GroupModerationLog,
    ICalCalendar,
    Notification,
    NotificationPreference,
    Post,
    PostLike,
    Semester,
    StudySession,
    StudySessionSegment,
    Task,
    Unit,
    User,
)

SEED_EMAIL_SUFFIX = "@seed.planify"
ACCOUNTS_PATH = Path(__file__).resolve().parent / "accounts.json"

# Leave profile_picture as None so both the Jinja template and _resolvePictureUrl()
# in JS fall back to their own /static/img/avatar-placeholder.svg logic.
AVATAR_PLACEHOLDER = None


def _load_accounts():
    with open(ACCOUNTS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _wipe_seed_users() -> int:
    """Remove all users (and dependent rows) whose email ends with @seed.planify."""
    users = User.query.filter(User.email.like(f"%{SEED_EMAIL_SUFFIX}")).all()
    if not users:
        return 0
    ids = [u.id for u in users]

    GroupInvitation.query.filter(
        or_(
            GroupInvitation.sender_id.in_(ids),
            GroupInvitation.receiver_id.in_(ids),
        )
    ).delete(synchronize_session=False)

    gids = [g.id for g in Group.query.filter(Group.owner_id.in_(ids)).all()]
    if gids:
        pids = [p.id for p in Post.query.filter(Post.group_id.in_(gids)).all()]
        if pids:
            PostLike.query.filter(PostLike.post_id.in_(pids)).delete(synchronize_session=False)
            Comment.query.filter(Comment.post_id.in_(pids)).delete(synchronize_session=False)
        Post.query.filter(Post.group_id.in_(gids)).delete(synchronize_session=False)
        GroupModerationLog.query.filter(GroupModerationLog.group_id.in_(gids)).delete(
            synchronize_session=False
        )
        GroupMembership.query.filter(GroupMembership.group_id.in_(gids)).delete(
            synchronize_session=False
        )
        Group.query.filter(Group.id.in_(gids)).delete(synchronize_session=False)

    GroupMembership.query.filter(GroupMembership.user_id.in_(ids)).delete(synchronize_session=False)

    Notification.query.filter(Notification.user_id.in_(ids)).delete(synchronize_session=False)
    NotificationPreference.query.filter(NotificationPreference.user_id.in_(ids)).delete(
        synchronize_session=False
    )

    sess_ids = [s.id for s in StudySession.query.filter(StudySession.user_id.in_(ids)).all()]
    if sess_ids:
        StudySessionSegment.query.filter(StudySessionSegment.session_id.in_(sess_ids)).delete(
            synchronize_session=False
        )
        ChecklistItem.query.filter(ChecklistItem.session_id.in_(sess_ids)).delete(
            synchronize_session=False
        )
        StudySession.query.filter(StudySession.id.in_(sess_ids)).delete(synchronize_session=False)

    Task.query.filter(Task.user_id.in_(ids)).delete(synchronize_session=False)

    unit_ids = [u.id for u in Unit.query.filter(Unit.user_id.in_(ids)).all()]
    if unit_ids:
        Assessment.query.filter(Assessment.unit_id.in_(unit_ids)).delete(synchronize_session=False)
    Unit.query.filter(Unit.user_id.in_(ids)).delete(synchronize_session=False)
    Semester.query.filter(Semester.user_id.in_(ids)).delete(synchronize_session=False)
    ICalCalendar.query.filter(ICalCalendar.user_id.in_(ids)).delete(synchronize_session=False)

    User.query.filter(User.id.in_(ids)).delete(synchronize_session=False)
    db.session.commit()
    db.session.expire_all()
    return len(ids)


def _make_user(email: str, username: str, friend_code: str, password: str) -> User:
    u = User(
        email=email,
        username=username,
        friend_code=friend_code,
        profile_picture=AVATAR_PLACEHOLDER,
    )
    u.set_password(password)
    db.session.add(u)
    db.session.flush()
    db.session.add(NotificationPreference(user_id=u.id))
    return u


def _seed_groups_and_social(owner: User, peers: list[User]):
    # --- Your group: "Test group" ---
    g1 = Group(
        name="Test group",
        description="Demo cohort for agile study — seeded members and pending invites.",
        owner_id=owner.id,
    )
    db.session.add(g1)
    db.session.flush()
    db.session.add(GroupMembership(user_id=owner.id, group_id=g1.id, role="owner"))
    for p in peers[:3]:
        db.session.add(GroupMembership(user_id=p.id, group_id=g1.id, role="member"))
    # AllyFour & AllyFive: invited but not accepted
    for p in peers[3:5]:
        db.session.add(
            GroupInvitation(
                group_id=g1.id,
                sender_id=owner.id,
                receiver_id=p.id,
                status="pending",
            )
        )
        db.session.add(
            Notification(
                user_id=p.id,
                type="group_invite",
                title=f'Invitation to "{g1.name}"',
                message=f'{owner.username} invited you to join "{g1.name}".',
                link="/groups#invitations",
                read=False,
            )
        )

    # --- AllyOne's "Test 2" — you have a pending invite ---
    g2 = Group(
        name="Test 2",
        description="Side project group — AllyOne invited you (accept in Groups).",
        owner_id=peers[0].id,
    )
    db.session.add(g2)
    db.session.flush()
    db.session.add(GroupMembership(user_id=peers[0].id, group_id=g2.id, role="owner"))
    db.session.add(
        GroupInvitation(
            group_id=g2.id,
            sender_id=peers[0].id,
            receiver_id=owner.id,
            status="pending",
        )
    )
    db.session.add(
        Notification(
            user_id=owner.id,
            type="group_invite",
            title=f'Invitation to "{g2.name}"',
            message=f'{peers[0].username} invited you to join "{g2.name}".',
            link="/groups#invitations",
            read=False,
        )
    )

    # --- Sample posts (feeds activity) ---
    p1 = Post(
        content="Kickoff post: sharing our sprint goals for this week. Who's free for a focus block tomorrow evening?",
        user_id=peers[0].id,
        group_id=g1.id,
    )
    p2 = Post(
        content="Useful link dump: lecture notes + two practice repos in the comments thread later today.",
        user_id=peers[1].id,
        group_id=g1.id,
    )
    p3 = Post(
        content="Reminder: we agreed to post weekly wins — mine was finally clearing the backlog review queue.",
        user_id=owner.id,
        group_id=g1.id,
    )
    db.session.add_all([p1, p2, p3])
    db.session.flush()
    db.session.add(Comment(content="I'm in for 7–9pm if we book a room.", user_id=peers[2].id, post_id=p1.id))
    db.session.add(Comment(content="+1 — I'll bring whiteboard markers.", user_id=owner.id, post_id=p1.id))
    db.session.add(PostLike(user_id=owner.id, post_id=p1.id))
    db.session.add(PostLike(user_id=peers[2].id, post_id=p2.id))

    # Tiny activity on Test 2 (visible after you accept)
    p4 = Post(
        content="Welcome draft — once everyone joins we'll pin the reading list here.",
        user_id=peers[0].id,
        group_id=g2.id,
    )
    db.session.add(p4)

    # Notifications for owner (beyond group invite): mixed read state
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    extras = [
        ("task_due", "Assignment due soon", "CSC3020 Project milestone is due in 48 hours.", "/calendar", False),
        ("task_overdue", "Overdue: weekly quiz", "You missed the self-check for Web Dev Lab.", "/calendar", True),
        ("session_reminder", "Session reminder", "Deep work block with unit Data Structures starts in 30 minutes.", "/sessions", False),
        ("semester_alert", "Semester midpoint", "You are at week 8 of Spring Study Term — review unit weights.", "/stats", False),
        ("timer_done", "Timer complete", "Pomodoro session saved: 25 minutes on Algorithms.", "/sessions", True),
        ("task_due", "Lab prep", "Databases lab prep checklist has unchecked items.", "/sessions", False),
    ]
    for i, (typ, title, msg, link, read) in enumerate(extras):
        db.session.add(
            Notification(
                user_id=owner.id,
                type=typ,
                title=title,
                message=msg,
                link=link,
                read=read,
                created_at=now - timedelta(hours=i * 6 + 2),
            )
        )


def _seed_owner_academics(owner: User):
    today = date.today()
    sem_start = today - timedelta(days=50)
    sem_end = today + timedelta(days=70)

    sem = Semester(
        user_id=owner.id,
        name="Spring Study Term",
        start_date=sem_start,
        end_date=sem_end,
        wam=73.6,
    )
    db.session.add(sem)
    db.session.flush()

    unit_specs = [
        ("Data Structures & Algorithms", "CSC2000", "#6366f1", 6),
        ("Web Application Development", "WEB3010", "#3b82f6", 6),
        ("Database Systems", "DBS2500", "#10b981", 6),
        ("Software Engineering & Agile", "AGL2100", "#f59e0b", 6),
        ("Human–Computer Interaction", "HCI2200", "#ec4899", 6),
    ]
    units: list[Unit] = []
    for name, code, color, credits in unit_specs:
        u = Unit(
            user_id=owner.id,
            semester_id=sem.id,
            name=name,
            code=code,
            color=color,
            number_credits=credits,
            archived=False,
        )
        db.session.add(u)
        units.append(u)
    db.session.flush()

    # Assessments (weights per unit sum to 100)
    assessment_sets = [
        [("Assignment 1", 82, 15), ("Midterm", 76, 35), ("Final project", 88, 50)],
        [("Lab portfolio", 90, 40), ("Milestone demo", 85, 30), ("Written exam", 79, 30)],
        [("SQL practical", 88, 45), ("Theory quiz", 74, 25), ("ER design", 91, 30)],
        [("Sprint reviews", 92, 50), ("Retrospective report", 86, 25), ("Team codebase", 84, 25)],
        [("Usability study", 80, 60), ("Prototype critique", 77, 40)],
    ]
    for unit, arows in zip(units, assessment_sets):
        for title, score, weight in arows:
            db.session.add(
                Assessment(unit_id=unit.id, name=title, score=float(score), weight=float(weight))
            )

    # iCal row (optional external calendar)
    db.session.add(
        ICalCalendar(
            user_id=owner.id,
            name="University timetable (demo)",
            url="https://example.edu/timetable/demo.ics",
            color="#94a3b8",
            visible=True,
        )
    )

    # Tasks (calendar events) — spread across weeks
    task_titles = [
        ("Read BST + heaps chapter", 3, "#f59e0b", False),
        ("Submit Web milestone 2", 5, "#ef4444", False),
        ("Normalize forms worksheet", 7, "#8b5cf6", True),
        ("HCI heuristic evaluation draft", 2, "#ec4899", False),
        ("Agile sprint planning prep", 1, "#f97316", True),
        ("DB indexing reading", 4, "#10b981", False),
        ("Pair-programming session prep", 0, "#6366f1", False),
        ("Revise exam formula sheet", 6, "#3b82f6", True),
        ("Post standup notes", 1, "#64748b", True),
        ("Record demo video (2 min)", 3, "#eab308", False),
        ("Office hours questions list", 2, "#06b6d4", False),
        ("Flashcards: big-O families", 0, "#a855f7", True),
        ("Unit test coverage pass", 4, "#22c55e", False),
        ("Literature review paragraph", 8, "#f43f5e", False),
        ("Backup repo before refactor", 0, "#94a3b8", True),
        ("Schedule peer review", 2, "#0ea5e9", False),
        ("Fix responsive nav bug", 3, "#3b82f6", False),
        ("Draft retrospective bullets", 1, "#f59e0b", True),
    ]
    for i, (title, day_off, color, done) in enumerate(task_titles):
        due = datetime.combine(
            today + timedelta(days=(i % 10) - 2 + day_off),
            datetime.min.time(),
        ) + timedelta(hours=14 + (i % 5))
        unit = units[i % len(units)]
        db.session.add(
            Task(
                user_id=owner.id,
                title=title,
                description="Seeded task for UI demos.",
                due_date=due,
                completed=done,
                duration_minutes=25 + (i % 4) * 15,
                color=color,
                unit_id=unit.id,
                repeat_type="none",
            )
        )

    # Study sessions + checklists + segments (stats + calendar)
    session_templates = [
        ("Deep work: Graph algorithms", 0, 90, "countdown", "completed", 0),
        ("Lab: REST API polish", 1, 120, "stopwatch", "completed", 1),
        ("Lecture catch-up: transactions", 2, 60, "countdown", "completed", 2),
        ("Assignment block: HCI write-up", 3, 45, "stopwatch", "active", 3),
        ("Morning review: sorting", 4, 50, "countdown", "completed", 0),
        ("Sprint backlog grooming", 5, 75, "stopwatch", "completed", 4),
        ("Practice: SQL joins", 6, 40, "countdown", "completed", 2),
        ("Team sync + code review", 7, 55, "stopwatch", "completed", 4),
        ("Reading: agile manifesto", 8, 35, "countdown", "completed", 4),
        ("Debug session: auth edge cases", 9, 100, "stopwatch", "completed", 1),
        ("Mock exam: complexity", 10, 80, "countdown", "completed", 0),
        ("Workshop prep slides", 11, 65, "stopwatch", "completed", 3),
        ("Flashcards drill", 12, 30, "countdown", "completed", 0),
        ("Unit integration tests", 13, 95, "stopwatch", "completed", 1),
        ("Essay outline", 14, 55, "countdown", "completed", 3),
        ("Database ER practice", 15, 70, "stopwatch", "completed", 2),
        ("Light review day", 16, 25, "countdown", "completed", None),
        ("Capstone research notes", 17, 85, "stopwatch", "completed", 4),
        ("Weekly planning", 18, 40, "countdown", "completed", None),
        ("Focus: accessibility checklist", 19, 72, "stopwatch", "completed", 3),
        ("Exam cram block A", 20, 110, "countdown", "completed", 0),
        ("Exam cram block B", 21, 90, "stopwatch", "completed", 0),
    ]

    for i, (subject, day_off, dur, mode, status, unit_idx) in enumerate(session_templates):
        start = datetime.combine(today - timedelta(days=day_off), datetime.min.time()) + timedelta(
            hours=9 + (i % 6)
        )
        unit_id = units[unit_idx].id if unit_idx is not None else None
        acc_sec = dur * 60 - 120 if status == "completed" else None
        sess = StudySession(
            user_id=owner.id,
            subject=subject,
            start_time=start,
            duration_minutes=dur,
            notes="Seeded session for dashboards and stats.",
            color=units[unit_idx % len(units)].color if unit_idx is not None else "#6366f1",
            timer_mode=mode,
            unit_id=unit_id,
            status=status,
            accumulated_seconds=acc_sec,
            repeat_type="none",
        )
        db.session.add(sess)
        db.session.flush()
        if i % 3 == 0:
            db.session.add(ChecklistItem(session_id=sess.id, title="Warm-up: skim notes", completed=True))
            db.session.add(ChecklistItem(session_id=sess.id, title="Core focus block", completed=status == "completed"))
            db.session.add(ChecklistItem(session_id=sess.id, title="Quick retrospective", completed=False))
        if status == "completed" and i % 2 == 0:
            seg_end = start + timedelta(minutes=max(1, dur // 2))
            db.session.add(
                StudySessionSegment(
                    session_id=sess.id,
                    segment_start=start,
                    segment_end=seg_end,
                    elapsed_seconds=max(60, (dur * 60) // 2),
                )
            )


def run_seed(force: bool = False) -> None:
    cfg = _load_accounts()
    owner_spec = cfg["owner_you"]
    peer_specs = cfg["peers_five"]
    password = cfg["password_all"]

    app = create_app()
    with app.app_context():
        apply_sqlite_light_migrations()
        existing = User.query.filter_by(email=owner_spec["email"]).first()
        if existing and not force:
            print(
                f'Seed user already exists ({owner_spec["email"]}). '
                "Re-run with --force to remove all @seed.planify users and re-seed."
            )
            return

        if force or existing:
            n = _wipe_seed_users()
            print(f"Removed {n} seed user(s) and related data.")

        owner = _make_user(
            owner_spec["email"],
            owner_spec["username"],
            owner_spec["friend_code"],
            password,
        )
        peers = [
            _make_user(p["email"], p["username"], p["friend_code"], password)
            for p in peer_specs
        ]
        db.session.flush()

        _seed_groups_and_social(owner, peers)
        _seed_owner_academics(owner)

        db.session.commit()
        print("Seed complete.")
        print(f"  Log in as you: {owner_spec['email']} / {password}")
        print(f"  Friend codes: see {ACCOUNTS_PATH.relative_to(ROOT)}")


def main():
    ap = argparse.ArgumentParser(description="Seed demo users and data.")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Delete existing @seed.planify users (and related rows) then re-seed.",
    )
    args = ap.parse_args()
    run_seed(force=args.force)


if __name__ == "__main__":
    main()
