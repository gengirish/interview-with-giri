---
name: interviewbot-agentmail
description: Integrate AgentMail (agentmail.to) for AI-powered email communications in the Interview Bot. Use when working with interview invitations, completion notifications, candidate follow-ups, or replacing SMTP email with AgentMail API inboxes.
---

# AgentMail Integration for Interview Bot

## Overview

AgentMail is an API-first email platform designed for AI agents. It replaces traditional SMTP with programmable inboxes that can send, receive, and act on emails via API. This skill covers integrating AgentMail into the Interview Bot to handle interview invitations, completion notifications, and candidate communications.

**Docs**: https://docs.agentmail.to
**Console**: https://console.agentmail.to
**Base URL**: `https://api.agentmail.to/v0/`

## Why AgentMail over SMTP

The current notification system in `backend/src/interviewbot/services/notifications.py` uses raw SMTP via `smtplib`. AgentMail provides:

- API-first inbox creation (no manual email account setup)
- Per-organization inboxes (multi-tenant isolation)
- Webhook/websocket support for incoming email events
- Semantic search across inbox messages
- Automatic email labeling and structured data extraction
- No rate limits or per-inbox pricing concerns

## Environment Variables

```
AGENTMAIL_API_KEY=am_...          # Required - from console.agentmail.to
AGENTMAIL_DEFAULT_DOMAIN=agentmail.to  # Optional - custom domain if on paid plan
```

Add to:
- `backend/.env` and `backend/.env.example`
- `backend/src/interviewbot/config.py` (Settings model)
- Fly.io secrets: `fly secrets set AGENTMAIL_API_KEY=am_...`

### Config Integration

```python
# backend/src/interviewbot/config.py
class Settings(BaseSettings):
    agentmail_api_key: str = ""
    agentmail_default_domain: str = "agentmail.to"
```

## Python SDK

### Installation

Add to `backend/pyproject.toml` dependencies:
```toml
"agentmail>=0.1",
```

Then run `uv sync` to install.

### Client Initialization

```python
# backend/src/interviewbot/services/agentmail_client.py
from agentmail import AgentMail
from interviewbot.config import get_settings

def get_agentmail_client() -> AgentMail | None:
    settings = get_settings()
    if not settings.agentmail_api_key:
        return None
    return AgentMail(api_key=settings.agentmail_api_key)
```

## Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Interview Bot Backend                                  │
│                                                         │
│  ┌──────────────────┐    ┌────────────────────────────┐ │
│  │  notifications.py │───>│  agentmail_client.py       │ │
│  │  (send_interview_ │    │  - get_agentmail_client()  │ │
│  │   invitation,     │    │  - create_org_inbox()      │ │
│  │   send_interview_ │    │  - send_email()            │ │
│  │   completed)      │    │  - list_inbox_messages()   │ │
│  └──────────────────┘    └─────────┬──────────────────┘ │
│                                     │                    │
│  Falls back to SMTP if              │                    │
│  AGENTMAIL_API_KEY not set          │                    │
└─────────────────────────────────────┼────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  AgentMail API    │
                            │  api.agentmail.to │
                            └──────────────────┘
```

## Core Integration Patterns

### Pattern 1: Organization Inbox Management

Each organization gets a dedicated AgentMail inbox for sending interview-related emails.

```python
# backend/src/interviewbot/services/agentmail_client.py
import structlog
from agentmail import AgentMail
from interviewbot.config import get_settings

logger = structlog.get_logger()


def get_agentmail_client() -> AgentMail | None:
    settings = get_settings()
    if not settings.agentmail_api_key:
        return None
    return AgentMail(api_key=settings.agentmail_api_key)


async def create_org_inbox(org_id: str, org_name: str) -> dict | None:
    """Create or retrieve a dedicated inbox for an organization."""
    client = get_agentmail_client()
    if not client:
        return None
    try:
        settings = get_settings()
        inbox = client.inboxes.create(
            username=f"interviews-{org_id[:8]}",
            domain=settings.agentmail_default_domain,
            display_name=f"{org_name} Interviews",
            client_id=f"org-{org_id}",  # Idempotent - safe to retry
        )
        logger.info("agentmail_inbox_created", org_id=org_id, inbox_id=inbox.inbox_id)
        return {"inbox_id": inbox.inbox_id, "email": inbox.email}
    except Exception as e:
        logger.error("agentmail_inbox_failed", org_id=org_id, error=str(e))
        return None


async def send_email(
    inbox_id: str,
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
) -> bool:
    """Send an email from an organization's AgentMail inbox."""
    client = get_agentmail_client()
    if not client:
        return False
    try:
        client.inboxes.messages.send(
            inbox_id,
            to=to,
            subject=subject,
            text=text,
            html=html,
        )
        logger.info("agentmail_sent", to=to, subject=subject)
        return True
    except Exception as e:
        logger.error("agentmail_send_failed", to=to, error=str(e))
        return False
```

### Pattern 2: Updating notifications.py with AgentMail Fallback

Replace the SMTP transport in `notifications.py` while keeping SMTP as fallback:

```python
# backend/src/interviewbot/services/notifications.py
# Add at the top of _send_email():
async def _send_email(to_email: str, subject: str, html: str) -> bool:
    settings = get_settings()

    # Try AgentMail first
    if settings.agentmail_api_key:
        from interviewbot.services.agentmail_client import send_email
        # Requires org inbox_id - store in Organization table or cache
        # For now, use a default inbox
        result = await send_email(
            inbox_id=settings.agentmail_default_inbox_id,
            to=to_email,
            subject=subject,
            text=subject,  # Plain-text fallback
            html=html,
        )
        if result:
            return True
        logger.warning("agentmail_fallback_to_smtp", to=to_email)

    # Fallback to SMTP
    smtp_host = getattr(settings, "smtp_host", "")
    if not smtp_host:
        logger.warning("email_not_configured", to=to_email, subject=subject)
        return False
    # ... existing SMTP logic ...
```

### Pattern 3: Interview Invitation with AgentMail

```python
async def send_interview_invitation_agentmail(
    org_inbox_id: str,
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    interview_url: str,
    org_name: str,
) -> bool:
    html = _build_html("Interview Invitation", f"""
    <p>Hi {candidate_name},</p>
    <p>You've been invited to interview for <strong>{job_title}</strong>
       at <strong>{org_name}</strong>.</p>
    <div style="text-align: center; margin: 24px 0;">
        <a href="{interview_url}"
           style="display: inline-block; background: #4f46e5; color: white;
           text-decoration: none; padding: 12px 32px; border-radius: 8px;
           font-weight: 600;">Start Interview</a>
    </div>
    """)
    return await send_email(
        inbox_id=org_inbox_id,
        to=candidate_email,
        subject=f"Interview Invitation: {job_title} at {org_name}",
        text=f"Hi {candidate_name}, you've been invited to interview for {job_title}. Visit: {interview_url}",
        html=html,
    )
```

### Pattern 4: Receiving Candidate Replies (Advanced)

AgentMail can receive emails, enabling two-way candidate communication:

```python
async def check_candidate_replies(inbox_id: str) -> list[dict]:
    """Poll for new candidate replies in the org inbox."""
    client = get_agentmail_client()
    if not client:
        return []
    try:
        result = client.inboxes.messages.list(inbox_id, limit=50)
        replies = []
        for msg in result.messages:
            replies.append({
                "from": msg.from_,
                "subject": msg.subject,
                "text": msg.extracted_text or msg.text,
                "received_at": msg.created_at,
            })
        return replies
    except Exception as e:
        logger.error("agentmail_list_failed", inbox_id=inbox_id, error=str(e))
        return []
```

## Database Changes

Store the AgentMail inbox ID per organization:

```python
# backend/src/interviewbot/models/tables.py
class Organization(Base):
    # ... existing fields ...
    agentmail_inbox_id = Column(String(255), nullable=True)
    agentmail_email = Column(String(255), nullable=True)
```

Migration:
```python
# alembic revision --autogenerate -m "add agentmail fields to organization"
def upgrade():
    op.add_column("organization", sa.Column("agentmail_inbox_id", sa.String(255), nullable=True))
    op.add_column("organization", sa.Column("agentmail_email", sa.String(255), nullable=True))
```

## API Endpoints

### Organization Email Setup

```python
# backend/src/interviewbot/routers/organizations.py
@router.post("/email/setup")
async def setup_org_email(
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Create an AgentMail inbox for the organization."""
    from interviewbot.services.agentmail_client import create_org_inbox

    org = await db.get(Organization, org_id)
    if org.agentmail_inbox_id:
        return {"inbox_id": org.agentmail_inbox_id, "email": org.agentmail_email}

    result = await create_org_inbox(str(org_id), org.name)
    if not result:
        raise HTTPException(500, "Failed to create email inbox")

    org.agentmail_inbox_id = result["inbox_id"]
    org.agentmail_email = result["email"]
    await db.commit()

    return result
```

### Send Interview Invite via Email

```python
# backend/src/interviewbot/routers/job_postings.py
# Update generate_interview_link to optionally send email:
@router.post("/{posting_id}/generate-link")
async def generate_interview_link(
    posting_id: UUID,
    send_email: bool = Query(False),
    candidate_email: str | None = Query(None),
    candidate_name: str | None = Query(None),
    ...
):
    # ... existing link generation ...
    if send_email and candidate_email:
        org = await db.get(Organization, org_id)
        if org.agentmail_inbox_id:
            await send_interview_invitation_agentmail(
                org.agentmail_inbox_id,
                candidate_email,
                candidate_name or "Candidate",
                posting.title,
                f"{frontend_url}/interview/{token}",
                org.name,
            )
    return {"token": token, "interview_url": f"/interview/{token}"}
```

## Frontend Settings Integration

Add AgentMail setup to the Settings page:

```typescript
// frontend/src/app/dashboard/settings/page.tsx
// In the Notifications or Integrations tab:

const [emailSetup, setEmailSetup] = useState<{inbox_id: string; email: string} | null>(null);

async function handleSetupEmail() {
  try {
    const res = await api.setupOrgEmail(); // POST /api/v1/organizations/email/setup
    setEmailSetup(res);
    toast.success("Email inbox created successfully");
  } catch (err) {
    toast.error("Failed to set up email");
  }
}

// In the render:
<div className="rounded-lg border border-slate-200 p-4">
  <h3 className="font-medium">Email Notifications</h3>
  {emailSetup ? (
    <p className="text-sm text-slate-600">
      Sending from: <strong>{emailSetup.email}</strong>
    </p>
  ) : (
    <button onClick={handleSetupEmail} className="btn-primary">
      Set Up Email Inbox
    </button>
  )}
</div>
```

## Testing

### Unit Tests

```python
# backend/tests/test_agentmail.py
from unittest.mock import MagicMock, patch
import pytest

@pytest.mark.asyncio
async def test_create_org_inbox():
    mock_client = MagicMock()
    mock_client.inboxes.create.return_value = MagicMock(
        inbox_id="inbox_123", email="interviews-abcd1234@agentmail.to"
    )
    with patch("interviewbot.services.agentmail_client.get_agentmail_client", return_value=mock_client):
        from interviewbot.services.agentmail_client import create_org_inbox
        result = await create_org_inbox("org-id", "Acme Corp")
        assert result["inbox_id"] == "inbox_123"
        mock_client.inboxes.create.assert_called_once()


@pytest.mark.asyncio
async def test_send_email_via_agentmail():
    mock_client = MagicMock()
    with patch("interviewbot.services.agentmail_client.get_agentmail_client", return_value=mock_client):
        from interviewbot.services.agentmail_client import send_email
        result = await send_email("inbox_123", "test@example.com", "Subject", "Body")
        assert result is True
        mock_client.inboxes.messages.send.assert_called_once()


@pytest.mark.asyncio
async def test_fallback_when_no_api_key():
    with patch("interviewbot.services.agentmail_client.get_agentmail_client", return_value=None):
        from interviewbot.services.agentmail_client import send_email
        result = await send_email("inbox_123", "test@example.com", "Subject", "Body")
        assert result is False
```

## Implementation Checklist

1. Add `agentmail` to `backend/pyproject.toml` and `uv sync`
2. Add `AGENTMAIL_API_KEY` and `AGENTMAIL_DEFAULT_DOMAIN` to config
3. Create `backend/src/interviewbot/services/agentmail_client.py`
4. Add `agentmail_inbox_id` and `agentmail_email` columns to Organization table
5. Create Alembic migration for the new columns
6. Update `notifications.py` to try AgentMail before SMTP
7. Add `/organizations/email/setup` endpoint
8. Optionally update `generate-link` to send email invitations
9. Add email setup section to Settings page
10. Write tests for AgentMail service
11. Set `AGENTMAIL_API_KEY` in Fly.io secrets and Vercel env

## Error Handling

- Always wrap AgentMail calls in try/except and log failures
- Fall back to SMTP when AgentMail is not configured or fails
- Use `client_id` for idempotent inbox creation (safe to retry)
- Handle 429 rate limit responses with exponential backoff
- Check `error.body.message` for detailed error information from the SDK

## SDK Reference

| Method | Purpose |
|--------|---------|
| `client.inboxes.create(username?, domain?, display_name?, client_id?)` | Create inbox |
| `client.inboxes.messages.send(inbox_id, to, subject, text, html?)` | Send email |
| `client.inboxes.messages.list(inbox_id, limit?, page_token?)` | List received emails |
| `client.inboxes.get(inbox_id)` | Get inbox details |
| `client.inboxes.list()` | List all inboxes |

Messages received include `extracted_text` and `extracted_html` for reply content without quoted history.
