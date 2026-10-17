#!/bin/bash
# probe-matrix.selftest.sh — 探针矩阵回归（每条**已验证**探针在每张真帧上的可见性）
#
# 为什么要有它（2026-10-17 事故）：探针在真实操作里全部返回"不可见"，而同一时刻
# `--print-state` 全判对 —— 根因是 daemon 活体把 `ys_look.grab` 的 0..1 浮点直接喂给
# 按 0..255 写死的判据（每一条判据都假，且不报错）。这套矩阵把「探针 × 真帧」钉死，
# 让同类静默回归在下一次改动时立刻红。
#
# 判据：矩阵文件 `calib/regress/probes/matrix.tsv` 逐行给「帧 → 必须可见的探针集合」；
#       `validated:false` 的探针不参与断言（bake_dialog / playtest_options —— 无干净离线帧）。
#
# 用法: bash tools/ys-editor/tests/probe-matrix.selftest.sh [-c fast|full]
# 输出机读行：PROBE-MATRIX ok=<通过断言数> bad=<失败断言数> frames=<帧数> probes=<探针数> verdict=PASS|FAIL
# 退出码: 0 全通过 / 1 有失败 / 3 缺文件
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
YS_DIR="$(dirname "$HERE")"
REG="$YS_DIR/calib/regress"
MATRIX="$REG/probes/matrix.tsv"
CHANNEL=fast
[ "${1:-}" = "-c" ] && CHANNEL="${2:-fast}"
[ -f "$MATRIX" ] || { echo "缺矩阵 $MATRIX" >&2; exit 3; }
[ -x "$YS_DIR/ys-state" ] || { echo "缺可执行 $YS_DIR/ys-state" >&2; exit 3; }

python3 - "$YS_DIR/ys-state" "$REG" "$MATRIX" "$CHANNEL" <<'PY'
import json
import os
import subprocess
import sys

ys, reg, matrix, channel = sys.argv[1:5]
ch_flag = ["--fast"] if channel == "fast" else []

meta = json.loads(subprocess.run([ys, "--probes", "--json"], capture_output=True, text=True).stdout)
validated = [p["probe"] for p in meta["probes"] if p.get("validated", True)]
unvalidated = [p["probe"] for p in meta["probes"] if not p.get("validated", True)]

ok = bad = 0
frames = 0
for line in open(matrix, encoding="utf-8"):
    line = line.rstrip("\n")
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    cols = line.split("\t")
    fn, want_state = cols[0].strip(), cols[1].strip()
    want_vis = {x.strip() for x in (cols[2].strip() if len(cols) > 2 else "").split(",") if x.strip()}
    path = os.path.join(reg, fn)
    if not os.path.exists(path):
        print(f"  MISSING {fn}", file=sys.stderr); bad += 1; continue
    frames += 1
    got = subprocess.run([ys, "--frame", path, "--json", *ch_flag], capture_output=True, text=True)
    try:
        st = json.loads(got.stdout).get("state")
    except Exception:
        st = "PARSE_ERROR"
    if st != want_state:
        bad += 1
        print(f"  ✗ {fn:32s} state={st} 期望 {want_state}", file=sys.stderr)
    else:
        ok += 1
    for p in validated:
        r = subprocess.run([ys, "--probe", p, "--frame", path, "--json"], capture_output=True, text=True)
        try:
            vis = json.loads(r.stdout).get("visible")
        except Exception:
            vis = None
        want = p in want_vis
        if vis == want:
            ok += 1
        else:
            bad += 1
            print(f"  ✗ {fn:32s} probe={p:16s} visible={vis} 期望 {want}", file=sys.stderr)
print(f"  [channel={channel}] 帧 {frames} / 已验证探针 {len(validated)}"
      f"（未验证跳过: {','.join(unvalidated) or '无'}）")
print(f"PROBE-MATRIX ok={ok} bad={bad} frames={frames} probes={len(validated)} "
      f"verdict={'PASS' if bad == 0 else 'FAIL'}")
sys.exit(0 if bad == 0 else 1)
PY
