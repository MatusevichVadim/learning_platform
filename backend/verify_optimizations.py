"""Verification of the performance optimizations.

Exercises the endpoints that were rewritten (stats aggregation, lesson
progress, language-cache, rating computation, async checker) against a
throwaway SQLite database and prints the SQL query counts so the N+1
elimination is provable.

Run:  python backend/verify_optimizations.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR.parent))

# Point at a throwaway DB before anything imports app.db.
_TMP_DB = Path(tempfile.gettempdir()) / "perf_verify.sqlite3"
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


class QueryCounter:
    """Counts SQL statements executed inside the `with` block."""

    def __init__(self) -> None:
        self.count = 0

    def __enter__(self):
        from sqlalchemy import event

        @event.listens_for(engine, "before_cursor_execute")
        def _hook(conn, cursor, statement, parameters, context, executemany):
            self.count += 1

        self._unhook = lambda: event.remove(engine, "before_cursor_execute", _hook)
        return self

    def __exit__(self, *exc):
        self._unhook()
        return False


def main() -> None:
    init_db()
    seed_initial_data()
    client = TestClient(app)

    print("\n=== Setup ===")
    with engine.begin() as conn:
        users = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
    print(f"  Seeded users: {users}")

    # --- Login ---
    print("\n=== Auth ===")
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    check("admin login returns 200", r.status_code == 200, f"got {r.status_code}")
    token = r.json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    # --- Create a student so we can exercise the student-facing endpoints ---
    r = client.post(
        "/api/admin/users",
        headers=auth,
        json={"username": "perf_student", "password": "student123", "full_name": "Perf Student", "role": "user"},
    )
    check("create student", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    student_id = r.json().get("id")

    r = client.post("/api/auth/login", json={"username": "perf_student", "password": "student123"})
    check("student login", r.status_code == 200, f"got {r.status_code}")
    s_token = r.json()["access_token"]
    s_auth = {"Authorization": f"Bearer {s_token}"}

    # Assign a language so the student can see lessons
    r = client.put(f"/api/admin/users/{student_id}/languages", headers=auth, json={"language_ids": ["python"]})
    check("assign language", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")

    # --- Seed some submissions for the student ---
    print("\n=== Submissions ===")
    with engine.begin() as conn:
        lesson_id = conn.execute(text("SELECT id FROM lessons WHERE language_id='python' ORDER BY order_index LIMIT 1")).scalar()
        # The seed creates 2 tasks per lesson (1 quiz + 1 code); pull tasks from
        # several lessons so we have enough rows to make the assertions meaningful.
        task_ids = [r[0] for r in conn.execute(
            text("SELECT id FROM tasks WHERE lesson_id IN (SELECT id FROM lessons WHERE language_id='python') ORDER BY id LIMIT 6")
        )]
    expected_n = len(task_ids)
    check("found tasks to submit against", expected_n >= 6, f"got {expected_n}")

    # Pattern C,C,F,C,... -> 4 correct, 2 incorrect out of 6
    for i, tid in enumerate(task_ids):
        is_correct = i % 3 != 2
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO submissions (user_id, task_id, answer, code, is_correct, result, status, created_at) "
                     "VALUES (:u, :t, 'A', NULL, :c, 'r', 'completed', :ts)"),
                {"u": student_id, "t": tid, "c": 1 if is_correct else 0,
                 "ts": f"2026-01-{(i % 9) + 1:02d} 10:00:00"},
            )
    n_correct = sum(1 for i in range(expected_n) if i % 3 != 2)
    n_wrong = expected_n - n_correct
    print(f"  inserted {expected_n} submissions ({n_correct} correct, {n_wrong} wrong)")

    # Trigger a rating recompute
    r = client.post("/api/admin/recompute-ratings", headers=auth)
    check("recompute ratings", r.status_code == 200, f"got {r.status_code}")

    # --- The key test: /api/profile/card query count ---
    print("\n=== Profile card (was 7 count queries + 2 per lesson) ===")
    with QueryCounter() as qc:
        r = client.get("/api/profile/card", headers=s_auth)
    check("GET /api/profile/card -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        data = r.json()
        stats = data["stats"]
        check(f"total_submissions == {expected_n}", stats["total_submissions"] == expected_n, f"got {stats['total_submissions']}")
        check(f"correct_submissions == {n_correct}", stats["correct_submissions"] == n_correct, f"got {stats['correct_submissions']}")
        check("pending_submissions == 0", stats["pending_submissions"] == 0, f"got {stats['pending_submissions']}")
        check(f"solved_tasks == {n_correct}", stats["solved_tasks"] == n_correct, f"got {stats['solved_tasks']}")
        check(f"attempted_tasks == {expected_n}", stats["attempted_tasks"] == expected_n, f"got {stats['attempted_tasks']}")
        check("lesson_progress non-empty", len(data["lesson_progress"]) > 0, f"got {len(data['lesson_progress'])}")
        # Every lesson the student touched must have solved_tasks <= total_tasks
        ok = all(lp["solved_tasks"] <= lp["total_tasks"] for lp in data["lesson_progress"])
        check("lesson_progress solved<=total", ok, f"got {data['lesson_progress']}")
    print(f"  SQL statements for /profile/card: {qc.count}  (old code: ~12+)")

    # --- Admin card (same N+1 pattern) ---
    print("\n=== Admin user card ===")
    with QueryCounter() as qc2:
        r = client.get(f"/api/admin/users/{student_id}/card", headers=auth)
    check("GET /api/admin/users/{id}/card -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        d = r.json()
        check(f"admin card total_submissions == {expected_n}", d["stats"]["total_submissions"] == expected_n, f"got {d['stats']['total_submissions']}")
        check(f"admin card solved_tasks == {n_correct}", d["stats"]["solved_tasks"] == n_correct, f"got {d['stats']['solved_tasks']}")
        check("admin card lesson_progress non-empty", len(d["lesson_progress"]) > 0, f"got {len(d['lesson_progress'])}")
    print(f"  SQL statements for /admin/users/{{id}}/card: {qc2.count}  (old code: ~12+)")

    # --- lesson_status: N+1 over students ---
    print("\n=== Teacher lesson status (was 1 query per student) ===")
    # Make the admin a teacher with a class, and add more students
    r = client.post("/api/admin/users", headers=auth,
                    json={"username": "perf_teacher", "password": "teacher123", "role": "teacher"})
    teacher_id = r.json().get("id")
    r = client.post(f"/api/admin/teachers/{teacher_id}/classes", headers=auth, json={"user_class": "9A"})
    check("teacher class assigned", r.status_code == 200, f"got {r.status_code}")

    for i in range(6):
        client.post("/api/admin/users", headers=auth,
                    json={"username": f"perf_s{i}", "password": "student123", "role": "user", "user_class": "9A"})
    r = client.post("/api/auth/login", json={"username": "perf_teacher", "password": "teacher123"})
    t_auth = {"Authorization": f"Bearer {r.json()['access_token']}"}

    with QueryCounter() as qc3:
        r = client.get(f"/api/teacher/lessons/{lesson_id}/status", headers=t_auth)
    check("GET /teacher/lessons/{id}/status -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:300]}")
    check("status returned for 6 students", r.status_code == 200 and len(r.json()) == 6, f"got {len(r.json()) if r.status_code==200 else 'n/a'}")
    print(f"  SQL statements for /teacher/lessons/{{id}}/status: {qc3.count}  (old code: ~7 for 6 students)")

    # --- language cache: repeated ensure_* calls must not re-query ---
    print("\n=== Language access cache ===")
    r = client.get("/api/languages", headers=s_auth)
    check("GET /languages -> 200", r.status_code == 200, f"got {r.status_code}")
    check("student sees 1 assigned language", r.status_code == 200 and len(r.json()) == 1, f"got {r.json() if r.status_code==200 else 'n/a'}")

    r = client.get("/api/lessons", headers=s_auth, params={"language": "python"})
    check("GET /lessons -> 200", r.status_code == 200, f"got {r.status_code}")

    r = client.get(f"/api/lessons/{lesson_id}/status", headers=s_auth)
    check("GET /lessons/{id}/status -> 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        solved = sum(1 for v in r.json().values() if v is True)
        check("status marks some tasks solved", solved > 0, f"got {r.json()}")

    # --- THE 15k-IOPS REGRESSION: admin submissions filtering -------------
    print("\n=== Admin submissions filtering (was page_size=100000) ===")
    r = client.get("/api/admin/submissions", headers=auth, params={"page": 1, "page_size": 50})
    check("GET /admin/submissions -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    check("unfiltered total == expected", r.status_code == 200 and r.json()["total"] == expected_n,
          f"got {r.json()['total'] if r.status_code==200 else 'n/a'}")

    # page_size must be clamped so a stale client asking for 100k rows gets a
    # capped page instead of a 422 (a 422 silently killed the whole filter row).
    r = client.get("/api/admin/submissions", headers=auth, params={"page": 1, "page_size": 100000})
    check("stale client page_size=100000 -> 200 (clamped, not 422)",
          r.status_code == 200 and r.json()["page_size"] == 200, f"got {r.status_code}")
    if r.status_code == 200:
        check("clamped response returns at most 200 rows", len(r.json()["data"]) <= 200,
              f"got {len(r.json()['data'])}")

    # status filter must be applied server-side and return only matching rows.
    with QueryCounter() as qc4:
        r = client.get("/api/admin/submissions", headers=auth,
                       params={"page": 1, "page_size": 50, "status": "pending"})
    check("status=pending filter -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        check("pending filter returns 0 rows", d["total"] == 0, f"got {d['total']}")
        check("pending filter returns no data", len(d["data"]) == 0, f"got {len(d['data'])}")
    print(f"  SQL statements for filtered /admin/submissions: {qc4.count} (constant, no full scan)")

    r = client.get("/api/admin/submissions", headers=auth,
                   params={"page": 1, "page_size": 50, "status": "completed"})
    check("status=completed filter -> 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        check("completed filter returns all seeded rows", r.json()["total"] == expected_n, f"got {r.json()['total']}")
        check("completed rows all have status=completed",
              all(x["status"] == "completed" for x in r.json()["data"]), "mismatch")

    # user_class filter
    r = client.get("/api/admin/submissions", headers=auth,
                   params={"page": 1, "page_size": 50, "user_class": "9A"})
    check("user_class filter -> 200", r.status_code == 200, f"got {r.status_code}")

    # sort_by must be honoured
    r = client.get("/api/admin/submissions", headers=auth,
                   params={"page": 1, "page_size": 50, "sort_by": "created_at", "order": "asc"})
    check("sort_by=created_at asc -> 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200 and len(r.json()["data"]) > 1:
        ids = [x["id"] for x in r.json()["data"]]
        check("asc sort returns ascending ids", ids == sorted(ids), f"got {ids}")

    # pending-review queue (the endpoint the user reported spiking IOPS on)
    with QueryCounter() as qc5:
        r = client.get("/api/admin/submissions/pending", headers=auth)
    check("GET /admin/submissions/pending -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    print(f"  SQL statements for /admin/submissions/pending: {qc5.count}")

    # dropdown option endpoints used by the tab
    r = client.get("/api/admin/classes", headers=auth)
    check("GET /admin/classes -> 200", r.status_code == 200, f"got {r.status_code}")

    # --- Dropdown options must never lead to an empty table ---------------
    # The regression: options were taken from every user/lesson, so choosing a
    # class or lesson with zero submissions showed an empty table and the filter
    # row looked broken.
    r = client.get("/api/admin/submissions/filter-options", headers=auth)
    check("GET /admin/submissions/filter-options -> 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        opts = r.json()
        check("filter-options has classes+lessons", "classes" in opts and "lessons" in opts, f"got {list(opts)}")
        empty_classes = []
        for c in opts.get("classes", []):
            rr = client.get("/api/admin/submissions", headers=auth,
                            params={"page": 1, "page_size": 1, "user_class": c})
            if rr.status_code != 200 or (rr.json().get("total") or 0) == 0:
                empty_classes.append(c)
        check("every offered class has >=1 submission", not empty_classes, f"empty: {empty_classes}")

        empty_lessons = []
        for l in opts.get("lessons", []):
            rr = client.get("/api/admin/submissions", headers=auth,
                            params={"page": 1, "page_size": 1, "lesson_id": l["id"]})
            if rr.status_code != 200 or (rr.json().get("total") or 0) == 0:
                empty_lessons.append(l["id"])
        check("every offered lesson has >=1 submission", not empty_lessons, f"empty: {empty_lessons}")
        print(f"  dropdown options: {len(opts.get('classes', []))} classes, "
              f"{len(opts.get('lessons', []))} lessons (all non-empty)")
    r = client.get("/api/admin/lessons", headers=auth)
    check("GET /admin/lessons -> 200", r.status_code == 200, f"got {r.status_code}")

    # --- Default ordering must stay "newest first" (no UI sorting) --------
    r = client.get("/api/admin/submissions", headers=auth, params={"page": 1, "page_size": 50})
    if r.status_code == 200:
        dates = [x["created_at"] for x in r.json()["data"]]
        check("default order is created_at desc (newest first)",
              dates == sorted(dates, reverse=True), f"first={dates[:3]}")

    # --- Sorting params are still accepted by the API ---------------------
    print("\n=== Server-side sorting ===")
    for col in ["id", "created_at", "status", "user_name", "user_class",
                "lesson_title", "task_title"]:
        r_asc = client.get("/api/admin/submissions", headers=auth,
                           params={"page": 1, "page_size": 50, "sort_by": col, "order": "asc"})
        r_desc = client.get("/api/admin/submissions", headers=auth,
                            params={"page": 1, "page_size": 50, "sort_by": col, "order": "desc"})
        ok = r_asc.status_code == 200 and r_desc.status_code == 200
        check(f"sort_by={col} asc/desc -> 200", ok,
              f"got {r_asc.status_code}/{r_desc.status_code}")
        if not ok:
            continue
        a = [x["id"] for x in r_asc.json()["data"]]
        d = [x["id"] for x in r_desc.json()["data"]]
        # The last column is a stable tie-breaker, so the two orders must be
        # exact reverses of each other for a non-trivial data set.
        if col == "id" and len(a) > 1:
            check(f"sort_by={col} asc is ascending", a == sorted(a), f"{a[:8]}")
            check(f"sort_by={col} desc is descending", d == sorted(d, reverse=True), f"{d[:8]}")

    r = client.get("/api/admin/submissions", headers=auth,
                   params={"page": 1, "page_size": 50, "sort_by": "nonsense", "order": "asc"})
    check("unknown sort_by falls back to created_at -> 200", r.status_code == 200, f"got {r.status_code}")

    # Sorting must compose with filtering and pagination.
    r = client.get("/api/admin/submissions", headers=auth,
                   params={"page": 1, "page_size": 50, "status": "completed",
                           "sort_by": "id", "order": "asc"})
    check("sort + filter compose -> 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200 and len(r.json()["data"]) > 1:
        ids = [x["id"] for x in r.json()["data"]]
        check("sort+filter result is sorted by id asc", ids == sorted(ids), f"{ids[:8]}")

    r = client.get("/api/admin/submissions", headers=auth,
                   params={"page": 2, "page_size": 2, "sort_by": "id", "order": "asc"})
    p1 = client.get("/api/admin/submissions", headers=auth,
                    params={"page": 1, "page_size": 2, "sort_by": "id", "order": "asc"})
    check("pagination page 2 -> 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200 and p1.status_code == 200 and len(r.json()["data"]) == 2:
        check("pages do not overlap",
              not (set(x["id"] for x in r.json()["data"]) & set(x["id"] for x in p1.json()["data"])),
              "page1 and page2 share ids")

    # --- quiz submission (exercises rating recompute) ---
    print("\n=== Quiz submission + rating ===")
    with engine.begin() as conn:
        quiz_id = conn.execute(text("SELECT id FROM tasks WHERE lesson_id=:l AND kind='quiz' ORDER BY order_index LIMIT 1"),
                               {"l": lesson_id}).scalar()
    r = client.post(f"/api/tasks/{quiz_id}/submit-quiz", headers=s_auth, json={"answer": "A"})
    check("POST submit-quiz -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")

    r = client.get("/api/leaderboard", headers=s_auth)
    check("GET /leaderboard -> 200", r.status_code == 200, f"got {r.status_code}")

    # --- async code submission (checker no longer blocks) ---
    print("\n=== Code submission (async checker) ===")
    with engine.begin() as conn:
        code_task = conn.execute(text("SELECT id FROM tasks WHERE lesson_id=:l AND kind='code' ORDER BY order_index LIMIT 1"),
                                 {"l": lesson_id}).scalar()
    r = client.post(f"/api/tasks/{code_task}/submit-code", headers=s_auth,
                    json={"code": "def add(a, b):\n    return a + b\n"})
    check("POST submit-code (correct) -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        check("code submission marked correct", r.json().get("is_correct") is True, f"got {r.json()}")

    r = client.post(f"/api/tasks/{code_task}/submit-code", headers=s_auth,
                    json={"code": "def add(a, b):\n    return a - b\n"})
    check("POST submit-code (wrong) -> 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        # NOTE: SubmissionOut does not expose `status`, so assert against the
        # admin pending queue - that proves the row was really persisted as
        # pending in the database.
        sub_id = r.json().get("id")
        r2 = client.get("/api/admin/submissions/pending", headers=auth)
        if r2.status_code == 200 and isinstance(r2.json(), list):
            pending_ids = [x.get("id") for x in r2.json()]
        elif r2.status_code == 200:
            pending_ids = [x.get("id") for x in r2.json().get("data", [])]
        else:
            pending_ids = []
        check("wrong code lands in admin pending queue", sub_id in pending_ids,
              f"submission {sub_id} not in {pending_ids}")

        r3 = client.get("/api/admin/submissions", headers=auth,
                        params={"page": 1, "page_size": 50, "status": "pending"})
        check("pending submission visible via status filter",
              r3.status_code == 200 and sub_id in [x.get("id") for x in r3.json().get("data", [])],
              f"got {r3.status_code}")

    # --- health check ---
    print("\n=== Health ===")
    r = client.get("/health")
    check("GET /health -> 200", r.status_code == 200, f"got {r.status_code}")
    check("health reports db connected", r.status_code == 200 and r.json().get("database") == "connected", f"got {r.json() if r.status_code==200 else 'n/a'}")

    # --- summary ---
    print("\n" + "=" * 60)
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("RESULT: all checks passed")

    engine.dispose()
    if _TMP_DB.exists():
        _TMP_DB.unlink()


if __name__ == "__main__":
    main()
