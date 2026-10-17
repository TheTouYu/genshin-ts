#!/bin/bash
# ys-observe 自测（gui-stack 票 01 的验收项固化版）
# 设计原则 P4「判据可回归」：改这个工具后跑一遍，坏了当场红——而不是等到游戏里白烧一轮。
# 用法: bash tests/observe.selftest.sh     退出码 0=全绿
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export DISPLAY="${DISPLAY:-:1}"
O="$HERE/ys-observe"; PASS=0; FAIL=0
t() { # t <名称> <期望退出码> <命令…>
  local name="$1" want="$2"; shift 2
  local out code
  out=$("$@" 2>&1); code=$?
  if [ "$code" = "$want" ]; then printf '  ✓ %-34s 退出码=%s\n' "$name" "$code"; PASS=$((PASS+1))
  else printf '  ✗ %-34s 期望退出码 %s 实得 %s\n     输出: %s\n' "$name" "$want" "$code" "$out"; FAIL=$((FAIL+1)); fi
  LAST_OUT="$out"
}
contains() { case "$LAST_OUT" in *"$1"*) printf '  ✓ 输出含 %s\n' "$1"; PASS=$((PASS+1));; *) printf '  ✗ 输出缺 %s\n     实得: %s\n' "$1" "$LAST_OUT"; FAIL=$((FAIL+1));; esac; }
absent() { case "$LAST_OUT" in *"$1"*) printf '  ✗ 输出不该含 %s\n     实得: %s\n' "$1" "$LAST_OUT"; FAIL=$((FAIL+1));; *) printf '  ✓ 输出不含 %s\n' "$1"; PASS=$((PASS+1));; esac; }

echo "══ ys-observe 自测 $(date '+%F %T') ══"
echo "① 窗口不存在 → 拒绝取数（退出 3）"
t "坏窗口 id" 3 env YS_WIN=0x09999999 "$O" px 1 1
contains WINDOW_NOT_FOUND
echo "② 探针越界 → 拒绝（退出 3；ImageMagick 会钳制坐标，必须自己校验）"
t "越界 px" 3 "$O" px 9999 9999
contains PROBE_OUT_OF_RANGE
t "越界 region" 3 "$O" region 2500 1300 200 200
contains PROBE_OUT_OF_RANGE
echo "③ 非法模式"
t "坏模式" 3 "$O" nope
echo "④ 正常路径（若原神不在栈顶会得 NOT_ATOP，属预期而非失败）"
t "px 正常" 0 "$O" px 300 300
if [ $? -eq 0 ]; then :; fi
case "$LAST_OUT" in
  *NOT_ATOP*) printf '  · 原神不在栈顶 → 属预期（本工具的任务就是拒绝这种情况）\n';;
  *) contains '"fresh":true'; contains '"atop":true'; contains diffFromPrev;;
esac
echo "⑤ --reuse 必须显式标注"
t "--reuse" 0 "$O" --reuse px 300 300
case "$LAST_OUT" in *reused\":true*) printf '  ✓ 标注了 reused:true\n'; PASS=$((PASS+1));; *NOT_ATOP*) printf '  · 不在栈顶，跳过\n';; *) printf '  ✗ 未标注 reused\n'; FAIL=$((FAIL+1));; esac

echo "────────────────"
if [ "$FAIL" -gt 0 ]; then echo "✗ $FAIL 项失败 / $PASS 项通过"; exit 1; fi
echo "✓ 全绿（$PASS 项）"; exit 0
