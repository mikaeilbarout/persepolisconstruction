import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .config import settings
from .database import Base, SessionLocal, engine
from .rate_limit import limiter
from .routers import auth, content, projects, quotes, testimonials

# Schema-first: tables are created directly from the models, no migration step.
Base.metadata.create_all(bind=engine)

# Fill in any missing editable-content rows (safe to run every startup).
with SessionLocal() as _db:
    content.seed_default_content(_db)
    auth.seed_default_account(_db)

app = FastAPI(title="Persepolis Construction API", version="1.0.0")

# ---------- Body size guard ----------
# Rejects obviously-oversized requests before they're read into memory, on
# top of the per-field length limits enforced by Pydantic. 10 MB comfortably
# covers the 8 MB image-upload limit plus multipart overhead.
MAX_BODY_BYTES = 10 * 1024 * 1024


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request body too large."})
    return await call_next(request)


# ---------- Rate limiting ----------
# A generous default protects the whole API from being hammered; individual
# public write endpoints (login, quote submissions, reviews) carry their own
# tighter limits declared next to the route in each router.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
os.makedirs(os.path.join(STATIC_DIR, "uploads"), exist_ok=True)
app.mount("/static", StaticFiles(directory=os.path.normpath(STATIC_DIR)), name="static")

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(testimonials.router)
app.include_router(quotes.router)
app.include_router(content.router)


@app.get("/api/health")
@limiter.limit("30/minute")
def health_check(request: Request):
    return {"status": "ok"}


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": "Not found. Check the API docs at /docs for available endpoints."},
    )
