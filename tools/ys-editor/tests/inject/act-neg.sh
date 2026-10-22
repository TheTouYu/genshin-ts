#!/bin/bash
# inject/act-neg.sh — F-3-05 的注入用例（证明 act 门禁不是空转）
#
# 注入什么：让 ys-act 的红点集合恒为空（`badges_of()` 直接返回 []）
#   ⇒ 动作前的红点抓不到，`badge_before=0`、`badge_delta.removed` 也为空。
#   这正是 F-3-05 记的原始错误形态：**红点没被捕获**（「预测奖励上新增红点，完全没抓」）。
# 预期红哪条：`✗ claim badge_delta`（「claim: 红点 3→0，badge_delta.removed 非空」那条）。
#   另外两条 claim 断言（text_removed / CHANGED）不受影响 ⇒ 判据没串。
# 为什么不注入 ys-afford：红点判据的实现只有一份（在 ys-afford），ys-act 只做编排；
#   本门禁守的是「编排层有没有把红点带进变化账」，所以故障造在编排层的取数点上。
# 还原：trap 保证任何退出路径都把源文件放回去。
#
# 用法: bash tools/ys-editor/tests/inject/act-neg.sh      rc=0 = 故障被正确抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-act"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = "    return [(b['cx'], b['cy'], b.get('w', 0), b.get('h', 0)) for b in d.get('badges', [])]"
new = "    return []   # INJECT：红点恒为空（造故障：编排层不再把红点带进变化账）"
if s.count(old) != 1:                       # 锚点必须全文唯一，否则可能打偏到别处
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-act 的 badges_of 改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PY

bash tools/ys-editor/tests/act-selftest.sh --only claim >"$log" 2>&1 && {
  echo "INJECT-FAIL act-neg: 红点恒为空，act 门禁仍绿（门禁空转）"; exit 1; }
grep -q '✗ claim badge_delta' "$log" || {
  echo "INJECT-FAIL act-neg: 变红但不是「claim badge_delta」那条（判据串了）："; tail -6 "$log"; exit 1; }
[ "$(grep -c '  ✗ ' "$log")" = 1 ] || {
  echo "INJECT-FAIL act-neg: 红了不止一条（判据串了）："; grep '  ✗ ' "$log"; exit 1; }
echo "  抓到: $(grep '  ✗ ' "$log" | head -1)"
echo "INJECT-PASS act-neg: 红点集合恒空 ⇒「claim: 红点 3→0，badge_delta.removed 非空」报红（仅此一条）"
exit 0
