# Planify · CITS3403 Agile Web Development

**Planify** is a web application built for unit **CITS3403 Agile Web Development** at The University of Western Australia (**UWA**).  
Repository: coursework **student planning** product — semesters, calendar, sessions, grades, notifications, and study groups.

---

## Purpose

Planify supports **students** in organising study around real university workflows: defining **semesters and units**, managing **tasks and calendar events**, running **timed study sessions** with checklists, tracking **weighted assessment scores**, receiving **notifications** (bells, reminders, optional browser prompts), and collaborating in **groups** using **friend-code invites**. The aim is one place for planning academics and light social coordination without juggling separate tools.

---

## Design

| Layer | Choice | Notes |
|--------|--------|--------|
| Backend | **Flask** (Python) | Modular blueprints (`auth`, calendar, sessions, groups, notifications, …), REST-style JSON endpoints where needed. |
| Data | **SQLite** via **SQLAlchemy** | Single-file DB suited to demos and coursework; path configurable (`SQLALCHEMY_DATABASE_URI`). |
| Frontend | **Jinja2** templates + **Tailwind CSS** (CDN) + vanilla **JS**/jQuery | Server-rendered pages with progressive enhancement; static assets under `Frontend/static/`. |
| Auth | **Flask-Login**, optional **Google OAuth** | Email/password signup; OAuth when `GOOGLE_CLIENT_*` env vars are set. |
| Jobs | **APScheduler** | Time-based notifications; disable with `SCHEDULER_ENABLED=0` for scripts/tests. |

**Repository layout:** `Backend/` holds the Flask app (models in `Backend/models.py`, routes in blueprint modules); `Frontend/` holds `templates/` and `static/`; `seed/` provides optional demo population; `tests/` holds pytest suites. **Docker**: `Dockerfile` + `docker-compose.yml` for a consistent runtime (SQLite persisted in a named volume).

---

## Use

Typical flows:

1. **Sign up / log in** → land on dashboard or semester setup if no semesters exist.  
2. **Academic settings** → create semesters and units (required context for calendars and grades).  
3. **Calendar** → add sessions and tasks; optional iCal subscriptions.  
4. **Sessions** → start timers, checklists, pause/resume, history tied to calendar.  
5. **Scores** → assessments per unit, weights, credit-weighted WAM-style views.  
6. **Groups** → create/join groups, invite by friend code, posts and comments.  
7. **Notifications** → unread summary and preferences.

Optional **seed data**: from the repo root with dependencies installed — `python -m seed.populate` — loads demo accounts and scenarios documented in **`seed/accounts.json`**.

---

## Group members

| UWA Student ID | Name | GitHub username |
|----------------|------|-----------------|
| 24112662 | Dyutiman Shiv | [@Dyutiman-shiv](https://github.com/Dyutiman-shiv) |
| 23176064 | Angelica Valencia Bravo | [@Angelica-Valencia](https://github.com/Angelica-Valencia) |
| 24254044 | Jessica Lin | [@JessicaLinnn](https://github.com/JessicaLinnn) |
| 24491136 | Bella Lu | [@bellalalala07](https://github.com/bellalalala07) |

---

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| **Python 3.10+** (3.12 recommended) | Local run and tests (`pip install -r requirements.txt`) |
| **Docker Desktop** (optional) | [Docker Compose](#option-b-docker-compose) launch |
| **Google Chrome** (optional) | [**E2E / Selenium**](#running-the-tests) tests only |

---

## Launching the application

Always work from the **repository root** (clone or download this repo).

### Option A — Local Python (recommended for daily dev)

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
python Backend/run.py
```

- Opens **http://127.0.0.1:5050**.  
- `Backend/run.py` runs **preflight checks** first (`tests/checks.py`). If they fail, fix the reported problems before proceeding.  
- Optional: put secrets/overrides in **`Backend/.env`** (see [`Backend/config.py`](Backend/config.py) — `SECRET_KEY`, `SQLALCHEMY_DATABASE_URI`, OAuth, …).

### Option B — Docker Compose (consistent environment)

Requires Docker Compose v2.

```bash
docker compose up --build
```

Then open **http://localhost:5050** (change host port with e.g. `HOST_PORT=8080 docker compose up`).  
Put a **`.env`** next to `docker-compose.yml` if you want a custom `SECRET_KEY` or OAuth keys (see [`docker-compose.yml`](docker-compose.yml)).

**Populate demo users inside the container:**

```bash
docker compose run --rm web python -m seed.populate
# Rebuild seed data from scratch:
# docker compose run --rm web python -m seed.populate --force
```

SQLite for the Compose stack persists in Docker volume **`sqlite-data`** until removed (`docker compose down -v`).

---

## Running the tests

Install dependencies (**same venv as app**):

```bash
pip install -r requirements.txt
```

From the repository root:

| Command | Meaning |
|---------|---------|
| `python -m tests.run_tests fast` | **All tests except Selenium E2E** (fast CI-style run, no Chrome) |
| `python -m tests.run_tests all` | Full suite **including Selenium E2E** |
| `python -m tests.run_tests e2e` | **Browser tests only** (needs **Chrome** installed) |

Category helpers:

```bash
python -m tests.run_tests startup       # App bootstrap / schema checks
python -m tests.run_tests unit          # Unit & smoke routes
python -m tests.run_tests integration    # Groups, invites, RBAC
python -m tests.run_tests api            # Unit + integration (no startup/E2E)
```

Equivalent **`pytest`** filters (markers are declared in **`pytest.ini`**):

```bash
pytest -m "not e2e"           # Same idea as fast
pytest -m e2e               # Browser tests only
```

Extra pytest flags can follow the runner, e.g. `python -m tests.run_tests unit -q --tb=no`.

Continuous integration runs **`python -m tests.run_tests fast`** and **`python -m tests.run_tests e2e`** in **`.github/workflows/tests.yml`**.

---

## Security note

Do **not** commit production secrets (`SECRET_KEY`, OAuth client secrets). Use **`Backend/.env`** or Compose **`.env`**, which are excluded from sane Docker builds via **`.dockerignore`**.
