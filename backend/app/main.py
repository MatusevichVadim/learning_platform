from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .db import init_db
from .seed import seed_initial_data
from .routers import public, admin


app = FastAPI(title="Learning Platform", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist - use absolute path from backend/app
# BASE_DIR should point to backend/ folder (parent of app/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
uploads_dir = os.path.join(BASE_DIR, "uploads")
os.makedirs(uploads_dir, exist_ok=True)
print(f"[MAIN] Static files served from: {uploads_dir}")

# Serve static files from uploads directory
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    seed_initial_data()


app.include_router(public.router, prefix="/api")
app.include_router(admin.router, prefix="/api/admin")


@app.get("/")
def root():
    return {"status": "ok"}


