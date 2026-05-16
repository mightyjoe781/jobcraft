# JobCraft

AI-powered resume tailoring and job application workspace. Paste a job description, get a tailored LaTeX resume compiled to PDF in seconds, scored against ATS criteria, tracked in one place.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, TailwindCSS |
| Backend | FastAPI (Python 3.12), SQLAlchemy 2, Alembic |
| AI | Anthropic Claude (`claude-sonnet-4-6`) with prompt caching |
| PDF rendering | Full `texlive` Docker sidecar (`pdflatex --no-shell-escape`) |
| Database | PostgreSQL 16 |
| Queue | Celery + Redis |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) v24+ and Docker Compose v2+
- An [Anthropic API key](https://console.anthropic.com)

---

## Setup

### 1. Configure environment

A `.env` file is already present with pre-generated `POSTGRES_PASSWORD` and `JWT_SECRET`. The only value you must set is your Anthropic API key:

```bash
# Open .env and replace the placeholder:
ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

> **Important:** `DATABASE_URL` in `.env` must use the same password as `POSTGRES_PASSWORD`. They are pre-matched — only edit both together if you change the password.

### 2. Start the stack

```bash
docker compose up --build
```

First run takes several minutes — the `texlive` image is large (~4 GB). Subsequent starts are fast.

Once all services are healthy:

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

### 3. Create an account

Open http://localhost:3000, click **Create one**, and register. Database migrations and template seeding run automatically on startup.

---

## Project structure

```
jobcraft/
├── api/                        # FastAPI backend
│   ├── alembic/                # DB migrations (auto-run on startup)
│   ├── app/
│   │   ├── main.py             # App entry point + lifespan (seed on startup)
│   │   ├── config.py           # All settings from .env
│   │   ├── database.py         # Async SQLAlchemy engine
│   │   ├── storage.py          # StorageService (local ↔ S3 abstraction)
│   │   ├── dependencies.py     # JWT auth dependency
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── routers/            # One file per resource group
│   │   ├── services/           # Business logic (ai.py, latex_client.py, security.py)
│   │   └── workers/            # Celery tasks
│   ├── templates/              # Bundled .tex resume templates (version-controlled)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── entrypoint.sh           # Runs migrations then starts uvicorn
├── frontend/                   # React + Vite app
│   ├── src/
│   │   ├── api/                # Typed fetch wrappers (no inline fetch in components)
│   │   ├── components/         # Sidebar, AppLayout, RequireAuth
│   │   ├── hooks/              # useAuth (AuthContext)
│   │   ├── pages/              # One folder per route
│   │   └── types/              # Shared TypeScript types
│   └── Dockerfile              # Multi-stage: Vite build → nginx
├── latex/                      # texlive sidecar
│   ├── main.py                 # FastAPI: POST /render, POST /compile-check
│   └── Dockerfile              # texlive/texlive:latest base
├── docker-compose.yml
├── .env                        # Active config (not committed)
├── .env.example                # Template — commit this, not .env
└── goals/
    └── requirement.md          # Full product requirements
```

---

## Development workflow

### Rebuild after code changes

```bash
# Rebuild and restart a single service
docker compose up --build api

# Rebuild everything
docker compose up --build
```

### Tail logs

```bash
docker compose logs -f              # all services
docker compose logs -f api          # API only
docker compose logs -f worker       # Celery worker
```

### Database

```bash
# Open psql shell
docker compose exec postgres psql -U jobcraft -d jobcraft

# Run migrations manually (they also run on startup)
docker compose exec api alembic upgrade head

# Generate a new migration after changing models
docker compose exec api alembic revision --autogenerate -m "describe change"
```

### Reset everything

```bash
docker compose down -v    # stops containers and deletes volumes (all data lost)
docker compose up
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `DATABASE_URL` | Yes | Full async connection string — must match `POSTGRES_PASSWORD` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `JWT_SECRET` | Yes | Random string for signing JWT tokens |
| `STORAGE_BACKEND` | No | `local` (default) or `s3` |
| `STORAGE_LOCAL_ROOT` | No | Mount path inside containers (default `/storage`) |
| `S3_BUCKET` | S3 only | Bucket name |
| `AWS_ACCESS_KEY_ID` | S3 only | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | S3 only | AWS credentials |
| `AWS_REGION` | S3 only | Default `us-east-1` |

Generate new secrets any time:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Switching to S3 storage

Set `STORAGE_BACKEND=s3` and add the S3 credentials. No code changes needed — the `StorageService` abstraction handles it transparently.

---

## Resume templates

Five `.tex` templates ship with the platform, stored in `api/templates/` and seeded into the database on first startup:

| Slug | Best for | ATS safe |
|---|---|---|
| `ats-clean` | Software engineering | Yes |
| `ats-data` | Data engineering / data science | Yes |
| `ats-minimal` | Any role, ultra-clean | Yes |
| `two-column-modern` | Design-forward roles | Caution |
| `academic` | Research / PhD applications | Yes |

To add a new template: add a `.tex` file to `api/templates/`, add its metadata to `TEMPLATE_META` in `api/app/services/seed.py`, then restart the API container.

---

## Troubleshooting

**Port already in use**

Change the host port in `docker-compose.yml`:
```yaml
ports:
  - "3001:80"   # was 3000:80
```

**API fails to start — `ANTHROPIC_API_KEY` error**

Make sure `.env` has a real key (not the placeholder `sk-ant-...your-key-here...`).

**LaTeX PDF render times out**

The `texlive` image is large. On first pull it may take 5–10 minutes. Check:
```bash
docker compose logs latex
```

**`DATABASE_URL` mismatch error**

If you changed `POSTGRES_PASSWORD`, update `DATABASE_URL` in `.env` to use the same password, then restart.

**Blank frontend**

Check the browser console (F12). Common cause: API not yet healthy. Wait 10 seconds and reload, or check `docker compose logs api`.

---

## What's built (implementation status)

| Module | Status |
|---|---|
| Auth (register, login, JWT refresh, profile) | Done |
| Resume template gallery | Done |
| Base resume editor (Monaco + PDF preview + snapshots) | Done |
| AI fill assist | Done |
| Resume tailoring (Claude + SSE progress + diff) | Done |
| ATS scoring (sync-first + async fallback) | Done |
| Skill gap analysis | Done |
| Dashboard & analytics | Done |
| Application tracker (Kanban + table) | Deferred |
| Cover letter generator | Phase 3 |
| Auto-apply engine | Phase 4 |
| Job discovery | Phase 5 |

See `goals/requirement.md` for full product requirements and `tasks/prd-jobcraft.md` for the implementation PRD.
