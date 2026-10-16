import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

def get_schema(db_path, table_name):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    conn.close()
    return columns

# Resolve DB_PATH from backend/.env (same as app.db) so this script inspects
# the SAME database the app actually uses.
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
load_dotenv(BACKEND_DIR / ".env")
DB_PATH = os.getenv("DB_PATH", "backend_data.sqlite3")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(BACKEND_DIR / DB_PATH)

# Backup DB is the active DB with a _backup suffix (same convention used by
# the migration scripts), so it always tracks the single source of truth.
backup_path = str(Path(DB_PATH).with_suffix("")) + "_backup.sqlite3"

# Check lessons table in backup
if os.path.exists(backup_path):
    backup_schema = get_schema(backup_path, 'lessons')
    print("Backup DB lessons schema:")
    for col in backup_schema:
        print(f"  {col[1]} {col[2]} {'NOT NULL' if col[3] else 'NULL'} {'DEFAULT ' + str(col[4]) if col[4] else ''}")
else:
    print(f"Backup DB not found at {backup_path}")

# Check lessons table in main
main_schema = get_schema(DB_PATH, 'lessons')
print("\nMain DB lessons schema:")
for col in main_schema:
    print(f"  {col[1]} {col[2]} {'NOT NULL' if col[3] else 'NULL'} {'DEFAULT ' + str(col[4]) if col[4] else ''}")

# Check languages table in main
lang_schema = get_schema(DB_PATH, 'languages')
print("\nMain DB languages schema:")
for col in lang_schema:
    print(f"  {col[1]} {col[2]} {'NOT NULL' if col[3] else 'NULL'} {'DEFAULT ' + str(col[4]) if col[4] else ''}")

# Check if python language exists in main
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT id, name FROM languages WHERE id = 'python'")
python_lang = cursor.fetchone()
print(f"\nPython language in main DB: {python_lang}")
conn.close()