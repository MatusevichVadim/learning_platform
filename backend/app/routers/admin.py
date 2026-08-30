from __future__ import annotations

import json
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete, or_, asc, desc
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from ..auth import get_password_hash
from ..db import get_session
from ..deps import get_current_admin, get_current_user
from ..models import Language, Lesson, Task, Submission, User
from ..rating import recompute_user_rating, recompute_all_ratings, effective_rating
from ..schemas import LessonOut, TaskOut, UserOut, UserCreate, UserUpdate

# Upload directory for language images - save to backend/uploads
CURRENT_FILE = os.path.abspath(__file__)
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(CURRENT_FILE)))
UPLOAD_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
print(f"[ADMIN] Upload directory: {UPLOAD_DIR}")


class PasswordReset(BaseModel):
    password: str = Field(min_length=4)


router = APIRouter(tags=["admin"])


def get_db() -> Session:
    with get_session() as session:
        yield session


def _is_safe_image(head: bytes) -> bool:
    """Reject SVG/XML (stored XSS risk) and only allow real raster image bytes."""
    if not head:
        return False
    stripped = head.lstrip()
    lowered = stripped[:9].lower()
    if lowered.startswith(b"<?xml") or lowered.startswith(b"<svg") or lowered.startswith(b"<!doctype"):
        return False
    if head[:3] == b"\xff\xd8\xff":  # JPEG
        return True
    if head[:8] == b"\x89PNG\r\n\x1a\n":  # PNG
        return True
    if head[:4] == b"GIF8":  # GIF
        return True
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":  # WEBP
        return True
    return False


# --- User Management ---

@router.get("/users", response_model=list[UserOut])
def list_users(
    search: str = "",
    sort_by: str = "created_at",
    order: str = "desc",
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    stmt = select(User)

    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(User.username.ilike(like), User.full_name.ilike(like)))

    sort_columns = {
        "id": User.id,
        "username": User.username,
        "full_name": User.full_name,
        "role": User.role,
        "is_active": User.is_active,
        "created_at": User.created_at,
        "rating": (User.rating + User.rating_bonus),
    }
    column = sort_columns.get(sort_by, User.created_at)
    if order == "asc":
        stmt = stmt.order_by(asc(column))
    else:
        stmt = stmt.order_by(desc(column))

    return db.execute(stmt).scalars().all()


@router.post("/users", response_model=UserOut)
def create_user(payload: UserCreate, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    # Check if username already exists
    existing = db.execute(select(User).where(User.username == payload.username)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = get_password_hash(payload.password)
    user = User(
        username=payload.username,
        hashed_password=hashed_password,
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.flush()
    return user


@router.put("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, payload: PasswordReset, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = get_password_hash(payload.password)
    db.flush()
    return {"status": "password_reset"}


@router.put("/users/{user_id}/status")
def toggle_user_status(user_id: int, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Guard against an admin deactivating their own account (self-lockout)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    # Guard against deactivating the last active admin
    if user.role == "admin" and user.is_active:
        other_active_admins = db.execute(
            select(func.count())
            .select_from(User)
            .where(User.role == "admin", User.is_active == True, User.id != user.id)
        ).scalar()
        if not other_active_admins:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last active admin")

    user.is_active = not user.is_active
    db.flush()
    return {"status": "activated" if user.is_active else "blocked", "is_active": user.is_active}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Guard against an admin deleting their own account (self-lockout)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Guard against deleting the last active admin
    if user.role == "admin":
        other_active_admins = db.execute(
            select(func.count())
            .select_from(User)
            .where(User.role == "admin", User.is_active == True, User.id != user.id)
        ).scalar()
        if not other_active_admins:
            raise HTTPException(status_code=400, detail="Cannot delete the last active admin")

    # Remove related submissions explicitly (the FK cascade should also handle this)
    db.execute(delete(Submission).where(Submission.user_id == user_id))
    db.delete(user)
    db.flush()
    return {"status": "deleted", "id": user_id}


@router.get("/users/{user_id}/card")
def get_user_card(
    user_id: int,
    search: str = "",
    sort_by: str = "created_at",
    order: str = "desc",
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    total_submissions = db.execute(
        select(func.count()).select_from(Submission).where(Submission.user_id == user_id)
    ).scalar() or 0
    correct_submissions = db.execute(
        select(func.count()).select_from(Submission).where(Submission.user_id == user_id, Submission.is_correct == True)
    ).scalar() or 0
    pending_submissions = db.execute(
        select(func.count()).select_from(Submission).where(Submission.user_id == user_id, Submission.status == "pending")
    ).scalar() or 0
    solved_tasks = db.execute(
        select(func.count(func.distinct(Submission.task_id))).select_from(Submission).where(Submission.user_id == user_id, Submission.is_correct == True)
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
        select(func.count(func.distinct(Submission.task_id))).select_from(Submission).where(Submission.user_id == user_id)
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
            (User.rating + User.rating_bonus) > (user.rating or 0) + (user.rating_bonus or 0)
        )
    ).scalar() or 0
    user_rank += 1

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "rating": effective_rating(user),
            "rating_bonus": user.rating_bonus or 0,
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


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Guard against an admin changing their own role or deactivating themselves.
    if user.id == current_user.id:
        if payload.role is not None and payload.role != user.role:
            raise HTTPException(status_code=400, detail="Cannot change your own role")
        if payload.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    # Guard against removing the last active admin.
    if (payload.role == "user" or payload.is_active is False) and user.role == "admin" and user.is_active:
        other_active_admins = db.execute(
            select(func.count())
            .select_from(User)
            .where(User.role == "admin", User.is_active == True, User.id != user.id)
        ).scalar()
        if not other_active_admins:
            raise HTTPException(status_code=400, detail="Cannot remove the last active admin")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.rating_bonus is not None:
        user.rating_bonus = int(payload.rating_bonus)

    db.flush()
    return user


@router.post("/recompute-ratings")
def recompute_ratings(current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Recompute the automatic rating for every user (e.g. after bulk task changes)."""
    recompute_all_ratings(db)
    return {"status": "recomputed"}


# --- Tasks ---

@router.get("/tasks", response_model=list[TaskOut])
def list_all_tasks(current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.execute(select(Task).order_by(Task.id)).scalars().all()


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


# --- Submissions ---

@router.get("/submissions")
def list_submissions(user_name: str = "", page: int = 1, page_size: int = 50, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Non-admin users may only view their own submissions.
    if current_user.role != "admin":
        user_name = current_user.username
    base_stmt = (
        select(Submission, User.username, Task.lesson_id, Task.title.label('task_title'), Lesson.title.label('lesson_title'), Language.name.label('language'))
        .join(User, User.id == Submission.user_id)
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .join(Language, Language.id == Lesson.language_id)
        .order_by(Submission.created_at.desc())
    )
    if user_name:
        base_stmt = base_stmt.where(User.username == user_name)
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = db.execute(count_stmt).scalar()
    stmt = base_stmt.offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).all()
    out = []
    for s, user_name_val, lesson_id, task_title, lesson_title, language in rows:
        status = getattr(s, 'status', 'completed')
        out.append({
            "id": s.id,
            "user_name": user_name_val,
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
    return {"data": out, "total": total, "page_size": page_size}


@router.get("/submissions/pending")
def list_pending_submissions(page: int = 1, page_size: int = 50, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    stmt = (
        select(Submission, User.username, Task.title.label('task_title'), Task.description.label('task_description'), Lesson.title.label('lesson_title'))
        .join(User, User.id == Submission.user_id)
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .where(Submission.status == "pending")
        .order_by(Submission.created_at.asc())
    )
    rows = db.execute(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    out = []
    for s, user_name_val, task_title, task_description, lesson_title in rows:
        out.append({
            "id": s.id,
            "user_name": user_name_val,
            "lesson_title": lesson_title,
            "task_title": task_title,
            "task_description": task_description,
            "code": s.code,
            "created_at": s.created_at,
        })
    return out


@router.post("/submissions/{submission_id}/review")
def review_submission(submission_id: int, data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    is_correct = data.get("is_correct", False)
    comment = data.get("comment", "")

    submission.is_correct = is_correct
    submission.status = "completed"
    submission.result = comment if comment else ("Правильно" if is_correct else "Неправильно")

    db.flush()
    # A manual review changes correctness, so the author's rating must be recomputed.
    recompute_user_rating(db, submission.user_id)
    return {"status": "reviewed", "is_correct": is_correct}


# --- Languages ---

@router.post("/languages")
def create_language(data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lang_id = str(data.get("id", "")).lower().replace(" ", "_")
    name = str(data.get("name", "")).strip()
    image_url = data.get("image_url")

    if not lang_id or not name:
        raise HTTPException(status_code=400, detail="id and name are required")

    existing = db.get(Language, lang_id)
    if existing:
        raise HTTPException(status_code=400, detail="Language with this id already exists")

    language = Language(id=lang_id, name=name, is_custom=True, image_url=image_url)
    db.add(language)
    db.flush()
    return {"id": language.id, "name": language.name, "is_custom": language.is_custom, "image_url": language.image_url}


@router.get("/languages")
def list_languages_admin(current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    result = db.execute(
        select(Language.id, Language.name, Language.is_custom, Language.image_url)
        .order_by(Language.created_at)
    ).all()
    output = []
    for row in result:
        lang_id, name, is_custom, image_url = row
        output.append({
            "id": lang_id,
            "name": name,
            "is_custom": is_custom,
            "image_url": image_url or ""
        })
    return output


@router.put("/languages/{lang_id}")
def update_language(lang_id: str, data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    language = db.get(Language, lang_id)
    if not language:
        raise HTTPException(status_code=404, detail="Language not found")

    if "name" in data:
        language.name = str(data["name"]).strip()
    if "image_url" in data:
        if data["image_url"]:
            language.image_url = data["image_url"]

    db.flush()
    return {"id": language.id, "name": language.name, "is_custom": language.is_custom, "image_url": language.image_url}


@router.delete("/languages/{lang_id}")
def delete_language(lang_id: str, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    language = db.get(Language, lang_id)
    if not language:
        raise HTTPException(status_code=404, detail="Language not found")

    if language.image_url and language.image_url.startswith("/uploads/"):
        try:
            file_path = os.path.join(UPLOAD_DIR, os.path.basename(language.image_url))
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass

    db.delete(language)
    db.flush()
    return {"status": "deleted"}


@router.post("/languages/{lang_id}/upload-image")
def upload_language_image(
    lang_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    language = db.get(Language, lang_id)
    if not language:
        raise HTTPException(status_code=404, detail="Language not found")

    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")

    # content_type is client-controlled; validate the actual file bytes.
    head = file.file.read(512)
    file.file.seek(0)
    if not _is_safe_image(head):
        raise HTTPException(status_code=400, detail="File content is not a supported image")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if not file_ext:
        ext_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
        }
        file_ext = ext_map.get(file.content_type, ".png")

    filename = f"lang_{lang_id}_{os.urandom(4).hex()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    finally:
        file.file.close()

    if language.image_url and language.image_url.startswith("/uploads/"):
        try:
            old_file_path = os.path.join(UPLOAD_DIR, os.path.basename(language.image_url))
            if os.path.exists(old_file_path) and old_file_path != file_path:
                os.remove(old_file_path)
        except Exception:
            pass

    image_url = f"/uploads/{filename}"
    language.image_url = image_url
    db.flush()

    return {"id": language.id, "name": language.name, "image_url": image_url}


# --- Lessons ---

@router.post("/lessons", response_model=LessonOut)
def create_lesson(data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    language = str(data.get("language", "")).lower()
    title = str(data.get("title", "").strip())
    if not language or not title:
        raise HTTPException(status_code=400, detail="language and title are required")

    lang_obj = db.get(Language, language)
    if not lang_obj:
        raise HTTPException(status_code=400, detail="Language does not exist")

    provided_order = data.get("order_index")
    if provided_order is not None:
        order_index = int(provided_order)
    else:
        last = db.execute(select(Lesson).where(Lesson.language == language).order_by(Lesson.order_index.desc())).scalars().first()
        order_index = (last.order_index + 1) if last else 1
    lesson = Lesson(language=language, language_id=language, title=title, order_index=order_index)
    db.add(lesson)
    db.flush()
    return lesson


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons_admin(current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.execute(select(Lesson).order_by(Lesson.language, Lesson.order_index)).scalars().all()


@router.get("/lessons/{lesson_id}/additional-info")
def get_lesson_additional_info(lesson_id: int, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return {"additional_info": lesson.additional_info or ""}


@router.put("/lessons/{lesson_id}/additional-info")
def update_lesson_additional_info(lesson_id: int, data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson.additional_info = data.get("additional_info", "")
    db.flush()
    return {"status": "updated"}


@router.put("/lessons/{lesson_id}")
def update_lesson(lesson_id: int, data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    if "title" in data:
        lesson.title = str(data["title"]).strip()

    db.flush()
    return {"id": lesson.id, "title": lesson.title}


@router.post("/lessons/{lesson_id}/move")
def move_lesson(lesson_id: int, data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    direction = data.get("direction")
    if direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")

    if direction == "up":
        adjacent = db.execute(
            select(Lesson)
            .where(Lesson.language == lesson.language)
            .where(Lesson.order_index < lesson.order_index)
            .order_by(Lesson.order_index.desc())
        ).scalars().first()
    else:
        adjacent = db.execute(
            select(Lesson)
            .where(Lesson.language == lesson.language)
            .where(Lesson.order_index > lesson.order_index)
            .order_by(Lesson.order_index.asc())
        ).scalars().first()

    if adjacent:
        temp = lesson.order_index
        lesson.order_index = adjacent.order_index
        adjacent.order_index = temp
        db.flush()

    return {"status": "moved", "direction": direction}


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: int, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    db.delete(lesson)
    db.flush()
    return {"status": "deleted"}


# --- Tasks ---

@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskOut, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.title = data.title
    task.description = data.description
    task.kind = data.kind
    task.test_spec = data.test_spec
    # Rating must be an integer between 1 and 5.
    if data.rating is not None:
        task.rating = max(1, min(5, int(data.rating)))
    db.flush()
    # Recompute the rating of every user who has submitted this task, since the
    # awarded points for solving it may have changed.
    affected = db.execute(
        select(func.distinct(Submission.user_id)).where(Submission.task_id == task.id)
    ).scalars().all()
    for uid in affected:
        recompute_user_rating(db, uid)
    return task


@router.post("/lessons/{lesson_id}/tasks", response_model=TaskOut)
def create_task(lesson_id: int, data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    title = str(data.get("title", "Task"))
    description = str(data.get("description", ""))
    kind = str(data.get("kind", "quiz"))
    test_spec = data.get("test_spec")
    raw_rating = data.get("rating", 1)
    try:
        rating = max(1, min(5, int(raw_rating)))
    except (TypeError, ValueError):
        rating = 1

    last_task = db.execute(
        select(Task).where(Task.lesson_id == lesson_id).order_by(Task.order_index.desc())
    ).scalars().first()
    order_index = (last_task.order_index + 1) if last_task else 1

    task = Task(lesson_id=lesson_id, title=title, description=description, kind=kind, test_spec=json.dumps(test_spec) if isinstance(test_spec, (dict, list)) else test_spec, order_index=order_index, rating=rating)
    db.add(task)
    db.flush()
    return task


@router.post("/tasks", response_model=TaskOut)
def create_task_auto(data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson_id = data.get("lesson_id")
    lesson = db.get(Lesson, int(lesson_id)) if lesson_id else None
    language = str(data.get("language", "")).lower()
    if not lesson and not language:
        raise HTTPException(status_code=400, detail="lesson_id or language is required")
    if not lesson:
        lesson = db.execute(select(Lesson).where(Lesson.language == language).order_by(Lesson.order_index)).scalars().first()
    if not lesson:
        lesson = Lesson(language=language, title=f"{language.title()} Auto Lesson", order_index=1)
        db.add(lesson)
        db.flush()
    title = str(data.get("title", "Task"))
    description = str(data.get("description", ""))
    kind = str(data.get("kind", "quiz"))
    test_spec = data.get("test_spec")
    raw_rating = data.get("rating", 1)
    try:
        rating = max(1, min(5, int(raw_rating)))
    except (TypeError, ValueError):
        rating = 1

    last_task = db.execute(
        select(Task).where(Task.lesson_id == lesson.id).order_by(Task.order_index.desc())
    ).scalars().first()
    order_index = (last_task.order_index + 1) if last_task else 1

    task = Task(lesson_id=lesson.id, title=title, description=description, kind=kind, test_spec=json.dumps(test_spec) if isinstance(test_spec, (dict, list)) else test_spec, order_index=order_index, rating=rating)
    db.add(task)
    db.flush()
    return task


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.execute(delete(Submission).where(Submission.task_id == task_id))
    db.delete(task)
    db.flush()
    return {"status": "deleted"}


@router.post("/tasks/{task_id}/move")
def move_task(task_id: int, data: dict, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    direction = data.get("direction")
    if direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")

    if direction == "up":
        adjacent = db.execute(
            select(Task)
            .where(Task.lesson_id == task.lesson_id)
            .where(Task.order_index < task.order_index)
            .order_by(Task.order_index.desc())
        ).scalars().first()
    else:
        adjacent = db.execute(
            select(Task)
            .where(Task.lesson_id == task.lesson_id)
            .where(Task.order_index > task.order_index)
            .order_by(Task.order_index.asc())
        ).scalars().first()

    if adjacent:
        temp = task.order_index
        task.order_index = adjacent.order_index
        adjacent.order_index = temp
        db.flush()

    return {"status": "moved", "direction": direction}


@router.get("/export/submissions.csv")
def export_submissions_csv(current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    import io, csv

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "user_id", "task_id", "is_correct", "result", "created_at"])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        stmt = select(Submission).order_by(Submission.created_at)
        for r in db.execute(stmt).scalars().all():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow([r.id, r.user_id, r.task_id, int(r.is_correct), r.result or "", r.created_at.isoformat()])
            yield buf.getvalue()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=submissions.csv"},
    )
