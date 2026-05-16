import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.job import Job
from app.models.resume import BaseResume
from app.models.skill_gap import SkillGap
from app.models.user import User
from app.schemas.skill_gaps import SkillGapAnalyzeRequest, SkillGapItem, SkillGapUpdate
from app.services.skill_gap import analyze_gaps
from app.storage import storage

router = APIRouter(prefix="/api/skill-gaps", tags=["skill-gaps"])


@router.post("/analyze", response_model=list[SkillGapItem], status_code=status.HTTP_201_CREATED)
async def analyze(
    body: SkillGapAnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate ownership
    base_result = await db.execute(
        select(BaseResume).where(BaseResume.id == body.base_resume_id, BaseResume.user_id == current_user.id)
    )
    base = base_result.scalar_one_or_none()
    if not base:
        raise HTTPException(status_code=404, detail="Base resume not found")

    job_result = await db.execute(
        select(Job).where(Job.id == body.job_id, Job.user_id == current_user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not job.jd_text:
        raise HTTPException(status_code=422, detail="Job has no description text")

    # Get resume text from .tex source
    tex = (await storage.get(base.tex_source_path)).decode()

    try:
        gaps = await analyze_gaps(resume_text=tex, jd_text=job.jd_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Persist results
    rows = []
    for g in gaps:
        row = SkillGap(
            user_id=current_user.id,
            job_id=body.job_id,
            category=g["category"],
            skill_name=g["skill_name"],
            priority=g["priority"],
            why_it_matters=g.get("why_it_matters", ""),
            suggested_resource=g.get("suggested_resource", ""),
            status="identified",
        )
        db.add(row)
        rows.append(row)

    await db.commit()
    for r in rows:
        await db.refresh(r)

    return rows


@router.get("", response_model=list[SkillGapItem])
async def list_gaps(
    job_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(SkillGap).where(SkillGap.user_id == current_user.id)
    if job_id:
        q = q.where(SkillGap.job_id == job_id)
    q = q.order_by(SkillGap.priority.desc(), SkillGap.created_at.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.patch("/{gap_id}", response_model=SkillGapItem)
async def update_gap(
    gap_id: uuid.UUID,
    body: SkillGapUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SkillGap).where(SkillGap.id == gap_id, SkillGap.user_id == current_user.id)
    )
    gap = result.scalar_one_or_none()
    if not gap:
        raise HTTPException(status_code=404, detail="Gap not found")

    gap.status = body.status
    await db.commit()
    await db.refresh(gap)
    return gap
