from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_access_token, decode_token
from ..db import get_session
from ..models import Language, Lesson, Task, Submission, User, CompetitionRoom, CompetitionParticipant
from ..checker import run_python_tests
from ..schemas import UserCreate, UserOut, LessonOut, TaskOut, SubmitQuiz, SubmitCode, SubmissionOut


router = APIRouter(tags=["public"])


def get_db() -> Session:
    with get_session() as session:
        yield session


@router.post("/enter")
def enter_user(payload: UserCreate, db: Session = Depends(get_db)):
    user = User(name=payload.name, is_admin=False)
    db.add(user)
    db.flush()
    token = create_access_token({"sub": str(user.id), "role": "user"})
    return {"user": {"id": user.id, "name": user.name, "is_admin": user.is_admin, "created_at": user.created_at}, "access_token": token, "token_type": "bearer"}


@router.post("/token")
def get_user_token(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    token = create_access_token({"sub": str(user.id), "role": "admin" if user.is_admin else "user"})
    return {"access_token": token, "token_type": "bearer"}


def get_current_user(authorization: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    user_id = int(payload.get("sub"))
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")
    return user


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
            # If submission is pending, return None (not completed)
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
    # Get the latest submission for this user and task
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
    return submission


@router.post("/tasks/{task_id}/record-test-success")
def record_test_success(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Record that user successfully passed all tests for a task"""
    task = db.get(Task, task_id)
    if not task or task.kind != "code":
        raise HTTPException(status_code=404, detail="Task not found or not a code task")

    # Check if user already has a successful test record for this task
    existing_record = db.execute(
        select(Submission)
        .where(Submission.user_id == user.id, Submission.task_id == task_id)
        .where(Submission.result.like("%AUTO_TEST_SUCCESS%"))
    ).scalars().first()

    if existing_record:
        # Update existing record with current timestamp
        existing_record.created_at = datetime.utcnow()
        db.commit()
        return {"message": "Test success record updated", "id": existing_record.id}

    # Create new test success record
    test_record = Submission(
        user_id=user.id,
        task_id=task.id,
        code="AUTO_TEST_SUCCESS: All tests passed locally",
        is_correct=True,
        result="Все тесты пройдены успешно (локально)",
        status="completed"
    )
    db.add(test_record)
    db.flush()

    return {
        "message": "Test success recorded",
        "id": test_record.id,
        "user_id": test_record.user_id,
        "task_id": test_record.task_id,
        "is_correct": test_record.is_correct,
        "result": test_record.result,
        "created_at": test_record.created_at,
        "status": test_record.status,
    }


@router.post("/tasks/{task_id}/submit-code", response_model=SubmissionOut)
def submit_code(task_id: int, payload: SubmitCode, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task or task.kind != "code":
        raise HTTPException(status_code=404, detail="Task not found or not a code task")

    # Check if this is an auto-completed submission (from successful test run)
    is_auto_completed = "# AUTO_COMPLETED:" in payload.code

    if is_auto_completed:
        # Auto-confirm the submission as correct
        submission = Submission(
            user_id=user.id,
            task_id=task.id,
            code=payload.code,
            is_correct=True,
            result="Задача выполнена автоматически - все тесты пройдены",
            status="completed"
        )
    else:
        # Create pending submission for manual review
        submission = Submission(
            user_id=user.id,
            task_id=task.id,
            code=payload.code,
            is_correct=False,  # Will be set by admin
            result="Ожидает проверки администратором",
            status="pending"
        )

    db.add(submission)
    db.flush()

    # Return appropriate response
    if is_auto_completed:
        response = {
            "id": submission.id,
            "user_id": submission.user_id,
            "task_id": submission.task_id,
            "code": submission.code,
            "is_correct": submission.is_correct,
            "result": {"message": "Задача выполнена успешно - все тесты пройдены!"},
            "created_at": submission.created_at,
            "status": submission.status,
        }
    else:
        response = {
            "id": submission.id,
            "user_id": submission.user_id,
            "task_id": submission.task_id,
            "code": submission.code,
            "is_correct": submission.is_correct,
            "result": {"message": "Ваше решение отправлено на проверку администратору"},
            "created_at": submission.created_at,
            "status": submission.status,
        }
    return response


# Competition endpoints for users
@router.get("/competition/room")
def get_competition_room_public(db: Session = Depends(get_db)):
    room = db.execute(select(CompetitionRoom)).scalars().first()
    if not room:
        room = CompetitionRoom()
        db.add(room)
        db.flush()
    return {
        "id": room.id,
        "name": room.name,
        "game_time": room.game_time,
        "difficulty": room.difficulty,
        "is_active": room.is_active
    }


@router.post("/competition/join")
def join_competition_room(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.execute(select(CompetitionRoom)).scalars().first()
    if not room:
        room = CompetitionRoom()
        db.add(room)
        db.flush()

    # Check if user is already in the room
    existing = db.execute(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.room_id == room.id, CompetitionParticipant.user_id == user.id)
    ).scalars().first()

    if not existing:
        participant = CompetitionParticipant(
            room_id=room.id,
            user_id=user.id,
            user_name=user.name,
            score=0,
            is_connected=True
        )
        db.add(participant)
        db.flush()
    else:
        existing.is_connected = True
        db.flush()

    return {"status": "joined"}


@router.get("/competition/participants")
def get_competition_participants_public(db: Session = Depends(get_db)):
    room = db.execute(select(CompetitionRoom)).scalars().first()
    if not room:
        return []

    participants = db.execute(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.room_id == room.id)
        .order_by(CompetitionParticipant.score.desc())
    ).scalars().all()

    return [{
        "id": p.id,
        "user_name": p.user_name,
        "score": p.score,
        "is_connected": p.is_connected
    } for p in participants]


@router.post("/competition/update-score")
def update_competition_score(data: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.execute(select(CompetitionRoom)).scalars().first()
    if not room or not room.is_active:
        raise HTTPException(status_code=400, detail="No active competition")

    participant = db.execute(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.room_id == room.id, CompetitionParticipant.user_id == user.id)
    ).scalars().first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.score = data.get("score", participant.score)
    db.flush()
    return {"status": "updated"}


@router.get("/competition/words")
def get_competition_words(db: Session = Depends(get_db)):
    # Simple word list - in real implementation, this could be more sophisticated
    words = [
        "hello", "world", "typing", "speed", "competition", "keyboard", "practice", "challenge",
        "python", "javascript", "programming", "developer", "software", "computer", "algorithm",
        "function", "variable", "string", "integer", "boolean", "array", "object", "class",
        "method", "property", "interface", "inheritance", "polymorphism", "encapsulation"
    ]
    return {"words": words}


