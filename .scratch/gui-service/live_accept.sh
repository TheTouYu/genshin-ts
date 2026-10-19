#!/bin/bash
set -u
REPO="/home/h/genshin-ts"; cd "$REPO"
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
[ "$(menu)" = "1" ] && { key 1; sleep 1.5; }     # 菜单 → 世界
key 48; sleep 2.2                                  # B 开背包
echo "== 正例：expect 盯网格区"
python3 .scratch/gui-service/worldsvc.py act --live \
  --text "星鹫赤羽" \
  --action '{"type":"scroll","dy":-4,"at":[900,600]}' \
  --expect '{"type":"region_text_set_changed","region":[300,200,1200,800],"min_jaccard_delta":0.05}' \
  --evidence-dir .scratch/gui-service/evidence/act-live-pos 2>&1 | tail -6
echo "rc_pos=$?"
echo "== 负例：expect 盯详情区（故意指错）"
python3 .scratch/gui-service/worldsvc.py act --live \
  --text "星鹫赤羽" \
  --action '{"type":"scroll","dy":-4,"at":[900,600]}' \
  --expect '{"type":"region_text_set_changed","region":[1770,150,630,650],"min_jaccard_delta":0.05}' \
  --evidence-dir .scratch/gui-service/evidence/act-live-neg 2>&1 | tail -6
echo "rc_neg=$?"
key 1; sleep 1.0; key 1
