import sqlite3

conn = sqlite3.connect('backend_data.sqlite3')
cursor = conn.cursor()

try:
    # Add the status column with default value 'completed'
    cursor.execute("ALTER TABLE submissions ADD COLUMN status VARCHAR(20) DEFAULT 'completed'")
    print("Added status column to submissions table")
    
    # Update all existing records to have 'completed' status
    cursor.execute("UPDATE submissions SET status = 'completed' WHERE status IS NULL")
    print("Updated existing submissions with 'completed' status")
    
    conn.commit()
    print("Migration completed successfully!")
    
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("Status column already exists")
    else:
        print(f"Error: {e}")

finally:
    conn.close()