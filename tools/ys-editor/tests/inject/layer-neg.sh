#!/bin/bash
# inject/layer-neg.sh — F-3-01 的注入用例（证明 layer 门禁不是空转）
#
# 注入什么：把 tools/ys-layer 的「亮面卡片」亮度阈值少写一个小数点
#     bright = mean > med_m * 1.15        ← 原：比中位亮度亮 15% 的网格算亮面
#   →  bright = mean > med_m * 11.5          （10 倍，任何画面都够不着）
#   ⇒ 认不出居中面板（panels/modal 全空）、modal 不在场时 scrim 也不成立
#   ⇒ **"我在第几层"直接失明**，正是 F-3-01 记的原始错误（在错误的层上按固定坐标连点）。
#   为什么挑这条而不是调 SCRIM_COVER：亮面卡片的检出是 modal 与 scrim 两条判据的共同上游，
#   一处坏掉两处一起失明，正好对上"层识别失效"这一个故障面。
#
# 判据：只跑受影响的那一帧用例（--only rules-panel），断言报红的是「rules-panel: scrim」。
# 还原：trap 保证任何路径都还原源文件。
#
# 用法: tests/inject/layer-neg.sh        rc=0 = 故障被正确抓住
# 退出码: 0 = INJECT-PASS / 1 = INJECT-FAIL / 3 = INJECT-BROKEN（锚点失效或环境不全）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-layer"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = "    bright = mean > med_m * 1.15\n"
new = "    bright = mean > med_m * 11.5       # INJECT：亮面阈值少一个小数点（造故障）\n"
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-layer 的 analyze() 亮面阈值行改过？）',
          file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

bash tools/ys-editor/tests/layer-selftest.sh --only rules-panel >"$log" 2>&1 && {
  echo "INJECT-FAIL layer-neg: 亮面阈值坏掉后门禁仍绿（门禁空转）"; exit 1; }
grep -q '✗ rules-panel: scrim' "$log" || {
  echo "INJECT-FAIL layer-neg: 变红但不是「rules-panel 的 scrim」那条（判据串了）："
  tail -4 "$log"; exit 1; }
echo "INJECT-PASS layer-neg: 亮面阈值 1.15→11.5（认不出面板/压暗层）⇒「rules-panel: scrim」报红"
exit 0
