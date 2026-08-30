import os, sys, time, urllib.request, urllib.error, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sqlalchemy import select
from app.db import get_session
from app.models import User
from app.auth import create_access_token

# Wait for server
time.sleep(4)

with get_session() as db:
    user = db.execute(select(User).order_by(User.id)).scalars().first()
    token = create_access_token({"sub": str(user.id)})

url = "http://localhost:8000/api/profile/card"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
try:
    r = urllib.request.urlopen(req, timeout=10)
    print("LIVE CARD STATUS:", r.status)
    print("LIVE CARD BODY:", r.read().decode()[:1500])
except urllib.error.HTTPError as e:
    print("LIVE HTTPError:", e.code, e.read().decode()[:500])
except Exception as e:
    print("LIVE ERR:", type(e).__name__, e)
