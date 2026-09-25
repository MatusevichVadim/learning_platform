from __future__ import annotations

from contextvars import ContextVar

from fastapi import HTTPException, status
from sqlalchemy import delete, false, insert, select, true
from sqlalchemy.orm import Session

from .models import Language, Lesson, User, user_languages


# ---------------------------------------------------------------------------
# Request-scoped cache for user language IDs.
#
# ``get_user_language_ids`` is called multiple times within a single request
# (e.g. once at the top of an endpoint, then again inside ``ensure_lesson_access``
# for every task).  For admin/teacher roles it queries *all* languages each
# time.  Caching the result per-request eliminates these redundant queries.
# ---------------------------------------------------------------------------
_language_cache: ContextVar[dict[int, list[str]] | None] = ContextVar(
    "language_cache", default=None
)


def _get_language_cache() -> dict[int, list[str]]:
    cache = _language_cache.get()
    if cache is None:
        cache = {}
        _language_cache.set(cache)
    return cache


def clear_language_cache() -> None:
    """Clear the request-scoped language cache. Call at the end of each request."""
    _language_cache.set(None)


def get_user_language_ids(db: Session, user: User) -> list[str]:
    """Return languages visible to a user.

    Staff roles manage the catalogue and therefore see every language. Regular
    students only see languages explicitly assigned to their account.

    Results are cached per-request to avoid redundant database queries when
    this function is called multiple times within the same request.
    """
    cache = _get_language_cache()
    if user.id in cache:
        return cache[user.id]

    if user.role in {"admin", "teacher"}:
        result = list(db.execute(select(Language.id).order_by(Language.id)).scalars().all())
    else:
        result = list(
            db.execute(
                select(user_languages.c.language_id)
                .where(user_languages.c.user_id == user.id)
                .order_by(user_languages.c.language_id)
            )
            .scalars()
            .all()
        )

    cache[user.id] = result
    return result


def ensure_language_access(db: Session, user: User, language_id: str) -> None:
    if user.role in {"admin", "teacher"}:
        return
    if language_id not in get_user_language_ids(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This language has not been assigned to you",
        )


def ensure_lesson_access(db: Session, user: User, lesson: Lesson) -> None:
    ensure_language_access(db, user, lesson.language_id)


def visible_lessons_condition(user: User, language_ids: list[str]) -> object:
    """Build a SQLAlchemy condition for lessons visible to the current user."""
    if user.role in {"admin", "teacher"}:
        return true()
    if not language_ids:
        return false()
    return Lesson.language_id.in_(language_ids)
