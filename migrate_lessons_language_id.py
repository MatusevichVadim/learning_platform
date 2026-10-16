import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

# Resolve DB_PATH from backend/.env (same as app.db) so this migration targets
# the SAME database the app actually uses.
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
load_dotenv(BACKEND_DIR / ".env")
DB_PATH = os.getenv("DB_PATH", "backend_data.sqlite3")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(BACKEND_DIR / DB_PATH)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Add language_id column to lessons table
try:
    cursor.execute('ALTER TABLE lessons ADD COLUMN language_id VARCHAR(50) REFERENCES languages(id)')
    conn.commit()
    print('Column language_id added successfully')
except sqlite3.OperationalError as e:
    if 'duplicate column name' in str(e):
        print('Column language_id already exists')
    else:
        print(f'Error: {e}')

conn.close()
