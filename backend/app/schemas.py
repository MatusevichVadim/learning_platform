from __future__ import annotations

from datetime import datetime
from typing import Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: str = Field("user", pattern="^(admin|user)$")


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(admin|user)$")
    is_active: Optional[bool] = None
    # Manual rating adjustment applied by an administrator (added to the computed rating).
    rating_bonus: Optional[int] = None


class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime
    # Computed rating from solved tasks + streaks, plus the manual admin bonus.
    rating: int = 0
    rating_bonus: int = 0
    model_config = ConfigDict(from_attributes=True)


UserMeOut = UserOut


class LessonOut(BaseModel):
    id: int
    language: str
    title: str
    order_index: int
    model_config = ConfigDict(from_attributes=True)


class TaskOut(BaseModel):
    id: int
    lesson_id: int
    title: str
    description: str
    kind: str
    test_spec: Optional[str] = None
    order_index: int = 0
    rating: int = 1
    model_config = ConfigDict(from_attributes=True)


class SubmitQuiz(BaseModel):
    answer: str


class SubmitCode(BaseModel):
    code: str


class SubmissionOut(BaseModel):
    id: int
    user_id: int
    task_id: int
    is_correct: bool
    result: Optional[Union[str, dict]] = None
    created_at: datetime
    failed_test_index: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class ProfileSummary(BaseModel):
    total_solved: int
    total_submissions: int
    success_rate: float
    languages_progress: dict[str, dict]


class SubmissionDetail(BaseModel):
    id: int
    task_id: int
    task_title: str
    lesson_title: str
    language: str
    code: Optional[str] = None
    answer: Optional[str] = None
    is_correct: bool
    result: Optional[Union[str, dict]] = None
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
