#!/bin/bash
# inject/brief-neg.sh — F-3-03 的注入用例（证明 brief 门禁不是空转）
#
# 注入什么：把 ys-brief 决策字段标签表 `LABELS` 里的「支持率」去掉
#   ⇒ 支持率不再被抽成决策字段。这正是 F-3-03 记的原始错误形态：
#   **决定之前没把面板上其它信息读进来**（用户原话：「没注意其他的信息，就做决定了」）。
#   回到事故形态后，brief 门禁必须报红，否则那条门禁就是在空转。
# 预期红哪条：`✗ 支持率字段`（「vote-slider: 抽出「支持率=29%」」那条）。
#   该故障**只**打红这一条：倍率 / C1 WARN / verdict=BLOCK / 负样本都还绿 ⇒ 判据没串。
# 还原：trap 保证任何退出路径都把源文件放回去（注入物绝不留在仓库里）。
#
# 用法: bash tools/ys-editor/tests/inject/brief-neg.sh      rc=0 = 故障被正确抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-brief"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = "LABELS = ('支持率', '倍率', '评分', '徽记', '投入', '上限', '奖励', '胜率')"
new = "LABELS = ('倍率', '评分', '徽记', '投入', '上限', '奖励', '胜率')  # INJECT：支持率不再当决策字段"
if s.count(old) != 1:                       # 锚点必须全文唯一，否则 replace(...,1) 可能打偏
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-brief 的 LABELS 改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PY

bash tools/ys-editor/tests/brief-selftest.sh --only vote-slider >"$log" 2>&1 && {
  echo "INJECT-FAIL brief-neg: 支持率不再被抽取，brief 门禁仍绿（门禁空转）"; exit 1; }
grep -q '✗ 支持率字段' "$log" || {
  echo "INJECT-FAIL brief-neg: 变红但不是「支持率字段」那条（判据串了）："; tail -6 "$log"; exit 1; }
# 只红一条：红了别的说明注入把别处也打坏了（那会让本用例证明不了「就是这条在判」）
[ "$(grep -c '  ✗ ' "$log")" = 1 ] || {
  echo "INJECT-FAIL brief-neg: 红了不止一条（判据串了）："; grep '  ✗ ' "$log"; exit 1; }
echo "  抓到: $(grep '  ✗ ' "$log" | head -1)"
echo "INJECT-PASS brief-neg: 把「支持率」从决策字段表去掉 ⇒「vote-slider: 抽出「支持率=29%」」报红（仅此一条）"
exit 0
