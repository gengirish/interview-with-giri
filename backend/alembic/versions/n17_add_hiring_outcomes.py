"""Add hiring_outcome and prediction_model tables."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "n17_hiring_outcomes"
down_revision: str | None = "n16_company_values"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hiring_outcome",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organization.id"), nullable=False, index=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("interview_session.id"), nullable=False, index=True),
        sa.Column("candidate_email", sa.String(255), nullable=False),
        sa.Column("was_hired", sa.Boolean(), nullable=False),
        sa.Column("hire_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("performance_rating", sa.Numeric(3, 1), nullable=True),
        sa.Column("retention_months", sa.Integer(), nullable=True),
        sa.Column("is_still_employed", sa.Boolean(), nullable=True),
        sa.Column("left_reason", sa.String(100), nullable=True),
        sa.Column("manager_feedback", sa.Text(), nullable=True),
        sa.Column("feedback_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("session_id", name="hiring_outcome_session_id_key"),
    )
    op.create_table(
        "prediction_model",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organization.id"), nullable=False, index=True),
        sa.Column("model_version", sa.Integer(), server_default="1"),
        sa.Column("training_sample_size", sa.Integer(), nullable=True),
        sa.Column("feature_weights", JSONB, server_default="{}"),
        sa.Column("accuracy_metrics", JSONB, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("trained_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("prediction_model")
    op.drop_table("hiring_outcome")
