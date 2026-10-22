#!/bin/bash
# inject/capture-stagnation-neg.sh — F-20261023-01「帧停滞稽核」的注入用例
# 造什么故障：把稽核的内容签名判据改成"永远不变"（sig_changed 恒 False）⇒
#   主通道恒给同一帧、合成器帧在变时，稽核会误判 CONTENT_STATIC ⇒ T1 必须红。
# 为什么这条值得注入：稽核失效的形态是**静默绿地**——帧照样出、通道照样是 xshm、
#   stale_events 永远是 0，只是内容悄悄滞后 0.3–2.7s（正是 .03/.04 那两轮的样子）。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
GATE="python3 tools/ys-editor/tests/capture-stagnation.selftest.py"
TARGET="tools/ys-editor/ys_capture.py"
tmp="$(mktemp -d)" || exit 3
cp "$TARGET" "$tmp/bak" || exit 3
trap 'cp "$tmp/bak" "$TARGET" 2>/dev/null; rm -rf "$tmp"' EXIT
$GATE >"$tmp/base.log" 2>&1 || { echo "INJECT-BROKEN capture-stagnation-neg: 基线不绿"; tail -6 "$tmp/base.log"; exit 3; }

OLD='    f = float((d > tol).any(axis=2).mean())
    return f > frac, round(f, 4)'
NEW='    f = float((d > tol).any(axis=2).mean())
    return False, round(f, 4)   # INJECT：内容签名恒判"没变"（稽核静默失效）'
OLD="$OLD" NEW="$NEW" python3 - "$TARGET" <<'PY' || exit 3
import os, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old, new = os.environ['OLD'], os.environ['NEW']
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点命中 %d 次' % s.count(old), file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

$GATE >"$tmp/inj.log" 2>&1; rc=$?
[ "$rc" = 0 ] && { echo "INJECT-FAIL capture-stagnation-neg: 稽核失效后门禁仍绿"; tail -6 "$tmp/inj.log"; exit 1; }
grep -q 'FAIL T1a' "$tmp/inj.log" || {
  echo "INJECT-FAIL capture-stagnation-neg: 变红但不是 T1a（陈旧未检出）"; tail -8 "$tmp/inj.log"; exit 1; }
echo "  rc=1 报红：$(grep -m1 'FAIL T1a' "$tmp/inj.log" | sed 's/^ *//')"

cp "$tmp/bak" "$TARGET"; trap - EXIT
$GATE >"$tmp/post.log" 2>&1 || { echo "INJECT-FAIL capture-stagnation-neg: 还原后仍红"; tail -6 "$tmp/post.log"; exit 1; }
rm -rf "$tmp"
echo "INJECT-PASS capture-stagnation-neg: 签名恒判没变 ⇒ ✗ T1a；还原后 CAPTURE-STAGNATION-RESULT verdict=PASS"
