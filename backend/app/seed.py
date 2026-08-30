from __future__ import annotations

from sqlalchemy import select

from .db import get_session
from .models import Language, Lesson, Task, User
from .auth import get_password_hash
from .config import ADMIN_USERNAME, ADMIN_PASSWORD


def seed_initial_data() -> None:
    with get_session() as session:
        # Seed default languages only if they don't exist
        default_languages = [
            ("python", "Python", False),
            ("csharp", "C#", False),
        ]

        for lang_id, name, is_custom in default_languages:
            existing = session.get(Language, lang_id)
            if not existing:
                lang = Language(id=lang_id, name=name, is_custom=is_custom)
                session.add(lang)

        session.flush()

        has_lessons = session.execute(select(Lesson).limit(1)).first()
        if has_lessons:
            # Ensure default admin user exists
            admin_user = session.execute(select(User).where(User.username == ADMIN_USERNAME)).scalar_one_or_none()
            if not admin_user:
                admin_user = User(
                    username=ADMIN_USERNAME,
                    hashed_password=get_password_hash(ADMIN_PASSWORD),
                    full_name="Administrator",
                    role="admin",
                    is_active=True,
                )
                session.add(admin_user)
                session.flush()
                print(f"[SEED] Default admin user created: {ADMIN_USERNAME}")
            return

        lessons: list[Lesson] = []
        for language in ("python", "csharp"):
            for i in range(1, 6):  # 5 lessons per language
                lesson = Lesson(language=language, language_id=language, title=f"{language.title()} Lesson {i}", order_index=i)
                lessons.append(lesson)
                quiz = Task(
                    title=f"Quiz {i}",
                    description="Select the correct answer (placeholder)",
                    kind="quiz",
                    test_spec='{"correct": "A"}',
                )
                code = Task(
                    title=f"Code Task {i}",
                    description="Write a function add(a, b) that returns a + b",
                    kind="code",
                    test_spec='{"function": "add", "tests": [[1,2,3],[5,7,12]]}',
                )
                lesson.tasks.extend([quiz, code])

        session.add_all(lessons)
        session.flush()

        # Create default admin user
        admin_user = User(
            username=ADMIN_USERNAME,
            hashed_password=get_password_hash(ADMIN_PASSWORD),
            full_name="Administrator",
            role="admin",
            is_active=True,
        )
        session.add(admin_user)
        session.flush()
        print(f"[SEED] Default admin user created: {ADMIN_USERNAME}")
