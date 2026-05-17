"""Admin-only endpoints — user management, registration tokens, and AI usage stats."""
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

@router.get("/users/{user_id}/stats")
async def get_user_stats(
    user_id: uuid.UUID,
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return usage stats for a user — shown when admin clicks a user row."""
    from sqlalchemy import func
    from app.models.resume import BaseResume, ResumeVariant
    from app.models.job import Job
    from app.models.application import Application
    from app.models.ats import AtsScore
    from app.models.skill_gap import SkillGap
    from app.models.activity import ActivityLog

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    async def count(model, *filters):
        result = await db.execute(select(func.count()).where(*filters))
        return result.scalar_one()

    base_resumes     = await count(BaseResume, BaseResume.user_id == user_id)
    variants         = await count(ResumeVariant, ResumeVariant.user_id == user_id)
    jobs_tracked     = await count(Job, Job.user_id == user_id)
    applications     = await count(Application, Application.user_id == user_id)
    ats_scores       = await count(AtsScore, AtsScore.user_id == user_id, AtsScore.status == "complete")
    skill_gaps       = await count(SkillGap, SkillGap.user_id == user_id)

    # AI calls this month
    from datetime import datetime, timezone
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ai_calls_month = await count(
        ActivityLog,
        ActivityLog.user_id == user_id,
        ActivityLog.action == "tailored",
        ActivityLog.created_at >= month_start,
    )
    ai_calls_total = await count(ActivityLog, ActivityLog.user_id == user_id, ActivityLog.action == "tailored")

    return {
        "user_id": str(user_id),
        "display_name": user.display_name,
        "email": user.email,
        "base_resumes": base_resumes,
        "resume_variants": variants,
        "jobs_tracked": jobs_tracked,
        "applications": applications,
        "ats_scores": ats_scores,
        "skill_gaps": skill_gaps,
        "ai_tailor_runs_this_month": ai_calls_month,
        "ai_tailor_runs_total": ai_calls_total,
        "estimated_cost_usd": round(ai_calls_total * 0.04, 2),
    }

@router.get("/stats")
async def get_platform_stats(
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide aggregate statistics for the admin dashboard."""
    from sqlalchemy import func, and_
    from datetime import timedelta
    from app.models.resume import BaseResume, ResumeVariant
    from app.models.job import Job
    from app.models.application import Application
    from app.models.ats import AtsScore
    from app.models.cover_letter import CoverLetter
    from app.models.skill_gap import SkillGap
    from app.models.activity import ActivityLog

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    async def count(model, *filters):
        r = await db.execute(select(func.count()).where(*filters))
        return r.scalar_one()

    # ── Users ──────────────────────────────────────────────────────────────────
    total_users    = await count(User)
    disabled_users = await count(User, User.is_disabled == True)  # noqa
    new_this_week  = await count(User, User.created_at >= week_ago)

    # ── Content ────────────────────────────────────────────────────────────────
    base_resumes = await count(BaseResume)
    variants     = await count(ResumeVariant)
    jobs_total   = await count(Job)
    applications = await count(Application)
    ats_scores   = await count(AtsScore, AtsScore.status == "complete")
    cover_letters = await count(CoverLetter)
    skill_gaps   = await count(SkillGap)

    # ── AI usage ───────────────────────────────────────────────────────────────
    tailor_total = await count(ActivityLog, ActivityLog.action == "tailored")
    tailor_month = await count(
        ActivityLog, ActivityLog.action == "tailored",
        ActivityLog.created_at >= month_start,
    )

    # ── Growth — user signups per week for last 8 weeks ───────────────────────
    # Use literal_column to avoid SQLAlchemy parameterising the date_trunc unit string
    from sqlalchemy import literal_column, text as sa_text
    week_trunc   = func.date_trunc(literal_column("'week'"), User.created_at)
    eight_weeks_ago = now - timedelta(weeks=8)
    growth_result = await db.execute(
        select(week_trunc.label("week"), func.count().label("users"))
        .where(User.created_at >= eight_weeks_ago)
        .group_by(sa_text('1'))
        .order_by(sa_text('1'))
    )
    growth = [
        {
            "week": row.week.strftime("%b %d"),
            "users": row.users,
        }
        for row in growth_result.all()
    ]

    # ── Daily AI activity — tailor runs + ATS scores per day, last 7 days ─────
    day_trunc_activity = func.date_trunc(literal_column("'day'"), ActivityLog.created_at)
    day_trunc_ats      = func.date_trunc(literal_column("'day'"), AtsScore.created_at)

    daily_tailor = await db.execute(
        select(day_trunc_activity.label("day"), func.count().label("count"))
        .where(ActivityLog.action == "tailored", ActivityLog.created_at >= week_ago)
        .group_by(sa_text('1'))
        .order_by(sa_text('1'))
    )
    daily_ats = await db.execute(
        select(day_trunc_ats.label("day"), func.count().label("count"))
        .where(AtsScore.status == "complete", AtsScore.created_at >= week_ago)
        .group_by(sa_text('1'))
        .order_by(sa_text('1'))
    )

    tailor_by_day = {row.day: row.count for row in daily_tailor.all()}
    ats_by_day    = {row.day: row.count for row in daily_ats.all()}
    all_days = sorted(set(tailor_by_day) | set(ats_by_day))
    daily_activity = [
        {
            "date": d.strftime("%b %d"),
            "tailor_runs": tailor_by_day.get(d, 0),
            "ats_scores":  ats_by_day.get(d, 0),
        }
        for d in all_days
    ]

    return {
        "users": {
            "total": total_users,
            "active": total_users - disabled_users,
            "disabled": disabled_users,
            "new_this_week": new_this_week,
        },
        "resumes": {"base_resumes": base_resumes, "variants": variants},
        "jobs": {"total_tracked": jobs_total, "applications": applications},
        "ai": {
            "tailor_runs_total": tailor_total,
            "tailor_runs_this_month": tailor_month,
            "estimated_cost_total_usd": round(tailor_total * 0.04, 2),
            "estimated_cost_this_month_usd": round(tailor_month * 0.04, 2),
        },
        "content": {
            "ats_scores": ats_scores,
            "cover_letters": cover_letters,
            "skill_gaps": skill_gaps,
        },
        "growth": growth,
        "daily_activity": daily_activity,
    }


@router.get("/stats/ai-usage")
async def get_ai_usage_stats(
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Real token usage and cost breakdown from ai_usage_logs."""
    from sqlalchemy import func, and_, literal_column, text as sa_text
    from datetime import timedelta
    from app.models.ai_usage import AiUsageLog

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = now - timedelta(days=30)

    async def scalar(stmt):
        r = await db.execute(stmt)
        return r.scalar_one()

    # ── Monthly totals ─────────────────────────────────────────────────────────
    total_calls_month = await scalar(
        select(func.count(AiUsageLog.id)).where(AiUsageLog.created_at >= month_start)
    )
    total_cost_month = float(await scalar(
        select(func.coalesce(func.sum(AiUsageLog.estimated_cost_usd), 0.0))
        .where(AiUsageLog.created_at >= month_start)
    ))
    total_input_tokens = int(await scalar(
        select(func.coalesce(func.sum(AiUsageLog.input_tokens), 0))
        .where(AiUsageLog.created_at >= month_start)
    ))
    total_output_tokens = int(await scalar(
        select(func.coalesce(func.sum(AiUsageLog.output_tokens), 0))
        .where(AiUsageLog.created_at >= month_start)
    ))
    total_cache_read_tokens = int(await scalar(
        select(func.coalesce(func.sum(AiUsageLog.cache_read_tokens), 0))
        .where(AiUsageLog.created_at >= month_start)
    ))
    cache_hits = int(await scalar(
        select(func.count(AiUsageLog.id))
        .where(AiUsageLog.created_at >= month_start, AiUsageLog.result_cache_hit == True)  # noqa
    ))

    # ── Per-feature breakdown ──────────────────────────────────────────────────
    feature_rows = await db.execute(
        select(
            AiUsageLog.feature,
            func.count().label("calls"),
            func.coalesce(func.sum(AiUsageLog.estimated_cost_usd), 0.0).label("cost"),
            func.coalesce(func.sum(AiUsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(AiUsageLog.output_tokens), 0).label("output_tokens"),
            func.count().filter(AiUsageLog.result_cache_hit == True).label("cache_hits"),  # noqa
        )
        .where(AiUsageLog.created_at >= month_start)
        .group_by(AiUsageLog.feature)
        .order_by(func.sum(AiUsageLog.estimated_cost_usd).desc())
    )
    per_feature = [
        {
            "feature": row.feature,
            "calls": row.calls,
            "cost_usd": round(float(row.cost), 4),
            "input_tokens": int(row.input_tokens),
            "output_tokens": int(row.output_tokens),
            "cache_hit_rate": round(row.cache_hits / row.calls, 3) if row.calls else 0.0,
        }
        for row in feature_rows.all()
    ]

    # ── Top 10 users by cost this month ───────────────────────────────────────
    top_users_rows = await db.execute(
        select(
            AiUsageLog.user_id,
            User.email,
            User.display_name,
            func.count().label("calls"),
            func.coalesce(func.sum(AiUsageLog.estimated_cost_usd), 0.0).label("cost"),
        )
        .join(User, AiUsageLog.user_id == User.id)
        .where(AiUsageLog.created_at >= month_start)
        .group_by(AiUsageLog.user_id, User.email, User.display_name)
        .order_by(func.sum(AiUsageLog.estimated_cost_usd).desc())
        .limit(10)
    )
    top_users = [
        {
            "user_id": str(row.user_id),
            "email": row.email,
            "display_name": row.display_name,
            "calls": row.calls,
            "cost_usd": round(float(row.cost), 4),
        }
        for row in top_users_rows.all()
    ]

    # ── Daily trend — last 30 days ─────────────────────────────────────────────
    day_trunc = func.date_trunc(literal_column("'day'"), AiUsageLog.created_at)
    daily_rows = await db.execute(
        select(
            day_trunc.label("day"),
            func.count().label("calls"),
            func.coalesce(func.sum(AiUsageLog.estimated_cost_usd), 0.0).label("cost"),
            func.coalesce(func.sum(AiUsageLog.input_tokens + AiUsageLog.output_tokens), 0).label("tokens"),
            func.count().filter(AiUsageLog.result_cache_hit == True).label("cache_hits"),  # noqa
        )
        .where(AiUsageLog.created_at >= thirty_days_ago)
        .group_by(sa_text("1"))
        .order_by(sa_text("1"))
    )
    daily_trend = [
        {
            "date": row.day.strftime("%b %d"),
            "calls": row.calls,
            "cost_usd": round(float(row.cost), 4),
            "tokens": int(row.tokens),
            "cache_hits": row.cache_hits,
        }
        for row in daily_rows.all()
    ]

    cache_hit_rate = round(cache_hits / total_calls_month, 3) if total_calls_month else 0.0

    return {
        "this_month": {
            "calls": total_calls_month,
            "cost_usd": round(total_cost_month, 4),
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "cache_read_tokens": total_cache_read_tokens,
            "cache_hit_rate": cache_hit_rate,
            "cache_hits": cache_hits,
        },
        "per_feature": per_feature,
        "top_users": top_users,
        "daily_trend": daily_trend,
    }
