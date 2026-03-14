"""Add interview_decision_tree table and decision_tree_id/tree_state to interview_session."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "n12_decision_tree"
down_revision: str | None = "n11_competency_genome"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "interview_decision_tree",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organization.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("role_type", sa.String(100), nullable=True),
        sa.Column("tree_data", JSONB, server_default="{}"),
        sa.Column("is_published", sa.Boolean(), server_default="false"),
        sa.Column("usage_count", sa.Integer(), server_default="0"),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column(
        "interview_session",
        sa.Column(
            "decision_tree_id",
            UUID(as_uuid=True),
            sa.ForeignKey("interview_decision_tree.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "interview_session",
        sa.Column("tree_state", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("interview_session", "tree_state")
    op.drop_column("interview_session", "decision_tree_id")
    op.drop_table("interview_decision_tree")
