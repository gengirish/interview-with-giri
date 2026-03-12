from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import structlog

from interviewbot.config import get_settings

PUBLIC_PATHS = {
    "/api/v1/health",
    "/api/v1/health/db",
    "/api/v1/health/redis",
    "/api/v1/auth/login",
    "/api/v1/auth/signup",
    "/api/v1/billing/webhook",
    "/api/v1/billing/plans",
    "/api/docs",
    "/api/redoc",
    "/openapi.json",
}

PUBLIC_PREFIXES = (
    "/api/v1/interviews/public/",
    "/ws/",
)

logger = structlog.get_logger()


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def, override]
        request.state.org_id = None

        path = request.url.path
        if (
            path in PUBLIC_PATHS
            or any(path.startswith(p) for p in PUBLIC_PREFIXES)
            or request.method == "OPTIONS"
        ):
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            try:
                settings = get_settings()
                payload = jwt.decode(
                    auth[7:],
                    settings.jwt_secret,
                    algorithms=[settings.jwt_algorithm],
                )
                request.state.org_id = payload.get("org_id")
            except (JWTError, ExpiredSignatureError):
                request.state.org_id = None

        return await call_next(request)
