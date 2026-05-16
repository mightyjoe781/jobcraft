import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.application import Application
from app.models.job import Job
from app.models.resume import ResumeVariant
from app.models.user import User
from app.schemas.applications import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationStats,
    ApplicationUpdate,
    STATUS_LABELS,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])


async def _enrich(app: Application, db: AsyncSession) -> ApplicationOut:
    job = await db.get(Job, app.job_id)
    variant_count_result = await db.execute(
        select(func.count()).where(ResumeVariant.job_id == app.job_id)
    )
    variant_count = variant_count_result.scalar_one()

    # Latest ATS score for this job's variants
    ats_score: int | None = None
    variant_id: uuid.UUID | None = app.resume_variant_id
    if not variant_id:
        latest = await db.execute(
            select(ResumeVariant)
            .where(ResumeVariant.job_id == app.job_id, ResumeVariant.user_id == app.user_id)
            .order_by(ResumeVariant.created_at.desc())
            .limit(1)
        )
        v = latest.scalar_one_or_none()
        if v:
            variant_id = v.id
            ats_score = v.ats_score
    else:
        v = await db.get(ResumeVariant, variant_id)
        if v:
            ats_score = v.ats_score

    return ApplicationOut(
        id=app.id,
        job_id=app.job_id,
        company=job.company if job else "Unknown",
        role_title=job.role_title if job else "Unknown",
        jd_text=job.jd_text if job else None,
        jd_url=job.jd_url if job else None,
        status=app.status,
        applied_at=app.applied_at,
        referral_contact=app.referral_contact,
        notes=app.notes,
        follow_up_date=app.follow_up_date,
        ats_score=ats_score,
        variant_id=variant_id,
        variant_count=variant_count,
        created_at=app.created_at,
        updated_at=app.updated_at,
    )


@router.get("/stats", response_model=ApplicationStats)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application.status, func.count())
        .where(Application.user_id == current_user.id)
        .group_by(Application.status)
    )
    by_status = {label: 0 for label in STATUS_LABELS}
    total = 0
    for s, count in result.all():
        by_status[s] = count
        total += count
    return ApplicationStats(total=total, by_status=by_status)


@router.get("", response_model=list[ApplicationOut])
async def list_applications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application)
        .where(Application.user_id == current_user.id)
        .order_by(Application.updated_at.desc())
    )
    apps = result.scalars().all()
    return [await _enrich(a, db) for a in apps]


@router.get("/{app_id}", response_model=ApplicationOut)
async def get_application(
    app_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).where(
            Application.id == app_id, Application.user_id == current_user.id
        )
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return await _enrich(app, db)


@router.post("", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
async def create_application(
    body: ApplicationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate job ownership
    job = await db.get(Job, body.job_id)
    if not job or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    # Upsert — one application per job per user
    existing = await db.execute(
        select(Application).where(
            Application.job_id == body.job_id,
            Application.user_id == current_user.id,
        )
    )
    app = existing.scalar_one_or_none()
    if app:
        return await _enrich(app, db)

    app = Application(
        user_id=current_user.id,
        job_id=body.job_id,
        resume_variant_id=body.resume_variant_id,
        status=body.status,
        notes=body.notes,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return await _enrich(app, db)


@router.patch("/{app_id}", response_model=ApplicationOut)
async def update_application(
    app_id: uuid.UUID,
    body: ApplicationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).where(
            Application.id == app_id, Application.user_id == current_user.id
        )
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if body.status is not None:
        app.status = body.status
        if body.status == "applied" and not app.applied_at:
            app.applied_at = datetime.now(timezone.utc)
    if body.resume_variant_id is not None:
        app.resume_variant_id = body.resume_variant_id
    if body.applied_at is not None:
        app.applied_at = body.applied_at
    if body.referral_contact is not None:
        app.referral_contact = body.referral_contact
    if body.notes is not None:
        app.notes = body.notes
    if body.follow_up_date is not None:
        app.follow_up_date = body.follow_up_date

    await db.commit()
    await db.refresh(app)
    return await _enrich(app, db)


@router.delete("/{app_id}", status_code=204)
async def delete_application(
    app_id: uuid.UUID,
    delete_variants: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete as sa_delete
    from app.models.resume import ResumeVariant
    from app.models.ats import AtsScore

    result = await db.execute(
        select(Application).where(
            Application.id == app_id, Application.user_id == current_user.id
        )
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    job_id = app.job_id

    if delete_variants:
        # Delete ATS scores for this job's variants first (FK)
        variants_result = await db.execute(
            select(ResumeVariant.id).where(
                ResumeVariant.job_id == job_id,
                ResumeVariant.user_id == current_user.id,
            )
        )
        variant_ids = [r for r, in variants_result.all()]
        if variant_ids:
            await db.execute(
                sa_delete(AtsScore).where(AtsScore.resume_variant_id.in_(variant_ids))
            )
        # Delete variants
        await db.execute(
            sa_delete(ResumeVariant).where(
                ResumeVariant.job_id == job_id,
                ResumeVariant.user_id == current_user.id,
            )
        )

    await db.delete(app)
    await db.commit()
