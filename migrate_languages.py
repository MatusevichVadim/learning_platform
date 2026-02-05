#!/usr/bin/env python3
"""
Migration script to migrate data from old database to new database with languages table.
"""

import sqlite3
import os
from pathlib import Path

def migrate_database():
    # Paths
    backup_db = "backend_data_backup.sqlite3"
    new_db = "backend/backend_data.sqlite3"

    if not os.path.exists(backup_db):
        print(f"Backup database {backup_db} not found!")
        return

    # Connect to backup database
    backup_conn = sqlite3.connect(backup_db)
    backup_cursor = backup_conn.cursor()

    # Create new database
    new_conn = sqlite3.connect(new_db)
    new_cursor = new_conn.cursor()

    try:
        # Drop existing tables if they exist
        print("Dropping existing tables...")
        tables = ['submissions', 'tasks', 'lessons', 'users', 'languages']
        for table in tables:
            try:
                new_cursor.execute(f'DROP TABLE IF EXISTS {table}')
            except:
                pass

        # Create new schema
        print("Creating new database schema...")

        # Languages table
        new_cursor.execute('''
            CREATE TABLE languages (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                is_custom BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Users table (unchanged)
        new_cursor.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL UNIQUE,
                is_admin BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Lessons table (with language_id)
        new_cursor.execute('''
            CREATE TABLE lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                language VARCHAR(20) NOT NULL,
                language_id VARCHAR(50) NOT NULL,
                title VARCHAR(200) NOT NULL,
                order_index INTEGER NOT NULL,
                additional_info TEXT,
                FOREIGN KEY (language_id) REFERENCES languages (id) ON DELETE CASCADE
            )
        ''')

        # Tasks table (unchanged)
        new_cursor.execute('''
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lesson_id INTEGER NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT NOT NULL,
                kind VARCHAR(20) NOT NULL,
                test_spec TEXT,
                FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE
            )
        ''')

        # Submissions table (unchanged)
        new_cursor.execute('''
            CREATE TABLE submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                answer TEXT,
                code TEXT,
                is_correct BOOLEAN DEFAULT 0,
                result TEXT,
                status VARCHAR(20) DEFAULT 'completed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        ''')

        # Seed default languages
        print("Seeding default languages...")
        default_languages = [
            ('python', 'Python', 0),
            ('csharp', 'C#', 0),
            ('javascript', 'JavaScript', 0),
            ('java', 'Java', 0),
            ('cpp', 'C++', 0),
            ('php', 'PHP', 0),
            ('ruby', 'Ruby', 0),
            ('go', 'Go', 0),
            ('rust', 'Rust', 0),
            ('kotlin', 'Kotlin', 0),
            ('swift', 'Swift', 0),
            ('typescript', 'TypeScript', 0),
        ]

        new_cursor.executemany(
            'INSERT INTO languages (id, name, is_custom) VALUES (?, ?, ?)',
            default_languages
        )

        # Migrate users
        print("Migrating users...")
        backup_cursor.execute('SELECT id, name, is_admin, created_at FROM users')
        users = backup_cursor.fetchall()
        new_cursor.executemany(
            'INSERT OR IGNORE INTO users (id, name, is_admin, created_at) VALUES (?, ?, ?, ?)',
            users
        )

        # Migrate lessons (map language to language_id)
        print("Migrating lessons...")
        backup_cursor.execute('SELECT id, language, title, order_index, additional_info FROM lessons')
        lessons = backup_cursor.fetchall()

        for lesson in lessons:
            lesson_id, language, title, order_index, additional_info = lesson
            # language_id is the same as language for existing data
            new_cursor.execute(
                'INSERT INTO lessons (id, language, language_id, title, order_index, additional_info) VALUES (?, ?, ?, ?, ?, ?)',
                (lesson_id, language, language, title, order_index, additional_info)
            )

        # Migrate tasks
        print("Migrating tasks...")
        backup_cursor.execute('SELECT id, lesson_id, title, description, kind, test_spec FROM tasks')
        tasks = backup_cursor.fetchall()
        new_cursor.executemany(
            'INSERT INTO tasks (id, lesson_id, title, description, kind, test_spec) VALUES (?, ?, ?, ?, ?, ?)',
            tasks
        )

        # Migrate submissions
        print("Migrating submissions...")
        backup_cursor.execute('SELECT id, user_id, task_id, answer, code, is_correct, result, status, created_at FROM submissions')
        submissions = backup_cursor.fetchall()
        new_cursor.executemany(
            'INSERT INTO submissions (id, user_id, task_id, answer, code, is_correct, result, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            submissions
        )

        # Commit changes
        new_conn.commit()
        print("Migration completed successfully!")

        # Print summary
        new_cursor.execute('SELECT COUNT(*) FROM users')
        user_count = new_cursor.fetchone()[0]

        new_cursor.execute('SELECT COUNT(*) FROM lessons')
        lesson_count = new_cursor.fetchone()[0]

        new_cursor.execute('SELECT COUNT(*) FROM tasks')
        task_count = new_cursor.fetchone()[0]

        new_cursor.execute('SELECT COUNT(*) FROM submissions')
        submission_count = new_cursor.fetchone()[0]

        new_cursor.execute('SELECT COUNT(*) FROM languages')
        language_count = new_cursor.fetchone()[0]

        print("\nMigration Summary:")
        print(f"  Users: {user_count}")
        print(f"  Languages: {language_count}")
        print(f"  Lessons: {lesson_count}")
        print(f"  Tasks: {task_count}")
        print(f"  Submissions: {submission_count}")

    except Exception as e:
        print(f"Error during migration: {e}")
        new_conn.rollback()
        raise
    finally:
        backup_conn.close()
        new_conn.close()

if __name__ == "__main__":
    migrate_database()