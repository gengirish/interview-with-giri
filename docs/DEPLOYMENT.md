# Deployment Guide — Interview with Giri

This guide covers deploying the Interview Bot platform using Fly.io, a self-managed VPS, or running locally for development.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Option 1: Fly.io (Recommended — Free Tier)](#option-1-flyio-recommended--free-tier)
- [Option 2: Single VPS with Docker Compose](#option-2-single-vps-with-docker-compose)
- [Local Development Setup](#local-development-setup)
- [Environment Variables Reference](#environment-variables-reference)
- [Database Migrations](#database-migrations)
- [SSL / HTTPS](#ssl--https)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────┐
│   Next.js 14     │──────▶│   FastAPI         │──────▶│  PostgreSQL  │
│   Frontend       │       │   Backend         │       │  16-alpine   │
│   (Fly.io)       │       │   (Fly.io)        │       │  (Neon)      │
└────────┬─────────┘       └────────┬──────────┘       └──────────────┘
         │ WebSocket                │
         └──────────────────────────┤
                                    │
                             ┌──────┴───────┐       ┌──────────────┐
                             │  AI Engine   │       │    Redis      │
                             │ OpenAI/Bonsai│       │  (Upstash)    │
                             │ /Claude      │       └──────────────┘
                             └──────────────┘
```

The platform splits into two deployable units:

| Unit | Technology | Deployed On |
|------|-----------|-------------|
| **Frontend** | Next.js 14 (App Router) | Fly.io (Docker) |
| **Backend** | FastAPI (async Python) + WebSockets | Fly.io (Docker) |
| **PostgreSQL** | PostgreSQL 16 | Neon (free) or self-hosted |
| **Redis** | Redis 7 | Upstash (free) or self-hosted |

---

## Option 1: Fly.io (Recommended — Free Tier)

**Total cost: $0** for development and demo usage.

| Component | Service | Free Tier |
|-----------|---------|-----------|
| Frontend | [Fly.io](https://fly.io) | 3 shared VMs, 256 MB each |
| Backend | [Fly.io](https://fly.io) | (shared with frontend quota) |
| PostgreSQL | [Neon](https://neon.tech) | 0.5 GB storage, always-on |
| Redis | [Upstash](https://upstash.com) | 10,000 commands/day |

### Step 1 — Provision Databases

#### Neon (PostgreSQL)

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project (select **US East** to be close to Fly.io's `iad` region)
3. Copy the connection string from the dashboard. It looks like:
   ```
   postgresql://neondb_owner:abc123@ep-cool-name-12345.us-east-1.aws.neon.tech/neondb
   ```
4. Convert it to the async driver format used by the backend:
   ```
   postgresql+asyncpg://neondb_owner:abc123@ep-cool-name-12345.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   - Replace `postgresql://` with `postgresql+asyncpg://`
   - Append `?sslmode=require`
   - Remove `&channel_binding=require` if present (not supported by asyncpg)

#### Upstash (Redis)

1. Sign up at [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (select **US East**)
3. Copy the Redis URL from the dashboard. It looks like:
   ```
   rediss://default:xxxxxxxxx@us1-xxxxx.upstash.io:6379
   ```
   Note the `rediss://` (with double-s) — this uses TLS, which Upstash requires.

### Step 2 — Install Fly CLI

```bash
# Windows (PowerShell)
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

# macOS / Linux
curl -L https://fly.io/install.sh | sh
```

Authenticate:

```bash
fly auth login
```

### Step 3 — Deploy Backend to Fly.io

```bash
cd backend

# Create the app (first time only)
fly apps create interview-with-giri-api --org personal

# Set secrets (environment variables)
fly secrets set \
  DATABASE_URL="postgresql+asyncpg://neondb_owner:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  REDIS_URL="rediss://default:TOKEN@xxx.upstash.io:6379" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  BONSAI_API_KEY="your-bonsai-key" \
  BONSAI_BASE_URL="https://api.trybons.ai/v1" \
  APP_URL="https://interview-with-giri-fe.fly.dev" \
  CORS_ORIGINS='["https://interview-with-giri-fe.fly.dev"]' \
  --app interview-with-giri-api

# Deploy
fly deploy --app interview-with-giri-api
```

Fly.io will:
1. Build the Docker image from `backend/Dockerfile`
2. Run `alembic upgrade head` (the `release_command` in `fly.toml`) to apply database migrations
3. Start the FastAPI server on port 8080
4. Assign a public URL: `https://interview-with-giri-api.fly.dev`

### Step 4 — Deploy Frontend to Fly.io

The frontend needs its own Fly app running the Next.js Docker image.

```bash
cd frontend

# Create the app
fly apps create interview-with-giri-fe --org personal

# Deploy with build args pointing to the backend
fly deploy \
  --app interview-with-giri-fe \
  --build-arg NEXT_PUBLIC_API_URL=https://interview-with-giri-api.fly.dev \
  --build-arg NEXT_PUBLIC_WS_URL=wss://interview-with-giri-api.fly.dev \
  --dockerfile Dockerfile
```

If `fly.toml` doesn't exist in `frontend/`, Fly auto-generates one. You can also create it manually:

```toml
app = "interview-with-giri-fe"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  DOCKER_BUILD = "1"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

### Step 5 — Update CORS on the Backend

Once both apps are deployed, update the backend secrets with the actual frontend URL:

```bash
fly secrets set \
  APP_URL="https://interview-with-giri-fe.fly.dev" \
  CORS_ORIGINS='["https://interview-with-giri-fe.fly.dev"]' \
  --app interview-with-giri-api
```

Fly.io auto-redeploys after secrets change.

### Step 6 — Verify

```bash
# Backend health check
curl https://interview-with-giri-api.fly.dev/api/v1/health

# Sign up a test user
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "org_name": "Test Corp",
    "full_name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'

# Login
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

Open `https://interview-with-giri-fe.fly.dev` in a browser to use the full UI.

### Custom Domain

```bash
# Add a custom domain to the frontend app
fly certs create yourdomain.com --app interview-with-giri-fe

# Add a custom domain to the backend app
fly certs create api.yourdomain.com --app interview-with-giri-api

# Then update DNS records as shown by the command output
```

After setting up custom domains, update CORS:

```bash
fly secrets set \
  APP_URL="https://yourdomain.com" \
  CORS_ORIGINS='["https://yourdomain.com"]' \
  --app interview-with-giri-api
```

### Useful Fly.io Commands

| Command | Description |
|---------|-------------|
| `fly status -a interview-with-giri-api` | Check app status and VM info |
| `fly logs -a interview-with-giri-api` | Stream live logs |
| `fly ssh console -a interview-with-giri-api` | SSH into the running VM |
| `fly secrets list -a interview-with-giri-api` | List configured secrets |
| `fly scale count 2 -a interview-with-giri-api` | Scale to 2 instances |
| `fly deploy -a interview-with-giri-api` | Deploy latest changes |
| `fly apps destroy interview-with-giri-api` | Delete the app |

### Redeployment

After code changes, push to Git and redeploy:

```bash
# Backend
cd backend && fly deploy

# Frontend (rebuild with backend URL baked in)
cd frontend && fly deploy \
  --build-arg NEXT_PUBLIC_API_URL=https://interview-with-giri-api.fly.dev \
  --build-arg NEXT_PUBLIC_WS_URL=wss://interview-with-giri-api.fly.dev
```

---

## Option 2: Single VPS with Docker Compose

Best for: full control, custom domains with SSL, or when you want everything on one server.

### Prerequisites

- A VPS with at least **2 GB RAM** (e.g., DigitalOcean $12/mo, Hetzner $4/mo)
- A domain name pointing to the server IP
- SSH access

### Step 1 — Server Setup

```bash
# SSH into your server
ssh root@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt-get install -y docker-compose-plugin

# Clone the repo
git clone https://github.com/gengirish/interview-with-giri.git
cd interview-with-giri
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
nano .env
```

Set these values for production:

```bash
# Database
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql+asyncpg://postgres:<same-password>@postgres:5432/interviewbot

# Redis (internal Docker network)
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=<openssl rand -hex 32>

# AI
BONSAI_API_KEY=<your key>

# App — use your actual domain
APP_ENV=production
DEBUG=false
APP_URL=https://yourdomain.com
CORS_ORIGINS=["https://yourdomain.com"]
```

### Step 3 — Configure Nginx for Your Domain

Edit `docker/nginx.conf` and replace `server_name _;` with your domain:

```nginx
server_name yourdomain.com www.yourdomain.com;
```

### Step 4 — Deploy

```bash
# Build and start all services
docker compose -f docker/docker-compose.prod.yml up -d --build

# Check that all services are healthy
docker compose -f docker/docker-compose.prod.yml ps
```

This starts 6 services:

| Service | Purpose | Port |
|---------|---------|------|
| `postgres` | Database | Internal only |
| `redis` | Cache & rate limiting | Internal only |
| `backend` | FastAPI API server | 8001 (internal) |
| `frontend` | Next.js app | 3000 (internal) |
| `nginx` | Reverse proxy + SSL | 80, 443 |
| `certbot` | Auto-renews SSL certs | — |

### Step 5 — Enable SSL (HTTPS)

```bash
# Request initial certificate
docker compose -f docker/docker-compose.prod.yml run --rm certbot \
  certonly --webroot \
  --webroot-path /var/www/certbot \
  -d yourdomain.com \
  --email you@email.com \
  --agree-tos \
  --no-eff-email
```

After obtaining the certificate, update `docker/nginx.conf`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then restart Nginx:

```bash
docker compose -f docker/docker-compose.prod.yml restart nginx
```

The Certbot container auto-renews certificates every 12 hours.

### Step 6 — Verify

```bash
curl https://yourdomain.com/api/v1/health
```

Open `https://yourdomain.com` in a browser.

---

## Local Development Setup

For day-to-day development, run databases in Docker and the app natively.

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (fast Python package manager)
- Node.js 20+
- Docker Desktop

### Steps

```bash
# 1. Clone and configure
git clone https://github.com/gengirish/interview-with-giri.git
cd interview-with-giri
cp .env.example .env
# Edit .env: set JWT_SECRET and BONSAI_API_KEY at minimum

# 2. Start Postgres (port 5433) and Redis (port 6380)
docker compose -f docker-compose.dev.yml up -d

# 3. Start backend
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn interviewbot.main:app --host 0.0.0.0 --port 8001 --reload

# 4. Start frontend (separate terminal)
cd frontend
npm install
npm run dev

# 5. Open http://localhost:3000
```

> The dev compose uses non-standard ports (5433, 6380) to avoid conflicts with locally installed Postgres/Redis. The `.env.example` `DATABASE_URL` and `REDIS_URL` already match these ports.

### Seed Data

The dev database is pre-loaded with demo users:

| Email | Password | Role |
|-------|----------|------|
| `admin@democorp.com` | `demo123456` | Admin |
| `hiring@democorp.com` | `demo123456` | Hiring Manager |

### Running Tests

```bash
cd backend
uv run pytest              # all tests with coverage
uv run pytest -v --tb=short  # verbose, short tracebacks
uv run ruff check src/     # linting
uv run mypy src/            # type checking
```

---

## Environment Variables Reference

### Required for All Deployments

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg driver) | `postgresql+asyncpg://user:pass@host/db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` or `rediss://...` (TLS) |
| `JWT_SECRET` | Secret key for signing JWT tokens | `openssl rand -hex 32` |

### AI Providers (at least one required)

| Variable | Description |
|----------|-------------|
| `BONSAI_API_KEY` | Free tier at [trybons.ai](https://trybons.ai) — recommended for dev |
| `BONSAI_BASE_URL` | Default: `https://api.trybons.ai/v1` |
| `OPENAI_API_KEY` | OpenAI API key (primary if set) |
| `ANTHROPIC_API_KEY` | Claude fallback provider |

The AI engine uses a **provider chain**: OpenAI → Bonsai → Claude. It automatically tries the next provider if the current one fails.

### Application Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | `dev` or `production` | `dev` |
| `DEBUG` | Enable debug logging | `true` |
| `APP_URL` | Public URL of the frontend | `http://localhost:3000` |
| `CORS_ORIGINS` | JSON array of allowed origins | `["http://localhost:3000"]` |

### Frontend (Build-Time)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (baked into JS at build time) |
| `NEXT_PUBLIC_WS_URL` | Backend WebSocket URL |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit server URL (for video interviews) |
| `NEXT_PUBLIC_STRIPE_KEY` | Stripe publishable key |

> Changing any `NEXT_PUBLIC_*` variable requires a **redeploy** of the frontend.

### Optional Services

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `ELEVENLABS_API_KEY` | Voice interview TTS |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Video interviews |
| `JUDGE0_API_URL` | Code execution (default: RapidAPI endpoint) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Email notifications |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` | File storage |

---

## Database Migrations

The backend uses [Alembic](https://alembic.sqlalchemy.org/) for schema migrations.

```bash
cd backend

# Apply all pending migrations
uv run alembic upgrade head

# Create a new migration after changing models
uv run alembic revision --autogenerate -m "describe your change"

# View migration history
uv run alembic history

# Rollback one step
uv run alembic downgrade -1
```

On Fly.io, migrations run automatically before each deploy via the `release_command` in `fly.toml`.

---

## SSL / HTTPS

### Fly.io (Option 1)

Fly.io provides **automatic HTTPS** with managed TLS certificates — no configuration needed. Custom domains also get automatic SSL via `fly certs create`.

### VPS with Docker (Option 2)

SSL is handled by Certbot + Nginx. The `docker/docker-compose.prod.yml` includes both services. See [Step 5 in Option 2](#step-5--enable-ssl-https) for setup instructions.

Certificates auto-renew every 12 hours via the Certbot container.

---

## Monitoring & Health Checks

### Health Endpoint

```bash
# Basic health (always returns 200 if the server is running)
GET /api/v1/health

# Database connectivity check
GET /api/v1/health/db
```

### Fly.io Health Checks

The `fly.toml` configures automatic health checks:

- **Path**: `/api/v1/health`
- **Interval**: every 30 seconds
- **Timeout**: 5 seconds
- **Grace period**: 10 seconds after deploy

If the health check fails, Fly.io automatically restarts the machine.

### Docker Health Checks

All services in `docker-compose.prod.yml` have built-in health checks:

- **Postgres**: `pg_isready` every 10s
- **Redis**: `redis-cli ping` every 10s
- **Backend**: `curl /api/v1/health` every 30s

### Logs

```bash
# Fly.io — stream live logs
fly logs -a interview-with-giri-api
fly logs -a interview-with-giri-fe

# VPS Docker deployment — view logs
docker compose -f docker/docker-compose.prod.yml logs -f backend
docker compose -f docker/docker-compose.prod.yml logs -f frontend
```

---

## Troubleshooting

### "CORS error" in browser console

Your `CORS_ORIGINS` on the backend doesn't include the frontend URL. Update it:

```bash
fly secrets set CORS_ORIGINS='["https://interview-with-giri-fe.fly.dev"]' -a interview-with-giri-api
```

### Fly.io deploy fails with "release command failed"

The `alembic upgrade head` release command can't connect to the database. Verify:

```bash
# Check that DATABASE_URL is set
fly secrets list -a interview-with-giri-api

# Check logs for the actual error
fly logs -a interview-with-giri-api
```

Common causes:
- `DATABASE_URL` has a placeholder password — update it with the real Neon password
- Missing `?sslmode=require` at the end of the Neon URL

### Fly.io build fails with "Readme file does not exist"

The Dockerfile creates a stub `README.md` at `/README.md` to satisfy hatchling. If you see this error, ensure line 20 of `backend/Dockerfile` has:
```dockerfile
RUN echo "# Interview Bot" > /README.md && uv sync --frozen --no-dev
```

### "Connection refused" for database

- **Neon**: Make sure you appended `?sslmode=require` to the URL and removed `&channel_binding=require`
- **Fly.io**: The `DATABASE_URL` must point to the external Neon URL, not `localhost`
- **Local**: Make sure Docker containers are running (`docker compose -f docker-compose.dev.yml ps`)

### Frontend shows stale API URL

`NEXT_PUBLIC_*` variables are baked in at build time. You must redeploy:

```bash
cd frontend && fly deploy \
  --build-arg NEXT_PUBLIC_API_URL=https://interview-with-giri-api.fly.dev \
  --build-arg NEXT_PUBLIC_WS_URL=wss://interview-with-giri-api.fly.dev
```

### Machine suspended / slow cold start

Fly.io suspends idle machines on the free tier. The first request after suspension takes 3-5 seconds. To keep it always running:

```bash
fly scale count 1 --app interview-with-giri-api
fly machine update --auto-stop=off --app interview-with-giri-api
```

### Rate limiting (429 Too Many Requests)

The backend rate-limits auth endpoints (5 signups/min, 10 logins/min per IP). If you hit this during testing, wait 60 seconds or adjust limits in `backend/src/interviewbot/routers/auth.py`.

---

## File Reference

| File | Purpose |
|------|---------|
| `backend/fly.toml` | Fly.io backend app config (region, VM, health checks, release command) |
| `backend/Dockerfile` | Multi-stage Docker build with uv + Alembic |
| `backend/.dockerignore` | Files excluded from Docker image builds |
| `frontend/Dockerfile` | Multi-stage Docker build (deps → build → runner) |
| `frontend/next.config.mjs` | API rewrites + conditional standalone output |
| `docker/docker-compose.prod.yml` | Full-stack production Docker Compose (6 services) |
| `docker/nginx.conf` | Nginx reverse proxy with WebSocket support |
| `docker-compose.dev.yml` | Dev-only Postgres + Redis |
| `.env.example` | Environment variable template |
| `.github/workflows/ci.yml` | GitHub Actions CI (lint, type check, test, build) |
