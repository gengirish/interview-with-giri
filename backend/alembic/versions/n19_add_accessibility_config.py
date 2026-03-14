"""Add accessibility_config to interview_session."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "n19_accessibility_config"
down_revision: str | None = "n18_knowledge_base"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'interview_session' AND column_name = 'accessibility_config'"
        )
    )
    if not result.fetchone():
        op.add_column(
            "interview_session",
            sa.Column("accessibility_config", JSONB, nullable=True),
        )


def downgrade() -> None:
    op.drop_column("interview_session", "accessibility_config")
