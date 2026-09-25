"""
Add performance indexes to an existing database.

`Base.metadata.create_all()` only creates *missing tables*; it does NOT add
indexes that were introduced later on tables that already exist.  This script
creates the indexes added for the concurrency/performance work:

  - lessons.language_id
  - tasks.lesson_id, tasks.kind, tasks.order_index
  - submissions.is_correct, submissions.status, submissions.created_at
  - submissions(user_id, created_at, id)        -- rating computation
  - submissions(user_id, task_id, created_at, id) -- lesson status

Safe to run multiple times: existing indexes are skipped.

Usage:
    # SQLite (dev):
    python backend/add_performance_indexes.py

    # PostgreSQL (prod) - reads DATABASE_URL from backend/.env
    python backend/add_performance_indexes.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from sqlalchemy import inspect, text

from app.db import engine

# (index_name, table, columns)
INDEXES: list[tuple[str, str, list[str]]] = [
    ("ix_lessons_language_id", "lessons", ["language_id"]),
    ("ix_tasks_lesson_id", "tasks", ["lesson_id"]),
    ("ix_tasks_kind", "tasks", ["kind"]),
    ("ix_tasks_order_index", "tasks", ["order_index"]),
    ("ix_submissions_is_correct", "submissions", ["is_correct"]),
    ("ix_submissions_status", "submissions", ["status"]),
    ("ix_submissions_created_at", "submissions", ["created_at"]),
    ("ix_submissions_user_created", "submissions", ["user_id", "created_at", "id"]),
    ("ix_submissions_user_task_created", "submissions", ["user_id", "task_id", "created_at", "id"]),
    ("ix_submissions_status_created", "submissions", ["status", "created_at", "id"]),
]


def main() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    created, skipped, failed = 0, 0, 0

    for index_name, table, columns in INDEXES:
        if table not in existing_tables:
            print(f"  [SKIP] {table} table does not exist")
            continue

        existing = {idx["name"] for idx in inspector.get_indexes(table) if idx.get("name")}
        if index_name in existing:
            print(f"  [OK]   {index_name} already present")
            skipped += 1
            continue

        cols = ", ".join(columns)
        stmt = text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({cols})")
        try:
            with engine.begin() as conn:
                conn.execute(stmt)
            print(f"  [NEW]  {index_name} on {table} ({cols})")
            created += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  [FAIL] {index_name}: {exc}")
            failed += 1

    print()
    print(f"Created: {created}  Skipped: {skipped}  Failed: {failed}")
    print("Done.")


if __name__ == "__main__":
    main()
