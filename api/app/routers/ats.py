import asyncio
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.ats import AtsScore
from app.models.job import Job
from app.models.resume import ResumeVariant
from app.models.user import User
from app.schemas.ats import AtsBreakdown, AtsScoreOut, MissingKeyword, Suggestion
from app.services.ats import extract_pdf_text, score_resume
from app.storage import storage
from app.workers.tasks import run_ats_score_task

router = APIRouter(prefix="/api/ats", tags=["ats"])

_SYNC_TIMEOUT = 60  # Claude structured scoring takes 20-35s; give it room


def _strip_latex(tex: str) -> str:
    """Strip LaTeX commands so Claude sees plain readable text."""
    # Remove comments
    tex = re.sub(r"%.*$", "", tex, flags=re.MULTILINE)
    # Remove common commands with arguments: \cmd{...}
    tex = re.sub(r"\\[a-zA-Z]+\*?\{([^}]*)\}", r"\1", tex)
    # Remove commands without arguments: \cmd
    tex = re.sub(r"\\[a-zA-Z]+\*?", " ", tex)
    # Remove remaining braces and special chars
    tex = re.sub(r"[{}\[\]\\$&_^#~]", " ", tex)
    # Collapse whitespace
    tex = re.sub(r"\s+", " ", tex).strip()
    return tex


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


async def _run_score(
    resume_text: str,
    jd_text: str,
    resume_variant_id: uuid.UUID | None,
    resolved_job_id: uuid.UUID | None,
    current_user: User,
    db: AsyncSession,
):
    """Shared sync-first scoring logic."""
    score_row = AtsScore(
        user_id=current_user.id,
        resume_variant_id=resume_variant_id,
        job_id=resolved_job_id,
        status="pending",
    )
    db.add(score_row)
    await db.commit()
    await db.refresh(score_row)

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
        if resume_variant_id:
            v = await db.get(ResumeVariant, resume_variant_id)
            if v:
                v.ats_score = data["overall_score"]
        await db.commit()
        await db.refresh(score_row)
        return _build_out(score_row)

    except asyncio.TimeoutError:
        run_ats_score_task.delay(str(score_row.id), resume_text, jd_text)
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


@router.post("/score/variant")
async def score_variant(
    resume_variant_id: uuid.UUID,
    jd_text: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Score a variant already in the system. Accepts JSON query params."""
    v_result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == resume_variant_id,
            ResumeVariant.user_id == current_user.id,
        )
    )
    variant = v_result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    resolved_job_id = variant.job_id

    # Prefer PDF text extraction; fall back to stripped LaTeX
    if variant.pdf_path:
        try:
            pdf_bytes = await storage.get(variant.pdf_path)
            resume_text = extract_pdf_text(pdf_bytes)
        except Exception:
            tex = (await storage.get(variant.modified_tex_path)).decode()
            resume_text = _strip_latex(tex)
    else:
        tex = (await storage.get(variant.modified_tex_path)).decode()
        resume_text = _strip_latex(tex)

    # Validate resume text is meaningful
    if len(resume_text.strip()) < 100:
        raise HTTPException(
            status_code=422,
            detail="Resume text is too short to score. The variant may still be rendering — try again in a moment.",
        )

    # Resolve JD
    if not jd_text and resolved_job_id:
        job = await db.get(Job, resolved_job_id)
        if job:
            jd_text = job.jd_text

    if not jd_text:
        raise HTTPException(status_code=422, detail="No job description found. Provide jd_text or link the variant to a job.")

    return await _run_score(resume_text, jd_text, resume_variant_id, resolved_job_id, current_user, db)


@router.post("/score/upload")
async def score_upload(
    jd_text: str = Form(...),
    uploaded_pdf: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Score an uploaded PDF against a pasted JD."""
    content = await uploaded_pdf.read()
    if len(content) > settings.pdf_upload_max_bytes:
        raise HTTPException(status_code=413, detail="PDF exceeds 5MB limit")

    resume_text = extract_pdf_text(content)
    if len(resume_text.strip()) < 100:
        raise HTTPException(status_code=422, detail="Could not extract enough text from the PDF.")

    return await _run_score(resume_text, jd_text, None, None, current_user, db)


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
