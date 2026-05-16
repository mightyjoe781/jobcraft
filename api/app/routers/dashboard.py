from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.activity import ActivityLog
from app.models.application import Application
from app.models.ats import AtsScore
from app.models.job import Job
from app.models.resume import ResumeVariant
from app.models.skill_gap import SkillGap
from app.models.user import User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

FUNNEL_STAGES = ["applied", "oa_screen", "interview", "offer"]
BREAKDOWN_KEYS = ["keyword_match", "semantic_relevance", "formatting", "action_verbs", "quantification", "seniority_match"]

# Common tech skills/tools to track frequency in JD text
TECH_KEYWORDS = [
    "python","golang","go","java","javascript","typescript","rust","scala","kotlin","c++","ruby","swift",
    "sql","postgresql","mysql","mongodb","redis","elasticsearch","cassandra","dynamodb","sqlite",
    "kubernetes","docker","terraform","ansible","helm","aws","gcp","azure","lambda","ec2","s3",
    "kafka","rabbitmq","grpc","graphql","rest","microservices","api","fastapi","django","flask","spring",
    "react","vue","angular","node","nextjs","tailwind",
    "machine learning","deep learning","pytorch","tensorflow","scikit","pandas","numpy","spark","airflow","dbt",
    "ci/cd","github actions","jenkins","linux","bash","git",
    "distributed systems","system design","observability","monitoring","prometheus","grafana","datadog",
    "slo","sla","reliability","scalability","performance","security","oauth","jwt","saml",
]

def _extract_demanded_skills(jd_texts: list[str]) -> list[dict]:
    """Count frequency of known tech terms across all JD texts."""
    import re
    freq: dict[str, int] = {}
    for text in jd_texts:
        lower = text.lower()
        for kw in TECH_KEYWORDS:
            # word-boundary match
            if re.search(r'\b' + re.escape(kw) + r'\b', lower):
                freq[kw] = freq.get(kw, 0) + 1
    return sorted(
        [{"skill": k, "count": v, "pct": round(v / len(jd_texts) * 100)} for k, v in freq.items()],
        key=lambda x: x["count"], reverse=True
    )[:12]


@router.get("/stats")
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.id
    now = datetime.now(timezone.utc)

    # ── ATS scores (complete only) ─────────────────────────────────────────────
    scores_result = await db.execute(
        select(
            AtsScore.overall_score,
            AtsScore.breakdown_json,
            AtsScore.suggestions_json,
            AtsScore.created_at,
            AtsScore.job_id,
        )
        .where(AtsScore.user_id == uid, AtsScore.status == "complete")
        .order_by(AtsScore.created_at.asc())
    )
    score_rows = scores_result.all()

    # Score trend — all scores ordered oldest→newest with company label
    score_trend = []
    job_cache: dict = {}
    for row in score_rows:
        if row.overall_score is None:
            continue
        label = "—"
        if row.job_id:
            if row.job_id not in job_cache:
                j = await db.get(Job, row.job_id)
                job_cache[row.job_id] = j.company if j else "?"
            label = job_cache[row.job_id]
        score_trend.append({
            "score": row.overall_score,
            "company": label,
            "date": row.created_at.strftime("%b %d"),
        })

    # ATS breakdown averages across all scored variants
    breakdown_sums: dict[str, list[int]] = {k: [] for k in BREAKDOWN_KEYS}
    for row in score_rows:
        if not row.breakdown_json:
            continue
        for k in BREAKDOWN_KEYS:
            v = row.breakdown_json.get(k)
            if v is not None:
                breakdown_sums[k].append(int(v))
    breakdown_avg = {
        k: round(sum(vals) / len(vals)) if vals else 0
        for k, vals in breakdown_sums.items()
    }

    # Missing keywords frequency
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

    # ── Applications ──────────────────────────────────────────────────────────
    apps_result = await db.execute(
        select(Application.status, Application.created_at)
        .where(Application.user_id == uid)
        .order_by(Application.created_at.asc())
    )
    all_apps = apps_result.all()

    # Application funnel (conversion through stages)
    status_counts = {}
    for row in all_apps:
        status_counts[row.status] = status_counts.get(row.status, 0) + 1

    funnel = []
    for stage in FUNNEL_STAGES:
        count = status_counts.get(stage, 0)
        funnel.append({"stage": stage, "count": count})

    # Response rate: of jobs "applied", how many reached oa_screen+
    applied_count = status_counts.get("applied", 0)
    responded = sum(status_counts.get(s, 0) for s in ["oa_screen", "interview", "offer"])
    response_rate = round(responded / (applied_count + responded) * 100) if (applied_count + responded) > 0 else None

    # Weekly application velocity — last 8 weeks
    weekly: dict[str, int] = {}
    eight_weeks_ago = now - timedelta(weeks=8)
    for row in all_apps:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if created < eight_weeks_ago:
            continue
        week_label = created.strftime("%b %d")
        # Group by week start (Monday)
        days_since_monday = created.weekday()
        week_start = (created - timedelta(days=days_since_monday)).strftime("%b %d")
        weekly[week_start] = weekly.get(week_start, 0) + 1

    weekly_velocity = [{"week": k, "count": v} for k, v in sorted(weekly.items())]

    # ── Variants ──────────────────────────────────────────────────────────────
    variant_count_result = await db.execute(
        select(func.count()).where(ResumeVariant.user_id == uid)
    )
    total_variants = variant_count_result.scalar_one()

    # ── Skill gaps ────────────────────────────────────────────────────────────
    gaps_result = await db.execute(
        select(SkillGap.status, SkillGap.category)
        .where(SkillGap.user_id == uid)
    )
    gap_rows = gaps_result.all()
    gap_statuses = [r.status for r in gap_rows]
    skill_gap_summary = {
        "total": len(gap_statuses),
        "identified": gap_statuses.count("identified"),
        "learning": gap_statuses.count("learning"),
        "acquired": gap_statuses.count("acquired"),
        "not_pursuing": gap_statuses.count("not_pursuing"),
    }

    # ── AI usage ──────────────────────────────────────────────────────────────
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
    estimated_cost = round(total_tailor_runs * 0.04, 2)

    # ── Most demanded skills from all JDs ────────────────────────────────────
    jd_result = await db.execute(
        select(Job.jd_text).where(Job.user_id == uid, Job.jd_text.isnot(None))
    )
    jd_texts = [r for r, in jd_result.all() if r and len(r.strip()) > 50]
    most_demanded_skills = _extract_demanded_skills(jd_texts) if jd_texts else []

    # ── Recent activity — enriched with company context ───────────────────────
    activity_result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == uid)
        .order_by(ActivityLog.created_at.desc())
        .limit(10)
    )
    activity_rows = activity_result.scalars().all()

    # Deduplicate: skip consecutive identical (action, entity_id) entries
    seen: set[tuple] = set()
    recent_activity = []
    for row in activity_rows:
        key = (row.action, str(row.entity_id))
        if key in seen:
            continue
        seen.add(key)
        # Try to get company name from variant → job
        label = None
        if row.entity_type == "resume_variant":
            try:
                vr = await db.execute(
                    select(ResumeVariant.job_id).where(ResumeVariant.id == row.entity_id)
                )
                vrow = vr.first()
                if vrow and vrow[0]:
                    jr = await db.execute(
                        select(Job.company, Job.role_title).where(Job.id == vrow[0])
                    )
                    jrow = jr.first()
                    if jrow:
                        label = f"{jrow[0]} — {jrow[1]}"
            except Exception:
                pass
        recent_activity.append({
            "action": row.action,
            "entity_type": row.entity_type,
            "label": label,
            "created_at": row.created_at.isoformat(),
        })

    return {
        # Score analytics
        "score_trend": score_trend,
        "breakdown_avg": breakdown_avg,
        "top_missing_keywords": top_missing_keywords,
        "most_demanded_skills": most_demanded_skills,
        "total_scores": len(score_rows),
        # Application analytics
        "funnel": funnel,
        "response_rate": response_rate,
        "weekly_velocity": weekly_velocity,
        "applications_by_status": status_counts,
        # Counts
        "total_variants": total_variants,
        "skill_gap_summary": skill_gap_summary,
        "ai_usage": {
            "tailor_runs_this_month": total_tailor_runs,
            "estimated_cost_usd": estimated_cost,
        },
        "recent_activity": recent_activity,
        # Legacy / compat
        "avg_ats_score": round(sum(r.overall_score for r in score_rows if r.overall_score) / len(score_rows)) if score_rows else None,
        "ats_history": score_trend[-10:],
        "upcoming_followups": [],
    }
