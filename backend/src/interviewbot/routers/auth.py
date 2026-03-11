import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import jwt
from passlib.context import CryptContext
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.config import get_settings
from interviewbot.dependencies import get_db
from interviewbot.models.schemas import LoginRequest, SignupRequest, TokenResponse
from interviewbot.models.tables import Organization, Subscription, User

router = APIRouter(prefix="/auth", tags=["Auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
limiter = Limiter(key_func=get_remote_address, default_limits=[], enabled=True)


def _create_token(user_id: str, email: str, role: str, org_id: str) -> tuple[str, int]:
    settings = get_settings()
    expires_in = settings.jwt_expire_minutes * 60
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    token = jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "role": role,
            "org_id": org_id,
            "exp": expire,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, expires_in


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def signup(request: Request, req: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    org = Organization(name=req.org_name)
    db.add(org)
    await db.flush()

    user = User(
        org_id=org.id,
        email=req.email,
        password_hash=pwd_context.hash(req.password),
        full_name=req.full_name,
        role="admin",
    )
    db.add(user)

    subscription = Subscription(
        org_id=org.id,
        plan_tier="free",
        interviews_limit=10,
        status="trialing",
    )
    db.add(subscription)

    await db.commit()
    await db.refresh(user)

    token, expires_in = _create_token(
        str(user.id), user.email, user.role, str(org.id)
    )

    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        role=user.role,
        org_id=org.id,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not pwd_context.verify(req.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    token, expires_in = _create_token(
        str(user.id), user.email, user.role, str(user.org_id)
    )

    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        role=user.role,
        org_id=user.org_id,
    )
