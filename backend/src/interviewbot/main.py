import traceback

from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import structlog

from interviewbot.config import get_settings
from interviewbot.middleware.tenant import TenantMiddleware
from interviewbot.routers import (
    analytics,
    ats,
    auth,
    billing,
    code_execution,
    dashboard,
    health,
    interviews,
    job_postings,
    proctoring,
    reports,
    users,
    webhooks,
)
from interviewbot.utils.logger import setup_logging
from interviewbot.websocket.chat_handler import handle_text_interview
from interviewbot.websocket.voice_handler import handle_voice_interview


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.app_env)

    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.1,
            environment=settings.app_env,
        )

    app = FastAPI(
        title="Interview Bot API",
        description="AI-powered Interview as a Service",
        version="0.1.0",
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(TenantMiddleware)

    from interviewbot.routers.auth import limiter

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        if settings.sentry_dsn:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        logger = structlog.get_logger()
        logger.error(
            "unhandled_exception",
            path=str(request.url.path),
            method=request.method,
            error=str(exc),
            traceback=traceback.format_exc(),
        )
        detail = str(exc) if settings.app_env == "dev" else "An internal error occurred"
        return JSONResponse(status_code=500, content={"detail": detail})

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(job_postings.router, prefix="/api/v1")
    app.include_router(interviews.router, prefix="/api/v1")
    app.include_router(dashboard.router, prefix="/api/v1")
    app.include_router(code_execution.router, prefix="/api/v1")
    app.include_router(reports.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")
    app.include_router(proctoring.router, prefix="/api/v1")
    app.include_router(billing.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(webhooks.router, prefix="/api/v1")
    app.include_router(ats.router, prefix="/api/v1")

    @app.websocket("/ws/interview/{token}")
    async def websocket_interview(websocket: WebSocket, token: str) -> None:
        from interviewbot.models.database import get_session_factory

        factory = get_session_factory()
        async with factory() as db:
            await handle_text_interview(websocket, token, db)

    @app.websocket("/ws/voice-interview/{token}")
    async def websocket_voice_interview(websocket: WebSocket, token: str) -> None:
        from interviewbot.models.database import get_session_factory

        factory = get_session_factory()
        async with factory() as db:
            await handle_voice_interview(websocket, token, db)

    return app


app = create_app()
