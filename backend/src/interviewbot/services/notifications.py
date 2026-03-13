"""Email notification service for interview events."""

import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib

import structlog

from interviewbot.config import get_settings

logger = structlog.get_logger()


def _build_html(subject: str, body_html: str) -> str:
    return f"""
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        margin: 0; padding: 0; background-color: #f8fafc;">
        <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 12px;
            border: 1px solid #e2e8f0; overflow: hidden;">
            <div style="background: #4f46e5; padding: 24px 32px;">
                <h1 style="color: white; margin: 0; font-size: 20px;">InterviewBot</h1>
            </div>
            <div style="padding: 32px;">
                <h2 style="color: #1e293b; margin: 0 0 16px;">{subject}</h2>
                {body_html}
            </div>
            <div style="background: #f8fafc; padding: 16px 32px; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    Powered by InterviewBot - AI Interview as a Service
                </p>
            </div>
        </div>
    </body>
    </html>
    """


async def send_interview_invitation(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    interview_url: str,
    org_name: str,
    org_inbox_id: str | None = None,
) -> bool:
    body = f"""
    <p style="color: #475569;">Hi {candidate_name},</p>
    <p style="color: #475569;">You've been invited to interview for the position of
        <strong>{job_title}</strong> at <strong>{org_name}</strong>.</p>
    <p style="color: #475569;">Click the button below to begin your interview:</p>
    <div style="text-align: center; margin: 24px 0;">
        <a href="{interview_url}"
           style="display: inline-block; background: #4f46e5; color: white; text-decoration: none;
           padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Start Interview
        </a>
    </div>
    <p style="color: #94a3b8; font-size: 13px;">
        This link is unique to you. Do not share it with others.
    </p>
    """
    return await _send_email(
        to_email=candidate_email,
        subject=f"Interview Invitation: {job_title} at {org_name}",
        html=_build_html("Interview Invitation", body),
        org_inbox_id=org_inbox_id,
    )


async def send_interview_completed(
    hiring_manager_email: str,
    candidate_name: str,
    job_title: str,
    score: float | None,
    report_url: str,
    org_inbox_id: str | None = None,
) -> bool:
    score_text = f"{score:.1f}/10" if score else "Pending"
    body = f"""
    <p style="color: #475569;">A candidate has completed their interview:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Candidate</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">{candidate_name}</td>
        </tr>
        <tr>
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Position</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">{job_title}</td>
        </tr>
        <tr>
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Score</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">{score_text}</td>
        </tr>
    </table>
    <div style="text-align: center; margin: 24px 0;">
        <a href="{report_url}"
           style="display: inline-block; background: #4f46e5; color: white; text-decoration: none;
           padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            View Report
        </a>
    </div>
    """
    return await _send_email(
        to_email=hiring_manager_email,
        subject=f"Interview Completed: {candidate_name} for {job_title}",
        html=_build_html("Interview Completed", body),
        org_inbox_id=org_inbox_id,
    )


async def _send_email(
    to_email: str,
    subject: str,
    html: str,
    org_inbox_id: str | None = None,
) -> bool:
    settings = get_settings()

    # --- AgentMail (preferred) ---
    if settings.agentmail_api_key and org_inbox_id:
        from interviewbot.services.agentmail_client import send_email as am_send

        ok = await am_send(
            inbox_id=org_inbox_id,
            to=to_email,
            subject=subject,
            text=subject,
            html=html,
        )
        if ok:
            return True
        logger.warning("agentmail_fallback_to_smtp", to=to_email)

    # --- SMTP fallback ---
    smtp_host = getattr(settings, "smtp_host", "")
    smtp_port = getattr(settings, "smtp_port", 587)
    smtp_user = getattr(settings, "smtp_user", "")
    smtp_password = getattr(settings, "smtp_password", "")
    from_email = getattr(settings, "from_email", "noreply@interviewbot.ai")

    if not smtp_host:
        logger.warning("email_not_configured", to=to_email, subject=subject)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))

        def _send_sync() -> None:
            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
                    if smtp_user:
                        server.login(smtp_user, smtp_password)
                    server.sendmail(from_email, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.starttls()
                    if smtp_user:
                        server.login(smtp_user, smtp_password)
                    server.sendmail(from_email, [to_email], msg.as_string())

        await asyncio.to_thread(_send_sync)

        logger.info("email_sent", to=to_email, subject=subject)
        return True
    except (smtplib.SMTPException, OSError) as e:
        logger.error("email_failed", to=to_email, error=str(e))
        return False
