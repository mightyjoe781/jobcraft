import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

from app.config import settings


class CoverLetterCreate(BaseModel):
    job_id: uuid.UUID
    resume_variant_id: uuid.UUID | None = None
    tone: Literal["formal", "conversational", "enthusiastic"] = "formal"
    personal_hook: str | None = None

    @field_validator("personal_hook")
    @classmethod
    def hook_limit(cls, v: str | None) -> str | None:
        if v and len(v) > settings.personal_hook_max_chars:
            raise ValueError(f"Personal hook exceeds {settings.personal_hook_max_chars} characters")
        return v


class CoverLetterUpdate(BaseModel):
    body_text: str


class CoverLetterOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    resume_variant_id: uuid.UUID | None
    body_text: str
    tone: str
    created_at: datetime
    updated_at: datetime
    company: str | None = None
    role_title: str | None = None

    model_config = {"from_attributes": True}
