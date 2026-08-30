"""
Fix migration: recreate users table without NOT NULL constraint on legacy 'name' column
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
        # Check if users table exists
        if "users" not in inspector.get_table_names():
            print("Users table does not exist.")
            return

        # Get all existing user data
        result = conn.execute(text("SELECT * FROM users"))
        rows = result.fetchall()
        columns = [col["name"] for col in inspector.get_columns("users")]
        print(f"Current columns: {columns}")
        print(f"Existing rows: {len(rows)}")

        # Create new table with correct schema
        conn.execute(text("""
            CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(100) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                full_name VARCHAR(200),
                role VARCHAR(20) DEFAULT 'user' NOT NULL,
                is_active BOOLEAN DEFAULT 1 NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                name VARCHAR(100)
            )
        """))

        # Copy data and swap tables atomically within a single transaction
        with conn.begin():
            # Copy data - map old columns to new ones
            for row in rows:
                row_dict = dict(zip(columns, row))
                conn.execute(text("""
                    INSERT INTO users_new (id, username, hashed_password, full_name, role, is_active, created_at, name)
                    VALUES (:id, :username, :hashed_password, :full_name, :role, :is_active, :created_at, :name)
                """), {
                    "id": row_dict.get("id"),
                    "username": row_dict.get("username", row_dict.get("name", f"user_{row_dict.get('id')}")),
                    "hashed_password": row_dict.get("hashed_password", ""),
                    "full_name": row_dict.get("full_name", row_dict.get("name")),
                    "role": row_dict.get("role", "user"),
                    "is_active": row_dict.get("is_active", 1),
                    "created_at": row_dict.get("created_at"),
                    "name": row_dict.get("name"),
                })

            # Rename original to a backup (no data loss) then rename new table into place
            conn.execute(text("ALTER TABLE users RENAME TO users_backup_before_auth_migration"))
            conn.execute(text("ALTER TABLE users_new RENAME TO users"))
            print("Users table recreated successfully! (old table kept as users_backup_before_auth_migration)")

        # Recreate index
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"))
            conn.commit()
            print("Created unique index on username")
        except Exception as e:
            print(f"Index creation note: {e}")

        print("Users table recreated successfully!")


if __name__ == "__main__":
    migrate()
