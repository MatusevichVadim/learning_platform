import os, time, urllib.request, urllib.error

# Touch profile.py to trigger uvicorn --reload
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app', 'routers', 'profile.py')
os.utime(path, None)
print('Touched', path)

time.sleep(6)  # give reloader time

def t(p):
    req = urllib.request.Request('http://localhost:8000' + p, headers={'Authorization': 'Bearer x'})
    try:
        r = urllib.request.urlopen(req, timeout=8)
        return str(r.status)
    except urllib.error.HTTPError as e:
        return 'HTTP' + str(e.code)
    except Exception as e:
        return 'ERR' + type(e).__name__

with open('diag_out.txt', 'w', encoding='utf-8') as f:
    f.write('summary: ' + t('/api/profile/summary') + '\n')
    f.write('card: ' + t('/api/profile/card') + '\n')
