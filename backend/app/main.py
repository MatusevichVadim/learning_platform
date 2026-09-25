from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import asyncio

from .db import init_db
from .seed import seed_initial_data
from .routers import public, admin, auth, profile, teacher
from .access import clear_language_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_initial_data()
    yield


app = FastAPI(title="Learning Platform", version="0.1.0", lifespan=lifespan)

# CORS origins can be set via ALLOWED_ORIGINS env var (comma separated).
# Defaults cover local Vite dev server. Override for production (e.g. your domain).
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TrustedHostMiddleware protects against Host header attacks.
# In production behind a reverse proxy, set ALLOWED_HOSTS to your domain(s).
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "*").split(",")
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[h.strip() for h in ALLOWED_HOSTS if h.strip()],
)


@app.middleware("http")
async def reset_request_cache(request: Request, call_next):
    """Clear the per-request language cache after each request completes.

    This ensures that cached data from one request does not leak into the next,
    which is critical when using a thread pool with multiple workers.
    """
    try:
        response = await call_next(request)
        return response
    finally:
        clear_language_cache()


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add X-Process-Time header for debugging slow requests."""
    import time
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = time.perf_counter() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.3f}"
    return response


@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    """Prevent slow requests from hanging indefinitely.

    Each request is given a configurable timeout (default 60s).  If the
    request exceeds the timeout, a 504 response is returned.  This prevents
    a single slow request from consuming a worker indefinitely, which is
    critical when many users are active simultaneously.
    """
    timeout = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "60"))
    try:
        return await asyncio.wait_for(call_next(request), timeout=timeout)
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=504,
            content={"detail": "Request timed out"},
        )


# Create uploads directory if it doesn't exist - use absolute path from backend/app
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
uploads_dir = os.path.join(BASE_DIR, "uploads")
os.makedirs(uploads_dir, exist_ok=True)
print(f"[MAIN] Static files served from: {uploads_dir}")

# Serve static files from uploads directory
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


app.include_router(public.router, prefix="/api")
app.include_router(admin.router, prefix="/api/admin")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(profile.router, prefix="/api/profile")
app.include_router(teacher.router, prefix="/api/teacher")


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health():
    """Health check endpoint for load balancers and monitoring."""
    from .db import engine
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "disconnected", "detail": str(e)},
        )
