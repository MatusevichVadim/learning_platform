import sqlite3, os  
for p in ['backend/backend_data.sqlite3', 'backend/prod.sqlite3']:  
    if os.path.exists(p):  
        print('DB:', p)  
        conn = sqlite3.connect(p)  
        cur = conn.cursor()  
        cur.execute("SELECT id, username, full_name, rating, rating_bonus FROM users WHERE full_name LIKE '%Онищук%' OR full_name LIKE '%Дмитрук%' OR full_name LIKE '%Арс%' OR full_name LIKE '%Тим%'")  
        for r in cur.fetchall():  
            total = (r[3] or 0) + (r[4] or 0)  
            print(r, 'total=', total)  
        conn.close()  
        print()  
