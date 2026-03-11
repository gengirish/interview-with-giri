from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    InviteUserRequest,
    UpdateUserRoleRequest,
    UserResponse,
)
from interviewbot.models.tables import User

router = APIRouter(prefix="/users", tags=["User Management"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("", response_model=list[UserResponse])
async def list_users(
    user: dict = Depends(require_role("admin")),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[UserResponse]:
    result = await db.execute(
        select(User)
        .where(User.org_id == org_id)
        .order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [_to_response(u) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def invite_user(
    req: InviteUserRequest,
    user: dict = Depends(require_role("admin")),  # noqa: B006
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
    user: dict = Depends(require_role("admin")),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> UserResponse:
    result = await db.execute(
        select(User).where(User.id == user_id, User.org_id == org_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if str(target.id) == user.get("sub"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot change your own role")

    target.role = req.role.value
    await db.commit()
    await db.refresh(target)
    return _to_response(target)


@router.patch("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: UUID,
    user: dict = Depends(require_role("admin")),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> UserResponse:
    result = await db.execute(
        select(User).where(User.id == user_id, User.org_id == org_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if str(target.id) == user.get("sub"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate yourself")

    target.is_active = not target.is_active
    await db.commit()
    await db.refresh(target)
    return _to_response(target)


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),  # noqa: B006
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
