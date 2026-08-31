from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Language, Lesson, Task, Submission, User
from ..checker import run_python_tests
from ..rating import recompute_user_rating, effective_rating
from ..schemas import UserOut, LessonOut, TaskOut, SubmitQuiz, SubmitCode, SubmissionOut
from ..deps import get_current_user, get_db


router = APIRouter(tags=["public"])


@router.post("/enter")
@router.post("/token")
def deprecated_legacy_endpoints():
    from fastapi import HTTPException, status
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="This endpoint is deprecated. Use /api/auth/login to authenticate.",
    )


@router.get("/languages")
def list_languages(db: Session = Depends(get_db)):
    languages = db.execute(select(Language).order_by(Language.created_at)).scalars().all()
    return [{"id": lang.id, "name": lang.name, "image_url": lang.image_url} for lang in languages]


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons(language: str, page: int = 1, page_size: int = 50, db: Session = Depends(get_db)):
    offset = (page - 1) * page_size
    stmt = select(Lesson).where(Lesson.language == language).order_by(Lesson.order_index).offset(offset).limit(page_size)
    return db.execute(stmt).scalars().all()


@router.get("/lessons/{lesson_id}/tasks", response_model=list[TaskOut])
def list_tasks(lesson_id: int, page: int = 1, page_size: int = 50, db: Session = Depends(get_db)):
    offset = (page - 1) * page_size
    stmt = select(Task).where(Task.lesson_id == lesson_id).order_by(Task.order_index).offset(offset).limit(page_size)
    return db.execute(stmt).scalars().all()


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: int, db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.get("/lessons/{lesson_id}/status")
def lesson_status(lesson_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tasks = db.execute(select(Task).where(Task.lesson_id == lesson_id).order_by(Task.order_index)).scalars().all()
    task_ids = [t.id for t in tasks]
    if not task_ids:
        return {}
    subs = db.execute(select(Submission).where(Submission.user_id == user.id, Submission.task_id.in_(task_ids)).order_by(Submission.created_at.desc())).scalars().all()
    latest: dict[int, bool | None] = {}
    for s in subs:
        if s.task_id not in latest:
            if s.status == "pending":
                latest[s.task_id] = None
            else:
                latest[s.task_id] = s.is_correct
    return {str(k): latest.get(k, None) for k in task_ids}


@router.get("/lessons/{lesson_id}/additional-info")
def get_lesson_additional_info_public(lesson_id: int, db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return {"additional_info": lesson.additional_info or ""}


@router.get("/tasks/{task_id}/submission")
def get_task_submission(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    submission = db.execute(
        select(Submission)
        .where(Submission.user_id == user.id, Submission.task_id == task_id)
        .order_by(Submission.created_at.desc())
    ).scalars().first()

    if not submission:
        return None

    return {
        "id": submission.id,
        "is_correct": submission.is_correct,
        "result": submission.result,
        "status": getattr(submission, 'status', 'completed'),
        "created_at": submission.created_at,
    }


@router.get("/progress")
def get_my_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total_tasks = db.execute(select(Task)).scalars().all()
    user_subs = db.execute(select(Submission).where(Submission.user_id == user.id)).scalars().all()
    solved = sum(1 for s in user_subs if s.is_correct)
    return {"user_id": user.id, "solved": solved, "total": len(total_tasks)}


@router.post("/tasks/{task_id}/submit-quiz", response_model=SubmissionOut)
def submit_quiz(task_id: int, payload: SubmitQuiz, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task or task.kind != "quiz":
        raise HTTPException(status_code=404, detail="Task not found or not a quiz")
    spec = json.loads(task.test_spec or "{}")
    correct_letters = spec.get("correct", [])
    if isinstance(correct_letters, str):
        correct_letters = [correct_letters]
    user_answer = sorted(payload.answer.strip())
    correct_answer = sorted(correct_letters)
    is_correct = user_answer == correct_answer
    submission = Submission(user_id=user.id, task_id=task.id, answer=payload.answer, is_correct=is_correct, result="correct" if is_correct else "incorrect")
    db.add(submission)
    db.flush()
    recompute_user_rating(db, user.id)
    return submission


@router.post("/tasks/{task_id}/submit-code", response_model=SubmissionOut)
def submit_code(task_id: int, payload: SubmitCode, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task or task.kind != "code":
        raise HTTPException(status_code=404, detail="Task not found or not a code task")

    # Execute the user's code in the isolated sandbox and grade it server-side.
    # The client cannot influence the outcome (no trusted markers).
    ok, result = run_python_tests(payload.code, task.test_spec or "{}")
    passed = isinstance(result, dict) and result.get("ok") is True

    if passed:
        is_correct = True
        status_val = "completed"
        stored_result = "Все тесты пройдены успешно"
        response_result = result
    else:
        is_correct = False
        status_val = "pending"
        stored_result = "Ожидает проверки администратором"
        response_result = {"message": "Ваше решение отправлено на проверку администратору"}

    submission = Submission(
        user_id=user.id,
        task_id=task.id,
        code=payload.code,
        is_correct=is_correct,
        result=stored_result,
        status=status_val,
    )
    db.add(submission)
    db.flush()
    recompute_user_rating(db, user.id)

    return {
        "id": submission.id,
        "user_id": submission.user_id,
        "task_id": submission.task_id,
        "code": submission.code,
        "is_correct": submission.is_correct,
        "result": response_result,
        "created_at": submission.created_at,
        "status": submission.status,
    }


@router.get("/leaderboard")
def leaderboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return all users ordered by their effective rating (computed + bonus), descending.

    Each entry contains the user id, username, full name (ФИО) and the effective rating.
    """
    from sqlalchemy import desc as _desc
    # Only active (non-blocked) non-admin users appear in the leaderboard.
    users = db.execute(
        select(User)
        .where(User.is_active.is_(True), User.role != "admin")
        .order_by(_desc(User.rating + User.rating_bonus))
    ).scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name or u.username,
            "rating": effective_rating(u),
            "rating_bonus": u.rating_bonus or 0,
        }
        for u in users
    ]
