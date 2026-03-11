from functools import lru_cache

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

    # LiveKit
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = "ws://localhost:7880"

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Code Execution
    judge0_api_url: str = "https://judge0-ce.p.rapidapi.com"

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

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {
        "env_file": (".env", "../.env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
