import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

from app.config import settings


class JobCreate(BaseModel):
    company: str
    role_title: str
    jd_text: str | None = None
    jd_url: str | None = None

    @field_validator("jd_text")
    @classmethod
    def jd_size(cls, v: str | None) -> str | None:
        if v and len(v) > settings.jd_text_max_chars:
            raise ValueError(f"Job description exceeds {settings.jd_text_max_chars} character limit")
        return v


class JobOut(BaseModel):
    id: uuid.UUID
    company: str
    role_title: str
    jd_text: str | None
    jd_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FetchJdRequest(BaseModel):
    url: str


class FetchJdResponse(BaseModel):
    company: str
    role_title: str
    jd_text: str


class TailorRequest(BaseModel):
    base_resume_id: uuid.UUID
    job_id: uuid.UUID
    aggressiveness: Literal["conservative", "balanced", "aggressive"] = "balanced"
    custom_instruction: str | None = None

    @field_validator("custom_instruction")
    @classmethod
    def instruction_limit(cls, v: str | None) -> str | None:
        if v and len(v) > settings.custom_instruction_max_chars:
            raise ValueError(f"Custom instruction exceeds {settings.custom_instruction_max_chars} characters")
        return v


class TailorResponse(BaseModel):
    variant_id: uuid.UUID
    stream_url: str
