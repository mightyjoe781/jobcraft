import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AtsScore(Base):
    __tablename__ = "ats_scores"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    resume_variant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("resume_variants.id", ondelete="SET NULL"), nullable=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    breakdown_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    suggestions_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
