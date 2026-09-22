from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, or_, asc, desc, insert, delete
from sqlalchemy.orm import Session

from ..auth import get_password_hash
from ..db import get_session
from ..deps import get_current_teacher, get_db
from ..models import User, Language, Lesson, Task, Submission, teacher_classes, user_languages
from ..schemas import (
    UserOut,
    UserCreate,
    TeacherClassAssign,
    TeacherStudentOut,
    LessonOut,
    TaskOut,
    UserLanguageAssign,
    UserLanguageOut,
)
from ..rating import effective_rating

router = APIRouter(tags=["teacher"])


def _get_teacher_class_list(current_user: User, db: Session) -> list[str]:
    """Return the list of class names assigned to the teacher."""
    rows = db.execute(
        select(teacher_classes.c.user_class).where(teacher_classes.c.teacher_id == current_user.id)
    ).scalars().all()
    return list(rows)


# --- Assigned classes ---

@router.get("/classes", response_model=list[str])
def get_assigned_classes(current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    return _get_teacher_class_list(current_user, db)


@router.post("/classes")
def assign_class(payload: TeacherClassAssign, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    existing = db.execute(
        select(teacher_classes).where(
            teacher_classes.c.teacher_id == current_user.id,
            teacher_classes.c.user_class == payload.user_class,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Class already assigned to this teacher")
    db.execute(
        insert(teacher_classes).values(teacher_id=current_user.id, user_class=payload.user_class)
    )
    db.flush()
    return {"status": "assigned", "user_class": payload.user_class}


@router.delete("/classes/{user_class}")
def unassign_class(user_class: str, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    result = db.execute(
        delete(teacher_classes).where(
            teacher_classes.c.teacher_id == current_user.id,
            teacher_classes.c.user_class == user_class,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Class not assigned to this teacher")
    db.flush()
    return {"status": "unassigned", "user_class": user_class}


# --- Students in assigned classes ---

@router.get("/students", response_model=list[TeacherStudentOut])
def list_students(
    search: str = "",
    sort_by: str = "username",
    order: str = "asc",
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    classes = _get_teacher_class_list(current_user, db)
    if not classes:
        return []

    stmt = select(User).where(User.user_class.in_(classes), User.role == "user")

    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(User.username.ilike(like), User.full_name.ilike(like)))

    sort_columns = {
        "id": User.id,
        "username": User.username,
        "full_name": User.full_name,
        "user_class": User.user_class,
        "rating": (User.rating + User.rating_bonus),
    }
    column = sort_columns.get(sort_by, User.username)
    if order == "desc":
        stmt = stmt.order_by(desc(column))
    else:
        stmt = stmt.order_by(asc(column))

    return db.execute(stmt).scalars().all()


@router.post("/students", response_model=UserOut)
def create_student(
    payload: UserCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    classes = _get_teacher_class_list(current_user, db)
    if not classes:
        raise HTTPException(status_code=403, detail="No classes assigned to this teacher")

    # The student must be assigned to one of the teacher's classes
    if not payload.user_class or payload.user_class not in classes:
        raise HTTPException(status_code=403, detail="Student must be assigned to one of your classes")

    # Teachers can only create regular users, not admins or other teachers
    if payload.role not in ("user",):
        raise HTTPException(status_code=403, detail="Teachers can only create student accounts")

    existing = db.execute(select(User).where(User.username == payload.username)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = get_password_hash(payload.password)
    user = User(
        username=payload.username,
        hashed_password=hashed_password,
        full_name=payload.full_name,
        role="user",
        user_class=payload.user_class,
    )
    db.add(user)
    db.flush()
    return user


# --- Student card (results) ---

@router.get("/students/{student_id}/card")
def get_student_card(
    student_id: int,
    search: str = "",
    sort_by: str = "created_at",
    order: str = "desc",
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    classes = _get_teacher_class_list(current_user, db)
    student = db.get(User, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != "user" or student.user_class not in classes:
        raise HTTPException(status_code=403, detail="Access denied to this student")

    user_id = student.id

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
        if s.task_id in seen_tasks:
            continue
        seen_tasks.add(s.task_id)
        status_val = getattr(s, 'status', 'completed')
        submissions.append({
            "id": s.id,
            "lesson_id": int(lesson_id),
            "lesson_title": lesson_title,
            "language": language,
            "task_id": s.task_id,
            "task_title": task_title,
            "is_correct": s.is_correct,
            "result": s.result,
            "status": status_val,
            "code": s.code,
            "created_at": s.created_at,
        })

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
            solved_tasks_lp = db.execute(
                select(func.count(func.distinct(Submission.task_id)))
                .join(Task, Task.id == Submission.task_id)
                .where(Submission.user_id == user_id, Submission.is_correct == True, Task.lesson_id == lid)
            ).scalar() or 0
            lesson_progress.append({
                "lesson_id": int(lid),
                "lesson_title": ltitle,
                "language": lname,
                "total_tasks": total_tasks,
                "solved_tasks": solved_tasks_lp,
            })
        lesson_progress.sort(key=lambda x: (x["language"], x["lesson_title"]))

    user_rank = db.execute(
        select(func.count(User.id)).where(
            (User.rating + User.rating_bonus) > (student.rating or 0) + (student.rating_bonus or 0)
        )
    ).scalar() or 0
    user_rank += 1

    return {
        "user": {
            "id": student.id,
            "username": student.username,
            "full_name": student.full_name,
            "role": student.role,
            "is_active": student.is_active,
            "created_at": student.created_at,
            "rating": effective_rating(student),
            "rating_bonus": student.rating_bonus or 0,
            "user_class": student.user_class,
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


# --- Student management (name, surname, password) ---

@router.put("/students/{student_id}")
def update_student(
    student_id: int,
    payload: dict,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    classes = _get_teacher_class_list(current_user, db)
    student = db.get(User, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != "user" or student.user_class not in classes:
        raise HTTPException(status_code=403, detail="Access denied to this student")

    # Teachers can only change name, surname (full_name), and password
    if "full_name" in payload:
        student.full_name = payload["full_name"]
    if "password" in payload:
        if len(payload["password"]) < 4:
            raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
        student.hashed_password = get_password_hash(payload["password"])

    db.flush()
    return {"status": "updated", "id": student_id}


@router.put("/students/{student_id}/reset-password")
def reset_student_password(
    student_id: int,
    payload: dict,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    classes = _get_teacher_class_list(current_user, db)
    student = db.get(User, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != "user" or student.user_class not in classes:
        raise HTTPException(status_code=403, detail="Access denied to this student")

    password = payload.get("password", "")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    student.hashed_password = get_password_hash(password)
    db.flush()
    return {"status": "password_reset", "id": student_id}


# --- Student language access ---

def _get_managed_student(current_user: User, student_id: int, db: Session) -> User:
    classes = _get_teacher_class_list(current_user, db)
    student = db.get(User, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != "user" or student.user_class not in classes:
        raise HTTPException(status_code=403, detail="Access denied to this student")
    return student


@router.get("/students/{student_id}/languages", response_model=UserLanguageOut)
def get_student_languages(
    student_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    _get_managed_student(current_user, student_id, db)
    language_ids = list(
        db.execute(
            select(user_languages.c.language_id)
            .where(user_languages.c.user_id == student_id)
            .order_by(user_languages.c.language_id)
        )
        .scalars()
        .all()
    )
    return UserLanguageOut(user_id=student_id, language_ids=language_ids)


@router.put("/students/{student_id}/languages", response_model=UserLanguageOut)
def set_student_languages(
    student_id: int,
    payload: UserLanguageAssign,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    _get_managed_student(current_user, student_id, db)

    language_ids = list(dict.fromkeys(payload.language_ids))
    if language_ids:
        existing = db.execute(select(Language.id).where(Language.id.in_(language_ids))).scalars().all()
        missing = set(language_ids) - set(existing)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown language ids: {', '.join(sorted(missing))}",
            )

    db.execute(delete(user_languages).where(user_languages.c.user_id == student_id))
    for language_id in language_ids:
        db.execute(insert(user_languages).values(user_id=student_id, language_id=language_id))
    db.flush()
    return UserLanguageOut(user_id=student_id, language_ids=language_ids)


# --- Lessons (read-only, same interface as students) ---

@router.get("/languages", response_model=list[dict])
def list_languages_teacher(current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    languages = db.execute(select(Language).order_by(Language.created_at)).scalars().all()
    return [{"id": lang.id, "name": lang.name, "image_url": lang.image_url} for lang in languages]


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons_teacher(language: str, page: int = 1, page_size: int = 50, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    offset = (page - 1) * page_size
    stmt = select(Lesson).where(Lesson.language_id == language).order_by(Lesson.order_index).offset(offset).limit(page_size)
    return db.execute(stmt).scalars().all()


@router.get("/lessons/{lesson_id}/tasks", response_model=list[TaskOut])
def list_tasks_teacher(lesson_id: int, page: int = 1, page_size: int = 50, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    offset = (page - 1) * page_size
    stmt = select(Task).where(Task.lesson_id == lesson_id).order_by(Task.order_index).offset(offset).limit(page_size)
    return db.execute(stmt).scalars().all()


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task_teacher(task_id: int, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
def get_lesson_teacher(lesson_id: int, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.get("/lessons/{lesson_id}/status")
def lesson_status_teacher(lesson_id: int, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    """Teachers can view lesson status for any student in their classes."""
    classes = _get_teacher_class_list(current_user, db)
    if not classes:
        return {}

    tasks = db.execute(select(Task).where(Task.lesson_id == lesson_id).order_by(Task.order_index)).scalars().all()
    task_ids = [t.id for t in tasks]
    if not task_ids:
        return {}

    # Get all students in teacher's classes
    student_ids = db.execute(
        select(User.id).where(User.user_class.in_(classes), User.role == "user")
    ).scalars().all()

    # Return status for each student
    result = {}
    for sid in student_ids:
        subs = db.execute(
            select(Submission)
            .where(Submission.user_id == sid, Submission.task_id.in_(task_ids))
            .order_by(Submission.created_at.desc())
        ).scalars().all()
        latest: dict[int, bool | None] = {}
        for s in subs:
            if s.task_id not in latest:
                if s.status == "pending":
                    latest[s.task_id] = None
                else:
                    latest[s.task_id] = s.is_correct
        result[str(sid)] = {str(k): latest.get(k, None) for k in task_ids}
    return result


@router.get("/lessons/{lesson_id}/additional-info")
def get_lesson_additional_info_teacher(lesson_id: int, current_user: User = Depends(get_current_teacher), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return {"additional_info": lesson.additional_info or ""}


# --- Results (aggregated student results with class sorting) ---

@router.get("/results")
def get_results(
    class_filter: str = "",
    sort_by: str = "user_class",
    order: str = "asc",
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Return aggregated results for all students in the teacher's assigned classes.
    Supports sorting by class."""
    classes = _get_teacher_class_list(current_user, db)
    if not classes:
        return {"students": [], "classes": []}

    stmt = select(User).where(User.user_class.in_(classes), User.role == "user")

    if class_filter:
        stmt = stmt.where(User.user_class == class_filter)

    sort_columns = {
        "user_class": User.user_class,
        "username": User.username,
        "full_name": User.full_name,
        "rating": (User.rating + User.rating_bonus),
        "id": User.id,
    }
    column = sort_columns.get(sort_by, User.user_class)
    if order == "desc":
        stmt = stmt.order_by(desc(column))
    else:
        stmt = stmt.order_by(asc(column))

    users = db.execute(stmt).scalars().all()

    results = []
    for u in users:
        total_submissions = db.execute(
            select(func.count(Submission.id)).where(Submission.user_id == u.id)
        ).scalar() or 0
        correct_submissions = db.execute(
            select(func.count(Submission.id)).where(Submission.user_id == u.id, Submission.is_correct == True)
        ).scalar() or 0
        solved_tasks = db.execute(
            select(func.count(func.distinct(Submission.task_id))).where(Submission.user_id == u.id, Submission.is_correct == True)
        ).scalar() or 0
        success_rate = round((correct_submissions / total_submissions * 100), 1) if total_submissions else 0.0

        results.append({
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "user_class": u.user_class,
            "is_active": u.is_active,
            "created_at": u.created_at,
            "rating": effective_rating(u),
            "total_submissions": total_submissions,
            "correct_submissions": correct_submissions,
            "solved_tasks": solved_tasks,
            "success_rate": success_rate,
        })

    return {
        "students": results,
        "classes": classes,
    }


# --- Submissions (all submissions from students in assigned classes) ---

@router.get("/submissions")
def list_submissions(
    class_filter: str = "",
    student_filter: str = "",
    lesson_filter: str = "",
    task_filter: str = "",
    status_filter: str = "",
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "created_at",
    order: str = "desc",
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Return paginated submissions for all students in the teacher's assigned classes.
    Supports filtering by class, student, lesson, task, and status."""
    classes = _get_teacher_class_list(current_user, db)
    if not classes:
        return {"data": [], "total": 0, "page": page, "page_size": page_size}

    # Get student IDs in teacher's classes
    student_stmt = select(User.id).where(User.user_class.in_(classes), User.role == "user")
    if class_filter:
        student_stmt = student_stmt.where(User.user_class == class_filter)
    if student_filter:
        like = f"%{student_filter}%"
        student_stmt = student_stmt.where(or_(User.username.ilike(like), User.full_name.ilike(like)))
    student_ids = db.execute(student_stmt).scalars().all()

    if not student_ids:
        return {"data": [], "total": 0, "page": page, "page_size": page_size}

    base_stmt = (
        select(
            Submission,
            User.username,
            User.full_name,
            User.user_class,
            Task.lesson_id,
            Task.title.label('task_title'),
            Lesson.title.label('lesson_title'),
            Language.name.label('language'),
        )
        .join(User, User.id == Submission.user_id)
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .join(Language, Language.id == Lesson.language_id)
        .where(Submission.user_id.in_(student_ids))
    )

    if lesson_filter:
        like = f"%{lesson_filter}%"
        base_stmt = base_stmt.where(Lesson.title.ilike(like))
    if task_filter:
        like = f"%{task_filter}%"
        base_stmt = base_stmt.where(Task.title.ilike(like))
    if status_filter:
        base_stmt = base_stmt.where(Submission.status == status_filter)

    sort_columns = {
        "created_at": Submission.created_at,
        "username": User.username,
        "full_name": User.full_name,
        "user_class": User.user_class,
        "lesson_title": Lesson.title,
        "task_title": Task.title,
        "language": Language.name,
        "status": Submission.status,
        "is_correct": Submission.is_correct,
    }
    column = sort_columns.get(sort_by, Submission.created_at)
    if order == "desc":
        base_stmt = base_stmt.order_by(desc(column))
    else:
        base_stmt = base_stmt.order_by(asc(column))

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = db.execute(count_stmt).scalar() or 0

    stmt = base_stmt.offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).all()

    submissions = []
    for s, username, full_name, user_class, lesson_id, task_title, lesson_title, language in rows:
        status_val = getattr(s, 'status', 'completed')
        submissions.append({
            "id": s.id,
            "username": username,
            "full_name": full_name,
            "user_class": user_class,
            "lesson_id": int(lesson_id),
            "lesson_title": lesson_title,
            "language": language,
            "task_id": s.task_id,
            "task_title": task_title,
            "is_correct": s.is_correct,
            "result": s.result,
            "status": status_val,
            "code": s.code,
            "created_at": s.created_at,
        })

    return {
        "data": submissions,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# --- Review submission ---

@router.post("/submissions/{submission_id}/review")
def review_submission(
    submission_id: int,
    data: dict,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Allow teacher to review a submission (mark as correct/incorrect) for students in their classes."""
    classes = _get_teacher_class_list(current_user, db)
    if not classes:
        raise HTTPException(status_code=403, detail="No classes assigned")

    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Check if the submission belongs to a student in teacher's classes
    student = db.get(User, submission.user_id)
    if not student or student.role != "user" or student.user_class not in classes:
        raise HTTPException(status_code=403, detail="Access denied to this submission")

    is_correct = data.get("is_correct")
    if is_correct is None:
        raise HTTPException(status_code=400, detail="is_correct is required")

    comment = data.get("comment", "")

    submission.is_correct = is_correct
    submission.status = "completed"
    if comment:
        # Store comment in result field if it's a dict, or append to existing result
        try:
            import json
            result_data = json.loads(submission.result) if submission.result else {}
            if isinstance(result_data, dict):
                result_data["teacher_comment"] = comment
                submission.result = json.dumps(result_data, ensure_ascii=False)
            else:
                submission.result = json.dumps({"result": submission.result, "teacher_comment": comment}, ensure_ascii=False)
        except:
            submission.result = json.dumps({"result": submission.result, "teacher_comment": comment}, ensure_ascii=False)

    # Recompute user rating
    from ..rating import recompute_user_rating
    recompute_user_rating(db, student.id)

    db.flush()
    return {"status": "reviewed", "submission_id": submission_id, "is_correct": is_correct}
