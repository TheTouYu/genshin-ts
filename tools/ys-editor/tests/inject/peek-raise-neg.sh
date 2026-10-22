#!/bin/bash
# inject/peek-raise-neg.sh — F-20261022-79「ys-peek 默认零打扰（不抬窗）」的注入用例
# 造什么故障：在只读闸门**之前**插入抬窗调用（默认路径改成先抬窗）。
#   ⚠ 注入的抬窗调用带 env 开关（YS_PEEK_INJECT_RAISE=1），测试不设它 ⇒ 不会真抬窗；
#   门禁 C3 判的是**源码顺序**（ys-kwin-raise 必须在 --allow-raise 闸门之后），所以仍会红。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
GATE="python3 tools/ys-editor/tests/frame-daemon.selftest.py"; TARGET="tools/ys-editor/ys-peek"
tmp="$(mktemp -d)" || exit 3; cp "$TARGET" "$tmp/bak" || exit 3
trap 'cp "$tmp/bak" "$TARGET" 2>/dev/null; rm -rf "$tmp"' EXIT
$GATE >"$tmp/base.log" 2>&1 || { echo "INJECT-BROKEN peek-raise-neg: 基线不绿"; tail -4 "$tmp/base.log"; exit 3; }
OLD='ALLOW_RAISE=0'
NEW='[ "${YS_PEEK_INJECT_RAISE:-0}" = 1 ] && "$HERE/ys-kwin-raise" "$TITLE" >/dev/null 2>&1   # INJECT：默认路径先抬窗
ALLOW_RAISE=0'
OLD="$OLD" NEW="$NEW" python3 - "$TARGET" <<'PY' || exit 3
import os, sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old, new = os.environ['OLD'], os.environ['NEW']
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点命中 %d 次' % s.count(old), file=sys.stderr); sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
bash -n "$TARGET" || { echo "INJECT-BROKEN peek-raise-neg: 注入后 bash 语法错"; exit 3; }
$GATE >"$tmp/inj.log" 2>&1; rc=$?
[ "$rc" = 0 ] && { echo "INJECT-FAIL peek-raise-neg: 默认先抬窗后门禁仍绿"; tail -4 "$tmp/inj.log"; exit 1; }
grep -q 'FAIL C3 raise 只在 --allow-raise 闸门之后' "$tmp/inj.log" || { echo "INJECT-FAIL peek-raise-neg: 变红但不是 C3"; tail -6 "$tmp/inj.log"; exit 1; }
echo "  rc=1 报红：$(grep -m1 'FAIL C3' "$tmp/inj.log" | sed 's/^ *//')"
cp "$tmp/bak" "$TARGET"; trap - EXIT
$GATE >"$tmp/post.log" 2>&1 || { echo "INJECT-FAIL peek-raise-neg: 还原后仍红"; tail -4 "$tmp/post.log"; exit 1; }
rm -rf "$tmp"; echo "INJECT-PASS peek-raise-neg: 默认先抬窗 ⇒ ✗ C3；还原后 verdict=PASS"
