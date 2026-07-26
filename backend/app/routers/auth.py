import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..database import get_db
from ..email_utils import send_email
from ..rate_limit import limiter
from ..schemas import (
    AdminAccountOut,
    AdminAccountUpdate,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
)
from ..security import create_access_token, get_current_admin, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

RESET_TOKEN_VALID_MINUTES = 30


def seed_default_account(db: Session) -> None:
    """Create the single admin account row from .env on first run — after
    that, the password and notification email live in the database and are
    managed from the admin panel, not by editing .env."""
    if db.query(models.AdminAccount).first():
        return
    db.add(
        models.AdminAccount(
            username=settings.admin_username,
            password_hash=settings.admin_password_hash,
        )
    )
    db.commit()


def _get_account(db: Session) -> models.AdminAccount:
    account = db.query(models.AdminAccount).first()
    if not account:
        raise HTTPException(status_code=500, detail="Admin account is not set up")
    return account


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    account = db.query(models.AdminAccount).first()
    valid_username = account and payload.username == account.username
    valid_password = account and verify_password(payload.password, account.password_hash)
    if not (valid_username and valid_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token = create_access_token(subject=account.username)
    return TokenResponse(access_token=token)


@router.get("/account", response_model=AdminAccountOut)
def get_account(db: Session = Depends(get_db), _admin: str = Depends(get_current_admin)):
    return _get_account(db)


@router.put("/account", response_model=AdminAccountOut)
def update_account(
    payload: AdminAccountUpdate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    account = _get_account(db)
    if "notify_email" in payload.model_fields_set:
        account.notify_email = payload.notify_email
    db.commit()
    db.refresh(account)
    return account


@router.put("/password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    account = _get_account(db)
    if not verify_password(payload.current_password, account.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    account.password_hash = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password updated.")


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("3/hour")
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    account = db.query(models.AdminAccount).first()
    generic_response = MessageResponse(
        message="If that username has a recovery email set, a reset link has been sent."
    )
    if not account or payload.username != account.username or not account.notify_email:
        return generic_response

    token = secrets.token_urlsafe(32)
    account.reset_token = token
    account.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_VALID_MINUTES)
    db.commit()

    link = f"{settings.frontend_url}/admin.html?reset_token={token}"
    send_email(
        account.notify_email,
        "Reset your Persepolis admin password",
        f"A password reset was requested for the Persepolis Construction admin panel.\n\n"
        f"Reset link (valid for {RESET_TOKEN_VALID_MINUTES} minutes):\n{link}\n\n"
        f"If you didn't request this, you can ignore this email.",
    )
    return generic_response


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("5/hour")
def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    account = db.query(models.AdminAccount).first()
    expires = account.reset_token_expires if account else None
    # SQLite drops tzinfo on round-trip even for timezone-aware columns —
    # treat a naive value as UTC (the only zone anything here is ever stored in).
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    valid = (
        account
        and account.reset_token
        and account.reset_token == payload.token
        and expires
        and expires > datetime.now(timezone.utc)
    )
    if not valid:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")

    account.password_hash = hash_password(payload.new_password)
    account.reset_token = None
    account.reset_token_expires = None
    db.commit()
    return MessageResponse(message="Password has been reset. You can now log in.")
