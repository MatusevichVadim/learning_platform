import sqlite3

cur_b = sqlite3.connect('backup.sqlite3')
cur_t = sqlite3.connect('backend/backend_data.sqlite3')

for t in ['submissions', 'tasks', 'lessons']:
    ids_b = set(r[0] for r in cur_b.execute(f'SELECT id FROM "{t}"').fetchall())
    ids_t = set(r[0] for r in cur_t.execute(f'SELECT id FROM "{t}"').fetchall())
    print(f'{t}: backup ids {min(ids_b) if ids_b else "-"}..{max(ids_b) if ids_b else "-"} ({len(ids_b)}), current ids {min(ids_t) if ids_t else "-"}..{max(ids_t) if ids_t else "-"} ({len(ids_t)}), overlap={len(ids_b & ids_t)}')
    if ids_b & ids_t:
        print('   overlap ids sample:', sorted(ids_b & ids_t)[:20])

# current submissions detail
print('current submissions:')
for r in cur_t.execute('SELECT * FROM submissions').fetchall():
    print('  ', r)
print('current teacher_classes:')
for r in cur_t.execute('SELECT * FROM teacher_classes').fetchall():
    print('  ', r)
print('current user_languages:')
for r in cur_t.execute('SELECT * FROM user_languages').fetchall():
    print('  ', r)

# backup languages
print('backup languages:')
for r in cur_b.execute('SELECT * FROM languages').fetchall():
    print('  ', r)
print('current languages:')
for r in cur_t.execute('SELECT * FROM languages').fetchall():
    print('  ', r)