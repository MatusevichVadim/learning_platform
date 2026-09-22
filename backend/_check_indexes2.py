import sqlite3

con = sqlite3.connect('backend/backend_data.sqlite3')
for t in ['users', 'languages', 'lessons', 'tasks', 'submissions']:
    print('=' * 40, t)
    for r in con.execute(f"PRAGMA index_list('{t}')").fetchall():
        info = con.execute("SELECT sql FROM sqlite_master WHERE type='index' AND name=?", (r[1],)).fetchone()
        print('  ', r, '| sql:', info[0] if info else None)