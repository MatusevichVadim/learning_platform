from __future__ import annotations

from sqlalchemy import select

from .db import get_session
from .models import Language, Lesson, Task


def seed_initial_data() -> None:
    with get_session() as session:
        # Seed default languages only if they don't exist
        # This ensures that:
        # 1. Languages created by admin are preserved
        # 2. Languages deleted by admin are NOT recreated
        # 3. Only missing default languages are added on startup
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
            return

        lessons: list[Lesson] = []
        for language in ("python", "csharp"):
            for i in range(1, 6):  # 5 lessons per language
                lesson = Lesson(language=language, language_id=language, title=f"{language.title()} Lesson {i}", order_index=i)
                lessons.append(lesson)
                # two tasks per lesson: one quiz, one code
                quiz = Task(
                    title=f"Quiz {i}",
                    description="Select the correct answer (placeholder)",
                    kind="quiz",
                    test_spec="{\"correct\": \"A\"}",
                )
                code = Task(
                    title=f"Code Task {i}",
                    description="Write a function add(a, b) that returns a + b",
                    kind="code",
                    test_spec="{\"function\": \"add\", \"tests\": [[1,2,3],[5,7,12]]}",
                )
                lesson.tasks.extend([quiz, code])

        session.add_all(lessons)
        session.flush()


