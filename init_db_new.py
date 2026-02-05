#!/usr/bin/env python3
"""
Initialize new database with correct schema and seed data.
"""

import sqlite3
from datetime import datetime

def init_new_database():
    # Database path
    db_path = "backend/backend_data.sqlite3"

    # Create new database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Drop existing tables if they exist
        print("Dropping existing tables...")
        tables = ['submissions', 'tasks', 'lessons', 'users', 'languages']
        for table in tables:
            try:
                cursor.execute(f'DROP TABLE IF EXISTS {table}')
            except:
                pass

        print("Creating new database schema...")

        # Languages table
        cursor.execute('''
            CREATE TABLE languages (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                is_custom BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Users table
        cursor.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL UNIQUE,
                is_admin BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Lessons table
        cursor.execute('''
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

        # Tasks table
        cursor.execute('''
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

        # Submissions table
        cursor.execute('''
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

        cursor.executemany(
            'INSERT INTO languages (id, name, is_custom) VALUES (?, ?, ?)',
            default_languages
        )

        # Seed sample lessons and tasks
        print("Seeding sample lessons and tasks...")

        # Python lessons
        cursor.execute(
            'INSERT INTO lessons (language, language_id, title, order_index) VALUES (?, ?, ?, ?)',
            ('python', 'python', 'Python Lesson 1', 1)
        )
        lesson1_id = cursor.lastrowid

        cursor.execute(
            'INSERT INTO lessons (language, language_id, title, order_index) VALUES (?, ?, ?, ?)',
            ('python', 'python', 'Python Lesson 2', 2)
        )
        lesson2_id = cursor.lastrowid

        # Sample tasks
        cursor.execute(
            'INSERT INTO tasks (lesson_id, title, description, kind, test_spec) VALUES (?, ?, ?, ?, ?)',
            (lesson1_id, 'Quiz 1', 'Select the correct answer', 'quiz', '{"correct": ["A"], "options": ["Answer A", "Answer B", "Answer C"]}')
        )

        cursor.execute(
            'INSERT INTO tasks (lesson_id, title, description, kind, test_spec) VALUES (?, ?, ?, ?, ?)',
            (lesson1_id, 'Code Task 1', 'Write a function add(a, b) that returns a + b', 'code', '{"tests": [[1,2,3],[5,7,12]]}')
        )

        cursor.execute(
            'INSERT INTO tasks (lesson_id, title, description, kind, test_spec) VALUES (?, ?, ?, ?, ?)',
            (lesson2_id, 'Quiz 2', 'Select the correct answer', 'quiz', '{"correct": ["B"], "options": ["Wrong", "Correct", "Also wrong"]}')
        )

        # C# lessons
        cursor.execute(
            'INSERT INTO lessons (language, language_id, title, order_index) VALUES (?, ?, ?, ?)',
            ('csharp', 'csharp', 'C# Lesson 1', 1)
        )
        csharp_lesson1_id = cursor.lastrowid

        cursor.execute(
            'INSERT INTO tasks (lesson_id, title, description, kind, test_spec) VALUES (?, ?, ?, ?, ?)',
            (csharp_lesson1_id, 'C# Quiz 1', 'Select the correct answer', 'quiz', '{"correct": ["A"], "options": ["Console.WriteLine", "print", "echo"]}')
        )

        # Commit changes
        conn.commit()
        print("Database initialized successfully!")

        # Print summary
        cursor.execute('SELECT COUNT(*) FROM languages')
        lang_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM lessons')
        lesson_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM tasks')
        task_count = cursor.fetchone()[0]

        print("\nDatabase Summary:")
        print(f"  Languages: {lang_count}")
        print(f"  Lessons: {lesson_count}")
        print(f"  Tasks: {task_count}")

    except Exception as e:
        print(f"Error during initialization: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    init_new_database()