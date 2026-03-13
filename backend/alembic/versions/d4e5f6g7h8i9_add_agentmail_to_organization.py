"""add agentmail fields to organization

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-03-13 14:00:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6g7h8i9"
down_revision: str | None = "c3d4e5f6g7h8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organization",
        sa.Column("agentmail_inbox_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "organization",
        sa.Column("agentmail_email", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organization", "agentmail_email")
    op.drop_column("organization", "agentmail_inbox_id")
