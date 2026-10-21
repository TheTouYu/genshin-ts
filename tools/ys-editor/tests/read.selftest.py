#!/usr/bin/env python3
"""read.selftest.py — ys-read「双读一致才报」的判据回归（离线）。

背景（2026-10-21 用户抓到的真 bug）：「中间过程的截图，很多角色名字和头像对不上」——
单帧可能落在切换动画中间（名字已更新、头像还没），拿它下结论会把顺序搞乱。
ys-read 用**两次读到的文字集合**做一致性判据，不一致就 rc=9（界面还在动，别下结论）。
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
READ = REPO / "tools" / "ys-editor" / "ys-read"
FRAME = REPO / ".scratch" / "gui-service" / "evidence" / "char-ganyu-20261021" / "s_ganyu.png"
FAILS = 0


def ok(m):
    print(f"  ✓ {m}")
    return True


def bad(m):
    global FAILS
    FAILS += 1
    print(f"  ✗ {m}")
    return False


def run(args, env=None):
    p = subprocess.run([sys.executable, str(READ)] + args, capture_output=True, text=True,
                       timeout=180, env={**os.environ, **(env or {})})
    try:
        return p.returncode, json.loads((p.stdout or "").strip().splitlines()[-1])
    except Exception:
        return p.returncode, {"raw": (p.stdout or "")[-200:]}


rc, d = run(["--frame", str(FRAME), "--grep", "甘雨", "--attempts", "1"])
(rc == 0 and d.get("consistent") is True and (d.get("match_count") or 0) >= 1
 and ok(f"T1 稳定帧 → consistent=true, 命中 {d.get('match_count')} 处")
 or bad(f"T1 rc={rc} d={d}"))

rc, d = run(["--frame", str(FRAME), "--grep", "雷电将军", "--attempts", "1"])
(rc == 0 and d.get("consistent") is True and d.get("match_count") == 0
 and ok("T2 稳定地没找到 → rc=0 且 match_count=0（'没找到'是判据）")
 or bad(f"T2 rc={rc} d={d}"))

# T3 界面还在动：假 worldsvc 每次给不同文字 ⇒ 必须 rc=9，不许假装成功
tmp = tempfile.mkdtemp()
counter = os.path.join(tmp, "n")
open(counter, "w").write("0")
fake = os.path.join(tmp, "fake_worldsvc.py")
with open(fake, "w") as f:
    f.write('''import json, sys, os
out = sys.argv[sys.argv.index("--json-out") + 1]
p = os.path.join(os.path.dirname(__file__), "n")
n = int(open(p).read() or 0) + 1
open(p, "w").write(str(n))
json.dump({"state": "GAME_CHARACTER", "texts_n": 1,
           "texts": [{"text": "冰元素／角色%d" % n, "bbox": [0, 0, 10, 10], "kind": "row"}],
           "free_text": [], "matches": [], "match_count": 0}, open(out, "w"))
''')
rc, d = run(["--grep", "角色", "--attempts", "2", "--confirm-ms", "10"], env={"YS_WORLDSVC": fake})
(rc == 9 and d.get("consistent") is False and ok("T3 两次文字不同 → rc=9 UNSTABLE_UI（不假装成功）")
 or bad(f"T3 rc={rc} d={d}"))

for p_ in (counter, fake):
    try:
        os.unlink(p_)
    except OSError:
        pass
try:
    os.rmdir(tmp)
except OSError:
    pass

if FAILS == 0:
    print("READ-RESULT pass=3 fail=0 verdict=PASS")
    sys.exit(0)
print(f"READ-RESULT pass={3 - FAILS} fail={FAILS} verdict=FAIL")
sys.exit(1)
