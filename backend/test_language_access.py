"""End-to-end regression test for student language assignments."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete, insert, select

from app.auth import get_password_hash
from app.config import ADMIN_USERNAME, ADMIN_PASSWORD
from app.db import get_session, init_db
from app.main import app
from app.models import Language, Lesson, Submission, Task, User, teacher_classes

init_db()

client = TestClient(app)
suffix = uuid.uuid4().hex[:10]
student_username = f"language_test_student_{suffix}"
teacher_username = f"language_test_teacher_{suffix}"
student_class = f"LANG_{suffix}"


def create_user(username: str, password: str, role: str, user_class: str | None = None) -> int:
    with get_session() as session:
        user = User(
            username=username,
            hashed_password=get_password_hash(password),
            full_name=username,
            role=role,
            user_class=user_class,
            is_active=True,
        )
        session.add(user)
        session.flush()
        return user.id


def cleanup() -> None:
    with get_session() as session:
        student = session.execute(select(User).where(User.username == student_username)).scalar_one_or_none()
        teacher = session.execute(select(User).where(User.username == teacher_username)).scalar_one_or_none()
        if student:
            session.execute(delete(Submission).where(Submission.user_id == student.id))
            session.delete(student)
        if teacher:
            session.execute(delete(teacher_classes).where(teacher_classes.c.teacher_id == teacher.id))
            session.delete(teacher)
        session.flush()


def language_ids() -> dict[str, str]:
    with get_session() as session:
        rows = session.execute(select(Language.id, Language.name)).all()
    return {name: language_id for language_id, name in rows}


def main() -> None:
    cleanup()
    student_id = create_user(student_username, "student-password", "user", student_class)
    teacher_id = create_user(teacher_username, "teacher-password", "teacher")

    try:
        with get_session() as session:
            session.execute(insert(teacher_classes).values(teacher_id=teacher_id, user_class=student_class))
            session.flush()

        langs = language_ids()
        python_id = next((value for name, value in langs.items() if name.lower() == "python"), None)
        csharp_id = next((value for name, value in langs.items() if name.lower() == "c#"), None)
        if not python_id or not csharp_id:
            raise AssertionError(f"Required languages not found: {langs}")

        python_lesson_id = None
        csharp_lesson_id = None
        with get_session() as session:
            python_lesson = session.execute(
                select(Lesson.id).where(Lesson.language_id == python_id).order_by(Lesson.id).limit(1)
            ).scalar_one_or_none()
            csharp_lesson = session.execute(
                select(Lesson.id).where(Lesson.language_id == csharp_id).order_by(Lesson.id).limit(1)
            ).scalar_one_or_none()
            python_lesson_id = python_lesson
            csharp_lesson_id = csharp_lesson
        if not python_lesson_id or not csharp_lesson_id:
            raise AssertionError("Required lessons not found")

        admin_client = TestClient(app)
        response = admin_client.post(
            "/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        )
        assert response.status_code == 200, response.text

        response = admin_client.put(
            f"/api/admin/users/{student_id}/languages",
            json={"language_ids": [python_id]},
        )
        assert response.status_code == 200, response.text

        student_client = TestClient(app)
        response = student_client.post(
            "/api/auth/login",
            json={"username": student_username, "password": "student-password"},
        )
        assert response.status_code == 200, response.text

        response = student_client.get("/api/languages")
        assert response.status_code == 200, response.text
        assert [item["id"] for item in response.json()] == [python_id]

        response = student_client.get("/api/lessons", params={"language": python_id})
        assert response.status_code == 200, response.text
        response = student_client.get("/api/lessons", params={"language": csharp_id})
        assert response.status_code == 403, response.text
        response = student_client.get(f"/api/lessons/{csharp_lesson_id}")
        assert response.status_code == 403, response.text

        # The legacy admin submissions endpoint must apply the same visibility
        # filter for non-admin users.
        with get_session() as session:
            blocked_task = session.execute(
                select(Task.id).where(Task.lesson_id == csharp_lesson_id).limit(1)
            ).scalar_one_or_none()
            if blocked_task is None:
                raise AssertionError("Required C# task not found")
            session.add(
                Submission(
                    user_id=student_id,
                    task_id=blocked_task,
                    is_correct=False,
                    result="blocked-language-submission",
                    status="completed",
                )
            )
            session.flush()

        response = student_client.get("/api/admin/submissions")
        assert response.status_code == 200, response.text
        assert all(item["lesson_id"] != csharp_lesson_id for item in response.json()["data"])

        teacher_client = TestClient(app)
        response = teacher_client.post(
            "/api/auth/login",
            json={"username": teacher_username, "password": "teacher-password"},
        )
        assert response.status_code == 200, response.text

        response = teacher_client.put(
            f"/api/teacher/students/{student_id}/languages",
            json={"language_ids": [csharp_id]},
        )
        assert response.status_code == 200, response.text

        response = student_client.get("/api/languages")
        assert response.status_code == 200, response.text
        assert [item["id"] for item in response.json()] == [csharp_id]
        response = student_client.get("/api/lessons", params={"language": python_id})
        assert response.status_code == 403, response.text
        response = student_client.get(f"/api/lessons/{python_lesson_id}")
        assert response.status_code == 403, response.text

        print("Language assignment access test PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    main()
