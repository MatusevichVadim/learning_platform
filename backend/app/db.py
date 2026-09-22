from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, Session


# Database path is configurable via env var so local and production
# deployments can keep their data in separate files.
# Defaults to a local sqlite file next to the backend package.
BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.getenv("DB_PATH", str(BACKEND_DIR / "backend_data.sqlite3"))

# Allow an absolute postgres url (e.g. postgresql://...) to override sqlite.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# When using a relative sqlite path, make sure it is resolved against the
# backend directory so the working directory does not affect the location.
if DATABASE_URL.startswith("sqlite:///") and not DATABASE_URL.startswith("sqlite:////"):
    relative = DATABASE_URL[len("sqlite:///"):]
    if not os.path.isabs(relative):
        resolved = str(BACKEND_DIR / relative)
        DATABASE_URL = f"sqlite:///{resolved}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    future=True,
)

# Enable foreign keys for SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
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


