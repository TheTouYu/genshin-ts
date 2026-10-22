#!/bin/bash
# inject/containers-textbox-neg.sh — F-20261022-80「ys-screen containers[].text_boxes（schema v2）」的注入用例
# 造什么故障：从容器 emit 里删掉 text_boxes 键 ⇒「每个容器都有 text_boxes 键」必须红。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
GATE="python3 tools/ys-editor/tests/containers-textbox.selftest.py"; TARGET="tools/ys-screen"
tmp="$(mktemp -d)" || exit 3; cp "$TARGET" "$tmp/bak" || exit 3
trap 'cp "$tmp/bak" "$TARGET" 2>/dev/null; rm -rf "$tmp"' EXIT
$GATE >"$tmp/base.log" 2>&1 || { echo "INJECT-BROKEN containers-textbox-neg: 基线不绿"; tail -4 "$tmp/base.log"; exit 3; }
OLD="                'text_boxes': k['text_boxes'],
" NEW=""
OLD="$OLD" NEW="$NEW" python3 - "$TARGET" <<'PY' || exit 3
import os, sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old, new = os.environ['OLD'], os.environ['NEW']
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点命中 %d 次' % s.count(old), file=sys.stderr); sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
$GATE >"$tmp/inj.log" 2>&1; rc=$?
[ "$rc" = 0 ] && { echo "INJECT-FAIL containers-textbox-neg: 删掉 text_boxes 后门禁仍绿"; tail -4 "$tmp/inj.log"; exit 1; }
grep -q 'FAIL 每个容器都有 text_boxes 键' "$tmp/inj.log" || { echo "INJECT-FAIL containers-textbox-neg: 变红但不是 schema 断言"; tail -6 "$tmp/inj.log"; exit 1; }
echo "  rc=1 报红：$(grep -m1 'FAIL 每个容器都有 text_boxes 键' "$tmp/inj.log" | sed 's/^ *//')"
cp "$tmp/bak" "$TARGET"; trap - EXIT
$GATE >"$tmp/post.log" 2>&1 || { echo "INJECT-FAIL containers-textbox-neg: 还原后仍红"; tail -4 "$tmp/post.log"; exit 1; }
rm -rf "$tmp"; echo "INJECT-PASS containers-textbox-neg: 删 text_boxes ⇒ ✗ schema；还原后 verdict=PASS"
