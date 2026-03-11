from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from interviewbot.config import get_settings
from interviewbot.middleware.tenant import TenantMiddleware
from interviewbot.routers import auth, health, job_postings
from interviewbot.utils.logger import setup_logging


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.app_env)

    app = FastAPI(
        title="Interview Bot API",
        description="AI-powered Interview as a Service",
        version="0.1.0",
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(TenantMiddleware)

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(job_postings.router, prefix="/api/v1")

    return app


app = create_app()
