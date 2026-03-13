"""Add difficulty_progression and is_practice to interview_session."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "m3n4o5p6q7r8"
down_revision: str | None = "k1l2m3n4o5p6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_session",
        sa.Column("difficulty_progression", JSONB, nullable=True),
    )
    op.add_column(
        "interview_session",
        sa.Column("is_practice", sa.Boolean(), server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("interview_session", "is_practice")
    op.drop_column("interview_session", "difficulty_progression")
