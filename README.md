# Interview with Giri

AI-powered **Interview as a Service (IaaS)** platform. Create job postings, generate shareable interview links, and let an AI interviewer conduct structured technical and non-technical interviews — then score and report on every candidate automatically.

## Features

- **Text, Voice & Video Interviews** — candidates join via a browser link, no login required
- **AI-Driven Question Flow** — dynamically adapts follow-up questions based on candidate responses
- **Live Code Assessment** — integrated Monaco editor with Judge0 execution for coding interviews
- **Automated Scoring & Reports** — multi-dimensional rubric scoring with AI-generated candidate reports
- **Multi-Tenant** — organization-based data isolation with role-based access
- **Billing** — Stripe-powered subscription tiers (Free, Pro, Enterprise)
- **Webhook & Email Notifications** — notify external systems and stakeholders on interview events
- **Analytics Dashboard** — score distributions, pass rates, per-job breakdowns with Recharts

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js    │────▶│   FastAPI    │────▶│  PostgreSQL  │
│  (React 18)  │     │  (async)     │     │   16-alpine  │
│  Port 3000   │     │  Port 8001   │     │   Port 5432  │
└──────┬───────┘     └──────┬───────┘     └──────────────┘
       │                    │
       │ WebSocket          │
       └────────────────────┤
                            │
                     ┌──────┴───────┐     ┌──────────────┐
                     │  AI Engine   │     │    Redis      │
                     │ OpenAI/Bonsai│     │  (cache/jobs) │
                     │ /Claude      │     │   Port 6379   │
                     └──────────────┘     └──────────────┘
```

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, Recharts |
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, structlog |
| AI | OpenAI GPT-4o, Bonsai (free tier), Anthropic Claude — provider chain with automatic fallback |
| Real-time | WebSocket (text/voice chat), LiveKit (WebRTC video) |
| Code Exec | Judge0 CE API |
| Database | PostgreSQL 16, Redis 7 |
| Billing | Stripe (subscriptions, webhooks, usage metering) |
| Tooling | [uv](https://docs.astral.sh/uv/) (package management), nox (task runner), ruff (lint/format), mypy (type check) |
| Infra | Docker, Docker Compose, GitHub Actions CI |

## Project Structure

```
interview-with-giri/
├── backend/                    # FastAPI application
│   ├── src/interviewbot/
│   │   ├── routers/            # API endpoints (auth, jobs, interviews, billing, ...)
│   │   ├── services/           # Business logic (ai_engine, scoring, voice, code_executor)
│   │   ├── models/             # SQLAlchemy tables, Pydantic schemas, DB session
│   │   ├── middleware/         # Tenant isolation middleware
│   │   ├── websocket/          # WebSocket handlers (text chat, voice)
│   │   └── utils/              # Logging config
│   ├── tests/                  # pytest test suite
│   ├── alembic/                # DB migrations
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── uv.lock                # deterministic lockfile
├── frontend/                   # Next.js application
│   └── src/
│       ├── app/
│       │   ├── (auth)/         # Login & Signup pages
│       │   ├── dashboard/      # Jobs, Interviews, Analytics, Settings
│       │   └── interview/      # Public candidate portal (text/voice/video/code)
│       ├── components/         # Reusable UI components
│       └── lib/                # API client, utilities
├── db/
│   ├── init.sql                # Schema creation
│   └── seed.sql                # Demo data
├── docker/
│   └── docker-compose.yml      # Full-stack production compose
├── docker-compose.dev.yml      # Dev compose (Postgres + Redis only)
├── .github/workflows/ci.yml    # CI pipeline
└── .env.example                # Environment variable reference
```

## Quick Start

### Prerequisites

- **Python** 3.12+
- **[uv](https://docs.astral.sh/uv/)** — fast Python package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Node.js** 20+
- **Docker** (for Postgres & Redis)
- An LLM API key — [Bonsai](https://trybons.ai) is free and recommended for development

### 1. Clone & configure

```bash
git clone https://github.com/gengirish/interview-with-giri.git
cd interview-with-giri
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
JWT_SECRET=<run: openssl rand -hex 32>
BONSAI_API_KEY=<your key from https://trybons.ai>
```

### 2. Start databases

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts PostgreSQL (host port **5433**) and Redis (host port **6380**). The database schema and demo data are auto-loaded from `db/init.sql` and `db/seed.sql`.

> **Note**: The dev compose maps to non-standard ports to avoid conflicts. The `.env.example` already has the matching `DATABASE_URL` and `REDIS_URL`.

### 3. Start the backend

```bash
cd backend
uv sync                # creates .venv and installs all deps from lockfile (~5s)
uv run uvicorn interviewbot.main:app --host 0.0.0.0 --port 8001 --reload
```

Backend runs at **http://localhost:8001**. API docs at **http://localhost:8001/api/docs**.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**.

### 5. Try it out

1. Open **http://localhost:3000** and sign up
2. Go to **Jobs** and create a posting (e.g. "Senior Python Developer")
3. Click **Generate Link** to get a shareable interview URL
4. Open that link in an incognito window to take the interview as a candidate
5. After completing, go to **Interviews** in the dashboard to view the transcript and generate an AI report

## Deploy to the Cloud (Free Tier)

The recommended zero-cost deployment splits the stack across free-tier services:

| Component | Service | Free Tier |
|-----------|---------|-----------|
| Frontend | [Vercel](https://vercel.com) | Unlimited for hobby |
| Backend | [Railway](https://railway.app) | 500 hrs/month, $5 credit |
| PostgreSQL | [Neon](https://neon.tech) | 0.5 GB, always-on |
| Redis | [Upstash](https://upstash.com) | 10K commands/day |

### Step 1 — Provision databases

**Neon (PostgreSQL)**
1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string — it looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb`
3. Append `?sslmode=require` and swap the driver: `postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

**Upstash (Redis)**
1. Create a database at [upstash.com](https://console.upstash.com)
2. Copy the Redis URL — it looks like `rediss://default:xxx@us1-xxx.upstash.io:6379`

### Step 2 — Deploy backend to Railway

1. Go to [railway.app](https://railway.app) and create a new project
2. Click **Deploy from GitHub repo** → select `interview-with-giri`
3. Set **Root Directory** to `backend`
4. Add these environment variables in the Railway dashboard:

```
DATABASE_URL=postgresql+asyncpg://...your-neon-url...
REDIS_URL=rediss://...your-upstash-url...
JWT_SECRET=<openssl rand -hex 32>
BONSAI_API_KEY=<your key>
APP_ENV=production
CORS_ORIGINS=["https://your-app.vercel.app"]
APP_URL=https://your-app.vercel.app
```

5. Railway auto-detects the `Dockerfile` and deploys. Alembic migrations run automatically via the `Procfile` release command.
6. Note the public URL Railway gives you (e.g. `https://interview-with-giri-production.up.railway.app`).

### Step 3 — Deploy frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and import the GitHub repo
2. Set **Root Directory** to `frontend`
3. Set **Framework Preset** to `Next.js`
4. Add environment variables:

```
NEXT_PUBLIC_API_URL=https://interview-with-giri-production.up.railway.app
NEXT_PUBLIC_WS_URL=wss://interview-with-giri-production.up.railway.app
```

5. Click **Deploy** — Vercel builds and serves the frontend at your `*.vercel.app` domain.
6. Go back to Railway and update `CORS_ORIGINS` and `APP_URL` with the actual Vercel URL.

### Step 4 — Verify

```bash
# Health check
curl https://your-railway-url/api/v1/health

# Sign up
curl -X POST https://your-railway-url/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"org_name":"Test Corp","full_name":"Test User","email":"test@test.com","password":"password123"}'
```

Then open your Vercel URL in a browser to use the full UI.

## Full Docker Deployment

To run everything (backend + frontend + databases) in Docker:

```bash
docker compose -f docker/docker-compose.yml up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| API Docs | http://localhost:8001/api/docs |

## API Overview

All endpoints are prefixed with `/api/v1/`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Create account + organization |
| POST | `/auth/login` | Get JWT token |
| CRUD | `/job-postings` | Manage job postings |
| POST | `/job-postings/{id}/generate-link` | Generate candidate interview link |
| POST | `/job-postings/{id}/extract-skills` | AI skill extraction from job description |
| GET | `/interviews` | List interview sessions |
| GET | `/interviews/public/{token}` | Public interview details (for candidates) |
| POST | `/reports/{id}/generate` | Generate AI scoring report |
| GET | `/reports/{id}` | Retrieve candidate report |
| GET | `/analytics/overview` | Org-wide analytics |
| GET | `/analytics/per-job` | Per-job performance metrics |
| GET | `/dashboard/stats` | Dashboard summary stats |
| POST | `/code/execute` | Run code via Judge0 (requires interview token) |
| POST | `/billing/checkout` | Create Stripe checkout session |
| GET | `/billing/plans` | List subscription plans |
| WS | `/ws/interview/{token}` | Text interview WebSocket |
| WS | `/ws/voice-interview/{token}` | Voice interview WebSocket |

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BONSAI_API_KEY` | Recommended | Free LLM access via [Bonsai](https://trybons.ai) |
| `OPENAI_API_KEY` | Optional | OpenAI API key (primary provider if set) |
| `ANTHROPIC_API_KEY` | Optional | Claude fallback provider |
| `ELEVENLABS_API_KEY` | For voice | Text-to-speech for voice interviews |
| `STRIPE_SECRET_KEY` | For billing | Stripe subscription management |
| `JUDGE0_API_URL` | For coding | Code execution service |

The AI engine uses a **provider chain**: OpenAI → Bonsai → Claude. It automatically falls back to the next provider if the current one is unavailable.

## Development

### Code Quality (Backend)

```bash
cd backend

# Lint & format
uv run ruff check src/ --fix
uv run ruff format src/

# Type checking
uv run mypy src/

# Run all tests (requires Postgres running via docker-compose.dev.yml)
uv run pytest

# Run tests with verbose output
uv run pytest -v --tb=short

# Run all checks via nox
uv run nox
```

### Database Migrations (Alembic)

```bash
cd backend

# Generate a new migration after model changes
uv run alembic revision --autogenerate -m "describe your change"

# Apply migrations
uv run alembic upgrade head
```

### Lint (Frontend)

```bash
cd frontend
npm run lint
```

### Seed Users

The `db/seed.sql` creates a demo organization with two users:

| Email | Password | Role |
|-------|----------|------|
| `admin@democorp.com` | `demo123456` | Admin |
| `hiring@democorp.com` | `demo123456` | Hiring Manager |

### CI

GitHub Actions runs on every push — linting, type checking, and tests. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

MIT
