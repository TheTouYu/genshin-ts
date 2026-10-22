#!/bin/bash
# inject/no-dead-window-id-neg.sh — F-20261022-76「窗口 id 必须走唯一入口」的注入用例
#
# 门禁 `no-dead-window-id` 是严格静态扫描：生产工具里出现 7-8 位十六进制窗口 id 字面量即红。
# 两个场景各造一次故障（覆盖 bash 与 python 两种写法）：
#   A `tools/ys-editor/ys-cover`（bash）：把「解析不到就报错退出」换回 `WIN="${WIN:-0x1800001}"`
#   B `tools/ys-editor/ys-states`（python）：把 `ys_win.resolve(...)` 换回 `return "0x1800001"`
# 造故障不做任何窗口操作（纯静态扫描，不占屏）。
#
# 判据三层（rc=2 之类不能与"抓到了"混为一谈）：
#   ① 基线未注入 ⇒ rc=0 且 verdict=PASS
#   ② 注入后     ⇒ rc=1、`verdict=FAIL`、输出点名 `<文件>:<行>`
#   ③ 还原后     ⇒ rc=0（trap 保证异常退出也还原，连跑两遍结果一致）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
GATE="bash tools/ys-editor/tests/no-dead-window-id.selftest.sh"
tmp="$(mktemp -d)" || exit 3
declare -a BAK_SRC=() BAK_DST=()
backup() { local b="$tmp/bak.$(basename "$1")"; cp "$1" "$b" || exit 3; BAK_SRC+=("$1"); BAK_DST+=("$b"); }
restore_copy() { local i; for i in "${!BAK_SRC[@]}"; do cp "${BAK_DST[$i]}" "${BAK_SRC[$i]}" 2>/dev/null; done; }
cleanup() { restore_copy; rm -rf "$tmp"; }
trap cleanup EXIT

inject() {   # $1=文件 $2=旧串 $3=新串（旧串必须全文唯一）
  OLD="$2" NEW="$3" python3 - "$1" <<'PY' || exit 3
import os, sys
p, old, new = sys.argv[1], os.environ["OLD"], os.environ["NEW"]
s = open(p, encoding='utf-8').read()
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效: %s（命中 %d 次）' % (p, s.count(old)), file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
}

expect_red() {   # 断言门禁对 $1 报红
  $GATE >"$tmp/inj.log" 2>&1; local rc=$?
  if [ "$rc" = 0 ]; then
    echo "INJECT-FAIL no-dead-window-id-neg: 注入 $1 后门禁仍绿（门禁空转）"; tail -4 "$tmp/inj.log"; exit 1
  fi
  grep -q 'verdict=FAIL' "$tmp/inj.log" || {
    echo "INJECT-FAIL no-dead-window-id-neg: rc=$rc 但没给 verdict=FAIL"; tail -6 "$tmp/inj.log"; exit 1; }
  grep -q "✗\? *$1:" "$tmp/inj.log" || grep -q "$1:" "$tmp/inj.log" || {
    echo "INJECT-FAIL no-dead-window-id-neg: 变红但没点名 $1"; tail -8 "$tmp/inj.log"; exit 1; }
  echo "  rc=1 报红：$(grep -m1 "$1:" "$tmp/inj.log" | sed 's/^ *//')"
}

# ── 基线 ────────────────────────────────────────────────────────────────────
if ! $GATE >"$tmp/base.log" 2>&1; then
  echo "INJECT-BROKEN no-dead-window-id-neg: 未注入时门禁就不绿（基线坏了）"; tail -4 "$tmp/base.log"; exit 3
fi
grep -q 'verdict=PASS' "$tmp/base.log" || {
  echo "INJECT-BROKEN no-dead-window-id-neg: 基线没有 verdict=PASS"; tail -4 "$tmp/base.log"; exit 3; }

# ── 场景 A：bash 兜底写死 id ────────────────────────────────────────────────
A_TARGET="tools/ys-editor/ys-cover"
backup "$A_TARGET"
inject "$A_TARGET" \
  '[ -n "$WIN" ] || { echo "[ys-cover] 解析不到窗口 id（先 source ys-env.sh 或打开千星）" >&2; exit 3; }' \
  'WIN="${WIN:-0x1800001}"   # INJECT：写死 id 兜底'
expect_red "$A_TARGET"

# ── 场景 B：python 解析换回写死 id ──────────────────────────────────────────
B_TARGET="tools/ys-editor/ys-states"
backup "$B_TARGET"
inject "$B_TARGET" '    return ys_win.resolve(prefer_sandbox=True)' '    return "0x1800001"   # INJECT'
expect_red "$B_TARGET"

# ── 还原并复验 ──────────────────────────────────────────────────────────────
restore_copy; trap - EXIT
if ! $GATE >"$tmp/post.log" 2>&1; then
  echo "INJECT-FAIL no-dead-window-id-neg: 还原后门禁仍红（还原失败）"; tail -4 "$tmp/post.log"; exit 1
fi
rm -rf "$tmp"
echo "INJECT-PASS no-dead-window-id-neg: 写死 id ⇒ ✗ ys-cover + ✗ ys-states；还原后 verdict=PASS"
exit 0
