"""Admin-only endpoints — user management and registration token/invite management."""
import hmac
import secrets
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_admin_user
from app.models.refresh_token import RefreshToken  # noqa: F401 — might not exist; use inline import
from app.models.user import RefreshToken as RefreshTokenModel, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


# ── Registration token + invites ───────────────────────────────────────────────

@router.get("/registration-token")
async def get_registration_token(_: User = Depends(get_admin_user)):
    return {"token": settings.registration_token or "(not set)", "type": "permanent"}


class InviteRequest(BaseModel):
    hours: int = 24


@router.post("/invite")
async def create_invite(body: InviteRequest, _: User = Depends(get_admin_user)):
    if body.hours < 1 or body.hours > 168:
        raise HTTPException(status_code=422, detail="hours must be 1–168")
    token = secrets.token_urlsafe(24)
    ttl = body.hours * 3600
    r = _redis()
    try:
        await r.set(f"invite:{token}", "1", ex=ttl)
    finally:
        await r.aclose()
    return {"token": token, "expires_in_hours": body.hours}


@router.get("/invites")
async def list_invites(_: User = Depends(get_admin_user)):
    r = _redis()
    try:
        keys = await r.keys("invite:*")
        result = []
        for key in keys:
            ttl = await r.ttl(key)
            token = key.removeprefix("invite:")
            result.append({
                "token_masked": token[:6] + "…",
                "token": token,
                "remaining_seconds": max(ttl, 0),
                "expires_at": (datetime.now(timezone.utc).timestamp() + ttl),
            })
        return result
    finally:
        await r.aclose()


@router.delete("/invites/{token}", status_code=204)
async def revoke_invite(token: str, _: User = Depends(get_admin_user)):
    r = _redis()
    try:
        await r.delete(f"invite:{token}")
    finally:
        await r.aclose()


# ── User management ────────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    plan: str
    is_disabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.patch("/users/{user_id}/disable", response_model=AdminUserOut)
async def disable_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_disabled = True
    # Revoke all refresh tokens so they are logged out immediately
    await db.execute(
        delete(RefreshTokenModel).where(RefreshTokenModel.user_id == user_id)
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/enable", response_model=AdminUserOut)
async def enable_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_disabled = False
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
