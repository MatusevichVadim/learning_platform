import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

# Resolve DB_PATH from backend/.env (same as app.db) so this script writes to
# the SAME database the app actually uses.
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
load_dotenv(BACKEND_DIR / ".env")
DB_PATH = os.getenv("DB_PATH", "backend_data.sqlite3")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(BACKEND_DIR / DB_PATH)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Create a pending code submission for testing
cursor.execute("""
INSERT INTO submissions (user_id, task_id, code, is_correct, result, status, created_at)
VALUES (1, 2, 'def add(a, b):\n    return a + b', 0, 'Ожидает проверки администратором', 'pending', datetime('now'))
""")

conn.commit()
print("Created test pending submission")

# Check the submission
cursor.execute("SELECT * FROM submissions WHERE status = 'pending' ORDER BY id DESC LIMIT 1")
result = cursor.fetchone()
print("Test submission:", result)

conn.close()