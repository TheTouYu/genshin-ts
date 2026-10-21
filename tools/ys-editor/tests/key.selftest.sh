#!/bin/bash
# key.selftest.sh — ys-key 的判据回归（**全离线，不碰屏幕、不注入**）。
#
# 为什么需要它（2026-10-21 找甘雨实任务踩出的三个坑）：
#   ① 裸 ydotool 不刷会话心跳 ⇒ 守护 8s 后交还屏幕，后续按键打进用户窗口；
#   ② 动画没结束时按键被吞 ⇒ 同一角色连拍 4 帧（24 帧里 11 帧重复）；
#   ③ focus→press→capture 三件套要模型手写，容易漏。
# ys-key 把 ①③ 收进工具，把 ② 变成可判的 --wait-change。
#
# 本测试只验**判定与解析**（--plan / --frame-raw 都不注入）：
#   T1 键名 → 码（c=46 / e=18 / q=16 / esc=1）
#   T2 非法键名 → 非零 + BAD_KEY
#   T3 区域格式错 → BAD_KEY 般的显式错误（BAD_REGION）
#   T4 静态缓冲 + --wait-change → 超时 rc=8 且 changed=false
#   T5 缓冲在等待期内变化 → rc=0 且 changed=true（证明判据真的在看像素）
# 退出码：0 PASS / 1 FAIL
set -u
cd "$(dirname "$0")/../../.." || exit 1
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
KEY=tools/ys-editor/ys-key
fails=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fails=$((fails+1)); }

# 合成 RGB 缓冲：宽 40 × 高 20
python3 - "$TMP/f.rgb" <<'PY'
import sys
data = bytes([30, 40, 50]) * (40 * 20)
open(sys.argv[1], "wb").write(data)
PY

for pair in "c:46" "e:18" "q:16" "esc:1" "space:57"; do
  k="${pair%%:*}"; want="${pair##*:}"
  got=$($KEY "$k" --plan 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['code'])")
  [ "$got" = "$want" ] && ok "T1 $k → $want" || bad "T1 $k → $got（应 $want）"
done

out=$($KEY nosuchkey --plan 2>&1); rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q "BAD_KEY" && ok "T2 非法键名被拒" || bad "T2 非法键名 rc=$rc out=$out"

out=$($KEY c --frame-raw "$TMP/f.rgb" --wait-change "1,2,3" 2>&1); rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q "BAD_REGION" && ok "T3 区域格式错被拒" || bad "T3 rc=$rc out=$out"

out=$($KEY c --frame-raw "$TMP/f.rgb" --frame-width 40 --wait-change "0,0,10,10" --max-wait-ms 300 2>&1); rc=$?
[ "$rc" -eq 8 ] && echo "$out" | grep -q '"changed": false' && ok "T4 静止画面 → 超时 rc=8（不假装成功）" \
  || bad "T4 rc=$rc out=$out"

# 等待期内改像素：后台 150ms 后改动 (0,0,10,10) 区域
( sleep 0.15; python3 - "$TMP/f.rgb" <<'PY'
import sys
p = sys.argv[1]
b = bytearray(open(p, "rb").read())
for y in range(10):
    for x in range(10):
        off = (y * 40 + x) * 3
        b[off:off + 3] = bytes([250, 10, 10])
open(p, "wb").write(bytes(b))
PY
) &
out=$($KEY c --frame-raw "$TMP/f.rgb" --frame-width 40 --wait-change "0,0,10,10" --max-wait-ms 1200 2>&1); rc=$?
wait
[ "$rc" -eq 0 ] && echo "$out" | grep -q '"changed": true' && ok "T5 画面变化 → rc=0 changed=true" \
  || bad "T5 rc=$rc out=$out"

[ "$fails" -eq 0 ] && { echo "KEY-RESULT pass=9 fail=0 verdict=PASS"; exit 0; }
echo "KEY-RESULT pass=$((9-fails)) fail=$fails verdict=FAIL"; exit 1
