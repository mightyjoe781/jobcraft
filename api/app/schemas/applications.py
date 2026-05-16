import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

STATUS_VALUES = Literal[
    "saved", "tailoring", "applied", "oa_screen",
    "interview", "offer", "rejected", "withdrawn"
]

STATUS_LABELS = {
    "saved": "Saved",
    "tailoring": "Tailoring",
    "applied": "Applied",
    "oa_screen": "OA / Screen",
    "interview": "Interview",
    "offer": "Offer",
    "rejected": "Rejected",
    "withdrawn": "Withdrawn",
}


class ApplicationCreate(BaseModel):
    job_id: uuid.UUID
    resume_variant_id: uuid.UUID | None = None
    status: STATUS_VALUES = "saved"
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    status: STATUS_VALUES | None = None
    resume_variant_id: uuid.UUID | None = None
    applied_at: datetime | None = None
    referral_contact: str | None = None
    notes: str | None = None
    follow_up_date: date | None = None


class ApplicationOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    company: str
    role_title: str
    jd_text: str | None
    jd_url: str | None
    status: str
    applied_at: datetime | None
    referral_contact: str | None
    notes: str | None
    follow_up_date: date | None
    ats_score: int | None
    variant_id: uuid.UUID | None
    variant_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApplicationStats(BaseModel):
    total: int
    by_status: dict[str, int]
