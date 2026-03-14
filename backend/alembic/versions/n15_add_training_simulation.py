"""Add training_simulation table."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "n15_training_simulation"
down_revision: str | None = "n14_interview_clips"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "training_simulation",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organization.id"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("role_type", sa.String(100), nullable=False),
        sa.Column("candidate_persona", JSONB, nullable=False),
        sa.Column("messages", JSONB, server_default="[]"),
        sa.Column("status", sa.String(30), server_default="active"),
        sa.Column("scorecard", JSONB, nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("training_simulation")
