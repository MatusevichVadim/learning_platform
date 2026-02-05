import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

# Get schema for submissions table
cursor.execute("PRAGMA table_info(submissions)")
columns = cursor.fetchall()
print("Submissions table schema:")
for col in columns:
    print(f"  {col[1]} {col[2]} {'NOT NULL' if col[3] else 'NULL'} {'DEFAULT ' + str(col[4]) if col[4] else ''}")

# Check if status column exists and what values it has
cursor.execute("SELECT status, COUNT(*) FROM submissions GROUP BY status")
status_counts = cursor.fetchall()
print(f"\nStatus field values:")
for status, count in status_counts:
    print(f"  {status}: {count}")

# Check a few sample records
cursor.execute("SELECT id, user_id, task_id, status, is_correct, result FROM submissions LIMIT 5")
samples = cursor.fetchall()
print(f"\nSample submissions:")
for sample in samples:
    print(f"  ID: {sample[0]}, User: {sample[1]}, Task: {sample[2]}, Status: {sample[3]}, Correct: {sample[4]}, Result: {sample[5]}")

conn.close()