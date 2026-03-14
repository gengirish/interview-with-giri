"""Add competency_genome and role_genome_profile tables."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "n11_competency_genome"
down_revision: str | None = "n10_copilot_session"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "competency_genome",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organization.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("candidate_email", sa.String(255), nullable=False),
        sa.Column("candidate_name", sa.String(255), nullable=True),
        sa.Column("genome_data", JSONB, server_default="{}"),
        sa.Column("version", sa.Integer(), server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "candidate_email", name="uq_competency_genome_org_email"),
    )
    op.create_table(
        "role_genome_profile",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organization.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("role_type", sa.String(100), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("ideal_genome", JSONB, server_default="{}"),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "role_type", name="uq_role_genome_profile_org_role"),
    )


def downgrade() -> None:
    op.drop_table("role_genome_profile")
    op.drop_table("competency_genome")
