"""
Migrate all data from backup.sqlite3 into the current database
backend/backend_data.sqlite3.

Strategy:
  - languages:  INSERT OR IGNORE  (python/csharp already exist; cpp/sql/javascript added)
  - users:       INSERT OR IGNORE  (username is UNIQUE; admin/test from backup collide with
                 current DB and are skipped; all other backup users are added)
  - lessons:      INSERT OR IGNORE  (no id overlap with current DB)
  - tasks:        INSERT OR IGNORE  (no id overlap)
  - submissions:  INSERT OR IGNORE, but only rows whose user_id AND task_id both exist
                 in the target after migration (rows referencing skipped users are dropped)

Run:  python backend/_migrate.py
"""
import sqlite3
import sys

BACKUP = "backup.sqlite3"
TARGET = "backend/backend_data.sqlite3"

src = sqlite3.connect(BACKUP)
dst = sqlite3.connect(TARGET)
dst.execute("PRAGMA foreign_keys = ON")
dst.execute("PRAGMA journal_mode = OFF")

# Snapshot current counts before migration
before = {}
for t in ["languages", "users", "lessons", "tasks", "submissions"]:
    before[t] = dst.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
print("before:", before)

# Order matters because of foreign keys: languages -> lessons -> tasks -> submissions.
# users are independent but referenced by submissions, so insert users first.
ORDER = ["languages", "users", "lessons", "tasks", "submissions"]

# For submissions we need to know which user/task ids actually landed in the target.
# Insert everything else first, then compute the surviving id sets.
for table in ["languages", "users", "lessons", "tasks"]:
    cols = [c[1] for c in src.execute(f"PRAGMA table_info('{table}')").fetchall()]
    col_list = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join("?" * len(cols))
    sql = f'INSERT OR IGNORE INTO "{table}" ({col_list}) VALUES ({placeholders})'
    rows = src.execute(f'SELECT {col_list} FROM "{table}"').fetchall()
    dst.executemany(sql, rows)
    dst.commit()
    after = dst.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"{table}: inserted {after - before[table]} of {len(rows)} (now {after})")

# Submissions: keep only rows whose user_id and task_id both exist in target.
valid_users = set(r[0] for r in dst.execute("SELECT id FROM users").fetchall())
valid_tasks = set(r[0] for r in dst.execute("SELECT id FROM tasks").fetchall())

cols = [c[1] for c in src.execute("PRAGMA table_info('submissions')").fetchall()]
col_list = ", ".join(f'"{c}"' for c in cols)
placeholders = ", ".join("?" * len(cols))
sql = f'INSERT OR IGNORE INTO "submissions" ({col_list}) VALUES ({placeholders})'

all_rows = src.execute(f'SELECT {col_list} FROM "submissions"').fetchall()
kept = [r for r in all_rows if r[1] in valid_users and r[2] in valid_tasks]
dropped = len(all_rows) - len(kept)
print(f"submissions: keeping {len(kept)} of {len(all_rows)} (dropped {dropped} referencing skipped users/tasks)")

dst.executemany(sql, kept)
dst.commit()
after = dst.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]
print(f"submissions: inserted {after - before['submissions']} (now {after})")

# Integrity check
issues = []
for table, ref, col in [
    ("submissions", "users", "user_id"),
    ("submissions", "tasks", "task_id"),
    ("tasks", "lessons", "lesson_id"),
    ("lessons", "languages", "language_id"),
]:
    bad = dst.execute(
        f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" NOT IN (SELECT id FROM "{ref}")'
    ).fetchone()[0]
    if bad:
        issues.append(f"{table}.{col} -> {ref}: {bad} orphan rows")
    else:
        print(f"FK ok: {table}.{col} -> {ref}")

if issues:
    print("INTEGRITY ISSUES:")
    for i in issues:
        print("  ", i)
    sys.exit(1)

print("MIGRATION COMPLETE")