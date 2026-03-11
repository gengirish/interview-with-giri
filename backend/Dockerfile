FROM python:3.12-slim AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src/ src/
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS production

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=base /app/.venv /app/.venv
COPY --from=base /app/src /app/src
COPY alembic.ini ./
COPY alembic/ alembic/

ENV PATH="/app/.venv/bin:$PATH"

RUN groupadd -r appuser && useradd -r -g appuser -s /sbin/nologin appuser
USER appuser

ENV PORT=8001
EXPOSE ${PORT}
CMD uvicorn interviewbot.main:app --host 0.0.0.0 --port ${PORT} --workers 2
