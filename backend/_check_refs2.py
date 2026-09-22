import sqlite3

cur_t = sqlite3.connect('backend/backend_data.sqlite3')
print('current users indexes:')
for r in cur_t.execute("PRAGMA index_list('users')").fetchall():
    print('  ', r)
    # get sql
    info = cur_t.execute("SELECT sql FROM sqlite_master WHERE type='index' AND name=?", (r[1],)).fetchone()
    print('    sql:', info[0] if info else None)
print('current languages indexes:')
for r in cur_t.execute("PRAGMA index_list('languages')").fetchall():
    print('  ', r)
print('current tasks indexes:')
for r in cur_t.execute("PRAGMA index_list('tasks')").fetchall():
    print('  ', r)
print('current lessons indexes:')
for r in cur_t.execute("PRAGMA index_list('lessons')").fetchall():
    print('  ', r)
print('current submissions indexes:')
for r in cur_t.execute("PRAGMA index_list('submissions')").fetchall():
    print('  ', r)