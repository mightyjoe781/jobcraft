import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.resume import (
    BaseResume,
    BaseResumeSnapshot,
    ResumeTemplate,
    ResumeVariant,
)
from app.models.job import Job
from app.models.user import User
from app.schemas.resumes import (
    AiFillRequest,
    AiFillResponse,
    BaseResumeCreate,
    BaseResumeOut,
    BaseResumeUpdate,
    BaseResumeWithTex,
    DiffOut,
    RenderResponse,
    SnapshotOut,
    SnapshotWithTex,
    TemplateOut,
    VariantOut,
)
from app.services import latex_client
from app.storage import generate_key, storage

router = APIRouter(prefix="/api", tags=["resumes"])


# ── Templates ──────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResumeTemplate).order_by(ResumeTemplate.sort_order))
    return result.scalars().all()


@router.get("/templates/{template_id}", response_model=TemplateOut)
async def get_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResumeTemplate).where(ResumeTemplate.id == template_id))
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.get("/templates/{template_id}/pdf")
async def get_template_pdf(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResumeTemplate).where(ResumeTemplate.id == template_id))
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    if tmpl.thumbnail_pdf_path:
        try:
            pdf_bytes = await storage.get(tmpl.thumbnail_pdf_path)
            return Response(content=pdf_bytes, media_type="application/pdf")
        except FileNotFoundError:
            pass

    # render on demand and cache
    tex_bytes = await storage.get(tmpl.tex_source_path)
    try:
        pdf_bytes = await latex_client.render(tex_bytes.decode())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    thumb_key = generate_key(f"system/templates/{tmpl.slug}/thumbnail", ".pdf")
    path = await storage.put(thumb_key, pdf_bytes)
    tmpl.thumbnail_pdf_path = path
    await db.commit()

    return Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/templates/{template_id}/tex")
async def get_template_tex(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResumeTemplate).where(ResumeTemplate.id == template_id))
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    tex_bytes = await storage.get(tmpl.tex_source_path)
    return {"tex_source": tex_bytes.decode()}


# ── Base Resumes ───────────────────────────────────────────────────────────────

async def _variant_count(db: AsyncSession, base_resume_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).where(ResumeVariant.base_resume_id == base_resume_id)
    )
    return result.scalar_one()


def _enrich(resume: BaseResume, count: int) -> BaseResumeOut:
    out = BaseResumeOut.model_validate(resume)
    out.variant_count = count
    return out


@router.get("/resumes/base", response_model=list[BaseResumeOut])
async def list_base_resumes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume)
        .where(BaseResume.user_id == current_user.id)
        .order_by(BaseResume.updated_at.desc())
    )
    resumes = result.scalars().all()
    enriched = []
    for r in resumes:
        count = await _variant_count(db, r.id)
        enriched.append(_enrich(r, count))
    return enriched


@router.get("/resumes/base/{resume_id}", response_model=BaseResumeWithTex)
async def get_base_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    tex = (await storage.get(resume.tex_source_path)).decode()
    count = await _variant_count(db, resume.id)
    base = _enrich(resume, count)
    return BaseResumeWithTex(**base.model_dump(), tex_source=tex)


@router.post("/resumes/base", response_model=BaseResumeOut, status_code=status.HTTP_201_CREATED)
async def create_base_resume(
    body: BaseResumeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = generate_key(f"users/{current_user.id}/base_resumes", ".tex")
    path = await storage.put(key, body.tex_source.encode())

    resume = BaseResume(
        user_id=current_user.id,
        label=body.label,
        source_type=body.source_type,
        source_template_id=body.source_template_id,
        source_variant_id=body.source_variant_id,
        tex_source_path=path,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return _enrich(resume, 0)


@router.patch("/resumes/base/{resume_id}", response_model=BaseResumeOut)
async def update_base_resume(
    resume_id: uuid.UUID,
    body: BaseResumeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if body.label is not None:
        resume.label = body.label

    if body.tex_source is not None:
        key = generate_key(f"users/{current_user.id}/base_resumes", ".tex")
        path = await storage.put(key, body.tex_source.encode())
        resume.tex_source_path = path
        resume.pdf_cache_path = None  # invalidate cached PDF

    await db.commit()
    await db.refresh(resume)
    count = await _variant_count(db, resume.id)
    return _enrich(resume, count)


@router.delete("/resumes/base/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_base_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    await db.delete(resume)
    await db.commit()


@router.get("/resumes/base/{resume_id}/pdf")
async def get_base_resume_pdf(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.pdf_cache_path:
        try:
            return Response(content=await storage.get(resume.pdf_cache_path), media_type="application/pdf")
        except FileNotFoundError:
            pass

    tex = (await storage.get(resume.tex_source_path)).decode()
    try:
        pdf_bytes = await latex_client.render(tex)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    pdf_key = generate_key(f"users/{current_user.id}/base_resumes/pdf", ".pdf")
    path = await storage.put(pdf_key, pdf_bytes)
    resume.pdf_cache_path = path
    await db.commit()

    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/resumes/base/{resume_id}/render", response_model=RenderResponse)
async def render_base_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    tex = (await storage.get(resume.tex_source_path)).decode()
    try:
        pdf_bytes = await latex_client.render(tex)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    pdf_key = generate_key(f"users/{current_user.id}/base_resumes/pdf", ".pdf")
    path = await storage.put(pdf_key, pdf_bytes)
    resume.pdf_cache_path = path
    await db.commit()
    return RenderResponse(pdf_path=path)


# ── Snapshots ──────────────────────────────────────────────────────────────────

@router.get("/resumes/base/{resume_id}/snapshots", response_model=list[SnapshotOut])
async def list_snapshots(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Resume not found")

    snaps = await db.execute(
        select(BaseResumeSnapshot)
        .where(BaseResumeSnapshot.base_resume_id == resume_id)
        .order_by(BaseResumeSnapshot.saved_at.desc())
    )
    return snaps.scalars().all()


@router.post("/resumes/base/{resume_id}/snapshots", response_model=SnapshotOut, status_code=201)
async def create_snapshot(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    snap = BaseResumeSnapshot(
        base_resume_id=resume_id,
        tex_source_path=resume.tex_source_path,
    )
    db.add(snap)
    await db.commit()
    await db.refresh(snap)
    return snap


@router.get("/resumes/base/{resume_id}/snapshots/{snapshot_id}", response_model=SnapshotWithTex)
async def get_snapshot(
    resume_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Resume not found")

    snap_result = await db.execute(
        select(BaseResumeSnapshot).where(
            BaseResumeSnapshot.id == snapshot_id,
            BaseResumeSnapshot.base_resume_id == resume_id,
        )
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    tex = (await storage.get(snap.tex_source_path)).decode()
    base = SnapshotOut.model_validate(snap)
    return SnapshotWithTex(**base.model_dump(), tex_source=tex)


# ── AI Fill ────────────────────────────────────────────────────────────────────

@router.post("/resumes/base/{resume_id}/ai-fill", response_model=AiFillResponse)
async def ai_fill(
    resume_id: uuid.UUID,
    body: AiFillRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BaseResume).where(BaseResume.id == resume_id, BaseResume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    tex = (await storage.get(resume.tex_source_path)).decode()

    from app.services.ai import fill_resume_placeholders
    filled = await fill_resume_placeholders(tex, body.background_text, current_user.id)
    return AiFillResponse(filled_tex=filled)


# ── Upload .tex ────────────────────────────────────────────────────────────────

@router.post("/resumes/base/upload", response_model=BaseResumeOut, status_code=201)
async def upload_base_resume(
    label: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".tex"):
        raise HTTPException(status_code=422, detail="Only .tex files are accepted")

    content = await file.read()
    if len(content) > 100_000:
        raise HTTPException(status_code=413, detail="File exceeds 100KB limit")

    tex = content.decode(errors="replace")
    check = await latex_client.compile_check(tex)
    if not check["ok"]:
        raise HTTPException(
            status_code=422,
            detail={"error": "compile_failed", "errors": check["errors"], "raw_output": check["raw_output"]},
        )

    key = generate_key(f"users/{current_user.id}/base_resumes", ".tex")
    path = await storage.put(key, content)

    resume = BaseResume(
        user_id=current_user.id,
        label=label,
        source_type="upload",
        tex_source_path=path,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return _enrich(resume, 0)


# ── Variants ───────────────────────────────────────────────────────────────────

@router.get("/resumes/variants", response_model=list[VariantOut])
async def list_variants(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ResumeVariant, Job.company, Job.role_title)
        .outerjoin(Job, ResumeVariant.job_id == Job.id)
        .where(ResumeVariant.user_id == current_user.id)
        .order_by(ResumeVariant.created_at.desc())
    )
    rows = result.all()
    out = []
    for variant, company, role_title in rows:
        v = VariantOut.model_validate(variant)
        v.company = company
        v.role_title = role_title
        out.append(v)
    return out


@router.get("/resumes/variants/{variant_id}", response_model=VariantOut)
async def get_variant(
    variant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ResumeVariant, Job.company, Job.role_title)
        .outerjoin(Job, ResumeVariant.job_id == Job.id)
        .where(ResumeVariant.id == variant_id, ResumeVariant.user_id == current_user.id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Variant not found")
    variant, company, role_title = row
    v = VariantOut.model_validate(variant)
    v.company = company
    v.role_title = role_title
    return v


@router.get("/resumes/variants/{variant_id}/pdf")
async def get_variant_pdf(
    variant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id, ResumeVariant.user_id == current_user.id
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    if variant.pdf_path:
        try:
            return Response(content=await storage.get(variant.pdf_path), media_type="application/pdf")
        except FileNotFoundError:
            pass

    tex = (await storage.get(variant.modified_tex_path)).decode()
    try:
        pdf_bytes = await latex_client.render(tex)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    key = generate_key(f"users/{current_user.id}/variants/pdf", ".pdf")
    path = await storage.put(key, pdf_bytes)
    variant.pdf_path = path
    await db.commit()
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/resumes/variants/{variant_id}/diff", response_model=DiffOut)
async def get_variant_diff(
    variant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id, ResumeVariant.user_id == current_user.id
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    base_result = await db.execute(
        select(BaseResume).where(BaseResume.id == variant.base_resume_id)
    )
    base = base_result.scalar_one_or_none()
    if not base:
        raise HTTPException(status_code=404, detail="Base resume not found")

    original = (await storage.get(base.tex_source_path)).decode()
    modified = (await storage.get(variant.modified_tex_path)).decode()
    return DiffOut(original_tex=original, modified_tex=modified)


@router.delete("/resumes/variants/{variant_id}", status_code=204)
async def delete_variant(
    variant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id, ResumeVariant.user_id == current_user.id
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    await db.delete(variant)
    await db.commit()
