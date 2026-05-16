import asyncio
import json
import logging
import uuid

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _make_session():
    """Create a fresh async engine + session per task to avoid asyncpg event-loop reuse errors."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from app.config import settings
    engine = create_async_engine(settings.database_url, pool_size=1, max_overflow=0)
    return engine, AsyncSession(engine, expire_on_commit=False)


@celery_app.task(name="tasks.run_tailoring", bind=True, max_retries=2)
def run_tailoring_task(
    self,
    variant_id: str,
    base_resume_id: str,
    job_id: str,
    user_id: str,
    aggressiveness: str,
    custom_instruction: str | None,
):
    # S-14: log task metadata only, never log tex source or JD text
    logger.info("run_tailoring task=%s aggressiveness=%s", variant_id, aggressiveness)
    asyncio.run(
        _async_tailor(
            uuid.UUID(variant_id),
            uuid.UUID(base_resume_id),
            uuid.UUID(job_id),
            uuid.UUID(user_id),
            aggressiveness,
            custom_instruction,
        )
    )


async def _async_tailor(
    variant_id: uuid.UUID,
    base_resume_id: uuid.UUID,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    aggressiveness: str,
    custom_instruction: str | None,
):
    import redis.asyncio as aioredis
    from app.config import settings
    from app.models.resume import BaseResume, ResumeVariant
    from app.models.job import Job
    from app.models.activity import ActivityLog
    from app.services import tailor as tailor_svc
    from app.services import latex_client
    from app.storage import generate_key, storage
    from sqlalchemy import select

    engine, db = _make_session()
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    channel = tailor_svc.sse_channel(variant_id)

    async def publish(event: str, data: dict):
        await r.publish(channel, json.dumps({"event": event, "data": data}))

    try:
        async with db:
            base_result = await db.execute(select(BaseResume).where(BaseResume.id == base_resume_id))
            base = base_result.scalar_one_or_none()
            job_result = await db.execute(select(Job).where(Job.id == job_id))
            job = job_result.scalar_one_or_none()
            if not base or not job:
                await publish("error", {"message": "Resume or job not found"})
                return

            tex = (await storage.get(base.tex_source_path)).decode()
            jd_text = job.jd_text or ""

            try:
                result = await tailor_svc.run_tailoring(
                    variant_id=variant_id,
                    base_resume_id=base_resume_id,
                    job_id=job_id,
                    tex_source=tex,
                    jd_text=jd_text,
                    aggressiveness=aggressiveness,
                    custom_instruction=custom_instruction,
                    user_id=user_id,
                )
            except Exception as exc:
                await publish("error", {"message": str(exc)})
                variant_result = await db.execute(
                    select(ResumeVariant).where(ResumeVariant.id == variant_id)
                )
                variant = variant_result.scalar_one_or_none()
                if variant:
                    await db.delete(variant)
                    await db.commit()
                return

            modified_tex = result["modified_tex"]
            changes = result.get("changes_summary", [])

            tex_key = generate_key(f"users/{user_id}/variants", ".tex")
            tex_path = await storage.put(tex_key, modified_tex.encode())

            try:
                pdf_bytes = await latex_client.render(modified_tex)
                pdf_key = generate_key(f"users/{user_id}/variants/pdf", ".pdf")
                pdf_path = await storage.put(pdf_key, pdf_bytes)
            except Exception:
                pdf_path = None

            variant_result = await db.execute(
                select(ResumeVariant).where(ResumeVariant.id == variant_id)
            )
            variant = variant_result.scalar_one_or_none()
            if variant:
                variant.modified_tex_path = tex_path
                variant.pdf_path = pdf_path

            db.add(ActivityLog(
                user_id=user_id,
                entity_type="resume_variant",
                entity_id=variant_id,
                action="tailored",
                metadata_json={"aggressiveness": aggressiveness, "changes_count": len(changes)},
            ))
            await db.commit()

        await publish("diff_ready", {"changes_summary": changes})
        if pdf_path:
            await publish("pdf_ready", {"pdf_url": f"/api/resumes/variants/{variant_id}/pdf"})
        else:
            await publish("error", {"message": "PDF compile failed; .tex saved successfully"})
    finally:
        await r.aclose()
        await engine.dispose()


@celery_app.task(name="tasks.run_ats_score")
def run_ats_score_task(score_id: str, resume_text: str, jd_text: str):
    # S-14: log score ID only — resume_text and jd_text are not logged
    logger.info("run_ats_score score_id=%s", score_id)
    asyncio.run(_async_ats(uuid.UUID(score_id), resume_text, jd_text))


async def _async_ats(score_id: uuid.UUID, resume_text: str, jd_text: str):
    from app.models.ats import AtsScore
    from app.models.resume import ResumeVariant
    from app.services.ats import score_resume
    from sqlalchemy import select

    engine, db = _make_session()
    try:
        async with db:
            result = await db.execute(select(AtsScore).where(AtsScore.id == score_id))
            score_row = result.scalar_one_or_none()
            if not score_row:
                return
            try:
                data = await score_resume(resume_text, jd_text)
                score_row.status = "complete"
                score_row.overall_score = data["overall_score"]
                score_row.breakdown_json = data["breakdown"]
                score_row.suggestions_json = {
                    "missing_keywords": data.get("missing_keywords", []),
                    "suggestions": data.get("suggestions", []),
                }
                # Also update the variant's cached ats_score so it shows without re-scoring
                if score_row.resume_variant_id:
                    v_result = await db.execute(
                        select(ResumeVariant).where(ResumeVariant.id == score_row.resume_variant_id)
                    )
                    variant = v_result.scalar_one_or_none()
                    if variant:
                        variant.ats_score = data["overall_score"]
            except Exception as exc:
                score_row.status = "failed"
                score_row.error_message = str(exc)
            await db.commit()
    finally:
        await engine.dispose()
