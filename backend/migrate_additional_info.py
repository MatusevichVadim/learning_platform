#!/usr/bin/env python3
"""
Migration script to add additional_info column to lessons table
"""
import sqlite3
import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

# Resolve DB_PATH from backend/.env (same as app.db) so every script targets
# the SAME database the app actually uses.
DB_PATH = os.getenv("DB_PATH", "backend_data.sqlite3")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(BACKEND_DIR / DB_PATH)


def migrate_database():
    if not os.path.exists(DB_PATH):
        print(f"Database file not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(lessons)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'additional_info' not in columns:
            print("Adding additional_info column to lessons table...")
            cursor.execute("ALTER TABLE lessons ADD COLUMN additional_info TEXT")

            conn.commit()
            print("Migration completed successfully!")
        else:
            print("additional_info column already exists.")

    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()