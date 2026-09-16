"""
Migration: Add user_class column to users table
Adds a nullable user_class column to support arbitrary class assignment for users.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text, inspect

DATABASE_URL = "sqlite:///./backend_data.sqlite3"


def migrate():
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, future=True)
    inspector = inspect(engine)

    with engine.connect() as conn:
        if "users" not in inspector.get_table_names():
            print("Users table does not exist. Nothing to migrate.")
            return

        columns = [col["name"] for col in inspector.get_columns("users")]

        if "user_class" in columns:
            print("user_class column already exists. No migration needed.")
            return

        print(f"Current columns: {columns}")
        print("Adding user_class column...")

        with conn.begin():
            conn.execute(text("ALTER TABLE users ADD COLUMN user_class VARCHAR(50) DEFAULT NULL"))

        print("user_class column added successfully!")

        # Verify
        result = conn.execute(text("PRAGMA table_info(users)"))
        new_columns = [row[1] for row in result.fetchall()]
        print(f"New columns: {new_columns}")


if __name__ == "__main__":
    migrate()
