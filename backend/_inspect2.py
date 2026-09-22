import sqlite3

for name in ['backup.sqlite3', 'backend/backend_data.sqlite3']:
    con = sqlite3.connect(name)
    cur = con.cursor()
    print('=' * 60)
    print('DB:', name)
    for t in ['languages', 'lessons', 'tasks', 'users', 'submissions']:
        try:
            rows = cur.execute(f'SELECT id, name, title, username, language, lesson_id, user_id, task_id FROM "{t}" LIMIT 15').fetchall()
            print(f'-- {t} (sample):')
            for r in rows:
                print('   ', r)
        except Exception as e:
            print('  err', t, e)
    con.close()