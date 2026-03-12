from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "dev"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/interviewbot"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # AI Services
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    elevenlabs_api_key: str = ""

    # Bonsai (free frontier models via OpenAI-compatible API)
    bonsai_api_key: str = ""
    bonsai_base_url: str = "https://api.trybons.ai/v1"

    # Google Gemini (free tier via AI Studio)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # OpenRouter (access to many models via OpenAI-compatible API)
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openai/gpt-oss-120b"

    # LiveKit
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = "ws://localhost:7880"

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Code Execution
    judge0_api_url: str = "https://judge0-ce.p.rapidapi.com"
    judge0_rapidapi_key: str = ""

    # Storage
    s3_bucket_name: str = "interviewbot-media"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # Email
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_email: str = "noreply@interviewbot.ai"

    # App
    app_url: str = "http://localhost:3000"

    sentry_dsn: str = ""

    # CORS (comma-separated string; split via cors_origins_list property)
    cors_origins: str = "http://localhost:3000"

    @model_validator(mode="after")
    def validate_jwt_secret_in_prod(self) -> "Settings":
        if self.app_env in {"prod", "production"} and (
            not self.jwt_secret or self.jwt_secret == "change-me-in-production"
        ):
            raise ValueError("JWT_SECRET must be set to a secure value in production")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {
        "env_file": (".env", "../.env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
