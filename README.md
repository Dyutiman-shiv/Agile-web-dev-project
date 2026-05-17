# Agile-web-dev-project
This repository will store the project for the UNIT CITS3403

Group members: Angelica Dyutiman, Jessica, Bella

---

## Overview

**Planify** is a Flask-based student planning application: academic semesters and units, calendar tasks and study sessions with timers, weighted grades per unit, notifications, and social study groups with invitations by friend code. The UI lives under `Frontend/` (Jinja templates, Tailwind via CDN, static JS/CSS); HTTP APIs and HTML routes are implemented in `Backend/`.

---

## Tech stack

| Layer | Choice |
|--------|--------|
| Web framework | Flask 3 |
| Auth | Flask-Login; optional Google OAuth (Authlib) |
| Database | SQLite via Flask-SQLAlchemy |
| Scheduling | APScheduler (notification jobs; disable with `SCHEDULER_ENABLED=0`) |
| Testing | pytest, pytest-flask, Selenium 4 |

---

## Repository layout

```
Agile-web-dev-project/
├── Backend/           # Flask app, models, blueprints, config
├── Frontend/          # templates/, static/ (css, js, uploads)
├── seed/              # Demo data script + accounts.json
├── tests/             # pytest suites (see Testing below)
├── Dockerfile         # Container image for the web app
├── docker-compose.yml # Local stack: web + persisted SQLite volume
├── pytest.ini         # pytest markers and paths
└── requirements.txt
```

---

## Prerequisites

- Python **3.10+** (3.12 recommended; CI uses 3.12)
- **Google Chrome** installed locally if you run **E2E / Selenium** tests (Selenium Manager resolves the matching ChromeDriver).

---

## Setup

From the repository root:

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
```

Optional: copy or create `Backend/.env` for secrets and overrides (see [Configuration](#configuration)).

---

## Running the application

The dev entrypoint runs preflight checks, then Flask on port **5050**:

```bash
python Backend/run.py
```

Open **http://127.0.0.1:5050**. Preflight verifies app startup, models, and DB/schema sanity (`tests/checks.py`). If checks fail, fix the reported issue before relying on local runs.

---

## Docker

Run the same stack everywhere with **Docker Compose** (Python 3.12 image, Flask on port **5050**, SQLite stored in a named volume under `/app/Backend/data`).

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)

### Start the app

From the repository root:

```bash
docker compose up --build
```

Then open **http://localhost:5050** (host port overridable with `HOST_PORT`, e.g. `HOST_PORT=8080 docker compose up`).

Stop with `Ctrl+C` or `docker compose down`. Database files persist in the **`sqlite-data`** volume until you remove it (`docker compose down -v`).

### Configuration

You can place a **`.env`** file next to `docker-compose.yml` (Compose loads it automatically). Useful variables:

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | Session signing (**set a strong value** outside throwaway demos) |
| `HOST_PORT` | Host port mapped to 5050 (default `5050`) |
| `SQLALCHEMY_DATABASE_URI` | Override DB URL (default: writable SQLite under `/app/Backend/data`) |
| `SCHEDULER_ENABLED` | `0` to disable APScheduler jobs inside the container |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google OAuth |

### Seed the database inside Docker

With the compose stack configured (same DB volume the app uses):

```bash
docker compose run --rm web python -m seed.populate
docker compose run --rm web python -m seed.populate --force
```

See [Seed data](#seed-data-demo-scenario) for what gets created and **`seed/accounts.json`** for logins.

### Image-only build / run (without Compose)

```bash
docker build -t planify:local .
docker run --rm -p 5050:5050 \
  -e SECRET_KEY=change-me \
  -e SQLALCHEMY_DATABASE_URI=sqlite:////app/Backend/data/app.db \
  -v planify-sqlite:/app/Backend/data \
  planify:local
```

This uses Flask’s built-in server (`debug=False`), suitable for demos and coursework consistency—not a hardened production deployment.

---

## Configuration

Environment variables are read from `Backend/.env` when present (`python-dotenv`). Common overrides:

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | Flask session signing |
| `SQLALCHEMY_DATABASE_URI` | Database URL (default: SQLite file `Backend/app.db`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable Google sign-in when both set |
| `SCHEDULER_ENABLED` | Set to `0` to disable background jobs (recommended for tests and one-off scripts) |

Uploads are stored under `Frontend/static/uploads/` with size limits defined in `Backend/config.py`.

---

## Seed data (demo scenario)

The `seed/` package loads a **repeatable demo dataset**: multiple `@seed.planify` users, groups, pending invitations, academics (semesters, units, assessments, tasks, sessions), and notifications. Credentials and friend codes are defined in **`seed/accounts.json`** (shared password `password_all`, scenario descriptions, owner vs peer emails).

### Commands

Run **from the project root** after dependencies are installed:

```bash
# First-time seed (creates seed users if missing)
python -m seed.populate

# Remove existing seed users (@seed.planify) and re-insert fresh data
python -m seed.populate --force
```

The script disables the scheduler for its process (`SCHEDULER_ENABLED`). It uses the same database as the app (`SQLALCHEMY_DATABASE_URI` or default `Backend/app.db`). **Do not point production data** at `--force` unless you intend to delete all seed-domain users and their dependents.

### Files

| File | Role |
|------|------|
| `seed/populate.py` | Idempotent wipe + insert logic |
| `seed/accounts.json` | Password, emails, usernames, friend codes, scenario notes |

Log in as **`student.demo@seed.planify`** (see JSON for password and codes) to explore the richest seeded profile.

---

## Testing

Tests live under **`tests/`**, grouped by folder and **pytest markers** (registered in `pytest.ini`). Markers are applied automatically by folder (`startup`, `unit`, `integration`); Selenium tests declare **`e2e`** on the module.

| Folder | Marker | What it covers |
|--------|--------|----------------|
| `tests/startup_checks/` | `startup` | App boots, models import, schema vs models |
| `tests/unit_testing/` | `unit` | Route smoke tests, sessions/calendar/scores isolation |
| `tests/integration_testing/` | `integration` | Groups, invites, RBAC |
| `tests/selenium_testing/` | `e2e` | Browser tests against a live local server |

Shared fixtures (`app`, `auth_client`, DB cleanup) are in **`tests/conftest.py`**. Selenium uses **`tests/selenium_testing/conftest.py`** (temp SQLite file + threaded Werkzeug server).

### Recommended commands (repository root)

Single entrypoint:

```bash
python -m tests.run_tests startup       # startup_checks only
python -m tests.run_tests unit          # unit_testing only
python -m tests.run_tests integration   # integration_testing only
python -m tests.run_tests e2e           # Selenium (requires Chrome)

python -m tests.run_tests api           # unit + integration (no startup, no browser)
python -m tests.run_tests fast          # everything except e2e (matches CI “fast” job)
python -m tests.run_tests all           # full suite including e2e
```

Shorthand:

```bash
python -m tests unit                    # same as tests.run_tests (via tests/__main__.py)
```

Forward extra pytest arguments:

```bash
python -m tests.run_tests integration -q --tb=no
python -m tests.run_tests unit tests/unit_testing/test_routes.py -k scores
```

Raw pytest (equivalent selectors):

```bash
pytest -m startup
pytest -m integration
pytest -m "not e2e"
```

### Continuous integration

GitHub Actions workflow **`.github/workflows/tests.yml`** runs **`python -m tests.run_tests fast`** on pull requests to `main`/`master`, and a separate job runs **`python -m tests.run_tests e2e`** with Chrome installed on the runner.

---

## Contributing / coursework notes

Keep secrets out of Git (use `.env`, never commit real `SECRET_KEY` or OAuth secrets). Follow existing patterns in `Backend/` blueprints and `Frontend/static/js` when adding features.
