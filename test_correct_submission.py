import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

# Create a correct pending code submission
cursor.execute("""
INSERT INTO submissions (user_id, task_id, code, is_correct, result, status, created_at)
VALUES (1, 2, 'def add(a, b):\n    return a + b  # Correct implementation', 0, 'Ожидает проверки администратором', 'pending', datetime('now'))
""")

conn.commit()
print("Created correct pending submission")

# Get the ID of the new submission
cursor.execute("SELECT id FROM submissions WHERE status = 'pending' ORDER BY id DESC LIMIT 1")
result = cursor.fetchone()
submission_id = result[0] if result else None
print("New submission ID:", submission_id)

conn.close()