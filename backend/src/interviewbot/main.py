from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from interviewbot.config import get_settings
from interviewbot.middleware.tenant import TenantMiddleware
from interviewbot.routers import analytics, auth, code_execution, dashboard, health, interviews, job_postings, reports
from interviewbot.utils.logger import setup_logging
from interviewbot.websocket.chat_handler import handle_text_interview
from interviewbot.websocket.voice_handler import handle_voice_interview


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
    app.include_router(interviews.router, prefix="/api/v1")
    app.include_router(dashboard.router, prefix="/api/v1")
    app.include_router(code_execution.router, prefix="/api/v1")
    app.include_router(reports.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")

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
