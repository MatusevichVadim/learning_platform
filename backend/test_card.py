import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db import get_session
from app.models import User
from app.auth import create_access_token

client = TestClient(app)

with get_session() as db:
    user = db.execute(select(User).order_by(User.id)).scalars().first()
    assert user, "No user in DB"
    print("USING USER:", user.id, user.username, "role=", user.role, "active=", user.is_active)
    token = create_access_token({"sub": str(user.id)})

headers = {"Authorization": f"Bearer {token}"}

# 1) No token -> should be 401 (proves route exists)
r0 = client.get("/api/profile/card")
print("NO-AUTH STATUS:", r0.status_code)

# 2) With token -> should be 200 with data
r = client.get("/api/profile/card", headers=headers)
print("CARD STATUS:", r.status_code)
print("CARD BODY:", r.text[:2000])
