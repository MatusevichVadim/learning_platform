import sqlite3

con = sqlite3.connect('backend/backend_data.sqlite3')

print("=== counts ===")
for t in ["languages", "users", "lessons", "tasks", "submissions", "teacher_classes", "user_languages"]:
    print(f"  {t}: {con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}")

print("=== languages ===")
for r in con.execute("SELECT * FROM languages ORDER BY id").fetchall():
    print("  ", r)

print("=== teacher_classes (must be unchanged) ===")
for r in con.execute("SELECT * FROM teacher_classes").fetchall():
    print("  ", r)

print("=== user_languages (must be unchanged) ===")
for r in con.execute("SELECT * FROM user_languages").fetchall():
    print("  ", r)

print("=== current submissions (must be unchanged) ===")
for r in con.execute("SELECT * FROM submissions WHERE id <= 2").fetchall():
    print("  ", r)

print("=== sample migrated users (new) ===")
for r in con.execute("SELECT id, username, role, user_class FROM users WHERE id > 15 ORDER BY id LIMIT 15").fetchall():
    print("  ", r)

print("=== sample migrated lessons ===")
for r in con.execute("SELECT id, language_id, title FROM lessons ORDER BY id LIMIT 8").fetchall():
    print("  ", r)

print("=== sample migrated submissions ===")
for r in con.execute("SELECT id, user_id, task_id, status FROM submissions ORDER BY id LIMIT 5").fetchall():
    print("  ", r)

print("=== orphan check ===")
for table, ref, col in [
    ("submissions", "users", "user_id"),
    ("submissions", "tasks", "task_id"),
    ("tasks", "lessons", "lesson_id"),
    ("lessons", "languages", "language_id"),
]:
    bad = con.execute(f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" NOT IN (SELECT id FROM "{ref}")').fetchone()[0]
    print(f"  {table}.{col} -> {ref}: orphans={bad}")

print("=== sqlite integrity ===")
for r in con.execute("PRAGMA integrity_check").fetchall():
    print("  ", r)