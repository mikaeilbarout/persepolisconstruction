from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..email_utils import send_email
from ..rate_limit import limiter
from ..security import get_current_admin

router = APIRouter(prefix="/api/testimonials", tags=["testimonials"])


@router.get("", response_model=list[schemas.TestimonialOut])
def list_approved_testimonials(db: Session = Depends(get_db)):
    return (
        db.query(models.Testimonial)
        .filter(models.Testimonial.is_approved.is_(True))
        .order_by(models.Testimonial.created_at.desc())
        .all()
    )


@router.get("/admin/all", response_model=list[schemas.TestimonialOut])
def admin_list_testimonials(
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    return db.query(models.Testimonial).order_by(models.Testimonial.created_at.desc()).all()


@router.post("", response_model=schemas.TestimonialOut, status_code=201)
@limiter.limit("5/minute")
def submit_testimonial(request: Request, payload: schemas.TestimonialPublicCreate, db: Session = Depends(get_db)):
    """Public: any visitor can leave a review. It is never auto-approved —
    it only appears on the site once an admin approves it in the admin panel."""
    testimonial = models.Testimonial(**payload.model_dump(), is_approved=False)
    db.add(testimonial)
    db.commit()
    db.refresh(testimonial)

    account = db.query(models.AdminAccount).first()
    if account and account.notify_email:
        send_email(
            account.notify_email,
            f"New review awaiting approval — {testimonial.name}",
            f"Name: {testimonial.name}\nLocation: {testimonial.location or '—'}\n"
            f"Rating: {'★' * testimonial.rating}\n\n\"{testimonial.text}\"\n\n"
            f"Approve it in the admin panel's Testimonials tab.",
        )
    return testimonial


@router.post("/admin", response_model=schemas.TestimonialOut, status_code=201)
def admin_create_testimonial(
    payload: schemas.TestimonialCreate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Admin-only: add a testimonial directly (e.g. one collected by phone/email),
    with control over whether it's approved immediately."""
    testimonial = models.Testimonial(**payload.model_dump())
    db.add(testimonial)
    db.commit()
    db.refresh(testimonial)
    return testimonial


@router.put("/{testimonial_id}", response_model=schemas.TestimonialOut)
def update_testimonial(
    testimonial_id: int,
    payload: schemas.TestimonialUpdate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    testimonial = db.get(models.Testimonial, testimonial_id)
    if not testimonial:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(testimonial, field, value)
    db.commit()
    db.refresh(testimonial)
    return testimonial


@router.delete("/{testimonial_id}", status_code=204)
def delete_testimonial(
    testimonial_id: int,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    testimonial = db.get(models.Testimonial, testimonial_id)
    if not testimonial:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    db.delete(testimonial)
    db.commit()
    return None
