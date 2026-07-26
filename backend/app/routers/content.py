from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_admin

router = APIRouter(prefix="/api/content", tags=["content"])

# key -> (default value, human-readable label shown in the admin panel)
DEFAULT_CONTENT: dict[str, tuple[str, str]] = {
    "hero_eyebrow": ("UK · Est. Foundations Since Day One", "Home hero — small label above the headline"),
    "hero_heading": ("Building<em> Beyond</em><br> Expectations.", "Home hero — main headline (HTML allowed, e.g. <em>)"),
    "hero_description": (
        "Persepolis Construction delivers renovations, extensions and new-builds across the UK — "
        "engineered like a foundation, finished like a monument.",
        "Home hero — supporting paragraph",
    ),
    "about_intro": (
        "Persepolis Construction started as a two-man renovation crew in Birmingham and grew by referral, "
        "not advertising — the same reputation still runs every job today.",
        "About page — intro paragraph",
    ),
    "phone": ("+44 7378 955285", "Phone number (shown in header, footer, contact page)"),
    "email": ("info@persepolisconstruction.co.uk", "Email address (shown in footer, contact page)"),
    "coverage_area": ("Birmingham, England (Cotteridge area)", "Contact page — coverage area"),
    "office_hours": ("Mon–Fri, 8:00–17:30", "Contact page — office hours"),
    "footer_copyright": (
        "&copy; 2026 Persepolis Construction Ltd. All rights reserved.",
        "Footer — copyright line (HTML allowed)",
    ),
    "faq1_question": ("Are you insured and certified?", "FAQ 1 — question"),
    "faq1_answer": (
        "Yes — full public liability insurance and FMB membership. Certificates are provided with every written quote.",
        "FAQ 1 — answer",
    ),
    "faq2_question": ("How long does a quote take?", "FAQ 2 — question"),
    "faq2_answer": (
        "A site visit within a week of enquiry, and a written itemised quote within two working days after that.",
        "FAQ 2 — answer",
    ),
    "faq3_question": ("Do you handle planning permission?", "FAQ 3 — question"),
    "faq3_answer": (
        "We advise on what's needed and can manage the application on your behalf where required.",
        "FAQ 3 — answer",
    ),
    "faq4_question": ("What areas do you cover?", "FAQ 4 — question"),
    "faq4_answer": ("Birmingham and the West Midlands, based out of Cotteridge.", "FAQ 4 — answer"),
}


def seed_default_content(db: Session) -> None:
    """Insert any content keys that don't exist yet. Safe to call on every startup."""
    existing = {row.key for row in db.query(models.SiteContent.key).all()}
    for key, (value, label) in DEFAULT_CONTENT.items():
        if key not in existing:
            db.add(models.SiteContent(key=key, value=value, label=label))
    db.commit()


@router.get("", response_model=list[schemas.SiteContentOut])
def get_all_content(db: Session = Depends(get_db)):
    """Public — every page fetches this once and fills in any element
    with a matching data-content-key attribute."""
    return db.query(models.SiteContent).order_by(models.SiteContent.key).all()


@router.put("/{key}", response_model=schemas.SiteContentOut)
def update_content(
    key: str,
    payload: schemas.SiteContentUpdate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    item = db.get(models.SiteContent, key)
    if not item:
        raise HTTPException(status_code=404, detail=f"Unknown content key '{key}'")
    item.value = payload.value
    db.commit()
    db.refresh(item)
    return item
