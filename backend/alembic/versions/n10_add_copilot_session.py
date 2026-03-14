"""Add copilot_session table."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "n10_copilot_session"
down_revision: str | None = "n4o5p6q7r8s9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "copilot_session",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "interview_session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("interview_session.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("status", sa.String(30), server_default="active"),
        sa.Column("suggestions", JSONB, server_default="[]"),
        sa.Column("competency_coverage", JSONB, server_default="{}"),
        sa.Column("legal_alerts", JSONB, server_default="[]"),
        sa.Column("config", JSONB, server_default="{}"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("interview_session_id", "user_id", name="uq_copilot_session_interview_user"),
    )


def downgrade() -> None:
    op.drop_table("copilot_session")
