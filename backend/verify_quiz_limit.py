"""Verify the 3-attempt limit for quiz submissions is enforced server-side.

The client used to track attempts only in localStorage, which could be out of
sync right after a page refresh (the persisted counter is restored
asynchronously). That let a blocked task (3 incorrect answers) be submitted
again on the next render. The server is now the source of truth: it counts
incorrect submissions and rejects any further incorrect answer once the limit
of 3 is reached. Correct answers are always accepted.

Run:  python backend/verify_quiz_limit.py
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR.parent))

_TMP_DB = Path(tempfile.gettempdir()) / "quiz_limit_verify.sqlite3"
if _TMP_DB.exists():
    _TMP_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ.setdefault("APP_SECRET_KEY", "verify-secret-key-for-tests-only")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")

from fastapi.testclient import TestClient  # noqa: E402

from app.db import init_db, engine  # noqa: E402
from app.seed import seed_initial_data  # noqa: E402
from app.main import app  # noqa: E402
from sqlalchemy import text  # noqa: E402

PASS, FAIL = "  [PASS]", "  [FAIL]"
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"{PASS} {name}")
    else:
        print(f"{FAIL} {name} {detail}")
        failures.append(name)


def main() -> None:
    init_db()
    seed_initial_data()
    client = TestClient(app)

    # --- Login as admin and create a fresh student ---
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    check("admin login -> 200", r.status_code == 200, f"got {r.status_code}")
    admin_auth = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.post(
        "/api/admin/users",
        headers=admin_auth,
        json={"username": "quiz_student", "password": "student123", "full_name": "Quiz Student", "role": "user"},
    )
    check("create student", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    student_id = r.json().get("id")

    r = client.put(f"/api/admin/users/{student_id}/languages", headers=admin_auth, json={"language_ids": ["python"]})
    check("assign python language", r.status_code == 200, f"got {r.status_code}")

    r = client.post("/api/auth/login", json={"username": "quiz_student", "password": "student123"})
    check("student login -> 200", r.status_code == 200, f"got {r.status_code}")
    s_auth = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # --- Find a quiz task (seeded correct answer is "A") ---
    with engine.begin() as conn:
        quiz_id = conn.execute(
            text("SELECT id FROM tasks WHERE kind='quiz' ORDER BY id LIMIT 1")
        ).scalar()
    check("found a quiz task", quiz_id is not None)

    # --- Submit 3 incorrect answers (B) ---
    for i in range(1, 4):
        r = client.post(f"/api/tasks/{quiz_id}/submit-quiz", headers=s_auth, json={"answer": "B"})
        check(f"incorrect attempt #{i} -> 200", r.status_code == 200,
              f"got {r.status_code}: {r.text[:200]}")

    # --- The 4th incorrect answer must be rejected (limit reached) ---
    r = client.post(f"/api/tasks/{quiz_id}/submit-quiz", headers=s_auth, json={"answer": "B"})
    check("4th incorrect attempt -> 400 (limit reached)", r.status_code == 400,
          f"got {r.status_code}: {r.text[:200]}")

    # --- A correct answer (A) must still be accepted even after the limit ---
    r = client.post(f"/api/tasks/{quiz_id}/submit-quiz", headers=s_auth, json={"answer": "A"})
    check("correct answer after limit -> 200", r.status_code == 200,
          f"got {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        check("correct answer marked correct", r.json().get("is_correct") is True, f"got {r.json()}")

    # --- The submission endpoint now reports the incorrect attempt count ---
    r = client.get(f"/api/tasks/{quiz_id}/submission", headers=s_auth)
    check("get submission -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        check("submission reports incorrect_attempts", body.get("incorrect_attempts") == 3,
              f"got {body}")

    print()
    if failures:
        print(f"FAILED: {len(failures)} check(s)")
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()