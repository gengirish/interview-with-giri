.PHONY: dev dev-backend dev-frontend test test-backend test-frontend lint format docker-up docker-down migrate help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start both backend and frontend dev servers
	@echo "Starting backend..."
	cd backend && uv run uvicorn interviewbot.main:app --reload --port 8001 &
	@echo "Starting frontend..."
	cd frontend && npm run dev &
	@wait

dev-backend: ## Start backend dev server
	cd backend && uv run uvicorn interviewbot.main:app --reload --port 8001

dev-frontend: ## Start frontend dev server
	cd frontend && npm run dev

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests
	cd backend && uv run pytest tests/ -v --timeout=90

test-frontend: ## Run frontend E2E tests
	cd frontend && npx playwright test

lint: ## Run all linters
	cd backend && uv run ruff check src/ tests/
	cd frontend && npm run lint

format: ## Format all code
	cd backend && uv run ruff format src/ tests/
	cd frontend && npx prettier --write "src/**/*.{ts,tsx}"

docker-up: ## Start all services with Docker Compose
	docker compose -f docker/docker-compose.yml up -d

docker-down: ## Stop all Docker Compose services
	docker compose -f docker/docker-compose.yml down

migrate: ## Run database migrations
	cd backend && uv run alembic upgrade head

install: ## Install all dependencies
	cd backend && uv sync
	cd frontend && npm ci
