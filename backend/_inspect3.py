import sqlite3

cur_b = sqlite3.connect('backup.sqlite3')
cur_t = sqlite3.connect('backend/backend_data.sqlite3')

for t in ['languages', 'lessons', 'tasks', 'users', 'submissions']:
    ids_b = set(r[0] for r in cur_b.execute(f'SELECT id FROM "{t}"').fetchall())
    ids_t = set(r[0] for r in cur_t.execute(f'SELECT id FROM "{t}"').fetchall())
    print(f'{t}: backup={len(ids_b)} current={len(ids_t)} overlap={len(ids_b & ids_t)} only_backup={len(ids_b - ids_t)} only_current={len(ids_t - ids_b)}')
    if ids_b & ids_t:
        print('   overlap ids:', sorted(ids_b & ids_t)[:20])