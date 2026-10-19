#!/bin/bash
set -u
cd /home/h/genshin-ts
export YS_CAPTURE_BACKEND=observe
menu(){ python3 - <<'PY'
import json,socket,os
S=f"/run/user/{os.getuid()}/ys-lookd.sock"
def px(x,y):
    c=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);c.settimeout(20);c.connect(S)
    c.sendall((json.dumps({"cmd":"px","x":x,"y":y})+"\n").encode());b=b""
    while not b.endswith(b"\n"):
        d=c.recv(4096)
        if not d:break
        b+=d
    c.close();return tuple(int(t) for t in json.loads(b.decode())["v"].split())
def near(a,b,t=14): return all(abs(a[i]-b[i])<=t for i in range(3))
print("1" if (near(px(467,556),(236,229,216)) and near(px(600,900),(80,89,107))) else "0")
PY
}
key(){ ydotool key "$1":1; sleep 0.06; ydotool key "$1":0; }
for i in 1 2 3; do [ "$(menu)" = "1" ] && break; key 1; sleep 0.9; done
[ "$(menu)" = "1" ] && { key 1; sleep 1.5; }
key 48; sleep 2.2
python3 .scratch/gui-service/worldsvc.py look --live --json-out /tmp/baglook.json >/dev/null 2>&1
python3 - <<'PY'
import json
d=json.load(open('/tmp/baglook.json'))
for o in (d.get('objects') or []):
    print(' id=%-4s kind=%-8s bbox=%-26s text=%s' % (o.get('id'),o.get('kind'),o.get('bbox'),(o.get('text') or [])[:2]))
PY
key 1; sleep 1.0; key 1
