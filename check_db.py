import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print('Tables:', [t[0] for t in tables])

# Check record counts
for table in tables:
    table_name = table[0]
    cursor.execute(f'SELECT COUNT(*) FROM {table_name}')
    count = cursor.fetchone()[0]
    print(f'{table_name}: {count} records')

# Check some sample data
if 'users' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM users LIMIT 3')
    users = cursor.fetchall()
    print('\nSample users:', users)

if 'lessons' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM lessons LIMIT 3')
    lessons = cursor.fetchall()
    print('\nSample lessons:', lessons)

if 'tasks' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM tasks LIMIT 3')
    tasks = cursor.fetchall()
    print('\nSample tasks:', tasks)

if 'submissions' in [t[0] for t in tables]:
    cursor.execute('SELECT * FROM submissions LIMIT 3')
    submissions = cursor.fetchall()
    print('\nSample submissions:', submissions)

conn.close()