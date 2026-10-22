#!/bin/bash
# inject/env-single-source-neg.sh — F-20261022-75「X11 环境解析必须只有一个源」的注入用例
#
# 门禁 env-single-source 现在是**严格模式**：扫描 `tools/ys-editor/` 与 `tools/` 顶层，
# 没有任何 EXEMPT / NOTE 通道。所以注入用例也要覆盖**两个根**（各造一次故障）：
#   A `tools/ys-editor/ys-unstick-win`：把入口引用改回裸读 DISPLAY（4946d448 那类回归）
#   B `tools/ys-snap`：删掉 `import ys_env`（等价于改回各自读 os.environ）
# 造故障本身不做任何窗口操作（静态门禁，不占屏）。
#
# 判据分三层，不能只看退出码（rc=2 是门禁自身坏了，与"抓到了"是两件事）：
#   ① 基线未注入 ⇒ rc=0 且 verdict=PASS（否则 INJECT-BROKEN）
#   ② 注入后     ⇒ rc=1、输出点名 `✗ <目标>`、且写明「统一环境入口」
#   ③ 还原后     ⇒ rc=0（trap 保证异常退出也还原；连跑两遍结果一致）
#
# 用法: tests/inject/env-single-source-neg.sh    rc=0 = 两个故障都抓到且已还原
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
GATE="python3 tools/ys-editor/tests/env-single-source-scan.py"
tmp="$(mktemp -d)" || exit 3
declare -a BAK_SRC=() BAK_DST=()
backup() { local b="$tmp/bak.$(basename "$1")"; cp "$1" "$b" || exit 3; BAK_SRC+=("$1"); BAK_DST+=("$b"); }
restore_copy() {
  local i
  for i in "${!BAK_SRC[@]}"; do cp "${BAK_DST[$i]}" "${BAK_SRC[$i]}" 2>/dev/null; done
}
cleanup() { restore_copy; rm -rf "$tmp"; }
trap cleanup EXIT

# 注入：把 $1 里的 $OLD 换成 $NEW（要求 OLD 全文唯一，否则 INJECT-BROKEN）
inject() {
  OLD="$2" NEW="$3" python3 - "$1" <<'PY' || exit 3
import os, sys
p, old, new = sys.argv[1], os.environ["OLD"], os.environ["NEW"]
s = open(p, encoding='utf-8').read()
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效: %s（命中 %d 次）' % (p, s.count(old)),
          file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
}

# 断言门禁对 $1 报红（rc=1 且点名该文件，且文案写明走哪个入口）
expect_red() {
  $GATE >"$tmp/inj.log" 2>&1; local rc=$?
  if [ "$rc" = 0 ]; then
    echo "INJECT-FAIL env-single-source-neg: 注入 $1 后门禁仍绿（门禁空转）"
    tail -4 "$tmp/inj.log"; exit 1
  fi
  if [ "$rc" = 2 ]; then
    echo "INJECT-BROKEN env-single-source-neg: 门禁自身异常 rc=2（不是抓到了）"
    tail -6 "$tmp/inj.log"; exit 3
  fi
  grep -q "✗ $1" "$tmp/inj.log" || {
    echo "INJECT-FAIL env-single-source-neg: 变红但不是 $1 那条（判据串了）"
    tail -8 "$tmp/inj.log"; exit 1; }
  grep -q '统一环境入口' "$tmp/inj.log" || {
    echo "INJECT-FAIL env-single-source-neg: 报红文案没写清走哪个入口"
    tail -8 "$tmp/inj.log"; exit 1; }
  echo "  rc=1 报红：$(grep -m1 "✗ $1" "$tmp/inj.log" | sed 's/^ *//')"
}

# ── 基线：不注入时必须绿 ─────────────────────────────────────────────────────
if ! $GATE >"$tmp/base.log" 2>&1; then
  echo "INJECT-BROKEN env-single-source-neg: 未注入时门禁就不绿（基线坏了）"; tail -4 "$tmp/base.log"; exit 3
fi
grep -q 'verdict=PASS' "$tmp/base.log" || {
  echo "INJECT-BROKEN env-single-source-neg: 基线输出没有 verdict=PASS"; tail -4 "$tmp/base.log"; exit 3; }

# ── 场景 A：bash 工具，入口引用 → 裸读 DISPLAY ───────────────────────────────
A_TARGET="tools/ys-editor/ys-unstick-win"
backup "$A_TARGET"
inject "$A_TARGET" \
  '. "$(dirname "$(readlink -f "$0")")/ys-env.sh" >/dev/null 2>&1 || true' \
  'export DISPLAY="${DISPLAY:-:1}"   # INJECT：裸读 DISPLAY，不引用统一入口'
expect_red "$A_TARGET"

# ── 场景 B：顶层 python 工具，删掉 import ys_env ─────────────────────────────
B_TARGET="tools/ys-snap"
backup "$B_TARGET"
inject "$B_TARGET" 'import ys_env  # noqa: E402' '# INJECT：删掉统一入口引用（等价于改回各自读 os.environ）'
expect_red "$B_TARGET"

# ── 还原并复验（trap 兜异常路径，这里显式做一遍好给出读数）──────────────────
restore_copy; trap - EXIT
if ! $GATE >"$tmp/post.log" 2>&1; then
  echo "INJECT-FAIL env-single-source-neg: 还原后门禁仍红（还原失败）"; tail -4 "$tmp/post.log"; exit 1
fi
rm -rf "$tmp"
echo "INJECT-PASS env-single-source-neg: 裸读环境 ⇒ ✗ ys-unstick-win + ✗ tools/ys-snap；还原后 verdict=PASS"
exit 0
