"""add share token to candidate report

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-03-13 16:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "e5f6g7h8i9j0"
down_revision: str | None = "d4e5f6g7h8i9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "candidate_report",
        sa.Column("share_token", sa.String(64), nullable=True),
    )
    op.add_column(
        "candidate_report",
        sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_candidate_report_share_token",
        "candidate_report",
        ["share_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_candidate_report_share_token", table_name="candidate_report")
    op.drop_column("candidate_report", "share_expires_at")
    op.drop_column("candidate_report", "share_token")
