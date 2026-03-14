"""Add company_values and values_assessment tables."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "n16_company_values"
down_revision: str | None = "n15_training_simulation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "company_values",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organization.id"), nullable=False, index=True),
        sa.Column("values", JSONB, server_default="[]"),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("org_id", name="company_values_org_id_key"),
    )
    op.create_table(
        "values_assessment",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("interview_session.id"), nullable=False, index=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organization.id"), nullable=False, index=True),
        sa.Column("value_scores", JSONB, server_default="{}"),
        sa.Column("overall_fit_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("fit_label", sa.String(50), nullable=True),
        sa.Column("ai_narrative", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", name="values_assessment_session_id_key"),
    )


def downgrade() -> None:
    op.drop_table("values_assessment")
    op.drop_table("company_values")
