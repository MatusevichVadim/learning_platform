import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

# Add language_id column to lessons table
try:
    cursor.execute('ALTER TABLE lessons ADD COLUMN language_id VARCHAR(50) REFERENCES languages(id)')
    conn.commit()
    print('Column language_id added successfully')
except sqlite3.OperationalError as e:
    if 'duplicate column name' in str(e):
        print('Column language_id already exists')
    else:
        print(f'Error: {e}')

conn.close()
