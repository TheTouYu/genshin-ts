#!/bin/bash
# inject/probe-neg.sh — F-3-04 的注入用例（证明 probe 门禁不是空转）
#
# 注入什么：把 ys-probe 的「第一个产生变化就 break」改成 continue
#   ⇒ 命中后仍继续试后面的变体（这正是 F-3-04 记的原始错误：只做一阶动作就停手）。
# 判据：probe-selftest 的「命中即停」那条必须报红，**且红的必须是它**（不是别的串了）。
# 还原：trap 保证任何路径都还原源文件。
#
# 用法: tests/inject/probe-neg.sh        rc=0 = 故障被正确抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-probe"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = """            working = v
            break                     # 第一个产生变化就停：不做无谓动作"""
new = """            working = v
            continue                  # INJECT：不提前停止（造故障）"""
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-probe 改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

bash tools/ys-editor/tests/probe-selftest.sh --only first >"$log" 2>&1 && {
  echo "INJECT-FAIL probe-neg: 去掉提前停止后门禁仍绿（门禁空转）"; exit 1; }
grep -q '✗ 提前停止' "$log" || {
  echo "INJECT-FAIL probe-neg: 变红但不是「提前停止」那条（判据串了）："; tail -4 "$log"; exit 1; }
echo "INJECT-PASS probe-neg: 去掉提前停止 ⇒「命中即停」报红"
exit 0
