#!/bin/bash
# inject/skill-coverage-neg.sh — F-20261021-51 的注入用例（证明 skill-coverage 门禁不是空转）
#
# 账目症状：能力只做进代码/注释、没进技能 ⇒ 下一个会话等于没有这项能力。
# 门禁判据：`worldsvc capabilities` 里列的每个 verb，必须能在 skills.entry 指向的技能文件里 grep 到。
#
# 造什么故障：给 worldsvc 的 CAPABILITIES 里**加一个技能里没写的 verb**（inject_xneg）——
#   正是这条账目记的形态（能力先落代码、技能忘了写），不是改阈值、不是动判据。
# 预期报红：`✗ T1 ... 未写进技能：['inject_xneg']`（T2/T3 仍绿 ⇒ 证明红的就是 T1 这一条）。
# 还原：trap 把 worldsvc.py 拷回（生产文件不留任何改动）。
#
# 用法: tests/inject/skill-coverage-neg.sh     rc=0 = 故障被正确抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f=".scratch/gui-service/worldsvc.py"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

# 先证明"没注入时门禁是绿的"（否则注入后变红说明不了任何事）。
python3 tools/ys-editor/tests/skill-coverage.selftest.py >"$log" 2>&1 || {
  echo "INJECT-BROKEN skill-coverage-neg: 未注入时门禁就不绿（基线坏了，先修门禁）"; tail -4 "$log"; exit 3; }

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = '''    "schema": "gui.worldstate.capabilities/v1",
    "verbs": {
'''
new = '''    "schema": "gui.worldstate.capabilities/v1",
    "verbs": {
        "inject_xneg": {"purpose": "INJECT 用例用：故意不写进技能，验证 skill-coverage T1 会红"},
'''
if s.count(old) != 1:                       # 锚点必须全文唯一，否则注入会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效（worldsvc CAPABILITIES 的 schema/verbs 行改动过？）',
          file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

python3 tools/ys-editor/tests/skill-coverage.selftest.py >"$log" 2>&1 && {
  echo "INJECT-FAIL skill-coverage-neg: 加了未写进技能的 verb，门禁仍绿（门禁空转）"; exit 1; }
grep -q "未写进技能.*inject_xneg" "$log" || {
  echo "INJECT-FAIL skill-coverage-neg: 变红但不是「T1 未写进技能」那条（判据串了）："; tail -4 "$log"; exit 1; }
echo "  报红：$(grep -m1 '未写进技能' "$log" | sed 's/^ *//')"
echo "INJECT-PASS skill-coverage-neg: capabilities 多一个技能里没有的 verb ⇒ T1「每个 verb 都在技能里」报红"
exit 0
