#!/usr/bin/env python3
"""
Migration script to add additional_info column to lessons table
"""

import sqlite3
import os

def migrate_database():
    # Get the database path
    db_path = os.path.join(os.path.dirname(__file__), '..', 'backend_data.sqlite3')

    if not os.path.exists(db_path):
        print(f"Database file not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if additional_info column exists
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