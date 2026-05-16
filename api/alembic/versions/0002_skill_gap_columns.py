"""add why_it_matters and suggested_resource to skill_gaps

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-16
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("skill_gaps", sa.Column("why_it_matters", sa.String(), nullable=False, server_default=""))
    op.add_column("skill_gaps", sa.Column("suggested_resource", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("skill_gaps", "why_it_matters")
    op.drop_column("skill_gaps", "suggested_resource")
