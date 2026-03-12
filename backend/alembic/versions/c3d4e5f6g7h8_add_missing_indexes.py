"""Add missing database indexes for query performance."""

from collections.abc import Sequence

from alembic import op

revision: str = "c3d4e5f6g7h8"
down_revision: str | None = "b2c3d4e5f6g7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_users_org_id", "users", ["org_id"])
    op.create_index("ix_job_posting_org_id", "job_posting", ["org_id"])
    op.create_index("ix_interview_session_org_id", "interview_session", ["org_id"])
    op.create_index("ix_interview_session_job_posting_id", "interview_session", ["job_posting_id"])
    op.create_index("ix_interview_session_status", "interview_session", ["status"])
    op.create_index("ix_interview_session_created_at", "interview_session", ["created_at"])
    op.create_index("ix_interview_message_session_id", "interview_message", ["session_id"])
    op.create_index("ix_subscription_org_id", "subscription", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_subscription_org_id", table_name="subscription")
    op.drop_index("ix_interview_message_session_id", table_name="interview_message")
    op.drop_index("ix_interview_session_created_at", table_name="interview_session")
    op.drop_index("ix_interview_session_status", table_name="interview_session")
    op.drop_index("ix_interview_session_job_posting_id", table_name="interview_session")
    op.drop_index("ix_interview_session_org_id", table_name="interview_session")
    op.drop_index("ix_job_posting_org_id", table_name="job_posting")
    op.drop_index("ix_users_org_id", table_name="users")
