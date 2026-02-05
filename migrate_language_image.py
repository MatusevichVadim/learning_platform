import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

# Add image_url column to languages table
try:
    cursor.execute('ALTER TABLE languages ADD COLUMN image_url VARCHAR(500)')
    conn.commit()
    print('Column image_url added successfully')
except sqlite3.OperationalError as e:
    if 'duplicate column name' in str(e):
        print('Column image_url already exists')
    else:
        print(f'Error: {e}')

conn.close()
