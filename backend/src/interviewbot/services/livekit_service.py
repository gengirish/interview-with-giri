"""LiveKit room and token management for voice/video interviews."""

import structlog

from interviewbot.config import get_settings

logger = structlog.get_logger()


def generate_livekit_token(
    room_name: str,
    participant_name: str,
    is_publisher: bool = True,
) -> str:
    """Generate a LiveKit access token for a participant."""
    from livekit import api as livekit_api

    settings = get_settings()

    token = livekit_api.AccessToken(
        settings.livekit_api_key,
        settings.livekit_api_secret,
    )
    token.with_identity(participant_name)
    token.with_name(participant_name)

    grant = livekit_api.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=is_publisher,
        can_subscribe=True,
    )
    token.with_grants(grant)

    jwt_token = token.to_jwt()
    logger.info(
        "livekit_token_generated",
        room=room_name,
        participant=participant_name,
    )
    return jwt_token


def get_room_name(interview_token: str) -> str:
    return f"interview-{interview_token}"
