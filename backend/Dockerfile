FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src/ src/

RUN pip install --no-cache-dir .

FROM base AS production

RUN groupadd -r appuser && useradd -r -g appuser -s /sbin/nologin appuser
USER appuser

EXPOSE 8001
CMD ["uvicorn", "interviewbot.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
