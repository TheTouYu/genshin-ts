#!/bin/bash
# state-concurrency.selftest.sh — 判态并发自测（防「串帧」静默回归）
#
# 起因（2026-10-17 事故）：`ys-state --fast` 曾用**固定路径** `/tmp/ys-state-fast.bin`
# 把整帧原始 RGB 交给 ys-lookd；两个进程同时判帧时互相覆盖 ⇒ 某一次拿到的是**别人的帧**
# ⇒ 回归里偶发单帧判错（实测 gate① 报 `fast 94.7 / menu.png 失败`，而单跑 12/12 全对）。
# 修复：唯一临时文件 + 用完即删 + daemon 冷启动重试。
# 本自测把那条路径**并发压一遍**，判据 = 每帧判出的态必须等于 manifest 期望态。
#
# 覆盖两条路径：
#   ① daemon 通道（缺省；常驻服务内取数+判定）
#   ② 本地回退通道（YS_STATE_LOCAL=1；这条才会走 frame_bin 临时文件，正是事故路径）
#
# 用法: bash tools/ys-editor/tests/state-concurrency.selftest.sh [-n 并发数] [-f 帧数]
# 输出机读行（供 tools/ys-gates 取值）：
#   GATE1-CONCURRENCY ok=<通过次数> bad=<不符次数> daemon=<n> local=<n> verdict=PASS|FAIL
# 退出码: 0 全通过 / 1 有不符 / 2 用法错 / 3 缺样本
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
YS_DIR="$(dirname "$HERE")"
REG="$YS_DIR/calib/regress"
MAN="$REG/manifest.tsv"
YS="$YS_DIR/ys-state"
N=4      # 并发路数
F=8      # 帧数
while [ $# -gt 0 ]; do
  case "$1" in
    -n) N="$2"; shift 2 ;;
    -f) F="$2"; shift 2 ;;
    *) echo "用法: $0 [-n 并发数] [-f 帧数]" >&2; exit 2 ;;
  esac
done
[ -f "$MAN" ] || { echo "缺回归清单 $MAN" >&2; exit 3; }
[ -x "$YS" ] || { echo "缺可执行 ys-state $YS" >&2; exit 3; }

python3 - "$YS" "$REG" "$MAN" "$N" "$F" <<'PY'
import concurrent.futures as cf
import json
import os
import subprocess
import sys

ys, reg, man, n, f = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
rows = []
for line in open(man, encoding="utf-8"):
    if not line.strip() or line.startswith("#"):
        continue
    c = line.rstrip("\n").split("\t")
    rows.append((c[0], c[1]))
missing = [fn for fn, _ in rows if not os.path.exists(os.path.join(reg, fn))]
if missing:
    print(f"缺样本: {missing[:3]}", file=sys.stderr)
    sys.exit(3)
rows = rows[:f]
want = dict(rows)


def judge(fn, local):
    env = dict(os.environ)
    if local:
        env["YS_STATE_LOCAL"] = "1"
    p = subprocess.run([ys, "--frame", os.path.join(reg, fn), "--fast", "--json"],
                       capture_output=True, text=True, env=env, timeout=180)
    try:
        d = json.loads(p.stdout)
    except Exception:
        return fn, "ERROR", p.returncode
    return fn, d.get("state"), p.returncode


def round_n(tag, local, workers=n):
    tasks = [(fn, local) for fn in want for _ in range(workers)]
    ok = bad = 0
    for fn, st, rc in cf.ThreadPoolExecutor(max_workers=workers).map(lambda a: judge(*a), tasks):
        if st == want[fn]:
            ok += 1
        else:
            bad += 1
            print(f"  BAD [{tag}] {fn}: got={st} want={want[fn]} rc={rc}", file=sys.stderr)
    print(f"  [{tag}] {len(want)} 帧 × {workers} 路 = {len(tasks)} 次判定：ok={ok} bad={bad}")
    return ok, bad


ok_d, bad_d = round_n("daemon", False)
ok_l, bad_l = round_n("local ", True)
ok, bad = ok_d + ok_l, bad_d + bad_l
verdict = "PASS" if bad == 0 else "FAIL"
print(f"GATE1-CONCURRENCY ok={ok} bad={bad} daemon={ok_d} local={ok_l} verdict={verdict}")
sys.exit(0 if bad == 0 else 1)
PY
