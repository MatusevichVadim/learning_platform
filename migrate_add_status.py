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

try:
    # Add the status column with default value 'completed'
    cursor.execute("ALTER TABLE submissions ADD COLUMN status VARCHAR(20) DEFAULT 'completed'")
    print("Added status column to submissions table")
    
    # Update all existing records to have 'completed' status
    cursor.execute("UPDATE submissions SET status = 'completed' WHERE status IS NULL")
    print("Updated existing submissions with 'completed' status")
    
    conn.commit()
    print("Migration completed successfully!")
    
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("Status column already exists")
    else:
        print(f"Error: {e}")

finally:
    conn.close()