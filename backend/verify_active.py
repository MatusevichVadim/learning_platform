import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

# Resolve DB_PATH from backend/.env (same as app.db) so this script inspects
# the SAME database the app actually uses.
DB_PATH = os.getenv("DB_PATH", "backend_data.sqlite3")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(BACKEND_DIR / DB_PATH)

eng = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}, future=True)
insp = inspect(eng)
print("ACTIVE:", DB_PATH)
print("users columns:", [c["name"] for c in insp.get_columns("users")])

with eng.connect() as c:
    # The exact query that was failing at startup
    rows = c.execute(text(
        "SELECT users.id, users.username, users.hashed_password, users.role, users.is_active "
        "FROM users"
    )).fetchall()
    print(f"SELECT username query OK -> {len(rows)} user rows returned")

    counts = {t: c.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
              for t in ["users", "languages", "lessons", "tasks", "submissions"]}
    print("counts:", counts)

    nulls = c.execute(text(
        "SELECT COUNT(*) FROM users WHERE username IS NULL OR hashed_password IS NULL "
        "OR role IS NULL OR is_active IS NULL OR created_at IS NULL"
    )).scalar()
    print("NULL critical user columns:", nulls)

    admin_exists = c.execute(text("SELECT COUNT(*) FROM users WHERE username='admin'")).scalar()
    print("users with username='admin' (should be 0 so seed creates the admin from env config):", admin_exists)

    admins = c.execute(text("SELECT id, username, role FROM users WHERE role='admin'")).fetchall()
    print("users with role='admin':", admins)

    # confirm id 93 (was name 'admin') got a non-admin username
    r93 = c.execute(text("SELECT id, username, role FROM users WHERE id=93")).fetchone()
    print("user 93:", r93)
eng.dispose()
print("\nACTIVE DB is NEW-schema and ready. Restart the uvicorn server to load it.")
