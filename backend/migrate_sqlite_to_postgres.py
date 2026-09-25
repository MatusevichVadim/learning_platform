"""
Migration script: SQLite → PostgreSQL

This script migrates all data from a SQLite database to a PostgreSQL database.
It is designed to be run once when upgrading from SQLite (dev/local) to
PostgreSQL (production).

Usage:
    # Set environment variables for both databases:
    export SQLITE_DB_PATH=./backend_data.sqlite3
    export POSTGRES_URL=postgresql://user:password@localhost:5432/learning_platform

    # Run the migration:
    python backend/migrate_sqlite_to_postgres.py

The script:
1. Creates all tables in PostgreSQL (using the SQLAlchemy models).
2. Copies data from SQLite to PostgreSQL table by table.
3. Preserves all data including auto-increment IDs.
4. Verifies the migration by comparing row counts.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure the backend package is importable
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR.parent))

from sqlalchemy import create_engine, MetaData, Table, select, insert, func
from sqlalchemy.engine import reflection

from app.db import Base
from app.models import (
    User, Language, Lesson, Task, Submission,
    user_languages, teacher_classes,
)


def get_sqlite_url() -> str:
    sqlite_path = os.getenv("SQLITE_DB_PATH", str(BACKEND_DIR / "backend_data.sqlite3"))
    if not os.path.isabs(sqlite_path):
        sqlite_path = str(BACKEND_DIR / sqlite_path)
    return f"sqlite:///{sqlite_path}"


def get_postgres_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url and url.startswith("postgresql"):
        return url
    # Fallback: construct from individual env vars
    user = os.getenv("POSTGRES_USER", "learning")
    password = os.getenv("POSTGRES_PASSWORD", "learning")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "learning_platform")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


def migrate_table(sqlite_engine, pg_engine, table: Table) -> int:
    """Copy all rows from a SQLite table to PostgreSQL. Returns row count."""
    metadata = MetaData()
    metadata.reflect(bind=sqlite_engine)
    sqlite_table = metadata.tables[table.name]

    # Read all rows from SQLite
    with sqlite_engine.connect() as conn:
        rows = conn.execute(select(sqlite_table)).fetchall()
        if not rows:
            print(f"  [SKIP] {table.name}: no data")
            return 0

        # Convert Row objects to dicts
        column_names = [c.name for c in sqlite_table.columns]
        data = [dict(zip(column_names, row)) for row in rows]

    # Write to PostgreSQL
    with pg_engine.begin() as conn:
        # Use raw insert to preserve IDs and avoid ORM overhead
        pg_table = Table(table.name, MetaData(), autoload_with=pg_engine)
        conn.execute(insert(pg_table), data)

    print(f"  [OK]   {table.name}: {len(data)} rows migrated")
    return len(data)


def main():
    sqlite_url = get_sqlite_url()
    pg_url = get_postgres_url()

    print(f"SQLite source:  {sqlite_url}")
    print(f"PostgreSQL target: {pg_url}")
    print()

    sqlite_engine = create_engine(sqlite_url)
    pg_engine = create_engine(pg_url)

    # 1. Create all tables in PostgreSQL
    print("Creating tables in PostgreSQL...")
    Base.metadata.create_all(bind=pg_engine)
    print("Tables created.")
    print()

    # 2. Migrate data table by table
    # Order matters: migrate parent tables before child tables with FKs.
    tables_to_migrate = [
        User,
        Language,
        Lesson,
        Task,
        Submission,
        # Association tables (no auto-increment IDs)
    ]

    total_rows = 0
    for table in tables_to_migrate:
        count = migrate_table(sqlite_engine, pg_engine, table.__table__)
        total_rows += count

    # Migrate association tables
    for table in [user_languages, teacher_classes]:
        count = migrate_table(sqlite_engine, pg_engine, table)
        total_rows += count

    print()
    print(f"Migration complete! Total rows migrated: {total_rows}")
    print()

    # 3. Verify migration
    print("Verifying migration...")
    sqlite_inspector = reflection.Inspect(sqlite_engine)
    pg_inspector = reflection.Inspect(pg_engine)

    sqlite_tables = sqlite_inspector.get_table_names()
    pg_tables = pg_inspector.get_table_names()

    all_ok = True
    for table_name in sqlite_tables:
        if table_name not in pg_tables:
            print(f"  [WARN] Table '{table_name}' missing in PostgreSQL")
            all_ok = False
            continue

        sqlite_count = sqlite_engine.execute(
            select(func.count()).select_from(Table(table_name, MetaData(), autoload_with=sqlite_engine))
        ).scalar()
        pg_count = pg_engine.execute(
            select(func.count()).select_from(Table(table_name, MetaData(), autoload_with=pg_engine))
        ).scalar()

        if sqlite_count == pg_count:
            print(f"  [OK]   {table_name}: {sqlite_count} rows (match)")
        else:
            print(f"  [FAIL] {table_name}: SQLite={sqlite_count}, PostgreSQL={pg_count}")
            all_ok = False

    if all_ok:
        print("\n✓ All tables verified successfully!")
    else:
        print("\n✗ Some tables have mismatches. Please check the output above.")

    sqlite_engine.dispose()
    pg_engine.dispose()


if __name__ == "__main__":
    main()
