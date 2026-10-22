#!/bin/bash
# inject/find-wording-neg.sh — F-20261022-81「ys-find 无判据时的措辞」的注入用例
# 造什么故障：把文案改回 `结论: unknown`（旧措辞）⇒「未给判据，仅列 N 个匹配」断言必须红。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
GATE="python3 tools/ys-editor/tests/find-wording.selftest.py"; TARGET="tools/ys-find"
tmp="$(mktemp -d)" || exit 3; cp "$TARGET" "$tmp/bak" || exit 3
trap 'cp "$tmp/bak" "$TARGET" 2>/dev/null; rm -rf "$tmp"' EXIT
$GATE >"$tmp/base.log" 2>&1 || { echo "INJECT-BROKEN find-wording-neg: 基线不绿"; tail -4 "$tmp/base.log"; exit 3; }
OLD="result['verdict_note'] = ('未给判据，仅列 %d 个匹配（如需结论请加 --expect X,Y）' % n_cand)"
NEW="result['verdict_note'] = '结论: unknown'   # INJECT：旧措辞"
OLD="$OLD" NEW="$NEW" python3 - "$TARGET" <<'PY' || exit 3
import os, sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old, new = os.environ['OLD'], os.environ['NEW']
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点命中 %d 次' % s.count(old), file=sys.stderr); sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
$GATE >"$tmp/inj.log" 2>&1; rc=$?
[ "$rc" = 0 ] && { echo "INJECT-FAIL find-wording-neg: 旧措辞下门禁仍绿"; tail -4 "$tmp/inj.log"; exit 1; }
grep -q 'FAIL ① 打印「未给判据，仅列 N 个匹配」' "$tmp/inj.log" || { echo "INJECT-FAIL find-wording-neg: 变红但不是措辞断言"; tail -6 "$tmp/inj.log"; exit 1; }
echo "  rc=1 报红：$(grep -m1 'FAIL ①' "$tmp/inj.log" | sed 's/^ *//')"
cp "$tmp/bak" "$TARGET"; trap - EXIT
$GATE >"$tmp/post.log" 2>&1 || { echo "INJECT-FAIL find-wording-neg: 还原后仍红"; tail -4 "$tmp/post.log"; exit 1; }
rm -rf "$tmp"; echo "INJECT-PASS find-wording-neg: 旧措辞 ⇒ ✗ ①；还原后 verdict=PASS"
