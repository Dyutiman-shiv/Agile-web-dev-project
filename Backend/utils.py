"""
Shared helpers used across multiple blueprints.

Kept tiny and dependency-light — anything heavier belongs in its own module.
"""

from datetime import datetime
from flask import current_app


# ─── Datetime parsing ────────────────────────────────────────────────────────

_DEFAULT_FALLBACK_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}


def parse_client_datetime(value):
    """Parse an ISO 8601 datetime string from the browser, tolerating ``...Z`` suffix.

    Python 3.9's ``datetime.fromisoformat`` rejects the ``Z`` UTC suffix that
    JavaScript's ``Date.prototype.toISOString()`` always emits; this helper
    normalizes it to ``+00:00`` before parsing. Returns ``None`` on failure
    instead of raising — callers should treat ``None`` as a 400 / invalid input.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    s = str(value).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


# ─── File uploads ────────────────────────────────────────────────────────────

def allowed_file(filename, fallback=None):
    """Return True if ``filename``'s extension is in app config's allowlist.

    Uses ``ALLOWED_EXTENSIONS`` from the active Flask config, falling back to
    ``fallback`` (or a sensible image-only set) if the config key is missing.
    """
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    allowed = current_app.config.get(
        "ALLOWED_EXTENSIONS",
        fallback if fallback is not None else _DEFAULT_FALLBACK_EXTENSIONS,
    )
    return ext in allowed
