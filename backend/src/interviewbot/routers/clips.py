"""Interview Clip Studio - AI-extracted shareable clips from interviews."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.config import get_settings
from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import ClipCollectionCreate, ClipCollectionResponse, ClipResponse
from interviewbot.models.tables import (
    ClipCollection,
    InterviewClip,
    InterviewMessage,
    InterviewSession,
    JobPosting,
)
from interviewbot.services.clip_engine import extract_clips

router = APIRouter(prefix="/clips", tags=["Clips"])
collections_router = APIRouter(prefix="/clip-collections", tags=["Clips"])


def _clip_to_response(clip: InterviewClip) -> ClipResponse:
    return ClipResponse(
        id=clip.id,
        session_id=clip.session_id,
        clip_type=clip.clip_type,
        title=clip.title,
        description=clip.description,
        message_start_index=clip.message_start_index,
        message_end_index=clip.message_end_index,
        transcript_excerpt=clip.transcript_excerpt,
        importance_score=float(clip.importance_score) if clip.importance_score else None,
        tags=clip.tags or [],
        share_token=clip.share_token,
        created_at=clip.created_at,
    )


# --- Clip endpoints ---


@router.get("", response_model=list[ClipResponse])
async def list_all_clips(
    clip_type: str | None = Query(None, alias="type"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    q: str | None = Query(None, description="Search in title, description, transcript"),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[ClipResponse]:
    """List all clips across interviews for the org, with optional filters."""
    query = select(InterviewClip).where(InterviewClip.org_id == org_id)
    if clip_type:
        query = query.where(InterviewClip.clip_type == clip_type)
    if date_from:
        try:
            parsed = datetime.strptime(date_from.strip(), "%Y-%m-%d").replace(tzinfo=UTC)
            query = query.where(InterviewClip.created_at >= parsed)
        except ValueError:
            pass
    if date_to:
        try:
            parsed = datetime.strptime(date_to.strip(), "%Y-%m-%d").replace(tzinfo=UTC) + timedelta(days=1)
            query = query.where(InterviewClip.created_at < parsed)
        except ValueError:
            pass
    if q and q.strip():
        search = f"%{q.strip()}%"
        query = query.where(
            or_(
                InterviewClip.title.ilike(search),
                InterviewClip.description.ilike(search),
                InterviewClip.transcript_excerpt.ilike(search),
            )
        )
    result = await db.execute(
        query.order_by(InterviewClip.created_at.desc())
    )
    clips = result.scalars().all()
    return [_clip_to_response(c) for c in clips]


@router.get("/session/{session_id}", response_model=list[ClipResponse])
async def get_session_clips(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[ClipResponse]:
    """Get all clips for an interview session."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")

    result = await db.execute(
        select(InterviewClip)
        .where(InterviewClip.session_id == session_id, InterviewClip.org_id == org_id)
        .order_by(InterviewClip.created_at.asc())
    )
    clips = result.scalars().all()
    return [_clip_to_response(c) for c in clips]


@router.post("/generate/{session_id}", response_model=list[ClipResponse])
async def generate_clips(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[ClipResponse]:
    """Trigger AI clip extraction for an interview session."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    if session.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview must be completed to generate clips",
        )

    job_result = await db.execute(
        select(JobPosting).where(JobPosting.id == session.job_posting_id)
    )
    job = job_result.scalar_one_or_none()
    job_title = job.title if job else "Unknown Position"

    msg_result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == session_id)
        .order_by(InterviewMessage.created_at.asc())
    )
    messages = msg_result.scalars().all()
    if not messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No messages in this interview",
        )

    messages_data = [{"role": m.role, "content": m.content} for m in messages]
    raw_clips = await extract_clips(messages_data, job_title)

    created: list[InterviewClip] = []
    for c in raw_clips:
        start_idx = c.get("start_index", 0)
        end_idx = c.get("end_index", start_idx)
        start_idx = max(0, min(start_idx, len(messages) - 1))
        end_idx = max(start_idx, min(end_idx, len(messages) - 1))

        excerpt_parts = []
        for i in range(start_idx, end_idx + 1):
            m = messages[i]
            speaker = "Interviewer" if m.role == "interviewer" else "Candidate"
            excerpt_parts.append(f"{speaker}: {m.content}")
        transcript_excerpt = "\n\n".join(excerpt_parts)

        clip = InterviewClip(
            session_id=session_id,
            org_id=org_id,
            clip_type=c.get("category", "key_insight"),
            title=c.get("title", "Untitled Clip")[:255],
            description=c.get("description"),
            message_start_index=start_idx,
            message_end_index=end_idx,
            transcript_excerpt=transcript_excerpt,
            importance_score=c.get("importance"),
            tags=c.get("tags", []),
        )
        db.add(clip)
        created.append(clip)

    await db.commit()
    for c in created:
        await db.refresh(c)
    return [_clip_to_response(c) for c in created]


@router.get("/public/{token}", response_model=ClipResponse)
async def get_public_clip(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> ClipResponse:
    """View a shared clip (no auth required)."""
    result = await db.execute(
        select(InterviewClip).where(InterviewClip.share_token == token)
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    if clip.share_expires_at and clip.share_expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This shared link has expired",
        )
    return _clip_to_response(clip)


@router.get("/{clip_id}", response_model=ClipResponse)
async def get_clip(
    clip_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> ClipResponse:
    """Get a single clip by ID."""
    result = await db.execute(
        select(InterviewClip).where(
            InterviewClip.id == clip_id,
            InterviewClip.org_id == org_id,
        )
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    return _clip_to_response(clip)


@router.delete("/{clip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clip(
    clip_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> None:
    """Delete a clip."""
    result = await db.execute(
        select(InterviewClip).where(
            InterviewClip.id == clip_id,
            InterviewClip.org_id == org_id,
        )
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    await db.delete(clip)
    await db.commit()


@router.post("/{clip_id}/share")
async def share_clip(
    clip_id: UUID,
    hours: int = Query(72, ge=1, le=720),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Generate a shareable public link for a clip."""
    result = await db.execute(
        select(InterviewClip).where(
            InterviewClip.id == clip_id,
            InterviewClip.org_id == org_id,
        )
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    token = secrets.token_urlsafe(32)
    clip.share_token = token
    clip.share_expires_at = datetime.now(UTC) + timedelta(hours=hours)
    await db.commit()

    settings = get_settings()
    share_url = f"{settings.app_url}/clips/{token}"
    return {
        "share_url": share_url,
        "share_token": token,
        "expires_at": clip.share_expires_at.isoformat(),
    }


# --- Clip collection endpoints ---


@collections_router.post("", response_model=ClipCollectionResponse)
async def create_clip_collection(
    body: ClipCollectionCreate,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> ClipCollectionResponse:
    """Create a clip collection."""
    user_id = user.get("sub")
    try:
        user_uuid = UUID(str(user_id)) if user_id else None
    except (ValueError, TypeError):
        user_uuid = None

    coll = ClipCollection(
        org_id=org_id,
        title=body.title,
        description=body.description or None,
        clip_ids=body.clip_ids or [],
        created_by=user_uuid,
    )
    db.add(coll)
    await db.commit()
    await db.refresh(coll)
    return ClipCollectionResponse(
        id=coll.id,
        title=coll.title,
        description=coll.description,
        clip_ids=coll.clip_ids or [],
        share_token=coll.share_token,
        created_at=coll.created_at,
    )


@collections_router.get("", response_model=list[ClipCollectionResponse])
async def list_clip_collections(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[ClipCollectionResponse]:
    """List all clip collections for the org."""
    result = await db.execute(
        select(ClipCollection)
        .where(ClipCollection.org_id == org_id)
        .order_by(ClipCollection.created_at.desc())
    )
    collections = result.scalars().all()
    return [
        ClipCollectionResponse(
            id=c.id,
            title=c.title,
            description=c.description,
            clip_ids=c.clip_ids or [],
            share_token=c.share_token,
            created_at=c.created_at,
        )
        for c in collections
    ]


@collections_router.get("/{collection_id}")
async def get_clip_collection(
    collection_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Get a collection with its clips."""
    result = await db.execute(
        select(ClipCollection).where(
            ClipCollection.id == collection_id,
            ClipCollection.org_id == org_id,
        )
    )
    coll = result.scalar_one_or_none()
    if not coll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    clips: list[ClipResponse] = []
    for cid in coll.clip_ids or []:
        try:
            clip_uuid = UUID(str(cid))
        except (ValueError, TypeError):
            continue
        clip_result = await db.execute(
            select(InterviewClip).where(
                InterviewClip.id == clip_uuid,
                InterviewClip.org_id == org_id,
            )
        )
        clip = clip_result.scalar_one_or_none()
        if clip:
            clips.append(_clip_to_response(clip))

    return {
        "id": str(coll.id),
        "title": coll.title,
        "description": coll.description,
        "clip_ids": coll.clip_ids or [],
        "share_token": coll.share_token,
        "created_at": coll.created_at.isoformat() if coll.created_at else None,
        "clips": [c.model_dump() for c in clips],
    }


@collections_router.post("/{collection_id}/share")
async def share_clip_collection(
    collection_id: UUID,
    hours: int = Query(72, ge=1, le=720),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Generate a shareable public link for a clip collection."""
    result = await db.execute(
        select(ClipCollection).where(
            ClipCollection.id == collection_id,
            ClipCollection.org_id == org_id,
        )
    )
    coll = result.scalar_one_or_none()
    if not coll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    token = secrets.token_urlsafe(32)
    coll.share_token = token
    coll.share_expires_at = datetime.now(UTC) + timedelta(hours=hours)
    await db.commit()

    settings = get_settings()
    share_url = f"{settings.app_url}/clip-collections/{token}"
    return {
        "share_url": share_url,
        "share_token": token,
        "expires_at": coll.share_expires_at.isoformat(),
    }


@collections_router.get("/public/{token}")
async def get_public_clip_collection(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """View a shared clip collection (no auth required)."""
    result = await db.execute(
        select(ClipCollection).where(ClipCollection.share_token == token)
    )
    coll = result.scalar_one_or_none()
    if not coll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    if coll.share_expires_at and coll.share_expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This shared link has expired",
        )

    clips: list[dict] = []
    for cid in coll.clip_ids or []:
        try:
            clip_uuid = UUID(str(cid))
        except (ValueError, TypeError):
            continue
        clip_result = await db.execute(
            select(InterviewClip).where(InterviewClip.id == clip_uuid)
        )
        clip = clip_result.scalar_one_or_none()
        if clip and (clip.share_token or clip.org_id == coll.org_id):
            clips.append(_clip_to_response(clip).model_dump())

    return {
        "id": str(coll.id),
        "title": coll.title,
        "description": coll.description,
        "clip_ids": coll.clip_ids or [],
        "created_at": coll.created_at.isoformat() if coll.created_at else None,
        "clips": clips,
    }
