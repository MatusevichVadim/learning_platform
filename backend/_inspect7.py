import sqlite3

for name in ['backup.sqlite3', 'backend/backend_data.sqlite3']:
    con = sqlite3.connect(name)
    cur = con.cursor()
    print('=' * 60)
    print('DB:', name)
    for t in ['users', 'languages', 'lessons', 'tasks', 'submissions']:
        print('  table_info', t)
        for r in cur.execute(f'PRAGMA table_info("{t}")').fetchall():
            print('    ', r)
        for r in cur.execute(f'PRAGMA index_list("{t}")').fetchall():
            print('    index', r)
    con.close()