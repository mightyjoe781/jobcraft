from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.activity import ActivityLog
from app.models.ats import AtsScore
from app.models.resume import ResumeVariant
from app.models.skill_gap import SkillGap
from app.models.user import User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.id
    now = datetime.now(timezone.utc)

    # ── ATS scores ────────────────────────────────────────────────────────────
    scores_result = await db.execute(
        select(AtsScore.overall_score, AtsScore.suggestions_json, AtsScore.created_at)
        .where(AtsScore.user_id == uid, AtsScore.status == "complete")
        .order_by(AtsScore.created_at.desc())
        .limit(50)
    )
    score_rows = scores_result.all()
    score_values = [r.overall_score for r in score_rows if r.overall_score is not None]
    avg_ats_score = round(sum(score_values) / len(score_values)) if score_values else None

    # ATS score history for sparkline (last 10, oldest first)
    ats_history = [
        {"score": r.overall_score, "date": r.created_at.isoformat()}
        for r in reversed(score_rows[:10])
        if r.overall_score is not None
    ]

    # Top missing keywords across all scores
    keyword_freq: dict[str, int] = {}
    for row in score_rows:
        if not row.suggestions_json:
            continue
        for kw in row.suggestions_json.get("missing_keywords", []):
            term = kw.get("term", "").strip()
            if term:
                keyword_freq[term] = keyword_freq.get(term, 0) + 1
    top_missing_keywords = sorted(
        [{"term": k, "count": v} for k, v in keyword_freq.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    # ── Variants ──────────────────────────────────────────────────────────────
    variant_count_result = await db.execute(
        select(func.count()).where(ResumeVariant.user_id == uid)
    )
    total_variants = variant_count_result.scalar_one()

    # ── Skill gaps ────────────────────────────────────────────────────────────
    gaps_result = await db.execute(
        select(SkillGap.status).where(SkillGap.user_id == uid)
    )
    gap_statuses = gaps_result.scalars().all()
    skill_gap_summary = {
        "total": len(gap_statuses),
        "identified": gap_statuses.count("identified"),
        "learning": gap_statuses.count("learning"),
        "acquired": gap_statuses.count("acquired"),
        "not_pursuing": gap_statuses.count("not_pursuing"),
    }

    # ── AI usage (from activity_log) ──────────────────────────────────────────
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ai_result = await db.execute(
        select(ActivityLog.metadata_json)
        .where(
            ActivityLog.user_id == uid,
            ActivityLog.action == "tailored",
            ActivityLog.created_at >= month_start,
        )
    )
    ai_logs = ai_result.scalars().all()
    total_tailor_runs = len(ai_logs)
    # Rough cost estimate: ~2000 tokens avg per tailor @ $3/M input + $15/M output
    estimated_cost = round(total_tailor_runs * 0.04, 2)

    # ── Recent activity ───────────────────────────────────────────────────────
    activity_result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == uid)
        .order_by(ActivityLog.created_at.desc())
        .limit(10)
    )
    recent_activity = [
        {
            "action": row.action,
            "entity_type": row.entity_type,
            "created_at": row.created_at.isoformat(),
            "metadata": row.metadata_json,
        }
        for row in activity_result.scalars().all()
    ]

    return {
        "avg_ats_score": avg_ats_score,
        "total_scores": len(score_values),
        "ats_history": ats_history,
        "top_missing_keywords": top_missing_keywords,
        "total_variants": total_variants,
        "skill_gap_summary": skill_gap_summary,
        "ai_usage": {
            "tailor_runs_this_month": total_tailor_runs,
            "estimated_cost_usd": estimated_cost,
        },
        "recent_activity": recent_activity,
        # Tracker-dependent — empty until Module 5 is built
        "applications_by_status": {},
        "upcoming_followups": [],
    }
