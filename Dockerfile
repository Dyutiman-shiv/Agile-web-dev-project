# Planify — Flask + SQLite (dev-style server; binds 0.0.0.0 for containers)
FROM python:3.12-slim-bookworm

WORKDIR /app

# Some transitive dependencies may need a compiler on slim images
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY Backend ./Backend
COPY Frontend ./Frontend
COPY seed ./seed

RUN mkdir -p /app/Backend/data

# Import `app` from Backend; allow `python -m seed.populate` from project root (`/app`)
ENV PYTHONPATH=/app/Backend:/app
ENV SCHEDULER_ENABLED=1

EXPOSE 5050

# Use a writable DB path (overridable via SQLALCHEMY_DATABASE_URI)
ENV SQLALCHEMY_DATABASE_URI=sqlite:////app/Backend/data/app.db

CMD ["python", "-c", "from app import create_app; app = create_app(); app.run(host='0.0.0.0', port=5050, threaded=True, debug=False)"]
