"""set ON DELETE SET NULL on resume_variant_id FKs

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-18

When a resume variant is deleted (e.g. tailoring failure cleanup),
applications and ats_scores that reference it should have their
resume_variant_id nulled out rather than blocking the delete.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # applications.resume_variant_id
    op.drop_constraint("applications_resume_variant_id_fkey", "applications", type_="foreignkey")
    op.create_foreign_key(
        "applications_resume_variant_id_fkey",
        "applications", "resume_variants",
        ["resume_variant_id"], ["id"],
        ondelete="SET NULL",
    )

    # ats_scores.resume_variant_id
    op.drop_constraint("ats_scores_resume_variant_id_fkey", "ats_scores", type_="foreignkey")
    op.create_foreign_key(
        "ats_scores_resume_variant_id_fkey",
        "ats_scores", "resume_variants",
        ["resume_variant_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ats_scores_resume_variant_id_fkey", "ats_scores", type_="foreignkey")
    op.create_foreign_key(
        "ats_scores_resume_variant_id_fkey",
        "ats_scores", "resume_variants",
        ["resume_variant_id"], ["id"],
    )

    op.drop_constraint("applications_resume_variant_id_fkey", "applications", type_="foreignkey")
    op.create_foreign_key(
        "applications_resume_variant_id_fkey",
        "applications", "resume_variants",
        ["resume_variant_id"], ["id"],
    )
