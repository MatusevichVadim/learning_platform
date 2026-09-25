from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, Session


# Database path is configurable via env var so local and production
# deployments can keep their data in separate files.
# Defaults to a local sqlite file next to the backend package.
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Load backend/.env BEFORE reading any env var below. Previously this module
# read os.getenv() before config.py had a chance to call load_dotenv(), so
# DB_PATH / DATABASE_URL from .env were silently ignored.
load_dotenv(BACKEND_DIR / ".env")

DB_PATH = os.getenv("DB_PATH", str(BACKEND_DIR / "prod.sqlite3"))

# Allow an absolute postgres url (e.g. postgresql://...) to override sqlite.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# When using a relative sqlite path, make sure it is resolved against the
# backend directory so the working directory does not affect the location.
if DATABASE_URL.startswith("sqlite:///") and not DATABASE_URL.startswith("sqlite:////"):
    relative = DATABASE_URL[len("sqlite:///"):]
    if not os.path.isabs(relative):
        resolved = str(BACKEND_DIR / relative)
        DATABASE_URL = f"sqlite:///{resolved}"

# Connection pool configuration.
# For PostgreSQL these values provide a healthy pool that can serve many
# concurrent users.  For SQLite (local dev) the pool is effectively a no-op
# because SQLite connections are cheap and single-threaded by default.
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "20"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "30"))
POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))  # 30 minutes

# Build engine kwargs depending on the backend.
engine_kwargs: dict = {
    "future": True,
}

if DATABASE_URL.startswith("sqlite"):
    # SQLite-specific settings
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    # SQLite doesn't benefit from a large pool; keep it small.
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
else:
    # PostgreSQL / other server databases
    engine_kwargs["pool_size"] = POOL_SIZE
    engine_kwargs["max_overflow"] = MAX_OVERFLOW
    engine_kwargs["pool_timeout"] = POOL_TIMEOUT
    engine_kwargs["pool_recycle"] = POOL_RECYCLE
    engine_kwargs["pool_pre_ping"] = True  # Recycle dead connections
    # Set a statement timeout to prevent long-running queries from
    # exhausting the connection pool.  30 seconds is generous for this app.
    engine_kwargs["connect_args"] = {"options": "-c statement_timeout=30000"}

engine = create_engine(DATABASE_URL, **engine_kwargs)

# Enable foreign keys and tune SQLite for many concurrent readers.
#
# These pragmas matter a lot for this app:
#   * journal_mode=WAL  - readers no longer block the writer and vice versa.
#     In the default rollback-journal mode a single write blocks ALL readers,
#     which is exactly what made the service stall with 15+ active users.
#   * synchronous=NORMAL - safe with WAL and removes an fsync per commit,
#     which is where most of the write IOPS came from.
#   * cache_size        - a bigger page cache keeps hot index pages in RAM
#     instead of re-reading them from disk on every request.
#   * mmap_size         - lets SQLite read via mmap, avoiding read() syscalls.
#   * temp_store=MEMORY - sorts/group-bys for ORDER BY run in RAM, not on disk.
SQLITE_CACHE_KB = int(os.getenv("SQLITE_CACHE_KB", "65536"))  # 64 MB
SQLITE_MMAP_MB = int(os.getenv("SQLITE_MMAP_MB", "256"))


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if not DATABASE_URL.startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    # WAL is persistent (stored in the DB header) but harmless to re-assert.
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute(f"PRAGMA cache_size=-{SQLITE_CACHE_KB}")  # negative = KiB
    cursor.execute(f"PRAGMA mmap_size={SQLITE_MMAP_MB * 1024 * 1024}")
    cursor.execute("PRAGMA temp_store=MEMORY")
    # Wait instead of instantly raising "database is locked" when another
    # request currently holds the write lock.
    cursor.execute("PRAGMA busy_timeout=15000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True, expire_on_commit=False)
Base = declarative_base()


def init_db() -> None:
    from . import models  # noqa: F401 - ensure models are imported for metadata
    from .models import user_languages

    Base.metadata.create_all(bind=engine)
    # create_all only creates tables that are absent from the metadata as a
    # whole; explicitly ensure this association table exists for upgraded DBs.
    user_languages.create(bind=engine, checkfirst=True)


@contextmanager
def get_session() -> Iterator[Session]:
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
