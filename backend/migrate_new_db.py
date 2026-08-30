"""
Clean data-migration script for the `auth` branch.

Creates a NEW database file with the new auth-enabled schema and transfers ALL
data from the existing (old) database into it, then swaps it into place while
keeping a backup of the old database.

This script does NOT modify any application source code and does NOT run the
in-place migration scripts (migrate_auth.py / migrate_fix_users.py).
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.db import Base
import app.models  # noqa: F401  (register all models on Base.metadata)
from app.auth import get_password_hash


def _parse_dt(value):
    """Parse a datetime value that may be a datetime, date, or string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
        return value
    return value

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
OLD_DB = os.path.join(BACKEND_DIR, "backend_data.sqlite3")
NEW_DB = os.path.join(BACKEND_DIR, "backend_data_new.sqlite3")

SIMPLE_TABLES = ["languages", "lessons", "tasks", "submissions"]


def main() -> None:
    # ------------------------------------------------------------------
    # Step 1: Inspect the old database
    # ------------------------------------------------------------------
    old_exists = os.path.exists(OLD_DB)
    print("=" * 70)
    print("STEP 1: INSPECT OLD DATABASE")
    print("=" * 70)
    if not old_exists:
        print("Old database does NOT exist. Will create a fresh DB via init_db()+seed.")
        _create_fresh()
        return

    print(f"Old database found: {OLD_DB}")

    old_engine = create_engine(f"sqlite:///{OLD_DB}", future=True)
    old_insp = inspect(old_engine)

    users_cols = old_insp.get_columns("users")
    users_col_names = {c["name"] for c in users_cols}
    print(f"Old `users` columns: {sorted(users_col_names)}")

    if "username" in users_col_names:
        old_schema = "new"
        print("Detected schema: NEW (already has `username`).")
    else:
        old_schema = "old"
        print("Detected schema: OLD (has `name`/`is_admin`, no `username`).")

    # ------------------------------------------------------------------
    # Step 2: Create the NEW database with the new schema
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("STEP 2: CREATE NEW DATABASE WITH NEW SCHEMA")
    print("=" * 70)
    if os.path.exists(NEW_DB):
        print(f"Removing leftover new DB file: {NEW_DB}")
        os.remove(NEW_DB)

    new_engine = create_engine(f"sqlite:///{NEW_DB}", future=True)
    Base.metadata.create_all(new_engine)
    print(f"New database created with new schema: {NEW_DB}")

    # ------------------------------------------------------------------
    # Step 3: Transfer data from old -> new
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("STEP 3: TRANSFER DATA OLD -> NEW")
    print("=" * 70)

    # 3a. Simple tables (identical schema) via ATTACH + INSERT...SELECT
    with new_engine.connect() as conn:
        conn.execute(text("ATTACH DATABASE :old AS olddb"), {"old": OLD_DB})
        for t in SIMPLE_TABLES:
            new_cols = [c.name for c in Base.metadata.tables[t].columns]
            old_cols_info = {c["name"] for c in old_insp.get_columns(t)}
            # Use intersection so minor schema drift is tolerated (defaults fill gaps)
            cols = [c for c in new_cols if c in old_cols_info]
            col_sql = ", ".join(cols)
            stmt = text(f"INSERT INTO {t} ({col_sql}) SELECT {col_sql} FROM olddb.{t}")
            res = conn.execute(stmt)
            print(f"  Copied {res.rowcount} rows -> {t}")
        conn.commit()

    # 3b. Users (special handling)
    _transfer_users(old_engine, new_engine, old_schema, users_col_names)

    # ------------------------------------------------------------------
    # Step 4: Verify the transfer
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("STEP 4: VERIFY TRANSFER")
    print("=" * 70)
    all_tables = SIMPLE_TABLES + ["users"]
    verify_ok = True
    with old_engine.connect() as oconn, new_engine.connect() as nconn:
        for t in all_tables:
            old_count = oconn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
            new_count = nconn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
            status = "OK" if old_count == new_count else "MISMATCH!"
            if old_count != new_count:
                verify_ok = False
            print(f"  {t}: {old_count} -> {new_count}  [{status}]")

    # Sanity-check new users for required non-null fields
    with new_engine.connect() as nconn:
        bad = nconn.execute(
            text(
                "SELECT COUNT(*) FROM users "
                "WHERE username IS NULL OR hashed_password IS NULL "
                "OR role IS NULL OR is_active IS NULL OR created_at IS NULL"
            )
        ).scalar()
        if bad:
            verify_ok = False
            print(f"  SANITY CHECK FAILED: {bad} users with NULL required fields!")
        else:
            print("  SANITY CHECK PASSED: no NULL username/hashed_password/role/is_active/created_at.")

    if not verify_ok:
        raise SystemExit("VERIFICATION FAILED - aborting swap to protect data.")

    # Close all pooled connections so the old DB file is no longer locked
    # (SQLAlchemy's connection pool keeps handles open after `with` blocks).
    old_engine.dispose()
    new_engine.dispose()

    # ------------------------------------------------------------------
    # Step 5: Swap (make new DB active) with backup
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("STEP 5: SWAP WITH BACKUP")
    print("=" * 70)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"backend_data_old_backup_{timestamp}.sqlite3"
    backup_path = os.path.join(BACKEND_DIR, backup_name)

    os.rename(OLD_DB, backup_path)
    print(f"Backed up old DB -> {backup_name}")
    os.rename(NEW_DB, OLD_DB)
    print(f"Swapped new DB into place -> backend_data.sqlite3")

    print()
    print("=" * 70)
    print("DONE. Active backend_data.sqlite3 is now the migrated DB.")
    print("NOTE: The running uvicorn server (Terminal 1) MUST be restarted")
    print("      to pick up the new database.")
    print("=" * 70)


def _transfer_users(old_engine, new_engine, old_schema, users_col_names):
    NewSession = sessionmaker(bind=new_engine, future=True)
    used_usernames: set[str] = set()

    with old_engine.connect() as oconn:
        rows = oconn.execute(text("SELECT * FROM users")).fetchall()
        col_names = list(oconn.execute(text("SELECT * FROM users")).keys())

    print(f"  Transferring {len(rows)} users (schema={old_schema})...")

    with NewSession() as session:
        for row in rows:
            data = dict(zip(col_names, row))
            uid = data.get("id")

            if old_schema == "new":
                # Direct copy of all columns
                user = app.models.User(
                    id=uid,
                    username=data.get("username"),
                    hashed_password=data.get("hashed_password"),
                    full_name=data.get("full_name"),
                    role=data.get("role"),
                    is_active=data.get("is_active"),
                    created_at=_parse_dt(data.get("created_at")),
                    name=data.get("name"),
                )
                session.add(user)
                print(f"  [direct] user {uid} ({user.username})")
            else:
                # Old schema: build new user with unique random password
                name = data.get("name")
                is_admin = bool(data.get("is_admin"))
                created_at = _parse_dt(data.get("created_at")) or datetime.utcnow()

                # Determine username
                base = name if (name and str(name).strip()) else f"user_{uid}"
                username = base
                suffix = 1
                while username in used_usernames:
                    suffix += 1
                    username = f"{base}_{suffix}"
                used_usernames.add(username)

                pw = secrets.token_urlsafe(12)
                hashed = get_password_hash(pw)
                print(f"  user {uid} ({username}): temp password {pw}")

                user = app.models.User(
                    id=uid,
                    username=username,
                    hashed_password=hashed,
                    full_name=name,
                    role="admin" if is_admin else "user",
                    is_active=True,
                    created_at=created_at,
                    name=name,
                )
                session.add(user)

        session.commit()
    print("  Users committed.")


def _create_fresh():
    """No old DB existed: create a fresh one via the app's init_db + seed."""
    from app.db import init_db
    from app.seed import seed_initial_data

    if os.path.exists(NEW_DB):
        os.remove(NEW_DB)
    # init_db / seed operate on the app's default engine -> backend_data.sqlite3
    init_db()
    seed_initial_data()
    print("Fresh database created at backend_data.sqlite3 via init_db()+seed_initial_data().")
    print("No swap needed (no old DB to back up).")
    print("NOTE: The running uvicorn server (Terminal 1) MUST be restarted to use it.")


if __name__ == "__main__":
    main()
