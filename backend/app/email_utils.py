import logging
import smtplib
from email.mime.text import MIMEText

from .config import settings

logger = logging.getLogger("persepolis.email")


def send_email(to_email: str, subject: str, body: str) -> bool:
    """Best-effort send — returns False (and logs) instead of raising when
    SMTP isn't configured or the send fails, so callers (quote/review
    submission, password reset) never break because of email trouble."""
    if not to_email or not settings.smtp_host or not settings.smtp_from_email:
        logger.info("Email skipped (SMTP not configured): %s", subject)
        return False

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, [to_email], msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send email: %s", subject)
        return False
