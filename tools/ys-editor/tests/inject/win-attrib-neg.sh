#!/bin/bash
# inject/win-attrib-neg.sh — F-20261022-74 的注入用例（证明 win-attrib 门禁不是空转）
#
# 注入什么：把 `tools/ys-editor/ys_attrib.py` 里「目标窗在别的虚拟桌面 ⇒ OTHER_DESKTOP」
# 改成直接返回 `OK` —— **这正是票34 的原始错误形态**：窗口其实在别的桌面/被遮挡，
# 归属校验却说"没问题"，于是调用方去点一个用户根本没看见的画面。
#
# 判据：只跑受影响的夹具用例（`YS_ATTR_FIXTURE=otherdesk`），断言报红的是
#   「原神在别的桌面 → OTHER_DESKTOP … 输出缺 "verdict": "OTHER_DESKTOP"」。
#   只判退出码不够：本套件另有若干"期望非 0 退出码"的用例，rc 非 0 说明不了问题。
#
# 还原：trap 保证任何路径（含 Ctrl-C / 断言失败）都还原源文件。
#
# 用法: tests/inject/win-attrib-neg.sh        rc=0 = 故障被正确抓住
# 退出码: 0 = INJECT-PASS / 1 = INJECT-FAIL / 3 = INJECT-BROKEN（锚点失效或环境不全）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-editor/ys-atop"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = 'if not desk_ok:\n    verdict = "OTHER_DESKTOP"\n'
new = 'if not desk_ok:\n    verdict = "OK"          # INJECT：把"在别的桌面"判成没问题（票34 原错）\n'
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-atop 的 desk_ok 判定改过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PY

# 注入后跑门禁：必须非 0 退出，且报红的是「原神在别的桌面」那条
bash tools/ys-editor/tests/win-attrib.selftest.sh >"$log" 2>&1
rc_inj=$?

ok=0
[ "$rc_inj" -ne 0 ] && grep -q '原神在别的桌面' "$log" && grep -q 'OTHER_DESKTOP' "$log" && ok=1

if [ "$ok" = 1 ]; then
  echo "INJECT-PASS win-attrib: 注入「别的桌面判 OK」后门禁报红（rc=$rc_inj）"
  grep -m1 '✗' "$log" || true
  exit 0
fi
echo "INJECT-FAIL win-attrib: 注入后门禁没抓住（rc=$rc_inj）"
tail -12 "$log"
exit 1
