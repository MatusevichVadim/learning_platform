import urllib.request, urllib.error

def t(path):
    req = urllib.request.Request('http://localhost:8000' + path, headers={'Authorization': 'Bearer x'})
    try:
        r = urllib.request.urlopen(req, timeout=8)
        return str(r.status)
    except urllib.error.HTTPError as e:
        return 'HTTP' + str(e.code)
    except Exception as e:
        return 'ERR' + type(e).__name__ + ':' + str(e)

with open('diag_out.txt', 'w', encoding='utf-8') as f:
    f.write('summary: ' + t('/api/profile/summary') + '\n')
    f.write('card: ' + t('/api/profile/card') + '\n')
    f.write('root: ' + t('/') + '\n')
