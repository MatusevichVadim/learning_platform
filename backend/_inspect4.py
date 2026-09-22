import sqlite3

cur_b = sqlite3.connect('backup.sqlite3')
cur_t = sqlite3.connect('backend/backend_data.sqlite3')

# usernames overlap
ub = set(r[0] for r in cur_b.execute('SELECT username FROM users').fetchall())
ut = set(r[0] for r in cur_t.execute('SELECT username FROM users').fetchall())
print('usernames backup:', sorted(ub))
print('usernames current:', sorted(ut))
print('usernames overlap:', sorted(ub & ut))

# roles
print('roles backup:', sorted(set(r[0] for r in cur_b.execute('SELECT DISTINCT role FROM users').fetchall())))
print('roles current:', sorted(set(r[0] for r in cur_t.execute('SELECT DISTINCT role FROM users').fetchall())))

# user_class values current
print('user_class current:', sorted(set(str(r[0]) for r in cur_t.execute('SELECT DISTINCT user_class FROM users').fetchall())))

# current users sample
print('current users:')
for r in cur_t.execute('SELECT * FROM users').fetchall():
    print('  ', r)

# check FK constraints on current db
print('foreign keys current:')
for r in cur_t.execute("PRAGMA foreign_key_list('submissions')").fetchall():
    print('  submissions:', r)
for r in cur_t.execute("PRAGMA foreign_key_list('tasks')").fetchall():
    print('  tasks:', r)
for r in cur_t.execute("PRAGMA foreign_key_list('lessons')").fetchall():
    print('  lessons:', r)