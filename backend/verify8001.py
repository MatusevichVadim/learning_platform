import os, sys, time, urllib.request, urllib.error, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sqlalchemy import select
from app.db import get_session
from app.models import User
from app.auth import create_access_token

time.sleep(4)

with get_session() as db:
    user = db.execute(select(User).order_by(User.id)).scalars().first()
    token = create_access_token({"sub": str(user.id)})

url = "http://127.0.0.1:8001/api/profile/card"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
try:
    r = urllib.request.urlopen(req, timeout=10)
    body = json.loads(r.read().decode())
    out = []
    out.append("STATUS: " + str(r.status))
    out.append("USER: " + json.dumps(body["user"], ensure_ascii=False))
    out.append("STATS: " + json.dumps(body["stats"], ensure_ascii=False))
    out.append("SUBMISSIONS COUNT: " + str(len(body["submissions"])))
    if body["submissions"]:
        out.append("FIRST SUBMISSION: " + json.dumps(body["submissions"][0], ensure_ascii=False))
except urllib.error.HTTPError as e:
    out = ["HTTPError: " + str(e.code) + " " + e.read().decode()[:300]]
except Exception as e:
    out = ["ERR: " + type(e).__name__ + " " + str(e)]

with open("verify8001_out.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
