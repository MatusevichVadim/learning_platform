import sqlite3

def get_schema(db_path, table_name):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    conn.close()
    return columns

# Check lessons table in backup
backup_schema = get_schema('backend/backend_data_backup.sqlite3', 'lessons')
print("Backup DB lessons schema:")
for col in backup_schema:
    print(f"  {col[1]} {col[2]} {'NOT NULL' if col[3] else 'NULL'} {'DEFAULT ' + str(col[4]) if col[4] else ''}")

# Check lessons table in main
main_schema = get_schema('backend/backend_data.sqlite3', 'lessons')
print("\nMain DB lessons schema:")
for col in main_schema:
    print(f"  {col[1]} {col[2]} {'NOT NULL' if col[3] else 'NULL'} {'DEFAULT ' + str(col[4]) if col[4] else ''}")

# Check languages table in main
lang_schema = get_schema('backend/backend_data.sqlite3', 'languages')
print("\nMain DB languages schema:")
for col in lang_schema:
    print(f"  {col[1]} {col[2]} {'NOT NULL' if col[3] else 'NULL'} {'DEFAULT ' + str(col[4]) if col[4] else ''}")

# Check if python language exists in main
conn = sqlite3.connect('backend/backend_data.sqlite3')
cursor = conn.cursor()
cursor.execute("SELECT id, name FROM languages WHERE id = 'python'")
python_lang = cursor.fetchone()
print(f"\nPython language in main DB: {python_lang}")
conn.close()