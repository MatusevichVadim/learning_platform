from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import delete, false, insert, select, true
from sqlalchemy.orm import Session

from .models import Language, Lesson, User, user_languages


def get_user_language_ids(db: Session, user: User) -> list[str]:
    """Return languages visible to a user.

    Staff roles manage the catalogue and therefore see every language. Regular
    students only see languages explicitly assigned to their account.
    """
    if user.role in {"admin", "teacher"}:
        return list(db.execute(select(Language.id).order_by(Language.id)).scalars().all())

    return list(
        db.execute(
            select(user_languages.c.language_id)
            .where(user_languages.c.user_id == user.id)
            .order_by(user_languages.c.language_id)
        )
        .scalars()
        .all()
    )


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
