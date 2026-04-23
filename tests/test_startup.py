"""
Tests that validate app startup, model imports, and DB schema synchronisation.
These wrap the preflight checks module as proper pytest assertions.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "Backend"))


def test_app_creates(app):
    """create_app() should succeed without errors."""
    assert app is not None


def test_all_models_importable():
    """Every model class should be importable."""
    from models import (
        User, StudySession, Task, ChecklistItem,
        ICalCalendar, Semester, Unit,
        Notification, NotificationPreference,
    )
    for cls in [User, StudySession, Task, ChecklistItem,
                ICalCalendar, Semester, Unit,
                Notification, NotificationPreference]:
        assert hasattr(cls, "__tablename__")


def test_db_schema_matches_models(app):
    """
    All columns defined in SQLAlchemy models must exist in the actual DB.
    This catches the 'ALTER TABLE not run' bug.
    """
    from app import db

    with app.app_context():
        engine = db.engine
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(engine)

        for table in db.metadata.sorted_tables:
            db_columns = {col["name"] for col in inspector.get_columns(table.name)}
            model_columns = {col.name for col in table.columns}
            missing = model_columns - db_columns
            assert not missing, (
                f"Table '{table.name}' is missing columns: {missing}. "
                f"Run: ALTER TABLE {table.name} ADD COLUMN <col> <type>;"
            )


def test_no_import_shadowing():
    """No backend file should re-import a module-level import inside a function."""
    from tests.checks import check_import_shadowing
    shadows = check_import_shadowing()
    assert shadows == [], (
        f"Import shadowing detected: {shadows}"
    )
