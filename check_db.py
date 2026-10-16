import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

# Resolve DB_PATH from backend/.env (same as app.db) so this script inspects
# the SAME database the app actually uses.
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
load_dotenv(BACKEND_DIR / ".env")
DB_PATH = os.getenv("DB_PATH", "backend_data.sqlite3")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(BACKEND_DIR / DB_PATH)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print('Tables:', [t[0] for t in tables])

# Check record counts
for table in tables:
    table_name = table[0]
    cursor.execute(f'SELECT COUNT(*) FROM {table_name}')
    count = cursor.fetchone()[0]
    print(f'{table_name}: {count} records')

# Check some sample data
if 'users' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM users LIMIT 3')
    users = cursor.fetchall()
    print('\nSample users:', users)

if 'lessons' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM lessons LIMIT 3')
    lessons = cursor.fetchall()
    print('\nSample lessons:', lessons)

if 'tasks' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM tasks LIMIT 3')
    tasks = cursor.fetchall()
    print('\nSample tasks:', tasks)

if 'submissions' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM submissions LIMIT 3')
    submissions = cursor.fetchall()
    print('\nSample submissions:', submissions)

conn.close()