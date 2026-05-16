from flask import Blueprint, request, jsonify, g
import os
import sqlite3

scores_bp = Blueprint("scores", __name__)

def _scores_db_path() -> str:
    """Return the SQLite file path for raw-sqlite scores access.

    In tests, SCORES_DB_PATH (or SQLALCHEMY_DATABASE_URI) can point to the
    session-scoped test DB so Selenium tests and unit tests share the same file.
    """
    env_path = os.environ.get("SCORES_DB_PATH") or os.environ.get("SQLALCHEMY_DATABASE_URI", "")
    if env_path.startswith("sqlite:///"):
        return env_path[len("sqlite:///"):]
    if env_path and not env_path.startswith("sqlite"):
        return env_path
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.db")


def get_db():
    if "db" not in g:
        db_path = _scores_db_path()
        g.db = sqlite3.connect(db_path)
        g.db.row_factory = sqlite3.Row
    return g.db

def init_db():
    conn = get_db()
    conn.execute("""
    CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER,
        name TEXT,
        score REAL,
        weight REAL
    )
    """)
    conn.commit()

@scores_bp.route("/api/scores/<semester>", methods=["GET"])
def get_scores(semester):
    conn = get_db()
    rows = conn.execute("""
        SELECT a.*
        FROM assessments a
        JOIN units u ON a.unit_id = u.id
        WHERE u.semester_id = ?
    """, (semester,)).fetchall()

    return jsonify([dict(row) for row in rows])

@scores_bp.route("/api/scores", methods=["POST"])
def create_score():
    data = request.json

    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO assessments (unit_id, name, score, weight)
        VALUES (?, ?, ?, ?)
    """, (
        data.get("unit_id"),
        data.get("name", "Assessment"),
        data.get("score", 0),
        data.get("weight", 0),
    ))
    conn.commit()

    return jsonify({
        "id": cursor.lastrowid,
        "unit_id": data.get("unit_id"),
        "name": data.get("name", "Assessment"),
        "score": data.get("score", 0),
        "weight": data.get("weight", 0),
    })

@scores_bp.route("/api/scores/<int:id>", methods=["PUT"])
def update_score(id):
    data = request.json

    conn = get_db()
    conn.execute("""
        UPDATE assessments
        SET name = ?, score = ?, weight = ?
        WHERE id = ?
    """, (
        data.get("name"),
        data.get("score"),
        data.get("weight"),
        id
    ))
    conn.commit()

    return jsonify({"status": "updated"})

@scores_bp.route("/api/scores/<int:id>", methods=["DELETE"])
def delete_score(id):
    conn = get_db()
    conn.execute(
        "DELETE FROM assessments WHERE id = ?",
        (id,)
    )
    conn.commit()

    return jsonify({"status": "deleted"})
