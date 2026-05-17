"""
Single entry point to run pytest by category.

Run from the repository root::

    python -m tests.run_tests startup       # startup_checks/
    python -m tests.run_tests unit          # unit_testing/
    python -m tests.run_tests integration   # integration_testing/
    python -m tests.run_tests e2e           # selenium_testing/
    python -m tests.run_tests api           # unit + integration (no startup, no browser)
    python -m tests.run_tests fast          # everything except e2e (CI default)
    python -m tests.run_tests all           # full suite

Extra arguments are forwarded to pytest, e.g.::

    python -m tests.run_tests unit -q --tb=no
    python -m tests.run_tests integration tests/integration_testing/test_group_invites.py -k duplicate
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Marker expressions must stay aligned with pytest.ini and pytest_collection_modifyitems in conftest.py
CATEGORIES = {
    "startup": ["-m", "startup"],
    "unit": ["-m", "unit"],
    "integration": ["-m", "integration"],
    "e2e": ["-m", "e2e"],
    "api": ["-m", "unit or integration"],
    "fast": ["-m", "not e2e"],
    "all": [],
}


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    if not argv or argv[0] in ("-h", "--help"):
        choices = ", ".join(sorted(CATEGORIES))
        print(__doc__.strip())
        print(f"\nCategories: {choices}")
        return 0 if argv and argv[0] in ("-h", "--help") else 2

    category = argv[0]
    extra = argv[1:]

    if category not in CATEGORIES:
        print(
            f"Unknown category {category!r}. Use: {', '.join(sorted(CATEGORIES))}",
            file=sys.stderr,
        )
        return 2

    os.chdir(ROOT)
    cmd = [sys.executable, "-m", "pytest", *CATEGORIES[category], *extra]
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
