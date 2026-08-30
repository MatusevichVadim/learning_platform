#!/usr/bin/env python3
"""
Migration script: add the rating system columns to an existing database.

Adds:
  * tasks.rating        (INTEGER, default 1)  - points awarded for solving a task
  * users.rating        (INTEGER, default 0)  - computed rating from tasks + streaks
  * users.rating_bonus  (INTEGER, default 0)  - manual admin adjustment

After the columns are added, every user's `rating` is recomputed from their
existing submission history so the leaderboard is correct immediately.
"""

import os
import sqlite3

from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker

# Allow importing the app package when run from the backend/ directory.
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import Base  # noqa: F401  (ensures models are registered)
from app.db import engine
from app.models import User, Submission, Task
from app.rating import recompute_all_ratings


def migrate_database():
    # Locate the database file (same resolution as app.db.DATABASE_URL).
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend_data.sqlite3")
    if not os.path.exists(db_path):
        # Fall back to a database inside the backend folder.
        alt = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend_data.sqlite3")
        db_path = alt if os.path.exists(alt) else db_path

    print(f"[MIGRATE] Using database: {os.path.abspath(db_path)}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # --- tasks.rating ---
        cursor.execute("PRAGMA table_info(tasks)")
        task_columns = [column[1] for column in cursor.fetchall()]
        if "rating" not in task_columns:
            print("[MIGRATE] Adding tasks.rating column...")
            cursor.execute("ALTER TABLE tasks ADD COLUMN rating INTEGER NOT NULL DEFAULT 1")
        else:
            print("[MIGRATE] tasks.rating already exists.")

        # --- users.rating ---
        cursor.execute("PRAGMA table_info(users)")
        user_columns = [column[1] for column in cursor.fetchall()]
        if "rating" not in user_columns:
            print("[MIGRATE] Adding users.rating column...")
            cursor.execute("ALTER TABLE users ADD COLUMN rating INTEGER NOT NULL DEFAULT 0")
        else:
            print("[MIGRATE] users.rating already exists.")

        if "rating_bonus" not in user_columns:
            print("[MIGRATE] Adding users.rating_bonus column...")
            cursor.execute("ALTER TABLE users ADD COLUMN rating_bonus INTEGER NOT NULL DEFAULT 0")
        else:
            print("[MIGRATE] users.rating_bonus already exists.")

        conn.commit()
        print("[MIGRATE] Schema migration completed.")
    except Exception as e:
        print(f"[MIGRATE] Schema migration failed: {e}")
        conn.rollback()
        conn.close()
        raise
    finally:
        conn.close()

    # --- Recompute every user's rating from existing submissions ---
    SessionLocal = sessionmaker(bind=engine, future=True)
    with SessionLocal() as db:
        recompute_all_ratings(db)
        db.commit()
    print("[MIGRATE] Recomputed ratings for all users.")


if __name__ == "__main__":
    migrate_database()
