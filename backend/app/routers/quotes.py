from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..email_utils import send_email
from ..rate_limit import limiter
from ..security import get_current_admin

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


@router.post("", response_model=schemas.QuoteRequestOut, status_code=201)
@limiter.limit("5/minute")
def submit_quote_request(request: Request, payload: schemas.QuoteRequestCreate, db: Session = Depends(get_db)):
    quote = models.QuoteRequest(**payload.model_dump())
    db.add(quote)
    db.commit()
    db.refresh(quote)

    account = db.query(models.AdminAccount).first()
    if account and account.notify_email:
        send_email(
            account.notify_email,
            f"New quote request — {quote.name}",
            f"Name: {quote.name}\nEmail: {quote.email}\nPhone: {quote.phone}\n"
            f"Project type: {quote.project_type}\n\nDetails:\n{quote.details or '—'}",
        )
    return quote


@router.get("", response_model=list[schemas.QuoteRequestOut])
def admin_list_quotes(
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    return db.query(models.QuoteRequest).order_by(models.QuoteRequest.created_at.desc()).all()


@router.patch("/{quote_id}", response_model=schemas.QuoteRequestOut)
def update_quote_status(
    quote_id: int,
    payload: schemas.QuoteRequestUpdate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    quote = db.get(models.QuoteRequest, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote request not found")
    quote.status = payload.status
    db.commit()
    db.refresh(quote)
    return quote


@router.delete("/{quote_id}", status_code=204)
def delete_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    quote = db.get(models.QuoteRequest, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote request not found")
    db.delete(quote)
    db.commit()
    return None
