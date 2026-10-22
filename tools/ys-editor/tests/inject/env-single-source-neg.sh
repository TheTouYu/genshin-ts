#!/bin/bash
# inject/env-single-source-neg.sh — F-20261022-75「X11 环境解析必须只有一个源」的注入用例
#
# 造什么故障：把 `tools/ys-editor/ys-unstick-win` 里唯一那行统一入口引用
#     . "$(dirname "$(readlink -f "$0")")/ys-env.sh" >/dev/null 2>&1 || true
#   换回它历史上的裸读写法 `export DISPLAY="${DISPLAY:-:1}"`（且从此不引用入口）。
#   这正是 4946d448 那类回归的形状：**调用点自己解析环境**，会话一换就静默失效。
#
# 门禁 env-single-source 是**静态**扫描：造故障的过程本身不做任何窗口操作（不占屏）。
# 判据分三层，不能只看退出码（rc=2 是门禁自身坏了，与"抓到了"是两件事）：
#   ① 基线未注入 ⇒ rc=0 且 verdict=PASS（否则 INJECT-BROKEN）
#   ② 注入后     ⇒ rc=1、输出点名 `✗ tools/ys-editor/ys-unstick-win`、且写明「统一环境入口」
#   ③ 还原后     ⇒ rc=0（trap 保证异常退出也还原，连跑两遍结果一致）
#
# 用法: tests/inject/env-single-source-neg.sh    rc=0 = 故障被抓到且已还原
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
TARGET="tools/ys-editor/ys-unstick-win"
GATE="python3 tools/ys-editor/tests/env-single-source-scan.py"
tmp="$(mktemp -d)" || exit 3
cp "$TARGET" "$tmp/target.bak" || exit 3
restore_copy() { cp "$tmp/target.bak" "$TARGET" 2>/dev/null; }
cleanup() { restore_copy; rm -rf "$tmp"; }
trap cleanup EXIT

# ── 基线：不注入时必须绿 ─────────────────────────────────────────────────────
if ! $GATE >"$tmp/base.log" 2>&1; then
  echo "INJECT-BROKEN env-single-source-neg: 未注入时门禁就不绿（基线坏了）"; tail -4 "$tmp/base.log"; exit 3
fi
grep -q 'verdict=PASS' "$tmp/base.log" || {
  echo "INJECT-BROKEN env-single-source-neg: 基线输出没有 verdict=PASS"; tail -4 "$tmp/base.log"; exit 3; }

# ── 注入：统一入口 → 裸读 DISPLAY ────────────────────────────────────────────
python3 - "$TARGET" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = '. "$(dirname "$(readlink -f "$0")")/ys-env.sh" >/dev/null 2>&1 || true\n'
new = 'export DISPLAY="${DISPLAY:-:1}"   # INJECT：裸读 DISPLAY，不引用统一入口\n'
if s.count(old) != 1:                       # 锚点必须全文唯一，否则注入会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-unstick-win 的入口引用改动过？）',
          file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

$GATE >"$tmp/inj.log" 2>&1; rc=$?
if [ "$rc" = 0 ]; then
  echo "INJECT-FAIL env-single-source-neg: 改回裸读 DISPLAY 后门禁仍绿（门禁空转）"
  tail -4 "$tmp/inj.log"; exit 1
fi
if [ "$rc" = 2 ]; then
  echo "INJECT-BROKEN env-single-source-neg: 门禁自身异常 rc=2（不是抓到了）"
  tail -6 "$tmp/inj.log"; exit 3
fi
grep -q '✗ tools/ys-editor/ys-unstick-win' "$tmp/inj.log" || {
  echo "INJECT-FAIL env-single-source-neg: 变红但不是 ys-unstick-win 那条（判据串了）"
  tail -8 "$tmp/inj.log"; exit 1; }
grep -q '统一环境入口' "$tmp/inj.log" || {
  echo "INJECT-FAIL env-single-source-neg: 报红文案没写清走哪个入口"
  tail -8 "$tmp/inj.log"; exit 1; }
echo "  rc=1 报红：$(grep -m1 '✗ tools/ys-editor/ys-unstick-win' "$tmp/inj.log" | sed 's/^ *//')"

# ── 还原并复验（trap 兜异常路径，这里显式做一遍好给出读数）──────────────────
restore_copy; trap - EXIT
if ! $GATE >"$tmp/post.log" 2>&1; then
  echo "INJECT-FAIL env-single-source-neg: 还原后门禁仍红（还原失败）"; tail -4 "$tmp/post.log"; exit 1
fi
rm -rf "$tmp"
echo "INJECT-PASS env-single-source-neg: 裸读 DISPLAY ⇒ ✗ ys-unstick-win；还原后 verdict=PASS"
exit 0
