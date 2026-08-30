from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import select, func, or_, asc, desc
from sqlalchemy.orm import Session

from ..models import Submission, Task, Lesson, User, Language
from ..schemas import ProfileSummary, SubmissionDetail
from ..rating import effective_rating
from ..deps import get_current_user, get_db

router = APIRouter(tags=["profile"])


@router.get("/card")
def get_card(
    search: str = "",
    sort_by: str = "created_at",
    order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    total_submissions = db.execute(
        select(func.count(Submission.id)).where(Submission.user_id == user_id)
    ).scalar() or 0
    correct_submissions = db.execute(
        select(func.count(Submission.id)).where(Submission.user_id == user_id, Submission.is_correct == True)
    ).scalar() or 0
    pending_submissions = db.execute(
        select(func.count(Submission.id)).where(Submission.user_id == user_id, Submission.status == "pending")
    ).scalar() or 0
    solved_tasks = db.execute(
        select(func.count(func.distinct(Submission.task_id))).where(Submission.user_id == user_id, Submission.is_correct == True)
    ).scalar() or 0
    solved_code_tasks = db.execute(
        select(func.count(func.distinct(Submission.task_id)))
        .select_from(Submission)
        .join(Task, Task.id == Submission.task_id)
        .where(Submission.user_id == user_id, Submission.is_correct == True, Task.kind == "code")
    ).scalar() or 0
    solved_quiz_tasks = db.execute(
        select(func.count(func.distinct(Submission.task_id)))
        .select_from(Submission)
        .join(Task, Task.id == Submission.task_id)
        .where(Submission.user_id == user_id, Submission.is_correct == True, Task.kind == "quiz")
    ).scalar() or 0
    attempted_tasks = db.execute(
        select(func.count(func.distinct(Submission.task_id))).where(Submission.user_id == user_id)
    ).scalar() or 0

    success_rate = round((correct_submissions / total_submissions * 100), 1) if total_submissions else 0.0

    stmt = (
        select(
            Submission,
            Task.lesson_id,
            Task.title.label('task_title'),
            Lesson.title.label('lesson_title'),
            Language.name.label('language'),
        )
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .join(Language, Language.id == Lesson.language_id)
        .where(Submission.user_id == user_id)
    )

    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(Lesson.title.ilike(like), Task.title.ilike(like), Language.name.ilike(like)))

    sort_columns = {
        "created_at": Submission.created_at,
        "lesson_title": Lesson.title,
        "task_title": Task.title,
        "status": Submission.status,
        "language": Language.name,
    }
    column = sort_columns.get(sort_by, Submission.created_at)
    if order == "asc":
        stmt = stmt.order_by(asc(column))
    else:
        stmt = stmt.order_by(desc(column))

    rows = db.execute(stmt).all()
    submissions = []
    seen_tasks = set()
    for s, lesson_id, task_title, lesson_title, language in rows:
        # Show each task only once (latest submission), so the same
        # correctly-solved task is not counted/tallied multiple times.
        if s.task_id in seen_tasks:
            continue
        seen_tasks.add(s.task_id)
        status = getattr(s, 'status', 'completed')
        submissions.append({
            "id": s.id,
            "lesson_id": int(lesson_id),
            "lesson_title": lesson_title,
            "language": language,
            "task_id": s.task_id,
            "task_title": task_title,
            "is_correct": s.is_correct,
            "result": s.result,
            "status": status,
            "code": s.code,
            "created_at": s.created_at,
        })

    # Lesson progress: for each lesson the user has submissions in, show the
    # total number of tasks and how many the user has solved. This powers the
    # "task completion in lessons" block in the personal card.
    lesson_ids = db.execute(
        select(func.distinct(Task.lesson_id))
        .join(Submission, Submission.task_id == Task.id)
        .where(Submission.user_id == user_id)
    ).scalars().all()

    lesson_progress = []
    if lesson_ids:
        lesson_rows = db.execute(
            select(Lesson.id, Lesson.title, Language.name)
            .join(Language, Language.id == Lesson.language_id)
            .where(Lesson.id.in_(lesson_ids))
        ).all()
        for lid, ltitle, lname in lesson_rows:
            total_tasks = db.execute(
                select(func.count(Task.id)).where(Task.lesson_id == lid)
            ).scalar() or 0
            solved_tasks = db.execute(
                select(func.count(func.distinct(Submission.task_id)))
                .join(Task, Task.id == Submission.task_id)
                .where(Submission.user_id == user_id, Submission.is_correct == True, Task.lesson_id == lid)
            ).scalar() or 0
            lesson_progress.append({
                "lesson_id": int(lid),
                "lesson_title": ltitle,
                "language": lname,
                "total_tasks": total_tasks,
                "solved_tasks": solved_tasks,
            })
        lesson_progress.sort(key=lambda x: (x["language"], x["lesson_title"]))

    user_rank = db.execute(
        select(func.count(User.id)).where(
            (User.rating + User.rating_bonus) > (current_user.rating or 0) + (current_user.rating_bonus or 0)
        )
    ).scalar() or 0
    user_rank += 1

    return {
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "is_active": current_user.is_active,
            "created_at": current_user.created_at,
            "rating": effective_rating(current_user),
            "rating_bonus": current_user.rating_bonus or 0,
            "rank": user_rank,
        },
        "stats": {
            "total_submissions": total_submissions,
            "correct_submissions": correct_submissions,
            "pending_submissions": pending_submissions,
            "solved_tasks": solved_tasks,
            "solved_code_tasks": solved_code_tasks,
            "solved_quiz_tasks": solved_quiz_tasks,
            "attempted_tasks": attempted_tasks,
            "success_rate": success_rate,
        },
        "submissions": submissions,
        "lesson_progress": lesson_progress,
    }


@router.get("/summary", response_model=ProfileSummary)
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Total solved unique tasks
    solved_stmt = (
        select(func.count(func.distinct(Submission.task_id)))
        .where(Submission.user_id == current_user.id)
        .where(Submission.is_correct == True)
    )
    total_solved = db.execute(solved_stmt).scalar() or 0

    # Total submissions
    total_submissions_stmt = select(func.count(Submission.id)).where(Submission.user_id == current_user.id)
    total_submissions = db.execute(total_submissions_stmt).scalar() or 0

    # Success rate
    success_rate = (total_solved / total_submissions * 100) if total_submissions > 0 else 0.0

    # Languages progress
    langs_stmt = (
        select(Lesson.language, func.count(func.distinct(Submission.task_id)).label("solved"))
        .join(Task, Task.lesson_id == Lesson.id)
        .join(Submission, Submission.task_id == Task.id)
        .where(Submission.user_id == current_user.id)
        .where(Submission.is_correct == True)
        .group_by(Lesson.language)
    )
    langs_rows = db.execute(langs_stmt).all()
    languages_progress = {}
    for lang, solved in langs_rows:
        languages_progress[lang] = {"solved": solved}

    return ProfileSummary(
        total_solved=total_solved,
        total_submissions=total_submissions,
        success_rate=round(success_rate, 1),
        languages_progress=languages_progress,
    )


@router.get("/submissions")
def get_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status: str | None = Query(None, description="Filter by status: accepted, wrong_answer, pending"),
    language: str | None = Query(None, description="Filter by language"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    base_stmt = (
        select(Submission, Task, Lesson)
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .where(Submission.user_id == current_user.id)
        .order_by(Submission.created_at.desc())
    )

    if status:
        if status == "accepted":
            base_stmt = base_stmt.where(Submission.is_correct == True)
        elif status == "wrong_answer":
            base_stmt = base_stmt.where(Submission.is_correct == False)
        elif status == "pending":
            base_stmt = base_stmt.where(Submission.status == "pending")

    if language:
        base_stmt = base_stmt.where(Lesson.language == language)

    # Count total
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = db.execute(count_stmt).scalar() or 0

    # Paginate
    stmt = base_stmt.offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).all()

    out = []
    for s, task, lesson in rows:
        out.append({
            "id": s.id,
            "task_id": s.task_id,
            "task_title": task.title,
            "lesson_title": lesson.title,
            "language": lesson.language,
            "code": s.code,
            "answer": s.answer,
            "is_correct": s.is_correct,
            "result": s.result,
            "status": s.status,
            "created_at": s.created_at,
        })

    return {"data": out, "total": total, "page": page, "page_size": page_size}


@router.get("/submissions/{submission_id}", response_model=SubmissionDetail)
def get_submission_detail(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Submission, Task, Lesson)
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .where(Submission.id == submission_id)
        .where(Submission.user_id == current_user.id)
    )
    row = db.execute(stmt).first()
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")

    s, task, lesson = row
    return SubmissionDetail(
        id=s.id,
        task_id=s.task_id,
        task_title=task.title,
        lesson_title=lesson.title,
        language=lesson.language,
        code=s.code,
        answer=s.answer,
        is_correct=s.is_correct,
        result=s.result,
        status=s.status,
        created_at=s.created_at,
    )
