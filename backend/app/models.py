from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship, Mapped, mapped_column

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)  # "admin" | "user"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    # Legacy column kept for backward compatibility with existing DB
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Rating system: `rating` is computed automatically from solved tasks + streaks,
    # `rating_bonus` is a manual adjustment applied by an administrator.
    rating: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_bonus: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    submissions: Mapped[list[Submission]] = relationship("Submission", back_populates="user", cascade="all, delete-orphan")


class Language(Base):
    __tablename__ = "languages"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # language identifier like "python", "csharp", "custom_lang"
    name: Mapped[str] = mapped_column(String(100))  # display name like "Python", "C#", "My Custom Language"
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)  # True for user-created languages
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # URL or path to language icon/image
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    lessons: Mapped[list[Lesson]] = relationship("Lesson", back_populates="language_obj", cascade="all, delete-orphan")


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    language: Mapped[str] = mapped_column(String(20), index=True)  # "python" | "csharp"
    language_id: Mapped[str] = mapped_column(ForeignKey("languages.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    order_index: Mapped[int] = mapped_column(Integer, index=True)
    additional_info: Mapped[str | None] = mapped_column(Text, nullable=True)  # Additional information for students

    tasks: Mapped[list[Task]] = relationship("Task", back_populates="lesson", cascade="all, delete-orphan")
    language_obj: Mapped[Language] = relationship("Language", back_populates="lessons")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20))  # "quiz" | "code"
    test_spec: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string or plain
    order_index: Mapped[int] = mapped_column(Integer, default=0)  # For ordering tasks within a lesson
    # Rating (1-5) awarded to a user when this task is solved correctly.
    rating: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    lesson: Mapped[Lesson] = relationship("Lesson", back_populates="tasks")
    submissions: Mapped[list[Submission]] = relationship("Submission", back_populates="task")


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)  # for quiz
    code: Mapped[str | None] = mapped_column(Text, nullable=True)  # for code tasks
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # "pending", "completed"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship("User", back_populates="submissions")
    task: Mapped[Task] = relationship("Task", back_populates="submissions")
