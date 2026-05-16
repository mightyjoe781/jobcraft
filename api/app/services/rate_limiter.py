"""Per-user rate limiting via Redis sliding window + daily AI budget check."""
import time
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.activity import ActivityLog
from app.models.user import User


def _redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def _check_rate_limit(user_id: uuid.UUID, key: str, limit: int) -> None:
    """Sliding window rate limiter. Raises 429 if over limit."""
    r = _redis()
    try:
        window_key = f"rl:{key}:{user_id}:{int(time.time() // 3600)}"
        count = await r.incr(window_key)
        if count == 1:
            await r.expire(window_key, 3600)
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: max {limit} requests per hour",
                headers={"Retry-After": "3600"},
            )
    finally:
        await r.aclose()


async def _check_daily_budget(user_id: uuid.UUID, db: AsyncSession) -> None:
    """S-09: block AI calls if user has exceeded their daily USD budget."""
    if settings.daily_ai_budget_usd <= 0:
        return  # unlimited

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    # Each tailor run costs ~$0.04 (rough estimate stored in activity log)
    result = await db.execute(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.user_id == user_id,
            ActivityLog.action == "tailored",
            ActivityLog.created_at >= today_start,
        )
    )
    tailor_count = result.scalar_one()
    estimated_cost = tailor_count * 0.04

    if estimated_cost >= settings.daily_ai_budget_usd:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="daily_ai_budget_exceeded",
            headers={"Retry-After": "86400"},
        )


# ── FastAPI dependency factories ───────────────────────────────────────────────

def require_rate_limit(limit_key: str, limit: int):
    """Returns a FastAPI dependency that enforces rate limiting."""
    async def _dep(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        await _check_rate_limit(current_user.id, limit_key, limit)
        await _check_daily_budget(current_user.id, db)
    return _dep


# Pre-built dependencies for each AI endpoint
TailorRateLimit = Depends(require_rate_limit("tailor", settings.rate_limit_tailor))
AtsRateLimit = Depends(require_rate_limit("ats", settings.rate_limit_ats_score))
CoverLetterRateLimit = Depends(require_rate_limit("cover_letter", settings.rate_limit_cover_letter))
SkillGapRateLimit = Depends(require_rate_limit("skill_gap", settings.rate_limit_skill_gap))
AiFillRateLimit = Depends(require_rate_limit("ai_fill", settings.rate_limit_ai_fill))
