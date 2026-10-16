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

# Add image_url column to languages table
try:
    cursor.execute('ALTER TABLE languages ADD COLUMN image_url VARCHAR(500)')
    conn.commit()
    print('Column image_url added successfully')
except sqlite3.OperationalError as e:
    if 'duplicate column name' in str(e):
        print('Column image_url already exists')
    else:
        print(f'Error: {e}')

conn.close()
