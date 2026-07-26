import io
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_admin

router = APIRouter(prefix="/api/projects", tags=["projects"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "static", "uploads")
UPLOAD_DIR = os.path.normpath(UPLOAD_DIR)
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
CONTENT_TYPE_TO_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB — checked against the raw upload, before compression
MAX_DIMENSION = 1920  # longest edge, in pixels — plenty for full-width web display


def compress_image(raw_bytes: bytes, content_type: str) -> bytes:
    """Re-encode the uploaded image: downscale anything bigger than
    MAX_DIMENSION on its longest edge and recompress, so a phone photo
    straight off a camera (often 4000px+ and several MB) doesn't sit on
    disk — and get served to every visitor — at full size.

    This also acts as a safety net: Pillow has to successfully decode the
    bytes as a real image of the claimed type, which rejects anything that
    merely has the right Content-Type header but isn't actually a valid
    image.
    """
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img.verify()
        img = Image.open(io.BytesIO(raw_bytes))  # re-open: verify() consumes the parser
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="File is not a valid image")

    if content_type == "image/jpeg" and img.mode != "RGB":
        img = img.convert("RGB")

    width, height = img.size
    if max(width, height) > MAX_DIMENSION:
        scale = MAX_DIMENSION / max(width, height)
        img = img.resize((int(width * scale), int(height * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    if content_type == "image/jpeg":
        img.save(buf, format="JPEG", quality=82, optimize=True)
    elif content_type == "image/png":
        img.save(buf, format="PNG", optimize=True)
    else:  # image/webp
        img.save(buf, format="WEBP", quality=82)
    return buf.getvalue()


# ---------- Public ----------
@router.get("", response_model=list[schemas.ProjectOut])
def list_projects(
    category: Optional[models.ProjectCategory] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Project).filter(models.Project.is_published.is_(True))
    if category:
        query = query.filter(models.Project.category == category)
    return query.order_by(models.Project.created_at.desc()).all()


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if not project or not project.is_published:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ---------- Admin ----------
@router.get("/admin/all", response_model=list[schemas.ProjectOut])
def admin_list_projects(
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    return db.query(models.Project).order_by(models.Project.created_at.desc()).all()


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(
    payload: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    project = models.Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{project_id}", response_model=schemas.ProjectOut)
def update_project(
    project_id: int,
    payload: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return None


@router.post("/{project_id}/images", response_model=schemas.ProjectOut)
def upload_project_images(
    project_id: int,
    files: list[UploadFile] = File(...),
    label: models.ImageLabel = Form(models.ImageLabel.gallery),
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for file in files:
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail=f"{file.filename}: only JPEG, PNG or WEBP images are allowed")

        contents = file.file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"{file.filename}: image too large (8 MB limit)")
        if not contents:
            raise HTTPException(status_code=400, detail=f"{file.filename}: empty file")

        compressed = compress_image(contents, file.content_type)

        # The extension comes from our own whitelist mapping, never from the
        # client-supplied filename — a renamed file (e.g. "x.jpg" containing a
        # script, or a filename engineered to end in ".php") can't change what
        # gets written to disk. The random filename also rules out path traversal.
        ext = CONTENT_TYPE_TO_EXT[file.content_type]
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(compressed)

        db.add(models.ProjectImage(project_id=project.id, image_path=f"/static/uploads/{filename}", label=label))

    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}/images/{image_id}", response_model=schemas.ProjectOut)
def delete_project_image(
    project_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    image = db.get(models.ProjectImage, image_id)
    if not image or image.project_id != project_id:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = os.path.join(UPLOAD_DIR, os.path.basename(image.image_path))
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(image)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{project_id}/images/{image_id}", response_model=schemas.ProjectOut)
def relabel_project_image(
    project_id: int,
    image_id: int,
    payload: schemas.ProjectImageLabelUpdate,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    image = db.get(models.ProjectImage, image_id)
    if not image or image.project_id != project_id:
        raise HTTPException(status_code=404, detail="Image not found")

    image.label = payload.label
    db.commit()
    db.refresh(project)
    return project
