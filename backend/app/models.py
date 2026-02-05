from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship, Mapped, mapped_column

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=False, index=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    submissions: Mapped[list[Submission]] = relationship("Submission", back_populates="user")


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

    lesson: Mapped[Lesson] = relationship("Lesson", back_populates="tasks")
    submissions: Mapped[list[Submission]] = relationship("Submission", back_populates="task")


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)  # for quiz
    code: Mapped[str | None] = mapped_column(Text, nullable=True)  # for code tasks
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # "pending", "completed"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship("User", back_populates="submissions")
    task: Mapped[Task] = relationship("Task", back_populates="submissions")


class CompetitionRoom(Base):
    __tablename__ = "competition_rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), default="Typing Competition")
    game_time: Mapped[int] = mapped_column(Integer, default=60)  # seconds
    difficulty: Mapped[int] = mapped_column(Integer, default=2)  # 0-5
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    participants: Mapped[list[CompetitionParticipant]] = relationship("CompetitionParticipant", back_populates="room", cascade="all, delete-orphan")


class CompetitionParticipant(Base):
    __tablename__ = "competition_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("competition_rooms.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user_name: Mapped[str] = mapped_column(String(100))
    score: Mapped[int] = mapped_column(Integer, default=0)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    room: Mapped[CompetitionRoom] = relationship("CompetitionRoom", back_populates="participants")
    user: Mapped[User] = relationship("User")


