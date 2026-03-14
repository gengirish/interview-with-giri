# CLAUDE.md

## Project Overview

AI Interview Bot ("Interview with Giri") — a multi-tenant SaaS platform that conducts automated AI interviews for any job role. Companies subscribe, configure interviews per job posting, and candidates receive a unique link to complete text, voice, or video interviews. The platform scores candidates, generates reports, and provides analytics dashboards.

**Production URLs:**
- API: `https://interview-with-giri-api.fly.dev`
- Frontend: `https://hire-with-giri.vercel.app`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI (Python 3.12+), SQLAlchemy 2.0 async, Alembic, Pydantic v2, structlog |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL 16 (Neon in prod), Redis 7 (Upstash in prod) |
| AI | Google Gemini 2.5 Flash (primary), OpenAI GPT-4o, Bonsai, Claude (fallback chain) |
| Real-time | WebSocket (text/voice chat), LiveKit (WebRTC video) |
| Code Exec | Judge0 CE API, Monaco Editor |
| Email | AgentMail (SMTP + API) |
| Billing | Stripe (subscriptions, webhooks, usage metering) |
| Tooling | uv (packages), nox + nox-uv (tasks), ruff (lint/format), mypy (strict types) |
| Deploy | Docker, Fly.io (backend), Vercel (frontend), GitHub Actions CI |

## Project Structure

```
interview-with-giri/
├── backend/
│   ├── src/interviewbot/       # Python package (src-layout)
│   │   ├── main.py             # FastAPI app factory
│   │   ├── config.py           # Pydantic Settings
│   │   ├── dependencies.py     # DI: DB session, current_user, org
│   │   ├── routers/            # API endpoints (auth, jobs, interviews, billing, reports, etc.)
│   │   ├── services/           # Business logic (ai_engine, scoring, voice, code, email, etc.)
│   │   ├── models/             # tables.py (ORM), schemas.py (Pydantic), database.py (engine)
│   │   ├── middleware/         # tenant.py (multi-tenant context), auth.py
│   │   ├── websocket/          # chat_handler.py, voice_handler.py
│   │   └── utils/              # logger.py (structlog)
│   ├── tests/                  # 44 test files, 207+ tests
│   ├── alembic/                # DB migrations
│   ├── pyproject.toml          # Single source of truth for deps, tools, config
│   ├── uv.lock                 # Locked deps
│   └── noxfile.py              # Nox task definitions (test, lint, type_check, fmt)
├── frontend/
│   ├── src/app/                # Next.js App Router pages
│   │   ├── (auth)/             # Login, signup
│   │   ├── dashboard/          # Jobs, interviews, analytics, team, settings
│   │   └── interview/[token]/  # Public candidate interview page
│   ├── src/components/         # UI (shadcn/ui), interview, code-editor, dashboard, layout
│   └── src/lib/                # API client, WebSocket client, LiveKit, utils
├── db/                         # init.sql (schema DDL), seed.sql (demo data)
├── docker/                     # docker-compose.yml (full-stack production)
├── docker-compose.dev.yml      # Dev compose (Postgres:5433, Redis:6380)
├── scripts/                    # post_deploy_check.py
└── .github/workflows/ci.yml   # CI pipeline
```

## Common Commands

### Backend

```bash
cd backend

# Install dependencies
uv sync

# Run dev server (port 8001)
uv run uvicorn interviewbot.main:app --reload --port 8001

# Run all tests
uv run pytest

# Run smoke tests only (fast, no external APIs)
uv run pytest -m smoke

# Skip integration/slow tests
uv run pytest -m "not integration and not slow"

# Lint & format
uv run ruff check src/ tests/ --fix
uv run ruff format src/ tests/

# Type checking
uv run mypy src/ tests/

# Run all checks via nox
uv run nox

# Database migrations
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "description"
```

### Frontend

```bash
cd frontend

# Install dependencies
npm ci

# Run dev server (port 3000)
npm run dev

# Lint
npm run lint

# Type check
npx tsc --noEmit

# E2E tests (Playwright)
npx playwright test
npx playwright test --headed   # with browser visible
```

### Makefile shortcuts (from root)

```bash
make install       # Install all deps (backend + frontend)
make dev           # Start both dev servers
make dev-backend   # Backend only
make dev-frontend  # Frontend only
make test          # Run all tests
make lint          # Run all linters
make format        # Format all code
make docker-up     # Start full Docker stack
make migrate       # Run Alembic migrations
```

### Dev databases

```bash
docker compose -f docker-compose.dev.yml up -d    # Postgres:5433, Redis:6380
docker compose -f docker-compose.dev.yml down
```

## Architecture Patterns

- **Multi-tenant isolation**: every tenant-scoped table has `org_id` FK; middleware sets tenant context
- **RBAC**: Admin (full access), Hiring Manager (CRUD jobs, view interviews/reports), Viewer (read-only)
- **AI provider chain**: Gemini -> OpenAI -> Bonsai -> Claude; automatic fallback on failure
- **src-layout**: backend Python package lives in `backend/src/interviewbot/`
- **Async everywhere**: SQLAlchemy async engine, asyncpg, async FastAPI endpoints
- **API versioning**: all routes under `/api/v1/`
- **Public vs. authenticated**: candidate interview pages use unique tokens (no auth); dashboard requires JWT

## Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `organization` | Tenant (customer company) |
| `users` | Org members with role-based access |
| `subscription` | Stripe billing state |
| `job_posting` | Interview config per role, with skills and format |
| `interview_session` | One candidate's interview (status, scores, duration) |
| `interview_message` | Chat turns (role, content, media) |
| `candidate_report` | AI-generated scoring report |

## Naming Conventions

| Context | Style | Example |
|---------|-------|---------|
| Python files/packages | snake_case | `ai_engine.py`, `interviewbot` |
| Python classes | PascalCase | `InterviewEngine` |
| API routes | kebab-case | `/api/v1/job-postings` |
| DB tables | snake_case | `interview_session` |
| React components | PascalCase | `InterviewChat.tsx` |
| Next.js pages/dirs | kebab-case | `job-postings/` |
| Env vars | UPPER_SNAKE_CASE | `OPENAI_API_KEY` |

## Testing

- **Backend**: pytest with async support (`asyncio_mode = "auto"`), 90s timeout, coverage via pytest-cov
- **Markers**: `smoke` (fast critical-path), `integration` (external APIs), `slow` (>30s)
- **Frontend**: Playwright E2E tests (17 tests), mock API calls (no backend needed)
- **CI**: lint + type-check -> smoke tests -> full suite -> deploy (on main push)
- **Test DB**: uses `TEST_DATABASE_URL` env var; CI provides its own Postgres service

## Key Configuration

- `pyproject.toml` is the single source of truth for backend deps, ruff, mypy, and pytest config
- Ruff: line-length 99, extensive rule selection (F, E, I, N, UP, RUF, B, C4, ISC, PIE, PT, PTH, SIM, TID)
- mypy: strict mode, ignore_missing_imports
- pytest: random ordering disabled by default (`-p no:randomly`), strict markers, strict config

## Environment Variables

Required variables are in `.env` (not committed) with a template in `.env.example`. Key groups:
- **Database**: `DATABASE_URL`, `REDIS_URL`
- **Auth**: `JWT_SECRET`
- **AI**: `GEMINI_API_KEY`, `BONSAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- **LiveKit**: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Email**: `AGENTMAIL_API_KEY`, `SMTP_*` vars
- **Frontend**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_LIVEKIT_URL`

## Important Rules

1. Always use `uv` for Python package management -- never pip directly
2. Always use `structlog` for logging -- never `print()`
3. Never mix secrets with structural config -- `.env` for secrets only
4. Frontend and backend are independently deployable
5. Candidate interview pages are public (unique token access); dashboard pages require JWT auth
6. Every tenant-scoped DB table must have `org_id` for multi-tenant isolation
7. Pre-commit hooks are configured (`.pre-commit-config.yaml`) -- install with `pre-commit install`

## Seed Data

Demo org with two users (from `db/seed.sql`):

| Email | Password | Role |
|-------|----------|------|
| `admin@democorp.com` | `demo123456` | Admin |
| `hiring@democorp.com` | `demo123456` | Hiring Manager |
