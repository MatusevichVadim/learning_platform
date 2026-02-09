from __future__ import annotations

import json
import os
import shutil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Header, Response, UploadFile, File
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session

from ..auth import create_access_token, decode_token
from ..config import ADMIN_USERNAME, ADMIN_PASSWORD
from ..db import get_session
from ..models import Language, Lesson, Task, Submission, User, CompetitionRoom, CompetitionParticipant
from ..schemas import AdminLogin, LessonOut, TaskOut, UserOut

# Upload directory for language images - save to backend/uploads
# __file__ is backend/app/routers/admin.py
# We need to go: admin.py -> routers/ -> app/ -> backend/ (this is where uploads/ should be)
CURRENT_FILE = os.path.abspath(__file__)
# Get the backend directory (3 levels up from admin.py: routers/app/backend)
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(CURRENT_FILE)))
# Use absolute path to backend/uploads
UPLOAD_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
print(f"[ADMIN] Upload directory: {UPLOAD_DIR}")


router = APIRouter(tags=["admin"])


def get_db() -> Session:
    with get_session() as session:
        yield session


def get_current_admin(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not admin")
    return payload


@router.post("/login")
def admin_login(payload: AdminLogin, db: Session = Depends(get_db)):
    if payload.username != ADMIN_USERNAME or payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": "admin", "role": "admin"})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/users", response_model=list[UserOut])
def list_users(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.execute(select(User).order_by(User.created_at.desc())).scalars().all()
@router.get("/tasks", response_model=list[TaskOut])
def list_all_tasks(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.execute(select(Task).order_by(Task.id)).scalars().all()

@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/submissions")
def list_submissions(user_name: str = "", page: int = 1, page_size: int = 50, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    # Join to fetch user name, lesson title, and task title
    base_stmt = (
        select(Submission, User.name, Task.lesson_id, Task.title.label('task_title'), Lesson.title.label('lesson_title'))
        .join(User, User.id == Submission.user_id)
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .order_by(Submission.created_at.desc())
    )
    if user_name:
        base_stmt = base_stmt.where(User.name == user_name)
    # Count total
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = db.execute(count_stmt).scalar()
    # Paginate
    stmt = base_stmt.offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).all()
    out = []
    for s, user_name_val, lesson_id, task_title, lesson_title in rows:
        # Handle missing status field for existing records
        status = getattr(s, 'status', 'completed')
        out.append({
            "id": s.id,
            "user_name": user_name_val,
            "lesson_id": int(lesson_id),
            "lesson_title": lesson_title,
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
def list_pending_submissions(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    # Get only pending code submissions
    stmt = (
        select(Submission, User.name, Task.title.label('task_title'), Task.description.label('task_description'), Lesson.title.label('lesson_title'))
        .join(User, User.id == Submission.user_id)
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .where(Submission.status == "pending")
        .order_by(Submission.created_at.asc())
    )
    rows = db.execute(stmt).all()
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
def review_submission(submission_id: int, data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    is_correct = data.get("is_correct", False)
    comment = data.get("comment", "")
    
    submission.is_correct = is_correct
    submission.status = "completed"
    submission.result = comment if comment else ("Правильно" if is_correct else "Неправильно")
    
    db.flush()
    return {"status": "reviewed", "is_correct": is_correct}


@router.post("/languages")
def create_language(data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    lang_id = str(data.get("id", "")).lower().replace(" ", "_")
    name = str(data.get("name", "")).strip()
    image_url = data.get("image_url")

    if not lang_id or not name:
        raise HTTPException(status_code=400, detail="id and name are required")

    # Check if language already exists
    existing = db.get(Language, lang_id)
    if existing:
        raise HTTPException(status_code=400, detail="Language with this id already exists")

    language = Language(id=lang_id, name=name, is_custom=True, image_url=image_url)
    db.add(language)
    db.flush()
    return {"id": language.id, "name": language.name, "is_custom": language.is_custom, "image_url": language.image_url}


@router.get("/languages")
def list_languages_admin(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    # Use a fresh query to ensure we get the latest data from database
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
        print(f"Language {lang_id}: image_url = {image_url!r}")
    return output


@router.put("/languages/{lang_id}")
def update_language(lang_id: str, data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    language = db.get(Language, lang_id)
    if not language:
        raise HTTPException(status_code=404, detail="Language not found")

    if "name" in data:
        language.name = str(data["name"]).strip()
    if "image_url" in data:
        # Only update if not empty string (to avoid overwriting uploaded image)
        if data["image_url"]:
            language.image_url = data["image_url"]
        print(f"PUT /languages/{lang_id}: image_url in data = {data.get('image_url')!r}, saved = {language.image_url!r}")

    db.flush()
    return {"id": language.id, "name": language.name, "is_custom": language.is_custom, "image_url": language.image_url}


@router.delete("/languages/{lang_id}")
def delete_language(lang_id: str, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    language = db.get(Language, lang_id)
    if not language:
        raise HTTPException(status_code=404, detail="Language not found")

    # Delete associated image file if exists
    if language.image_url and language.image_url.startswith("/uploads/"):
        try:
            file_path = os.path.join(UPLOAD_DIR, os.path.basename(language.image_url))
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass  # Ignore errors when deleting files

    db.delete(language)
    db.flush()
    return {"status": "deleted"}


@router.post("/languages/{lang_id}/upload-image")
def upload_language_image(
    lang_id: str,
    file: UploadFile = File(...),
    _: dict = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Upload an image file for a language."""
    language = db.get(Language, lang_id)
    if not language:
        raise HTTPException(status_code=404, detail="Language not found")

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")

    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1].lower()
    if not file_ext:
        # Determine extension from content type
        ext_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/svg+xml": ".svg"
        }
        file_ext = ext_map.get(file.content_type, ".png")
    
    filename = f"lang_{lang_id}_{os.urandom(4).hex()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    finally:
        file.file.close()

    # Delete old image if exists
    if language.image_url and language.image_url.startswith("/uploads/"):
        try:
            old_file_path = os.path.join(UPLOAD_DIR, os.path.basename(language.image_url))
            if os.path.exists(old_file_path) and old_file_path != file_path:
                os.remove(old_file_path)
        except Exception:
            pass

    # Update language with new image URL
    image_url = f"/uploads/{filename}"
    language.image_url = image_url
    db.flush()  # Flush changes to the session

    print(f"Updated language {language.id}: image_url = {language.image_url!r}")

    return {"id": language.id, "name": language.name, "image_url": image_url}


@router.post("/lessons", response_model=LessonOut)
def create_lesson(data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    language = str(data.get("language", "")).lower()
    title = str(data.get("title", "").strip())
    if not language or not title:
        raise HTTPException(status_code=400, detail="language and title are required")

    # Check if language exists
    lang_obj = db.get(Language, language)
    if not lang_obj:
        raise HTTPException(status_code=400, detail="Language does not exist")

    # compute next order index for this language if not provided
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
def list_lessons_admin(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.execute(select(Lesson).order_by(Lesson.language, Lesson.order_index)).scalars().all()

@router.get("/lessons/{lesson_id}/additional-info")
def get_lesson_additional_info(lesson_id: int, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return {"additional_info": lesson.additional_info or ""}

@router.put("/lessons/{lesson_id}/additional-info")
def update_lesson_additional_info(lesson_id: int, data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson.additional_info = data.get("additional_info", "")
    db.flush()
    return {"status": "updated"}

@router.put("/lessons/{lesson_id}")
def update_lesson(lesson_id: int, data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    if "title" in data:
        lesson.title = str(data["title"]).strip()
    
    db.flush()
    return {"id": lesson.id, "title": lesson.title}

@router.post("/lessons/{lesson_id}/move")
def move_lesson(lesson_id: int, data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    direction = data.get("direction")  # "up" or "down"
    if direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")
    
    # Find adjacent lesson with same language
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
        # Swap order_index values
        temp = lesson.order_index
        lesson.order_index = adjacent.order_index
        adjacent.order_index = temp
        db.flush()
    
    return {"status": "moved", "direction": direction}

@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: int, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    db.delete(lesson)
    db.flush()
    return {"status": "deleted"}


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskOut, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.title = data.title
    task.description = data.description
    task.kind = data.kind
    task.test_spec = data.test_spec
    db.flush()
    return task

@router.post("/lessons/{lesson_id}/tasks", response_model=TaskOut)
def create_task(lesson_id: int, data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    title = str(data.get("title", "Task"))
    description = str(data.get("description", ""))
    kind = str(data.get("kind", "quiz"))
    test_spec = data.get("test_spec")
    
    # Compute next order_index for this lesson
    last_task = db.execute(
        select(Task).where(Task.lesson_id == lesson_id).order_by(Task.order_index.desc())
    ).scalars().first()
    order_index = (last_task.order_index + 1) if last_task else 1
    
    task = Task(lesson_id=lesson_id, title=title, description=description, kind=kind, test_spec=json.dumps(test_spec) if isinstance(test_spec, (dict, list)) else test_spec, order_index=order_index)
    db.add(task)
    db.flush()
    return task

@router.post("/tasks", response_model=TaskOut)
def create_task_auto(data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    # allow explicit lesson_id, otherwise pick by language
    lesson_id = data.get("lesson_id")
    lesson = db.get(Lesson, int(lesson_id)) if lesson_id else None
    language = str(data.get("language", "")).lower()
    if not lesson and not language:
        raise HTTPException(status_code=400, detail="lesson_id or language is required")
    if not lesson:
        # find first lesson for language, or create auto
        lesson = db.execute(select(Lesson).where(Lesson.language == language).order_by(Lesson.order_index)).scalars().first()
    if not lesson:
        # create auto lesson
        lesson = Lesson(language=language, title=f"{language.title()} Auto Lesson", order_index=1)
        db.add(lesson)
        db.flush()
    title = str(data.get("title", "Task"))
    description = str(data.get("description", ""))
    kind = str(data.get("kind", "quiz"))
    test_spec = data.get("test_spec")
    
    # Compute next order_index for this lesson
    last_task = db.execute(
        select(Task).where(Task.lesson_id == lesson.id).order_by(Task.order_index.desc())
    ).scalars().first()
    order_index = (last_task.order_index + 1) if last_task else 1
    
    task = Task(lesson_id=lesson.id, title=title, description=description, kind=kind, test_spec=json.dumps(test_spec) if isinstance(test_spec, (dict, list)) else test_spec, order_index=order_index)
    db.add(task)
    db.flush()
    return task

@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Delete associated submissions first
    db.execute(delete(Submission).where(Submission.task_id == task_id))
    db.delete(task)
    db.flush()
    return {"status": "deleted"}

@router.post("/tasks/{task_id}/move")
def move_task(task_id: int, data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    direction = data.get("direction")  # "up" or "down"
    if direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")
    
    # Find adjacent task with same lesson_id
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
        # Swap order_index values
        temp = task.order_index
        task.order_index = adjacent.order_index
        adjacent.order_index = temp
        db.flush()
    
    return {"status": "moved", "direction": direction}

@router.get("/export/submissions.csv")
def export_submissions_csv(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    import io, csv
    rows = db.execute(select(Submission).order_by(Submission.created_at)).scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "user_id", "task_id", "is_correct", "result", "created_at"])
    for r in rows:
        writer.writerow([r.id, r.user_id, r.task_id, int(r.is_correct), r.result or "", r.created_at.isoformat()])
    csv_text = buf.getvalue()
    return Response(content=csv_text, media_type="text/csv")


# Competition endpoints
@router.get("/competition/room")
def get_competition_room(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
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


@router.put("/competition/room")
def update_competition_room(data: dict, _: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    room = db.execute(select(CompetitionRoom)).scalars().first()
    if not room:
        room = CompetitionRoom()
        db.add(room)

    room.game_time = data.get("game_time", room.game_time)
    room.difficulty = data.get("difficulty", room.difficulty)
    room.is_active = data.get("is_active", room.is_active)
    db.flush()
    return {"status": "updated"}


@router.get("/competition/participants")
def get_competition_participants(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
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
        "is_connected": p.is_connected,
        "user_id": p.user_id
    } for p in participants]


@router.get("/competition/participants/{user_id}/submissions")
def get_competition_user_submissions(
    user_id: int,
    _: dict = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all submissions for a specific user in the competition (including code solutions)."""
    stmt = (
        select(Submission, Task.title.label('task_title'), Task.kind, Lesson.title.label('lesson_title'))
        .join(Task, Task.id == Submission.task_id)
        .join(Lesson, Lesson.id == Task.lesson_id)
        .where(Submission.user_id == user_id)
        .order_by(Submission.created_at.desc())
    )
    rows = db.execute(stmt).all()

    out = []
    for s, task_title, task_kind, lesson_title in rows:
        out.append({
            "id": s.id,
            "task_title": task_title,
            "task_kind": task_kind,
            "lesson_title": lesson_title,
            "code": s.code,
            "answer": s.answer,
            "is_correct": s.is_correct,
            "result": s.result,
            "status": s.status,
            "created_at": s.created_at,
        })
    return out


@router.post("/competition/start")
def start_competition(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    room = db.execute(select(CompetitionRoom)).scalars().first()
    if not room:
        room = CompetitionRoom()
        db.add(room)

    room.is_active = True
    db.flush()
    return {"status": "started"}


@router.post("/competition/stop")
def stop_competition(_: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    room = db.execute(select(CompetitionRoom)).scalars().first()
    if room:
        room.is_active = False
        db.flush()
    return {"status": "stopped"}


