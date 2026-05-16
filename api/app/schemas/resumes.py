import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

from app.config import settings


class TemplateOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    category: str
    description: str | None
    is_ats_friendly: bool
    sort_order: int
    thumbnail_pdf_path: str | None

    model_config = {"from_attributes": True}


class BaseResumeCreate(BaseModel):
    label: str
    source_type: Literal["template", "upload", "forked_variant"]
    source_template_id: uuid.UUID | None = None
    source_variant_id: uuid.UUID | None = None
    tex_source: str

    @field_validator("tex_source")
    @classmethod
    def tex_size_limit(cls, v: str) -> str:
        if len(v.encode()) > settings.tex_source_max_bytes:
            raise ValueError(f"LaTeX source exceeds {settings.tex_source_max_bytes // 1000}KB limit")
        return v


class BaseResumeUpdate(BaseModel):
    label: str | None = None
    tex_source: str | None = None

    @field_validator("tex_source")
    @classmethod
    def tex_size_limit(cls, v: str | None) -> str | None:
        if v is not None and len(v.encode()) > settings.tex_source_max_bytes:
            raise ValueError(f"LaTeX source exceeds {settings.tex_source_max_bytes // 1000}KB limit")
        return v


class BaseResumeOut(BaseModel):
    id: uuid.UUID
    label: str
    source_type: str
    source_template_id: uuid.UUID | None
    source_variant_id: uuid.UUID | None
    pdf_cache_path: str | None
    created_at: datetime
    updated_at: datetime
    variant_count: int = 0

    model_config = {"from_attributes": True}


class BaseResumeWithTex(BaseResumeOut):
    tex_source: str


class SnapshotOut(BaseModel):
    id: uuid.UUID
    saved_at: datetime

    model_config = {"from_attributes": True}


class SnapshotWithTex(SnapshotOut):
    tex_source: str


class AiFillRequest(BaseModel):
    background_text: str

    @field_validator("background_text")
    @classmethod
    def size_limit(cls, v: str) -> str:
        if len(v) > settings.background_text_max_chars:
            raise ValueError(f"Background text exceeds {settings.background_text_max_chars} character limit")
        return v


class AiFillResponse(BaseModel):
    filled_tex: str


class RenderResponse(BaseModel):
    pdf_path: str


class VariantOut(BaseModel):
    id: uuid.UUID
    base_resume_id: uuid.UUID | None
    job_id: uuid.UUID | None
    modified_tex_path: str
    pdf_path: str | None
    ats_score: int | None
    label: str | None
    created_at: datetime
    company: str | None = None
    role_title: str | None = None

    model_config = {"from_attributes": True}


class DiffOut(BaseModel):
    original_tex: str
    modified_tex: str
