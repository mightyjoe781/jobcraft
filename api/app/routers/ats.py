import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.ats import AtsScore
from app.models.job import Job
from app.models.resume import ResumeVariant
from app.models.user import User
from app.schemas.ats import AtsScoreOut, AtsBreakdown, MissingKeyword, Suggestion
from app.services.ats import extract_pdf_text, score_resume
from app.storage import storage
from app.workers.tasks import run_ats_score_task

router = APIRouter(prefix="/api/ats", tags=["ats"])

_SYNC_TIMEOUT = 11  # seconds before falling back to async


def _build_out(row: AtsScore) -> AtsScoreOut:
    breakdown = None
    missing = None
    suggestions = None
    if row.breakdown_json:
        breakdown = AtsBreakdown(**row.breakdown_json)
    if row.suggestions_json:
        missing = [MissingKeyword(**k) for k in row.suggestions_json.get("missing_keywords", [])]
        suggestions = [Suggestion(**s) for s in row.suggestions_json.get("suggestions", [])]
    return AtsScoreOut(
        id=row.id,
        status=row.status,
        overall_score=row.overall_score,
        breakdown=breakdown,
        missing_keywords=missing,
        suggestions=suggestions,
        error_message=row.error_message,
        created_at=row.created_at,
    )


@router.post("/score", status_code=status.HTTP_200_OK)
async def score(
    resume_variant_id: uuid.UUID | None = None,
    job_id: uuid.UUID | None = None,
    jd_text: str | None = None,
    uploaded_pdf: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Score a resume against a JD. Sync-first: returns full result in 200 if Claude
    responds within 11s; returns 202 with score_id for polling otherwise.
    """
    # Resolve resume text
    resume_text: str = ""
    resolved_job_id: uuid.UUID | None = job_id

    if uploaded_pdf is not None:
        content = await uploaded_pdf.read()
        if len(content) > settings.pdf_upload_max_bytes:
            raise HTTPException(status_code=413, detail="PDF exceeds 5MB limit")
        resume_text = extract_pdf_text(content)
    elif resume_variant_id:
        v_result = await db.execute(
            select(ResumeVariant).where(
                ResumeVariant.id == resume_variant_id,
                ResumeVariant.user_id == current_user.id,
            )
        )
        variant = v_result.scalar_one_or_none()
        if not variant:
            raise HTTPException(status_code=404, detail="Variant not found")
        if not variant.pdf_path:
            # Use tex source as text
            tex = (await storage.get(variant.modified_tex_path)).decode()
            resume_text = tex
        else:
            pdf_bytes = await storage.get(variant.pdf_path)
            resume_text = extract_pdf_text(pdf_bytes)
        if not resolved_job_id:
            resolved_job_id = variant.job_id
    else:
        raise HTTPException(status_code=422, detail="Provide resume_variant_id or upload a PDF")

    # Resolve JD text
    if not jd_text and resolved_job_id:
        j_result = await db.execute(
            select(Job).where(Job.id == resolved_job_id, Job.user_id == current_user.id)
        )
        job = j_result.scalar_one_or_none()
        if job:
            jd_text = job.jd_text

    if not jd_text:
        raise HTTPException(status_code=422, detail="Provide jd_text or a job_id with JD text")

    # Create score row in pending state
    score_row = AtsScore(
        user_id=current_user.id,
        resume_variant_id=resume_variant_id,
        job_id=resolved_job_id,
        status="pending",
    )
    db.add(score_row)
    await db.commit()
    await db.refresh(score_row)

    # Try sync path
    try:
        data = await asyncio.wait_for(
            score_resume(resume_text, jd_text),
            timeout=_SYNC_TIMEOUT,
        )
        score_row.status = "complete"
        score_row.overall_score = data["overall_score"]
        score_row.breakdown_json = data["breakdown"]
        score_row.suggestions_json = {
            "missing_keywords": data.get("missing_keywords", []),
            "suggestions": data.get("suggestions", []),
        }
        # Update variant ATS score
        if resume_variant_id:
            v2 = await db.execute(
                select(ResumeVariant).where(ResumeVariant.id == resume_variant_id)
            )
            v = v2.scalar_one_or_none()
            if v:
                v.ats_score = data["overall_score"]
        await db.commit()
        await db.refresh(score_row)
        return _build_out(score_row)

    except asyncio.TimeoutError:
        # Async fallback
        run_ats_score_task.delay(str(score_row.id), resume_text, jd_text)
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={
                "score_id": str(score_row.id),
                "status": "pending",
                "poll_url": f"/api/ats/scores/{score_row.id}",
            },
        )
    except ValueError as exc:
        score_row.status = "failed"
        score_row.error_message = str(exc)
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/scores", response_model=list[AtsScoreOut])
async def list_scores(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AtsScore)
        .where(AtsScore.user_id == current_user.id)
        .order_by(AtsScore.created_at.desc())
        .limit(50)
    )
    return [_build_out(r) for r in result.scalars().all()]


@router.get("/scores/{score_id}", response_model=AtsScoreOut)
async def get_score(
    score_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AtsScore).where(AtsScore.id == score_id, AtsScore.user_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Score not found")
    return _build_out(row)
