"""Add engagement_metrics to interview_message and engagement_profile to candidate_report."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "n13_engagement_metrics"
down_revision: str | None = "n12_decision_tree"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_message",
        sa.Column("engagement_metrics", JSONB, nullable=True),
    )
    op.add_column(
        "candidate_report",
        sa.Column("engagement_profile", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("candidate_report", "engagement_profile")
    op.drop_column("interview_message", "engagement_metrics")
