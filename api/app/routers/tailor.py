import asyncio
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_sse
from app.models.application import Application
from app.models.job import Job
from app.models.resume import BaseResume, ResumeVariant
from app.models.user import User
from app.schemas.tailor import (
    FetchJdRequest,
    FetchJdResponse,
    JobCreate,
    JobOut,
    TailorRequest,
    TailorResponse,
)
from app.services.security import check_jd
from app.services.tailor import subscribe_sse
from app.storage import generate_key, storage
from app.workers.tasks import run_tailoring_task

router = APIRouter(prefix="/api", tags=["tailor"])


@router.post("/jobs", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: JobCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.jd_text:
        flag = check_jd(body.jd_text)
        if flag:
            raise HTTPException(status_code=400, detail={"code": "job_description_rejected"})

    job = Job(
        user_id=current_user.id,
        company=body.company,
        role_title=body.role_title,
        jd_text=body.jd_text,
        jd_url=body.jd_url,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Job).where(Job.user_id == current_user.id).order_by(Job.created_at.desc())
    )
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == current_user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/fetch-jd", response_model=FetchJdResponse)
async def fetch_jd(body: FetchJdRequest):
    """Fetch and parse a job description from a URL."""
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(body.url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            html = resp.text
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {exc}")

    # Strip HTML tags naively; real implementation could use beautifulsoup
    import re
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    text = text[: 15_000]  # cap at limit

    flag = check_jd(text)
    if flag:
        raise HTTPException(status_code=400, detail={"code": "job_description_rejected"})

    return FetchJdResponse(company="", role_title="", jd_text=text)


@router.post("/tailor", response_model=TailorResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_tailoring(
    body: TailorRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_result = await db.execute(
        select(BaseResume).where(
            BaseResume.id == body.base_resume_id,
            BaseResume.user_id == current_user.id,
        )
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
        raise HTTPException(status_code=422, detail="Job has no JD text; add a description first")

    # Create a placeholder variant row — worker fills in paths
    placeholder_key = generate_key(f"users/{current_user.id}/variants", ".tex")
    await storage.put(placeholder_key, b"% placeholder")

    variant = ResumeVariant(
        user_id=current_user.id,
        base_resume_id=body.base_resume_id,
        job_id=body.job_id,
        modified_tex_path=placeholder_key,
    )
    db.add(variant)
    await db.flush()  # get variant.id without full commit

    # Upsert application — one per job per user; created automatically on first tailor
    existing_app = await db.execute(
        select(Application).where(
            Application.job_id == body.job_id,
            Application.user_id == current_user.id,
        )
    )
    app = existing_app.scalar_one_or_none()
    if not app:
        db.add(Application(
            user_id=current_user.id,
            job_id=body.job_id,
            resume_variant_id=variant.id,
            status="tailoring",
        ))
    else:
        # Update linked variant to the latest tailor run
        app.resume_variant_id = variant.id
        if app.status == "saved":
            app.status = "tailoring"

    await db.commit()
    await db.refresh(variant)

    run_tailoring_task.delay(
        str(variant.id),
        str(body.base_resume_id),
        str(body.job_id),
        str(current_user.id),
        body.aggressiveness,
        body.custom_instruction,
    )

    return TailorResponse(
        variant_id=variant.id,
        stream_url=f"/api/tailor/stream/{variant.id}",
    )


@router.get("/tailor/stream/{variant_id}")
async def tailor_stream(
    variant_id: uuid.UUID,
    current_user: User = Depends(get_current_user_sse),
    db: AsyncSession = Depends(get_db),
):
    """SSE endpoint — subscribe to Redis pub/sub for this variant's progress events."""
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Variant not found")

    async def event_stream():
        timeout = 120  # max seconds to wait for completion
        elapsed = 0
        async for chunk in subscribe_sse(variant_id):
            yield chunk
            elapsed += 0
            if elapsed >= timeout:
                yield "event: error\ndata: {\"message\": \"Timeout\"}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")
