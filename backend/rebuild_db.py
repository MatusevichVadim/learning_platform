"""
Rebuild the ACTIVE database (the one the uvicorn server actually reads, which
is resolved from DB_PATH in backend/.env by app/db.py) into the NEW auth
schema, preserving ALL original data.

SOURCE = the DB_PATH the app uses (single source of truth).
We rebuild into a temp file, verify, then swap into place.
"""
import os
import secrets
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

# Resolve DB_PATH from backend/.env (same as app.db) so this script targets
# the SAME database the app actually uses. There is only ONE database.
BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
SOURCE = os.getenv("DB_PATH", "backend_data.sqlite3")
if not os.path.isabs(SOURCE):
    SOURCE = str(BACKEND_DIR / SOURCE)
REBUILT = str(Path(SOURCE).with_suffix("")) + "_rebuilt.sqlite3"
# Keep backend/ in sync with the active DB (same file if DB_PATH already lives there).
BACKEND_ACTIVE = str(BACKEND_DIR / os.path.basename(SOURCE))

# ---- import models (registers tables on Base) ----
from app.db import Base
import app.models  # noqa: F401  (registers User, Language, Lesson, Task, Submission)
from app.auth import get_password_hash
from app.models import User, Language, Lesson, Task, Submission

COPY_MODELS = [Language, Lesson, Task, Submission]


def parse_dt(v):
    if v is None:
        return datetime.utcnow()
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(v, fmt)
            except ValueError:
                continue
        return datetime.utcnow()
    return datetime.utcnow()


# ============ STEP 3: build fresh NEW-schema DB ============
if os.path.exists(REBUILT):
    os.remove(REBUILT)
    print(f"removed existing {REBUILT}")

rebuilt_engine = create_engine(
    f"sqlite:///{REBUILT}", connect_args={"check_same_thread": False}, future=True
)
Base.metadata.create_all(rebuilt_engine)

insp = inspect(rebuilt_engine)
user_cols = [c["name"] for c in insp.get_columns("users")]
assert "username" in user_cols, f"username column missing in rebuilt! cols={user_cols}"
print("rebuilt users columns:", user_cols)

# ============ STEP 4: copy data ============
source_engine = create_engine(
    f"sqlite:///{SOURCE}", connect_args={"check_same_thread": False}, future=True
)
SrcSession = sessionmaker(bind=source_engine, future=True)
NewSession = sessionmaker(bind=rebuilt_engine, future=True)

src = SrcSession()
new = NewSession()

# source counts (for verification)
src_counts = {}
for t in ["users", "languages", "lessons", "tasks", "submissions"]:
    src_counts[t] = src.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
print("SOURCE counts:", src_counts)

# --- copy the 4 matching tables (preserve ids) ---
for model in COPY_MODELS:
    tname = model.__tablename__
    cols = [c.name for c in model.__table__.columns]
    rows = src.execute(text(f"SELECT {', '.join(cols)} FROM {tname}")).mappings().all()
    for r in rows:
        data = {}
        for c in cols:
            val = r[c]
            if c == "created_at":
                val = parse_dt(val)
            data[c] = val
        # Source `lessons.language_id` is NULL; derive it from `language`
        # so the NOT NULL FK column is satisfied (faithful to source data).
        if tname == "lessons" and (data.get("language_id") in (None, "")):
            data["language_id"] = data.get("language")
        new.add(model(**data))
    new.flush()
    print(f"copied {tname}: {len(rows)} rows")

# --- copy users (OLD -> NEW transform) ---
src_users = src.execute(
    text("SELECT id, name, is_admin, created_at FROM users")
).mappings().all()

used_usernames = set()
temp_passwords = []
for r in src_users:
    uid = r["id"]
    name = r["name"]
    is_admin = r["is_admin"]
    created_at = parse_dt(r["created_at"])

    if name and str(name).strip():
        base = str(name).strip()
    else:
        base = f"user_{uid}"
    # Reserve 'admin' so seed.py can create the real admin account from env config.
    if base.lower() == "admin":
        base = f"user_{uid}"

    username = base
    suffix = 2
    while username.lower() in used_usernames:
        username = f"{base}_{suffix}"
        suffix += 1
    used_usernames.add(username.lower())

    pw = secrets.token_urlsafe(12)
    hashed = get_password_hash(pw)
    temp_passwords.append((uid, username, pw))

    new.add(User(
        id=uid,
        username=username,
        hashed_password=hashed,
        full_name=name,
        role="admin" if is_admin else "user",
        is_active=True,
        created_at=created_at,
        name=name,
    ))
new.flush()
print(f"copied users: {len(src_users)} rows")

# Save temp passwords to a file for the operator's convenience.
pw_file = os.path.join(Path(SOURCE).parent, "temp_passwords.txt")
with open(pw_file, "w", encoding="utf-8") as f:
    f.write("# TEMPORARY user passwords (generated during DB rebuild)\n")
    f.write("# Format: user_id | username | temp_password\n")
    for uid, username, pw in temp_passwords:
        f.write(f"{uid} | {username} | {pw}\n")
        print(f"user {uid} ({username}): TEMP PASSWORD = {pw}")

new.commit()
src.close()
new.close()

# ============ STEP 5: verify ============
veng = create_engine(
    f"sqlite:///{REBUILT}", connect_args={"check_same_thread": False}, future=True
)
with veng.connect() as c:
    # username query must succeed
    c.execute(text("SELECT id, username, hashed_password, role, is_active FROM users")).fetchall()
    rebuilt_counts = {}
    for t in ["users", "languages", "lessons", "tasks", "submissions"]:
        rebuilt_counts[t] = c.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
    # no NULL critical columns
    nulls = c.execute(text(
        "SELECT COUNT(*) FROM users "
        "WHERE username IS NULL OR hashed_password IS NULL OR role IS NULL "
        "OR is_active IS NULL OR created_at IS NULL"
    )).scalar()

print("\n=== VERIFICATION (source -> rebuilt) ===")
ok = True
for t in ["users", "languages", "lessons", "tasks", "submissions"]:
    s = src_counts[t]
    b = rebuilt_counts[t]
    flag = "OK" if s == b else "MISMATCH"
    if s != b:
        ok = False
    print(f"  {t}: {s} -> {b}  [{flag}]")
print(f"  NULL critical user columns: {nulls}  [{'OK' if nulls == 0 else 'FAIL'}]")
if nulls != 0:
    ok = False

veng.dispose()
source_engine.dispose()
rebuilt_engine.dispose()

if not ok:
    print("\nVERIFICATION FAILED - NOT swapping. Inspect above.")
    raise SystemExit(1)

print("\nVERIFICATION PASSED.")

# ============ STEP 6: swap ============
ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# 6a. active (the real DB the server reads)
broken_backup_root = os.path.join(Path(SOURCE).parent, f"{os.path.basename(SOURCE).replace('.sqlite3','')}_broken_backup_{ts}.sqlite3")
os.rename(SOURCE, broken_backup_root)
os.rename(REBUILT, SOURCE)
print(f"active: renamed -> {os.path.basename(broken_backup_root)}")
print(f"active: renamed rebuilt -> {os.path.basename(SOURCE)}")

# 6b. also sync backend/<same basename> so it has the full data too
if os.path.abspath(BACKEND_ACTIVE) != os.path.abspath(SOURCE):
    if os.path.exists(BACKEND_ACTIVE):
        bb = os.path.join(Path(BACKEND_ACTIVE).parent, f"{os.path.basename(BACKEND_ACTIVE).replace('.sqlite3','')}_broken_backup_{ts}.sqlite3")
        try:
            os.rename(BACKEND_ACTIVE, bb)
            print(f"backend/: renamed old -> {os.path.basename(bb)}")
        except OSError as e:
            print(f"backend/: could not rename old ({e}); will overwrite copy")
    import shutil
    shutil.copy2(SOURCE, BACKEND_ACTIVE)
    print(f"backend/: copied rebuilt DB into {BACKEND_ACTIVE}")

print("\nDONE. Temp passwords saved to:", pw_file)
