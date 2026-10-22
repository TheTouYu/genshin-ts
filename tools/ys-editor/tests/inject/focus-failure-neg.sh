#!/bin/bash
# inject/focus-failure-neg.sh — F-20261019-40 的注入用例（证明 focus-failure 门禁不是空转）
#
# 账目症状：守护对"永远恢复不了"的租约每 0.5s 重试，每次重试都 raise ⇒ 用户被反复拖回原神桌面。
# 门禁判据（本例打的那一条）：同一租约**连续失败 3 次**就该停手（标记 abandoned），此后不再碰它。
#
# 造什么故障：把 `ys-focus-guard` 里「已 abandoned 就跳过这个租约」的那句判断短路掉（`if False:`）——
#   租约被标记 abandoned 之后仍然继续重试，于是"3 次后停止"不再成立，
#   会一直重试到"连续 5 次无法恢复 ⇒ 自停"的保险丝才停。这正是事故形态：不再尊重 abandoned。
# 预期报红：`✗ 期望 3 次调用，实得 N`（N>3）。
# 安全性：套件本来就用**假 ys-lease**（永远失败）+ 假自停命令；`--only abandon` 连 noop 归还那段都不跑
#   ⇒ 零抬窗、零注入、零响铃（YS_BELL=0 再加一道）。
#
# 用法: tests/inject/focus-failure-neg.sh        rc=0 = 故障被正确抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
export YS_BELL=0
SUITE="tools/ys-editor/tests/focus-failure.selftest.sh"
f="tools/ys-editor/ys-focus-guard"; copy="tools/ys-editor/.inject_tmp-ys-focus-guard"
bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log" "$copy"' EXIT

# 基线：没注入时「3 次后停止」必须绿（否则注入后变红说明不了任何事）。
bash "$SUITE" --only abandon >"$log" 2>&1 || {
  echo "INJECT-BROKEN focus-failure-neg: 未注入时该例就不绿（基线坏了，先修门禁）"; tail -4 "$log"; exit 3; }

# 注入副本放在同目录：守卫用 __file__ 定位 ys-lease/ys-hand-back 默认值，
# 同目录副本 + 套件自带的假 bin 覆盖 ⇒ 行为与生产完全一致，只有被改的那一行不同。
cp "$f" "$copy"
python3 - "$copy" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = '''    if lease.get("abandoned"):
'''
new = '''    if False:      # INJECT：不再尊重 abandoned 标记 ⇒ 标记后仍继续重试同一租约
'''
if s.count(old) != 1:                       # 锚点必须全文唯一，否则注入会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-focus-guard 的 abandoned 判断改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
chmod +x "$copy"

YS_FOCUS_GUARD_BIN="$ROOT/$copy" bash "$SUITE" --only abandon >"$log" 2>&1 && {
  echo "INJECT-FAIL focus-failure-neg: 不再尊重 abandoned 后门禁仍绿（门禁空转）"; tail -5 "$log"; exit 1; }
grep -q '✗ 期望 3 次调用' "$log" || {
  echo "INJECT-FAIL focus-failure-neg: 变红但不是「3 次后停止」那条（判据串了）："; tail -5 "$log"; exit 1; }
echo "  报红：$(grep -m1 '✗ 期望 3 次调用' "$log" | sed 's/^ *//')"
echo "  机读：$(grep -o 'FOCUS-FAILURE-RESULT.*' "$log" | tail -1)"
echo "INJECT-PASS focus-failure-neg: abandoned 后仍继续重试 ⇒「同一租约连续失败 3 次后停止」报红"
exit 0
