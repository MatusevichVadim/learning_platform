"""
Migration script to add authentication fields to the existing database.
This script:
1. Adds new columns to the users table (username, hashed_password, full_name, role, is_active)
2. Migrates existing user data (name -> username, is_admin -> role)
3. Creates a default admin user if no users exist
"""
from __future__ import annotations

import os
import sys
import secrets
from datetime import datetime

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from sqlalchemy import create_engine, text, inspect
import bcrypt

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
# Fall back to a randomly generated password (printed below) if none is configured,
# instead of a weak hardcoded default.
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or secrets.token_urlsafe(12)

DATABASE_URL = "sqlite:///./backend_data.sqlite3"


def migrate():
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, future=True)
    inspector = inspect(engine)

    with engine.connect() as conn:
        # Check if users table exists
        if "users" not in inspector.get_table_names():
            print("Users table does not exist. Run init_db first.")
            return

        # Get existing columns
        existing_columns = [col["name"] for col in inspector.get_columns("users")]
        print(f"Existing columns: {existing_columns}")

        # Add new columns if they don't exist
        if "username" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(100)"))
            print("Added column: username")

        if "hashed_password" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255)"))
            print("Added column: hashed_password")

        if "full_name" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(200)"))
            print("Added column: full_name")

        if "role" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"))
            print("Added column: role")

        if "is_active" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
            print("Added column: is_active")

        conn.commit()

        # Migrate existing data
        result = conn.execute(text("SELECT id, name, is_admin, created_at FROM users"))
        users = result.fetchall()

        for user_id, name, is_admin, created_at in users:
            # Set username from name
            username = name if name else f"user_{user_id}"
            # Set role from is_admin
            role = "admin" if is_admin else "user"
            # Generate a unique random temporary password per user (user will need to reset)
            random_pw = secrets.token_urlsafe(12)
            hashed_password = bcrypt.hashpw(random_pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            # Set full_name from name
            full_name = name if name else None

            conn.execute(
                text("UPDATE users SET username = :username, hashed_password = :hashed_password, full_name = :full_name, role = :role, is_active = 1 WHERE id = :id"),
                {"username": username, "hashed_password": hashed_password, "full_name": full_name, "role": role, "id": user_id}
            )
            print(f"Migrated user {user_id}: {username} (role: {role}) — temporary password: {random_pw}")

        conn.commit()

        # Make username unique and not null
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"))
            conn.commit()
            print("Created unique index on username")
        except Exception as e:
            print(f"Index creation note: {e}")

        # Check if we need to create default admin
        admin_exists = conn.execute(text("SELECT COUNT(*) FROM users WHERE role = 'admin'")).scalar()
        if admin_exists == 0:
            admin_password = bcrypt.hashpw(ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            now = datetime.utcnow().isoformat()
            # Include all columns for backward compatibility with NOT NULL constraints
            conn.execute(
                text("INSERT INTO users (name, is_admin, created_at, username, hashed_password, full_name, role, is_active) VALUES (:name, :is_admin, :created_at, :username, :hashed_password, :full_name, :role, :is_active)"),
                {"name": ADMIN_USERNAME, "is_admin": 1, "created_at": now, "username": ADMIN_USERNAME, "hashed_password": admin_password, "full_name": "Administrator", "role": "admin", "is_active": 1}
            )
            conn.commit()
            print(f"Created default admin user: {ADMIN_USERNAME} / {ADMIN_PASSWORD}")
        else:
            print("Admin user already exists, skipping creation")

    print("Migration completed successfully!")


if __name__ == "__main__":
    migrate()
