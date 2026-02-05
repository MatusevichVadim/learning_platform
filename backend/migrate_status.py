#!/usr/bin/env python3
"""
Migration script to add status column to submissions table
"""

import sqlite3
import os

def migrate_database():
    # Get the database path
    db_path = os.path.join(os.path.dirname(__file__), '..', 'backend_data.sqlite3')
    
    if not os.path.exists(db_path):
        print(f"Database file not found at {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if status column exists
        cursor.execute("PRAGMA table_info(submissions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'status' not in columns:
            print("Adding status column to submissions table...")
            cursor.execute("ALTER TABLE submissions ADD COLUMN status VARCHAR(20) DEFAULT 'completed'")
            
            # Update all existing records to have 'completed' status
            cursor.execute("UPDATE submissions SET status = 'completed' WHERE status IS NULL")
            
            conn.commit()
            print("Migration completed successfully!")
        else:
            print("Status column already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()