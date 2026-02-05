import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

# Create a new pending code submission for testing
cursor.execute("""
INSERT INTO submissions (user_id, task_id, code, is_correct, result, status, created_at)
VALUES (1, 2, 'def add(a, b):\n    return a + b + 1  # Wrong implementation', 0, 'Ожидает проверки администратором', 'pending', datetime('now'))
""")

conn.commit()
print("Created new pending submission")

# Get the ID of the new submission
cursor.execute("SELECT id FROM submissions WHERE status = 'pending' ORDER BY id DESC LIMIT 1")
result = cursor.fetchone()
print("New submission ID:", result[0] if result else "None")

conn.close()