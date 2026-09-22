import sqlite3

cur_b = sqlite3.connect('backup.sqlite3')
cur_t = sqlite3.connect('backend/backend_data.sqlite3')

ub = cur_b.execute('SELECT id, username, role FROM users ORDER BY id').fetchall()
print('backup users ids:', ub[0][0], '..', ub[-1][0], 'count', len(ub))
print('backup users with id<=15:', [r for r in ub if r[0] <= 15])
print('current users ids:', [r[0] for r in cur_t.execute('SELECT id FROM users ORDER BY id').fetchall()])

# lesson_id referenced by backup tasks
lids_b = set(r[0] for r in cur_b.execute('SELECT id FROM lessons').fetchall())
bad_tasks = cur_b.execute('SELECT id, lesson_id FROM tasks WHERE lesson_id NOT IN ({})'.format(','.join('?'*len(lids_b))), list(lids_b)).fetchall()
print('backup tasks with unknown lesson_id:', bad_tasks[:10], 'count', len(bad_tasks))

# language_id referenced by backup lessons
langids_b = set(r[0] for r in cur_b.execute('SELECT id FROM languages').fetchall())
bad_lessons = cur_b.execute('SELECT id, language_id FROM lessons WHERE language_id NOT IN ({})'.format(','.join('?'*len(langids_b))), list(langids_b)).fetchall()
print('backup lessons with unknown language_id:', bad_lessons[:10], 'count', len(bad_lessons))

# backup submissions references
s_user = set(r[0] for r in cur_b.execute('SELECT user_id FROM submissions').fetchall())
s_task = set(r[0] for r in cur_b.execute('SELECT task_id FROM submissions').fetchall())
print('submission user_ids not in backup users:', sorted(s_user - set(r[0] for r in ub))[:10])
print('submission task_ids not in backup tasks:', sorted(s_task - lids_b)[:10])