"""
Preflight checks that run before the server starts.
Can also be used standalone: python -m tests.checks
Or wrapped by pytest in test_startup.py.
"""

import os
import sys
import ast
import sqlite3

# Make Backend/ importable when running standalone
_backend_dir = os.path.join(os.path.dirname(__file__), os.pardir, "Backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, os.path.abspath(_backend_dir))


# ── Colour helpers ──────────────────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

def _pass(msg):
    print(f"  {GREEN}PASS{RESET}  {msg}")

def _fail(msg):
    print(f"  {RED}FAIL{RESET}  {msg}")

def _warn(msg):
    print(f"  {YELLOW}WARN{RESET}  {msg}")


# ── 1. App creation check ──────────────────────────────────────────────
def check_app_creates():
    """Try to create the Flask app. Returns (ok, error_message)."""
    try:
        os.environ["SCHEDULER_ENABLED"] = "0"
        from app import create_app
        app = create_app()
        return True, None
    except Exception as e:
        return False, str(e)


# ── 2. DB schema sync check ────────────────────────────────────────────
def check_schema_sync(db_path=None):
    """
    Compare every SQLAlchemy model's columns against the actual SQLite DB.
    Returns a list of (table, column) tuples that exist in the model but
    are missing from the database.
    """
    if db_path is None:
        db_path = os.path.join(os.path.abspath(_backend_dir), "app.db")

    if not os.path.exists(db_path):
        return []  # DB doesn't exist yet — create_all will handle it

    # Gather expected columns from models
    os.environ["SCHEDULER_ENABLED"] = "0"
    from app import create_app, db as flask_db
    app = create_app()

    expected = {}  # {table_name: set(column_names)}
    with app.app_context():
        for table in flask_db.metadata.sorted_tables:
            expected[table.name] = {col.name for col in table.columns}

    # Gather actual columns from SQLite
    conn = sqlite3.connect(db_path)
    actual = {}
    for table_name in expected:
        try:
            cursor = conn.execute(f"PRAGMA table_info([{table_name}])")
            actual[table_name] = {row[1] for row in cursor.fetchall()}
        except Exception:
            actual[table_name] = set()
    conn.close()

    # Find missing columns
    missing = []
    for table_name, cols in expected.items():
        actual_cols = actual.get(table_name, set())
        if not actual_cols:
            missing.append((table_name, "*ALL* (table missing)"))
        else:
            for col in sorted(cols - actual_cols):
                missing.append((table_name, col))

    return missing


# ── 3. Import shadowing check ──────────────────────────────────────────
def check_import_shadowing():
    """
    Use AST to scan Backend/*.py for function-local imports that shadow
    module-level imports. Returns list of (file, function, module) tuples.
    """
    backend_dir = os.path.abspath(_backend_dir)
    issues = []

    for fname in os.listdir(backend_dir):
        if not fname.endswith(".py"):
            continue
        filepath = os.path.join(backend_dir, fname)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read(), filename=fname)
        except SyntaxError:
            issues.append((fname, "<syntax error>", ""))
            continue

        # Collect module-level import names
        module_imports = set()
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_imports.add(alias.asname or alias.name)
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    module_imports.add(alias.asname or alias.name)

        # Walk functions and look for shadowing imports
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for child in ast.walk(node):
                if isinstance(child, ast.Import):
                    for alias in child.names:
                        name = alias.asname or alias.name
                        if name in module_imports:
                            issues.append((fname, node.name, name))
                elif isinstance(child, ast.ImportFrom):
                    for alias in child.names:
                        name = alias.asname or alias.name
                        if name in module_imports:
                            issues.append((fname, node.name, name))

    return issues


# ── Orchestrator ────────────────────────────────────────────────────────
def run_preflight(db_path=None):
    """
    Run all preflight checks. Prints results and returns True if all pass.
    """
    print("\n" + "=" * 50)
    print("  PREFLIGHT CHECKS")
    print("=" * 50)

    all_ok = True

    # 1. App creation
    ok, err = check_app_creates()
    if ok:
        _pass("App creates successfully")
    else:
        _fail(f"App creation failed: {err}")
        all_ok = False

    # 2. Schema sync
    missing = check_schema_sync(db_path)
    if not missing:
        _pass("DB schema matches models")
    else:
        all_ok = False
        _fail("DB schema drift detected:")
        for table, col in missing:
            print(f"         table={table}  column={col}")

    # 3. Import shadowing
    shadows = check_import_shadowing()
    if not shadows:
        _pass("No import shadowing detected")
    else:
        for fname, func, mod in shadows:
            _warn(f"Import shadowing: {fname}:{func}() re-imports '{mod}'")

    print("=" * 50)
    if all_ok:
        print(f"  {GREEN}All preflight checks passed{RESET}")
    else:
        print(f"  {RED}Some checks FAILED — fix before running the server{RESET}")
    print("=" * 50 + "\n")

    return all_ok


# Allow running standalone: python -m tests.checks
if __name__ == "__main__":
    success = run_preflight()
    sys.exit(0 if success else 1)
