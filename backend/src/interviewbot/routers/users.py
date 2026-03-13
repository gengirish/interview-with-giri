from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, pwd_context, require_role
from interviewbot.models.schemas import (
    InviteUserRequest,
    PaginatedResponse,
    UpdateUserRoleRequest,
    UserResponse,
)
from interviewbot.models.tables import User

router = APIRouter(prefix="/users", tags=["User Management"])


async def _get_user_or_404(db: AsyncSession, user_id: UUID, org_id: UUID) -> User:
    result = await db.execute(select(User).where(User.id == user_id, User.org_id == org_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("", response_model=PaginatedResponse)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> PaginatedResponse:
    base_query = select(User).where(User.org_id == org_id)

    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = count_result.scalar() or 0

    result = await db.execute(
        base_query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    users = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(u) for u in users],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def invite_user(
    req: InviteUserRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> UserResponse:
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    new_user = User(
        org_id=org_id,
        email=req.email,
        password_hash=pwd_context.hash(req.password),
        full_name=req.full_name,
        role=req.role.value,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return _to_response(new_user)


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: UUID,
    req: UpdateUserRoleRequest,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> UserResponse:
    target = await _get_user_or_404(db, user_id, org_id)

    if str(target.id) == user.get("sub"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot change your own role")

    target.role = req.role.value
    await db.commit()
    await db.refresh(target)
    return _to_response(target)


@router.patch("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> UserResponse:
    target = await _get_user_or_404(db, user_id, org_id)

    if str(target.id) == user.get("sub"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate yourself")

    target.is_active = not target.is_active
    await db.commit()
    await db.refresh(target)
    return _to_response(target)


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    result = await db.execute(select(User).where(User.id == UUID(user["sub"])))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return _to_response(db_user)


def _to_response(u: User) -> UserResponse:
    return UserResponse(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        is_active=u.is_active,
        created_at=u.created_at,
    )
