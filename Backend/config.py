import os
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


class Config:
    # Flask
    SECRET_KEY = os.environ.get("SECRET_KEY", os.urandom(32).hex())

    # Database - SQLite stored in Backend/
    BASE_DIR = BASE_DIR
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(BASE_DIR, "app.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Secure cookie settings
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_DURATION = 60 * 60 * 24 * 14  # 14 days in seconds

    # File uploads
    UPLOAD_FOLDER = os.path.join(BASE_DIR, os.pardir, "Frontend", "static", "uploads")
    # Whole request body cap (multipart overhead needs headroom below this).
    MAX_CONTENT_LENGTH = 21 * 1024 * 1024
    # Per-file limit for post images/videos (enforced in group_routes.create_post).
    MAX_POST_MEDIA_BYTES = 20 * 1024 * 1024
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "mp4", "webm", "mov"}

    # Google OAuth
    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
