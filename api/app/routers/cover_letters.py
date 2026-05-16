import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.cover_letter import CoverLetter
from app.models.job import Job
from app.models.resume import ResumeVariant
from app.models.user import User
from app.schemas.cover_letter import CoverLetterCreate, CoverLetterOut, CoverLetterUpdate
from app.services.cover_letter import generate_cover_letter, render_to_pdf
from app.storage import generate_key, storage

router = APIRouter(prefix="/api/cover-letters", tags=["cover-letters"])


async def _resolve_resume_text(variant_id: uuid.UUID | None, db: AsyncSession) -> str:
    if not variant_id:
        return ""
    result = await db.execute(select(ResumeVariant).where(ResumeVariant.id == variant_id))
    variant = result.scalar_one_or_none()
    if not variant:
        return ""
    try:
        return (await storage.get(variant.modified_tex_path)).decode()
    except Exception:
        return ""


def _enrich(row: CoverLetter, company: str | None, role_title: str | None) -> CoverLetterOut:
    out = CoverLetterOut.model_validate(row)
    out.company = company
    out.role_title = role_title
    return out


@router.get("", response_model=list[CoverLetterOut])
async def list_cover_letters(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CoverLetter, Job.company, Job.role_title)
        .outerjoin(Job, CoverLetter.job_id == Job.id)
        .where(CoverLetter.user_id == current_user.id)
        .order_by(CoverLetter.created_at.desc())
    )
    return [_enrich(cl, company, role) for cl, company, role in result.all()]


@router.get("/{cl_id}", response_model=CoverLetterOut)
async def get_cover_letter(
    cl_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CoverLetter, Job.company, Job.role_title)
        .outerjoin(Job, CoverLetter.job_id == Job.id)
        .where(CoverLetter.id == cl_id, CoverLetter.user_id == current_user.id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    cl, company, role = row
    return _enrich(cl, company, role)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_and_stream(
    body: CoverLetterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a cover letter record and stream the AI-generated body via SSE.
    The record is created immediately; body_text is updated as Claude streams.
    Returns the cover_letter_id in the first SSE event so the client can poll/update.
    """
    job_result = await db.execute(
        select(Job).where(Job.id == body.job_id, Job.user_id == current_user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.jd_text:
        raise HTTPException(status_code=422, detail="Job has no description text")

    resume_text = await _resolve_resume_text(body.resume_variant_id, db)

    # Create placeholder record
    cl = CoverLetter(
        user_id=current_user.id,
        job_id=body.job_id,
        resume_variant_id=body.resume_variant_id,
        tone=body.tone,
        body_text="",
    )
    db.add(cl)
    await db.commit()
    await db.refresh(cl)
    cl_id = cl.id

    async def stream():
        import json
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as _AsyncSession
        from app.config import settings as _s

        full_text = ""
        yield f"event: id\ndata: {json.dumps({'cover_letter_id': str(cl_id)})}\n\n"

        try:
            async for chunk in generate_cover_letter(
                jd_text=job.jd_text,
                resume_text=resume_text,
                tone=body.tone,
                personal_hook=body.personal_hook,
            ):
                full_text += chunk
                yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"

            # Use a fresh engine/session to persist — the request session may
            # be in an inconsistent state after streaming
            engine = create_async_engine(_s.database_url, pool_size=1, max_overflow=0)
            try:
                async with _AsyncSession(engine) as session:
                    result = await session.execute(
                        select(CoverLetter).where(CoverLetter.id == cl_id)
                    )
                    saved = result.scalar_one_or_none()
                    if saved:
                        saved.body_text = full_text
                        await session.commit()
            finally:
                await engine.dispose()

            yield f"event: done\ndata: {json.dumps({'cover_letter_id': str(cl_id)})}\n\n"

        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@router.patch("/{cl_id}", response_model=CoverLetterOut)
async def update_cover_letter(
    cl_id: uuid.UUID,
    body: CoverLetterUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CoverLetter, Job.company, Job.role_title)
        .outerjoin(Job, CoverLetter.job_id == Job.id)
        .where(CoverLetter.id == cl_id, CoverLetter.user_id == current_user.id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    cl, company, role = row
    cl.body_text = body.body_text
    await db.commit()
    await db.refresh(cl)
    return _enrich(cl, company, role)


@router.delete("/{cl_id}", status_code=204)
async def delete_cover_letter(
    cl_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CoverLetter).where(CoverLetter.id == cl_id, CoverLetter.user_id == current_user.id)
    )
    cl = result.scalar_one_or_none()
    if not cl:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    await db.delete(cl)
    await db.commit()


@router.get("/{cl_id}/pdf")
async def download_pdf(
    cl_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CoverLetter).where(CoverLetter.id == cl_id, CoverLetter.user_id == current_user.id)
    )
    cl = result.scalar_one_or_none()
    if not cl:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    if not cl.body_text:
        raise HTTPException(status_code=422, detail="Cover letter has no content yet")

    try:
        pdf_bytes = render_to_pdf(
            body_text=cl.body_text,
            sender_name=current_user.display_name,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF render failed: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cover-letter-{cl_id}.pdf"'},
    )
