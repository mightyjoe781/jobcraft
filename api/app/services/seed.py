"""Seed resume_templates from bundled .tex files in api/templates/."""
import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume import ResumeTemplate
from app.storage import generate_key, storage

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"

TEMPLATE_META = {
    "ats-clean": {
        "name": "ATS Clean",
        "category": "engineering",
        "description": "Single-column, ATS-optimised layout for software engineering roles.",
        "is_ats_friendly": True,
        "sort_order": 0,
    },
    "ats-data": {
        "name": "ATS Data",
        "category": "data",
        "description": "Skills-first layout tailored for data engineering and data science roles.",
        "is_ats_friendly": True,
        "sort_order": 1,
    },
    "ats-minimal": {
        "name": "ATS Minimal",
        "category": "general",
        "description": "Ultra-clean single-column layout suitable for any role.",
        "is_ats_friendly": True,
        "sort_order": 2,
    },
    "two-column-modern": {
        "name": "Two Column Modern",
        "category": "general",
        "description": "Two-column layout with sidebar. Visually distinctive; may not parse well in all ATS.",
        "is_ats_friendly": False,
        "sort_order": 3,
    },
    "academic": {
        "name": "Academic CV",
        "category": "research",
        "description": "Standard CV format for PhD applications, research, and academic positions.",
        "is_ats_friendly": True,
        "sort_order": 4,
    },
}


async def seed_templates(db: AsyncSession) -> None:
    for slug, meta in TEMPLATE_META.items():
        result = await db.execute(select(ResumeTemplate).where(ResumeTemplate.slug == slug))
        if result.scalar_one_or_none():
            continue

        tex_file = TEMPLATES_DIR / f"{slug}.tex"
        if not tex_file.exists():
            continue

        tex_bytes = tex_file.read_bytes()
        key = generate_key(f"system/templates/{slug}", ".tex")
        path = await storage.put(key, tex_bytes)

        template = ResumeTemplate(slug=slug, tex_source_path=path, **meta)
        db.add(template)

    await db.commit()
