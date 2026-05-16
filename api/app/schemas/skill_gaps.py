import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SkillGapAnalyzeRequest(BaseModel):
    job_id: uuid.UUID
    base_resume_id: uuid.UUID


class SkillGapItem(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    category: str
    skill_name: str
    priority: int
    why_it_matters: str
    suggested_resource: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SkillGapUpdate(BaseModel):
    status: Literal["identified", "learning", "acquired", "not_pursuing"]
