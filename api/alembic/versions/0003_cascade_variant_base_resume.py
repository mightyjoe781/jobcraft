"""cascade delete variants when base resume deleted

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-16
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old FK without CASCADE
    op.drop_constraint("resume_variants_base_resume_id_fkey", "resume_variants", type_="foreignkey")
    # Re-add with SET NULL so deleting a base resume orphans variants (keeps history)
    # rather than cascade-deleting the tailored work
    op.create_foreign_key(
        "resume_variants_base_resume_id_fkey",
        "resume_variants", "base_resumes",
        ["base_resume_id"], ["id"],
        ondelete="SET NULL",
    )
    # Allow NULL now that FK is SET NULL
    op.alter_column("resume_variants", "base_resume_id", nullable=True)


def downgrade() -> None:
    op.alter_column("resume_variants", "base_resume_id", nullable=False)
    op.drop_constraint("resume_variants_base_resume_id_fkey", "resume_variants", type_="foreignkey")
    op.create_foreign_key(
        "resume_variants_base_resume_id_fkey",
        "resume_variants", "base_resumes",
        ["base_resume_id"], ["id"],
    )
