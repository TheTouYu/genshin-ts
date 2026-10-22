#!/bin/bash
# inject/perf-neg.sh — F-1-12 的注入用例（证明 ys-perf 性能门禁不是空转）
#
# 账目症状：GUI 感知层**单次执行**没有任何性能门禁，同一份代码里长期并存 8×/22×/39× 的慢通道。
# 门禁判据（本例打的那一条）：`screen-containers-cached` 必须命中内容寻址缓存 ——
#   `timing.container_cached == true` 且 `timing.container_ms ≤ 5ms`（常驻 ≤200ms/帧、缓存命中 ≤5ms 口径）。
#
# 造什么故障：把 `tools/ys-screen` 里容器层缓存的**读路径**关掉（`path = None`）。
#   这不是"改阈值"——阈值一个字节没动；是代码真的变慢：同一帧重复问从读缓存（<1ms）
#   退化回每次重算容器层（实测 ~120ms/帧，>25 倍），正是 F-1-12 记的"该常驻/该缓存的没常驻"。
# 预期报红：`screen-containers-cached ... ✗ FAIL`，明细行 `└ timing.container_ms ... ✗（未命中缓存）`。
# 口径：只跑这一例；全程离线、不碰任何窗口。
#
# 用法: tests/inject/perf-neg.sh        rc=0 = 故障被正确抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-screen"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

# 缓存预热：`screen-containers-cached` 要求**命中**内容寻址缓存，而新机器/新克隆里缓存是空的
# （首次必 miss ⇒ 基线假红）。先跑一次同帧把缓存写出来，再拿门禁判「缓存命中快不快」。
./tools/ys-screen tools/ys-editor/calib/regress/playtest.png --containers >/dev/null 2>&1

# 先证明「没注入时这一例是绿的」：否则注入后变红可能只是机器本来就慢。
./tools/ys-perf --only screen-containers-cached --n 1 >"$log" 2>&1 || {
  echo "INJECT-BROKEN perf-neg: 未注入时该例就不绿（机器负载？先看读数）"; tail -3 "$log"; exit 3; }

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = """    path = (_cont_cache_path(frame_sha or _sha256(frame), scale, text_boxes, backend_sig)
            if use_cache else None)"""
new = """    path = None   # INJECT：关掉容器层缓存的读路径（同帧重复问退化成每次重算）"""
if s.count(old) != 1:                       # 锚点必须全文唯一，否则注入会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-screen containers_cached 改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

./tools/ys-perf --only screen-containers-cached --n 1 >"$log" 2>&1 && {
  echo "INJECT-FAIL perf-neg: 关掉容器缓存读路径后门禁仍绿（门禁空转）"; tail -3 "$log"; exit 1; }
grep -qE '^screen-containers-cached.*✗ FAIL' "$log" || {
  echo "INJECT-FAIL perf-neg: 变红但不是 screen-containers-cached 这一例（判据串了）："; tail -5 "$log"; exit 1; }
grep -q '未命中缓存' "$log" || {
  echo "INJECT-FAIL perf-neg: 该例红了但不是因为「缓存未命中」这条判据（墙钟超线不算）："; tail -5 "$log"; exit 1; }
echo "  报红：$(grep -E '^screen-containers-cached.*✗ FAIL' "$log" | head -1 | sed 's/  */ /g')"
echo "  明细：$(grep -m1 '└ timing.container_ms' "$log" | sed 's/^ *//')"
echo "INJECT-PASS perf-neg: 关掉容器层缓存读路径 ⇒「screen-containers-cached」的『缓存命中 ≤5ms』判据报红"
exit 0
