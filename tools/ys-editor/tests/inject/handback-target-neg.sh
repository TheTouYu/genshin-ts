#!/bin/bash
# inject/handback-target-neg.sh — F-20261022-77「交还目标必须等于授权记录里的窗」的注入用例
#
# 造什么故障（2026-10-22 真机事故的两个原始半面）：
#   A `ys-hand-back` 把 --prev-json "$PREV" 改回 `--prev-json ""` ⇒ 记录被丢，目标退化成 firefox
#   B `ys-screen-grant._hand_back()` 不再把授权记录传下去（if prev: args += [...] 删掉）
# 门禁 handback-target 全离线（KWin 夹具 + dry-run），造故障不碰屏幕。
#
# 判据：基线 PASS → 注入后 rc=1 且**点名到具体那一层**（A 层/ C 层）→ trap 还原 → PASS。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
GATE="python3 tools/ys-editor/tests/handback-target.selftest.py"
tmp="$(mktemp -d)" || exit 3
declare -a BAK_SRC=() BAK_DST=()
backup() { local b="$tmp/bak.$(basename "$1")"; cp "$1" "$b" || exit 3; BAK_SRC+=("$1"); BAK_DST+=("$b"); }
restore_copy() { local i; for i in "${!BAK_SRC[@]}"; do cp "${BAK_DST[$i]}" "${BAK_SRC[$i]}" 2>/dev/null; done; }
cleanup() { restore_copy; rm -rf "$tmp"; }
trap cleanup EXIT
expect_red() {  # $1=文件 $2=期望报红的那一层关键词
  $GATE >"$tmp/inj.log" 2>&1; local rc=$?
  if [ "$rc" = 0 ]; then
    echo "INJECT-FAIL handback-target-neg: 注入 $1 后门禁仍绿（空转）"; tail -4 "$tmp/inj.log"; exit 1
  fi
  grep -q "✗ $2" "$tmp/inj.log" || {
    echo "INJECT-FAIL handback-target-neg: 变红但不是「✗ $2」那层"; tail -8 "$tmp/inj.log"; exit 1; }
  echo "  rc=1 报红：$(grep -m1 "✗ $2" "$tmp/inj.log" | sed 's/^ *//')"
}
if ! $GATE >"$tmp/base.log" 2>&1; then
  echo "INJECT-BROKEN handback-target-neg: 未注入时门禁就不绿"; tail -5 "$tmp/base.log"; exit 3
fi

# ── A：ys-hand-back 丢掉记录（真实路径 + dry-run 两处都要改，否则门禁抓不到真实回归）──
A="tools/ys-editor/ys-hand-back"; backup "$A"
python3 - "$A" <<'PY' || exit 3
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = '--prev-json "$PREV"'
n = s.count(old)
if n != 2:
    print('INJECT-BROKEN 锚点命中 %d 次（期望 2：真实路径 + dry-run）' % n, file=sys.stderr); sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, '--prev-json ""'))
PY
expect_red "$A" "A 记录优先"
# 必须抓到**语义**回归（dry-run 仍能跑、rc=0，但目标变成了 firefox），不是语法错/崩溃
grep -q '✗ A 记录优先：期望 target.class=kitty，实得 rc=0' "$tmp/inj.log" || {
  echo "INJECT-FAIL handback-target-neg: A 层不是语义回归（dry-run 没正常跑）"; tail -6 "$tmp/inj.log"; exit 1; }

# ── B：ys-screen-grant 不把记录传给 ys-hand-back ───────────────────────────
B="tools/ys-editor/ys-screen-grant"; backup "$B"
python3 - "$B" <<'PY' || exit 3
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = '''    if prev:
        args += ["--prev-json", prev]
'''
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点命中 %d 次' % s.count(old), file=sys.stderr); sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, '    # INJECT：记录不再传给 ys-hand-back\n'))
PY
expect_red "$B" "C 接线"

# ── 还原并复验 ──────────────────────────────────────────────────────────────
restore_copy; trap - EXIT
if ! $GATE >"$tmp/post.log" 2>&1; then
  echo "INJECT-FAIL handback-target-neg: 还原后门禁仍红"; tail -4 "$tmp/post.log"; exit 1
fi
rm -rf "$tmp"
echo "INJECT-PASS handback-target-neg: 丢记录 ⇒ ✗ A/C 两层报红；还原后 verdict=PASS"
exit 0
