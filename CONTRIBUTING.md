# Contributing to Interview Bot

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker and Docker Compose
- PostgreSQL 16
- Redis 7

## Quick Start

```bash
# Install all dependencies
make install

# Start development servers
make dev

# Or start individually
make dev-backend   # Backend on :8001
make dev-frontend  # Frontend on :3000
```

## Development Workflow

### Backend

```bash
cd backend

# Run tests
uv run pytest tests/ -v

# Lint and format
uv run ruff check src/ tests/ --fix
uv run ruff format src/ tests/

# Run migrations
uv run alembic upgrade head

# Create a new migration
uv run alembic revision --autogenerate -m "description"
```

### Frontend

```bash
cd frontend

# Run E2E tests
npx playwright test

# Run E2E tests with browser visible
npx playwright test --headed

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

### Docker

```bash
# Start all services
make docker-up

# Stop all services
make docker-down
```

## Project Structure

```
interview-with-giri/
├── backend/                 # FastAPI backend
│   ├── src/interviewbot/    # Application code
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── models/          # DB models & schemas
│   │   ├── middleware/       # Custom middleware
│   │   └── websocket/       # WebSocket handlers
│   ├── tests/               # Pytest test suite
│   └── alembic/             # DB migrations
├── frontend/                # Next.js frontend
│   ├── src/app/             # App router pages
│   ├── src/components/      # Reusable components
│   ├── src/lib/             # Utilities
│   └── tests/e2e/           # Playwright tests
├── docker/                  # Docker configs
└── .github/workflows/       # CI/CD
```

## Testing

### Backend Tests
- 207+ tests covering API endpoints, WebSocket flows, and services
- Tests require PostgreSQL and Redis
- Run with: `make test-backend`

### Frontend E2E Tests
- 17 Playwright tests covering auth, dashboard, jobs, interviews, and responsive design
- Tests mock API calls (no backend needed)
- Run with: `make test-frontend`

## CI/CD Pipeline

On push to `main`:
1. Backend: lint, type-check, smoke tests, full test suite
2. Frontend: lint, type-check, build, Playwright E2E
3. Deploy: backend to Fly.io, frontend to Vercel

## Code Style

- **Backend**: Ruff for linting and formatting (configured in `pyproject.toml`)
- **Frontend**: ESLint + Prettier
- **Pre-commit hooks**: Install with `pre-commit install`

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values. See the file for documentation on each variable.
