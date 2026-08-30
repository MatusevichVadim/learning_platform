from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_access_token, verify_password
from ..config import ACCESS_TOKEN_EXPIRE_MINUTES, SECURE_COOKIES
from ..db import get_session
from ..deps import COOKIE_NAME, get_current_user
from ..models import User
from ..schemas import UserLogin, UserMeOut

router = APIRouter(tags=["auth"])


def get_db() -> Session:
    with get_session() as session:
        yield session


@router.post("/login")
def login(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    stmt = select(User).where(User.username == payload.username)
    user = db.execute(stmt).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Учетная запись заблокирована")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=SECURE_COOKIES,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return {
        "user": UserMeOut.model_validate(user).model_dump(),
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
    }


@router.get("/me", response_model=UserMeOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}
  
