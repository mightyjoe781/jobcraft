"""Seed resume_templates from bundled .tex files in api/templates/."""
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume import BaseResume, ResumeTemplate
from app.storage import generate_key, storage

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"

# Slugs replaced by better templates — removed from DB on startup
DEPRECATED_SLUGS = {"ats-clean", "ats-data", "ats-minimal", "two-column-modern", "academic"}

# Categories: engineering | professional | creative | research
TEMPLATE_META = {
    # ── Single-column, ATS-safe ───────────────────────────────────────────────
    "jake-style": {
        "name": "Jake's Resume",
        "category": "engineering",
        "description": "The #1 most-used CS resume on Overleaf. Horizontal-rule sections, tight spacing, scshape headings. Safe default for any software engineering role.",
        "is_ats_friendly": True,
        "sort_order": 0,
    },
    "harshibar-style": {
        "name": "Harshibar",
        "category": "engineering",
        "description": "Clean single-column with bold section rules and compact bullet layout. Widely used by new grads targeting FAANG and mid-size tech companies.",
        "is_ats_friendly": True,
        "sort_order": 1,
    },
    "sb2nov-style": {
        "name": "sb2nov",
        "category": "engineering",
        "description": "Compact 10.5pt layout that fits more onto one page without feeling crowded. A go-to format for students and new grads applying to internships.",
        "is_ats_friendly": True,
        "sort_order": 2,
    },
    "developer-cv": {
        "name": "Developer CV",
        "category": "engineering",
        "description": "GitHub-first layout that surfaces open-source projects and contributions before experience. Ideal for engineers with strong public portfolios.",
        "is_ats_friendly": True,
        "sort_order": 3,
    },
    # ── Two-column (ATS caution) ──────────────────────────────────────────────
    "deedy-style": {
        "name": "Deedy CV",
        "category": "engineering",
        "description": "Two-column format popularised for FAANG applications. Left sidebar holds education and skills; right column holds experience and projects.",
        "is_ats_friendly": False,
        "sort_order": 4,
    },
    "altacv-style": {
        "name": "AltaCV",
        "category": "general",
        "description": "Modern sidebar with coloured skill-level indicators. One of the most-starred LaTeX resume templates on GitHub. Visually distinctive.",
        "is_ats_friendly": False,
        "sort_order": 5,
    },
    # ── General / professional ────────────────────────────────────────────────
    "awesome-cv-style": {
        "name": "Awesome CV",
        "category": "professional",
        "description": "Header-heavy with coloured accent section dividers and a professional summary at the top. Works for any industry, not just tech.",
        "is_ats_friendly": True,
        "sort_order": 6,
    },
    "moderncv-style": {
        "name": "ModernCV",
        "category": "professional",
        "description": "Inspired by the moderncv LaTeX class — one of the most-downloaded CV packages ever. Rule-based sections, tabular skills, clean professional tone.",
        "is_ats_friendly": True,
        "sort_order": 7,
    },
    # ── Creative ──────────────────────────────────────────────────────────────
    "friggeri-style": {
        "name": "Friggeri",
        "category": "creative",
        "description": "Distinctive dark header with timeline-style experience entries. Instantly recognisable — best for roles where visual design matters. Not ATS-safe.",
        "is_ats_friendly": False,
        "sort_order": 8,
    },
    # ── Research / Academic ───────────────────────────────────────────────────
    "research-enhanced": {
        "name": "Research CV",
        "category": "research",
        "description": "Full academic CV with publications, talks, teaching, fellowships, and research positions. Follows conventions for PhD programs and faculty searches.",
        "is_ats_friendly": True,
        "sort_order": 9,
    },
}


async def seed_templates(db: AsyncSession) -> None:
    # Remove deprecated templates — NULL out FK references first to avoid violation
    for slug in DEPRECATED_SLUGS:
        result = await db.execute(
            select(ResumeTemplate).where(ResumeTemplate.slug == slug)
        )
        old = result.scalar_one_or_none()
        if old:
            # Detach any base resumes that still reference this template
            await db.execute(
                update(BaseResume)
                .where(BaseResume.source_template_id == old.id)
                .values(source_template_id=None)
            )
            await db.execute(
                delete(ResumeTemplate).where(ResumeTemplate.slug == slug)
            )

    # Insert new templates (idempotent — skip if slug already exists)
    for slug, meta in TEMPLATE_META.items():
        result = await db.execute(
            select(ResumeTemplate).where(ResumeTemplate.slug == slug)
        )
        if result.scalar_one_or_none():
            continue

        tex_file = TEMPLATES_DIR / f"{slug}.tex"
        if not tex_file.exists():
            continue

        tex_bytes = tex_file.read_bytes()
        key = generate_key(f"system/templates/{slug}", ".tex")
        path = await storage.put(key, tex_bytes)

        db.add(ResumeTemplate(slug=slug, tex_source_path=path, **meta))

    await db.commit()


async def seed_admin(db: AsyncSession) -> None:
    """Bootstrap the admin account from ADMIN_EMAIL + ADMIN_PASSWORD in config.
    Creates the account if it doesn't exist; updates the password if it does."""
    from app.config import settings
    from app.models.user import User
    from app.services.auth import hash_password

    if not settings.admin_email or not settings.admin_password:
        return  # nothing configured — skip silently

    result = await db.execute(select(User).where(User.email == settings.admin_email))
    user = result.scalar_one_or_none()
    new_hash = hash_password(settings.admin_password)

    if user:
        user.password_hash = new_hash  # keep password in sync with .env
    else:
        db.add(User(
            email=settings.admin_email,
            password_hash=new_hash,
            display_name="Admin",
        ))

    await db.commit()
