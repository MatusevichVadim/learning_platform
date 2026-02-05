from __future__ import annotations

from datetime import datetime
from typing import Optional, Union

from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    name: str


class AdminLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    is_admin: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


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


