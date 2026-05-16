import uuid
from datetime import datetime

from pydantic import BaseModel


class AtsScoreRequest(BaseModel):
    resume_variant_id: uuid.UUID | None = None
    job_id: uuid.UUID | None = None
    jd_text: str | None = None


class AtsBreakdown(BaseModel):
    keyword_match: int
    semantic_relevance: int
    formatting: int
    action_verbs: int
    quantification: int
    seniority_match: int


class MissingKeyword(BaseModel):
    term: str
    priority: str  # high | medium | low
    suggested_location: str


class Suggestion(BaseModel):
    priority: int
    category: str
    suggestion: str
    estimated_impact: str


class AtsScoreOut(BaseModel):
    id: uuid.UUID
    status: str  # pending | complete | failed
    overall_score: int | None
    breakdown: AtsBreakdown | None
    missing_keywords: list[MissingKeyword] | None
    suggestions: list[Suggestion] | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
