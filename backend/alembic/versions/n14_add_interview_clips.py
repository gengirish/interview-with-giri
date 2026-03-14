"""Add interview_clip and clip_collection tables."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "n14_interview_clips"
down_revision: str | None = "n13_engagement_metrics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "interview_clip",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("interview_session.id"), nullable=False, index=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organization.id"), nullable=False, index=True),
        sa.Column("clip_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("message_start_index", sa.Integer, nullable=False),
        sa.Column("message_end_index", sa.Integer, nullable=False),
        sa.Column("transcript_excerpt", sa.Text, nullable=False),
        sa.Column("importance_score", sa.Numeric(3, 2), nullable=True),
        sa.Column("tags", JSONB, server_default="[]"),
        sa.Column("share_token", sa.String(64), unique=True, nullable=True, index=True),
        sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "clip_collection",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organization.id"), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("clip_ids", JSONB, server_default="[]"),
        sa.Column("share_token", sa.String(64), unique=True, nullable=True, index=True),
        sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("clip_collection")
    op.drop_table("interview_clip")
