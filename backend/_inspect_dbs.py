import sqlite3, traceback

for name in ['backup.sqlite3', 'backend/backend_data.sqlite3']:
    print('=' * 60)
    print('DB:', name)
    try:
        con = sqlite3.connect(name)
        cur = con.cursor()
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
        print('tables:', tables)
        for t in tables:
            cnt = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{t}")').fetchall()]
            print(f'  {t}: {cnt} rows, cols={cols}')
        con.close()
    except Exception as e:
        traceback.print_exc()