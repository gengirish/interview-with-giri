# Deployment Guide — Interview with Giri

This guide covers every deployment option for the Interview Bot platform, from local development through to production on free-tier cloud services or a self-managed VPS.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Option 1: Vercel + Fly.io (Recommended — Free)](#option-1-vercel--flyio-recommended--free)
- [Option 2: Vercel + Railway](#option-2-vercel--railway)
- [Option 3: Single VPS with Docker Compose](#option-3-single-vps-with-docker-compose)
- [Option 4: Render (Alternative PaaS)](#option-4-render-alternative-paas)
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
│   (Vercel)       │       │   (Railway)       │       │  (Neon)      │
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

The platform splits cleanly into two deployable units:

| Unit | Technology | Best Deployed On |
|------|-----------|-----------------|
| **Frontend** | Next.js 14 (App Router) | Vercel, Netlify, or any Node.js host |
| **Backend** | FastAPI (async Python) + WebSockets | Railway, Render, Fly.io, or VPS |
| **PostgreSQL** | PostgreSQL 16 | Neon (free), Supabase, or self-hosted |
| **Redis** | Redis 7 | Upstash (free) or self-hosted |

---

## Option 1: Vercel + Fly.io (Recommended — Free)

**Total cost: $0** for development and demo usage.

| Component | Service | Free Tier |
|-----------|---------|-----------|
| Frontend | [Vercel](https://vercel.com) | Unlimited hobby projects |
| Backend | [Fly.io](https://fly.io) | 3 shared VMs, 256 MB each |
| PostgreSQL | [Neon](https://neon.tech) | 0.5 GB storage, always-on |
| Redis | [Upstash](https://upstash.com) | 10,000 commands/day |

### Step 1 — Provision Databases

Follow the [Neon](#neon-postgresql) and [Upstash](#upstash-redis) setup in the databases section below (same for all options).

### Step 2 — Install Fly CLI

```bash
# Windows (PowerShell)
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

# macOS / Linux
curl -L https://fly.io/install.sh | sh
```

Then authenticate:

```bash
fly auth login
```

### Step 3 — Deploy Backend to Fly.io

```bash
cd backend

# Create the app (first time only)
fly launch --no-deploy --name interview-with-giri-api --region iad

# Set secrets (environment variables)
fly secrets set \
  DATABASE_URL="postgresql+asyncpg://neondb_owner:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  REDIS_URL="rediss://default:TOKEN@xxx.upstash.io:6379" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  BONSAI_API_KEY="your-bonsai-key" \
  BONSAI_BASE_URL="https://api.trybons.ai/v1" \
  APP_URL="https://your-app.vercel.app" \
  CORS_ORIGINS='["https://your-app.vercel.app"]'

# Deploy
fly deploy
```

Fly.io will:
1. Build the Docker image from `backend/Dockerfile`
2. Run `alembic upgrade head` (the `release_command` in `fly.toml`) to apply migrations
3. Start the FastAPI server on port 8080
4. Assign a public URL: `https://interview-with-giri-api.fly.dev`

### Step 4 — Deploy Frontend to Vercel

```bash
cd frontend

# Login (first time only — opens browser)
vercel login

# Deploy to production with env vars
vercel --prod \
  -e NEXT_PUBLIC_API_URL=https://interview-with-giri-api.fly.dev \
  -e NEXT_PUBLIC_WS_URL=wss://interview-with-giri-api.fly.dev
```

Or set env vars permanently:

```bash
vercel env add NEXT_PUBLIC_API_URL production    # paste: https://interview-with-giri-api.fly.dev
vercel env add NEXT_PUBLIC_WS_URL production     # paste: wss://interview-with-giri-api.fly.dev
vercel --prod
```

### Step 5 — Update CORS on Fly.io

Once Vercel gives you the final URL:

```bash
cd backend
fly secrets set \
  APP_URL="https://interview-with-giri.vercel.app" \
  CORS_ORIGINS='["https://interview-with-giri.vercel.app"]'
```

Fly.io auto-redeploys after secrets change.

### Step 6 — Verify

```bash
# Health check
curl https://interview-with-giri-api.fly.dev/api/v1/health

# Signup
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"org_name":"Test Corp","full_name":"Test User","email":"test@example.com","password":"password123"}'
```

Open your Vercel URL in a browser to use the full UI.

### Useful Fly.io Commands

| Command | Description |
|---------|-------------|
| `fly status` | Check app status and VM info |
| `fly logs` | Stream live logs |
| `fly ssh console` | SSH into the running VM |
| `fly secrets list` | List configured secrets |
| `fly scale count 2` | Scale to 2 instances |
| `fly deploy` | Deploy latest changes |
| `fly apps destroy interview-with-giri-api` | Delete the app |

---

## Option 2: Vercel + Railway

**Total cost: $0** for development and demo usage.

| Component | Service | Free Tier Limits |
|-----------|---------|-----------------|
| Frontend | [Vercel](https://vercel.com) | Unlimited hobby projects |
| Backend | [Railway](https://railway.app) | 500 hrs/month, $5 credit |
| PostgreSQL | [Neon](https://neon.tech) | 0.5 GB storage, always-on |
| Redis | [Upstash](https://upstash.com) | 10,000 commands/day |

### Step 1 — Provision Databases

#### Neon (PostgreSQL)

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project (select a region close to your Railway deployment)
3. Copy the connection string from the dashboard. It looks like:
   ```
   postgresql://neondb_owner:abc123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb
   ```
4. Convert it to the async driver format used by the backend:
   ```
   postgresql+asyncpg://neondb_owner:abc123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   - Replace `postgresql://` with `postgresql+asyncpg://`
   - Append `?sslmode=require`

#### Upstash (Redis)

1. Sign up at [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (select a region close to Railway)
3. Copy the Redis URL from the dashboard. It looks like:
   ```
   rediss://default:xxxxxxxxx@us1-xxxxx.upstash.io:6379
   ```
   Note the `rediss://` (with double-s) — this uses TLS, which Upstash requires.

### Step 2 — Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) and create a new project
2. Click **"Deploy from GitHub repo"** and select `interview-with-giri`
3. In the service settings:
   - Set **Root Directory** to `backend`
   - Railway auto-detects the `Dockerfile` and builds from it
4. Go to **Variables** and add these environment variables:

```bash
# Required
DATABASE_URL=postgresql+asyncpg://...your-neon-connection-string...?sslmode=require
REDIS_URL=rediss://...your-upstash-url...
JWT_SECRET=<generate with: openssl rand -hex 32>
APP_ENV=production
DEBUG=false

# AI Provider (at least one required)
BONSAI_API_KEY=<your key from https://trybons.ai>
BONSAI_BASE_URL=https://api.trybons.ai/v1

# CORS — update after Vercel deploy gives you a URL
CORS_ORIGINS=["https://your-app.vercel.app"]
APP_URL=https://your-app.vercel.app
```

5. Railway runs the `Procfile` automatically:
   - **release**: `alembic upgrade head` — runs database migrations before each deploy
   - **web**: starts the FastAPI server on the Railway-assigned `$PORT`
6. Once deployed, Railway assigns a public URL like:
   ```
   https://interview-with-giri-production.up.railway.app
   ```
   Copy this URL — you'll need it for the frontend.

### Step 3 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**
2. Import the `interview-with-giri` GitHub repository
3. Configure the project:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Install Command**: `npm install` (default)
4. Add environment variables:

```bash
NEXT_PUBLIC_API_URL=https://interview-with-giri-production.up.railway.app
NEXT_PUBLIC_WS_URL=wss://interview-with-giri-production.up.railway.app
```

> **Important**: `NEXT_PUBLIC_` variables are baked in at build time. If you change them, you must redeploy.

5. Click **Deploy**
6. Vercel gives you a URL like `https://interview-with-giri.vercel.app`

### Step 4 — Update CORS on Railway

Go back to Railway and update two variables with your actual Vercel URL:

```bash
CORS_ORIGINS=["https://interview-with-giri.vercel.app"]
APP_URL=https://interview-with-giri.vercel.app
```

Railway will automatically redeploy after the variable change.

### Step 5 — Verify

```bash
# Backend health check
curl https://interview-with-giri-production.up.railway.app/api/v1/health

# Sign up a test user
curl -X POST https://interview-with-giri-production.up.railway.app/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "org_name": "Test Corp",
    "full_name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'

# Login
curl -X POST https://interview-with-giri-production.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

Then open your Vercel URL in a browser to use the full UI.

### How It Works

The `next.config.mjs` uses [rewrites](https://nextjs.org/docs/app/api-reference/next-config-js/rewrites) to proxy `/api/*` and `/ws/*` requests from the Vercel frontend to the Railway backend:

```javascript
async rewrites() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
  return [
    { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
    { source: "/ws/:path*",  destination: `${apiUrl.replace("http", "ws")}/ws/:path*` },
  ];
}
```

The `output: "standalone"` option is only enabled when `DOCKER_BUILD=1` is set (Docker builds), so Vercel uses its default optimized output.

---

## Option 3: Single VPS with Docker Compose

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

# Update nginx.conf to use SSL (add this server block)
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

## Option 4: Render (Alternative PaaS)

[Render](https://render.com) is another free-tier PaaS that supports Docker deployments.

### Backend on Render

1. Go to [render.com](https://render.com) → New **Web Service**
2. Connect the `interview-with-giri` repo
3. Settings:
   - **Root Directory**: `backend`
   - **Runtime**: Docker
   - **Health Check Path**: `/api/v1/health`
4. Add the same environment variables as in the Railway setup
5. Add a **Pre-Deploy Command**: `alembic upgrade head`

### Frontend on Vercel (same as Option 1)

Follow [Step 3 from Option 1](#step-3--deploy-frontend-to-vercel), using the Render backend URL for `NEXT_PUBLIC_API_URL`.

> **Note**: Render's free tier spins down after 15 minutes of inactivity. The first request after a cold start takes ~30 seconds. Railway does not have this limitation.

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

On Railway/Render, migrations run automatically before each deploy via the `Procfile` release command or the `railway.toml` start command.

---

## SSL / HTTPS

### Vercel + Railway (Option 1)

Both Vercel and Railway provide **automatic HTTPS** — no configuration needed.

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

### Docker Health Checks

All services in `docker-compose.prod.yml` have built-in health checks:

- **Postgres**: `pg_isready` every 10s
- **Redis**: `redis-cli ping` every 10s
- **Backend**: `curl /api/v1/health` every 30s

### Logs

```bash
# VPS Docker deployment — view logs
docker compose -f docker/docker-compose.prod.yml logs -f backend
docker compose -f docker/docker-compose.prod.yml logs -f frontend

# Railway — view logs in the dashboard or via CLI
railway logs
```

---

## Troubleshooting

### "CORS error" in browser console

Your `CORS_ORIGINS` on the backend doesn't include the frontend URL. Update it:
```bash
CORS_ORIGINS=["https://your-frontend-url.vercel.app"]
```
Restart the backend after changing.

### "502 Bad Gateway" on Vercel

The `NEXT_PUBLIC_API_URL` is wrong or the backend is down. Verify:
```bash
curl $NEXT_PUBLIC_API_URL/api/v1/health
```

### "Connection refused" for database

- **Neon**: Make sure you appended `?sslmode=require` to the URL
- **Railway**: The `DATABASE_URL` must use the internal Docker hostname (`postgres`) if co-located, or the Neon external URL if using managed Postgres
- **Local**: Make sure Docker containers are running (`docker compose -f docker-compose.dev.yml ps`)

### Railway build fails with "uv.lock not found"

Ensure `uv.lock` is committed to the repository:
```bash
cd backend
uv lock
git add uv.lock && git commit -m "chore: update uv.lock"
git push
```

### Frontend shows stale API URL after changing `NEXT_PUBLIC_API_URL`

`NEXT_PUBLIC_*` variables are baked in at build time. You must trigger a **redeploy** on Vercel (Settings → Deployments → Redeploy) after changing them.

### Rate limiting (429 Too Many Requests)

The backend rate-limits auth endpoints (5 signups/min, 10 logins/min per IP). If you hit this during testing, wait 60 seconds or adjust limits in `backend/src/interviewbot/routers/auth.py`.

---

## File Reference

| File | Purpose |
|------|---------|
| `frontend/vercel.json` | Vercel build configuration |
| `frontend/next.config.mjs` | API rewrites + conditional standalone output |
| `frontend/Dockerfile` | Multi-stage Docker build (deps → build → runner) |
| `backend/Dockerfile` | Multi-stage Docker build with uv + Alembic |
| `backend/fly.toml` | Fly.io app configuration (region, VM size, health checks) |
| `backend/Procfile` | Railway/Render process definitions |
| `backend/railway.toml` | Railway-specific build and deploy settings |
| `backend/.dockerignore` | Files excluded from Docker image builds |
| `docker/docker-compose.prod.yml` | Full-stack production Docker Compose (6 services) |
| `docker/nginx.conf` | Nginx reverse proxy with WebSocket support |
| `docker-compose.dev.yml` | Dev-only Postgres + Redis |
| `.env.example` | Environment variable template |
| `.github/workflows/ci.yml` | GitHub Actions CI (lint, type check, test, build) |
