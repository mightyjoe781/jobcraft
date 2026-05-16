import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ResumeTemplate(Base):
    __tablename__ = "resume_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    tex_source_path: Mapped[str] = mapped_column(String, nullable=False)
    thumbnail_pdf_path: Mapped[str | None] = mapped_column(String, nullable=True)
    is_ats_friendly: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BaseResume(Base):
    __tablename__ = "base_resumes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, nullable=False)  # template|upload|forked_variant
    source_template_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("resume_templates.id"), nullable=True
    )
    source_variant_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    tex_source_path: Mapped[str] = mapped_column(String, nullable=False)
    pdf_cache_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    snapshots: Mapped[list["BaseResumeSnapshot"]] = relationship(
        back_populates="base_resume", cascade="all, delete-orphan"
    )
    variants: Mapped[list["ResumeVariant"]] = relationship(back_populates="base_resume")


class BaseResumeSnapshot(Base):
    __tablename__ = "base_resume_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    base_resume_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("base_resumes.id", ondelete="CASCADE"), nullable=False
    )
    tex_source_path: Mapped[str] = mapped_column(String, nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    base_resume: Mapped["BaseResume"] = relationship(back_populates="snapshots")


class ResumeVariant(Base):
    __tablename__ = "resume_variants"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    base_resume_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("base_resumes.id", ondelete="SET NULL"), nullable=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    modified_tex_path: Mapped[str] = mapped_column(String, nullable=False)
    pdf_path: Mapped[str | None] = mapped_column(String, nullable=True)
    ats_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    base_resume: Mapped["BaseResume"] = relationship(back_populates="variants")
