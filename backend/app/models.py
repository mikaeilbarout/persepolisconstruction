import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from .database import Base


class ProjectCategory(str, enum.Enum):
    renovation = "renovation"
    extension = "extension"
    new_build = "new_build"
    structural = "structural"
    exterior = "exterior"
    maintenance = "maintenance"


class QuoteStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    quoted = "quoted"
    won = "won"
    lost = "lost"


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    category = Column(Enum(ProjectCategory), nullable=False, default=ProjectCategory.renovation)
    description = Column(Text, default="")
    location = Column(String(120), default="")
    is_published = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    images = relationship(
        "ProjectImage", back_populates="project", cascade="all, delete-orphan", order_by="ProjectImage.id"
    )


class ImageLabel(str, enum.Enum):
    before = "before"
    after = "after"
    gallery = "gallery"


class ProjectImage(Base):
    __tablename__ = "project_images"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    image_path = Column(String(300), nullable=False)
    label = Column(Enum(ImageLabel), nullable=False, default=ImageLabel.gallery)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="images")


class Testimonial(Base):
    __tablename__ = "testimonials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    location = Column(String(120), default="")
    text = Column(Text, nullable=False)
    rating = Column(Integer, default=5)
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class QuoteRequest(Base):
    __tablename__ = "quote_requests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(200), nullable=False)
    phone = Column(String(40), nullable=False)
    project_type = Column(String(60), default="Other")
    details = Column(Text, default="")
    status = Column(Enum(QuoteStatus), default=QuoteStatus.new)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AdminAccount(Base):
    """Single-row table holding the admin's login credentials and
    notification email — moved out of .env so the admin can change their
    own password and recovery email at runtime without editing files."""

    __tablename__ = "admin_account"

    id = Column(Integer, primary_key=True)
    username = Column(String(80), nullable=False)
    password_hash = Column(String(200), nullable=False)
    notify_email = Column(String(200), nullable=True)
    reset_token = Column(String(100), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SiteContent(Base):
    """Simple key/value store for editable site text (hero copy, contact
    details, etc.) so the admin can change wording without touching code."""

    __tablename__ = "site_content"

    key = Column(String(80), primary_key=True)
    value = Column(Text, nullable=False, default="")
    label = Column(String(150), default="")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
