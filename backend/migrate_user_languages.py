"""Create the student-language assignment table for existing deployments."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect

from backend.app.db import engine
from backend.app.models import user_languages


def migrate() -> None:
    inspector = inspect(engine)
    if "user_languages" in inspector.get_table_names():
        print("user_languages table already exists. No migration needed.")
        return

    print("Creating user_languages table...")
    user_languages.create(bind=engine, checkfirst=True)
    print("user_languages table created successfully.")


if __name__ == "__main__":
    migrate()
