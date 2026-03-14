"""Add walkthrough_progress to users table."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "n4o5p6q7r8s9"
down_revision: str | None = "m3n4o5p6q7r8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("walkthrough_progress", JSONB, nullable=True, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("users", "walkthrough_progress")
