from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import ImageLabel, ProjectCategory, QuoteStatus


# ---------- Projects ----------
class ProjectBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: ProjectCategory
    description: str = Field(default="", max_length=4000)
    location: str = Field(default="", max_length=200)
    is_published: bool = True


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category: Optional[ProjectCategory] = None
    description: Optional[str] = Field(default=None, max_length=4000)
    location: Optional[str] = Field(default=None, max_length=200)
    is_published: Optional[bool] = None


class ProjectImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    image_path: str
    label: ImageLabel


class ProjectImageLabelUpdate(BaseModel):
    label: ImageLabel


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    images: list[ProjectImageOut] = []
    created_at: datetime


# ---------- Testimonials ----------
class TestimonialBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    location: str = Field(default="", max_length=120)
    text: str = Field(min_length=1, max_length=2000)
    rating: int = Field(default=5, ge=1, le=5)


class TestimonialPublicCreate(TestimonialBase):
    """What a website visitor can submit — approval is never in their control."""
    pass


class TestimonialCreate(TestimonialBase):
    is_approved: bool = False


class TestimonialUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    text: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    is_approved: Optional[bool] = None


class TestimonialOut(TestimonialBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_approved: bool
    created_at: datetime


# ---------- Quote requests ----------
class QuoteRequestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=3, max_length=40)
    project_type: str = Field(default="Other", max_length=60)
    details: str = Field(default="", max_length=4000)


class QuoteRequestUpdate(BaseModel):
    status: QuoteStatus


class QuoteRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    phone: str
    project_type: str
    details: str
    status: QuoteStatus
    created_at: datetime


# ---------- Auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=100)


class AdminAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    username: str
    notify_email: Optional[str] = None


class AdminAccountUpdate(BaseModel):
    notify_email: Optional[EmailStr] = None


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=100)


# ---------- Site content (editable text) ----------
class SiteContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    value: str
    label: str
    updated_at: datetime


class SiteContentUpdate(BaseModel):
    value: str = Field(max_length=5000)
