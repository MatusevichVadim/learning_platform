import sqlite3

# Paths to databases
backup_db = 'backend/backend_data_backup.sqlite3'
main_db = 'backend/backend_data.sqlite3'

# Connect to databases
backup_conn = sqlite3.connect(backup_db)
backup_cursor = backup_conn.cursor()

main_conn = sqlite3.connect(main_db)
main_cursor = main_conn.cursor()

# Get all Python lessons from backup
backup_cursor.execute("SELECT id, language, title, order_index FROM lessons WHERE language = 'python' ORDER BY order_index")
backup_lessons = backup_cursor.fetchall()

print(f"Found {len(backup_lessons)} Python lessons in backup DB.")

# For each lesson, check if it exists in main DB by title
for lesson in backup_lessons:
    old_id, language, title, order_index = lesson

    # Check if lesson with this title exists in main
    main_cursor.execute("SELECT id FROM lessons WHERE title = ? AND language = 'python'", (title,))
    existing = main_cursor.fetchone()

    if existing:
        print(f"Lesson '{title}' already exists in main DB (ID: {existing[0]}). Skipping.")
        new_lesson_id = existing[0]
    else:
        # Insert into main DB
        main_cursor.execute("""
            INSERT INTO lessons (language, language_id, title, order_index, additional_info)
            VALUES (?, ?, ?, ?, ?)
        """, (language, 'python', title, order_index, None))
        new_lesson_id = main_cursor.lastrowid
        print(f"Inserted lesson '{title}' with new ID: {new_lesson_id}")

    # Now migrate tasks for this lesson
    backup_cursor.execute("SELECT id, title, description, kind, test_spec FROM tasks WHERE lesson_id = ?", (old_id,))
    tasks = backup_cursor.fetchall()

    for task in tasks:
        task_id, task_title, description, kind, test_spec = task

        # Check if task exists by title and lesson_id
        main_cursor.execute("SELECT id FROM tasks WHERE title = ? AND lesson_id = ?", (task_title, new_lesson_id))
        existing_task = main_cursor.fetchone()

        if existing_task:
            print(f"  Task '{task_title}' already exists. Skipping.")
        else:
            main_cursor.execute("""
                INSERT INTO tasks (lesson_id, title, description, kind, test_spec)
                VALUES (?, ?, ?, ?, ?)
            """, (new_lesson_id, task_title, description, kind, test_spec))
            print(f"  Inserted task '{task_title}' for lesson '{title}'")

# Commit changes
main_conn.commit()

# Close connections
backup_conn.close()
main_conn.close()

print("Migration completed.")