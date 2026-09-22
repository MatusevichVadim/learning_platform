import sqlite3

cur_b = sqlite3.connect('backup.sqlite3')

# integrity inside backup
ub = set(r[0] for r in cur_b.execute('SELECT id FROM users').fetchall())
tb = set(r[0] for r in cur_b.execute('SELECT id FROM tasks').fetchall())
lb = set(r[0] for r in cur_b.execute('SELECT id FROM lessons').fetchall())

su = cur_b.execute('SELECT user_id, COUNT(*) FROM submissions GROUP BY user_id').fetchall()
bad_su = [(u, c) for u, c in su if u not in ub]
print('submissions -> users: total distinct users', len(su), 'orphan rows:', bad_su)

st = cur_b.execute('SELECT task_id, COUNT(*) FROM submissions GROUP BY task_id').fetchall()
bad_st = [(t, c) for t, c in st if t not in tb]
print('submissions -> tasks: total distinct tasks', len(st), 'orphan rows:', bad_st)

# users that will be skipped due to duplicate username (admin=25, test=26)
dup_usernames = {'admin', 'test'}
skip_ids = set(r[0] for r in cur_b.execute("SELECT id FROM users WHERE username IN ('admin','test')").fetchall())
print('backup users skipped (dup username):', sorted(skip_ids))
skipped_subs = cur_b.execute(f"SELECT COUNT(*) FROM submissions WHERE user_id IN ({','.join('?'*len(skip_ids))})", list(skip_ids)).fetchone()[0]
print('submissions referencing skipped users:', skipped_subs)
# which task_ids do those skipped-user submissions reference?
if skipped_subs:
    tids = cur_b.execute(f"SELECT DISTINCT task_id FROM submissions WHERE user_id IN ({','.join('?'*len(skip_ids))})", list(skip_ids)).fetchall()
    print('  distinct task_ids referenced:', sorted(t[0] for t in tids))
    print('  all those task_ids will be migrated (present in backup tasks):', all(t[0] in tb for t in tids))

# total submissions that will migrate
print('total backup submissions:', cur_b.execute('SELECT COUNT(*) FROM submissions').fetchone()[0])