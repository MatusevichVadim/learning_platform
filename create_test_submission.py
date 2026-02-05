import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

# Create a pending code submission for testing
cursor.execute("""
INSERT INTO submissions (user_id, task_id, code, is_correct, result, status, created_at)
VALUES (1, 2, 'def add(a, b):\n    return a + b', 0, 'Ожидает проверки администратором', 'pending', datetime('now'))
""")

conn.commit()
print("Created test pending submission")

# Check the submission
cursor.execute("SELECT * FROM submissions WHERE status = 'pending' ORDER BY id DESC LIMIT 1")
result = cursor.fetchone()
print("Test submission:", result)

conn.close()