from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .db import init_db
from .seed import seed_initial_data
from .routers import public, admin, auth, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_initial_data()
    yield


app = FastAPI(title="Learning Platform", version="0.1.0", lifespan=lifespan)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/")
def root():
    return {"status": "ok"}
