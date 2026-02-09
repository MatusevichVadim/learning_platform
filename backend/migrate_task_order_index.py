#!/usr/bin/env python3
"""Add order_index column to tasks table."""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text

# Use the correct database path
DATABASE_URL = "sqlite:///d:/WORK/Python/rrrr/backend_data.sqlite3"

def migrate():
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT name FROM pragma_table_info('tasks') WHERE name = 'order_index'
        """))
        if result.fetchone():
            print("Column 'order_index' already exists in tasks table.")
            return
        
        # Add order_index column with default value based on existing id
        print("Adding order_index column to tasks table...")
        conn.execute(text("""
            ALTER TABLE tasks ADD COLUMN order_index INTEGER DEFAULT 0
        """))
        conn.commit()
        
        # Update existing tasks to have order_index = id (preserves current order)
        print("Updating existing tasks with order_index values...")
        conn.execute(text("""
            UPDATE tasks SET order_index = id
        """))
        conn.commit()
        
        print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
