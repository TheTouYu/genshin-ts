#!/usr/bin/env bash
# own-guard — 注入前所有权断言的离线自测（夹具驱动，零占屏零注入）
# 判据：目标窗非 ACTIVE / 跨桌面 / 找不到窗 ⇒ 必须 REFUSE(4)；ACTIVE 且 ds 含 cur ⇒ OK(0)。
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OWN="$HERE/ys-own"
pass=0; fail=0
chk() {  # chk <期望rc> <名称> <夹具行…>
  local want="$1" name="$2"; shift 2
  printf '%s\n' "$@" > /tmp/own-fixture.txt
  "$OWN" --attrib-file /tmp/own-fixture.txt >/tmp/own.out 2>&1; local rc=$?
  if [ "$rc" = "$want" ]; then pass=$((pass+1)); echo "  PASS $name (rc=$rc)"
  else fail=$((fail+1)); echo "  FAIL $name 期望 rc=$want 实得 rc=$rc"; sed 's/^/        /' /tmp/own.out; fi
}
chk 0 "ACTIVE+同桌面 ⇒ 允许" \
  '[6] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=6 | act=1'
chk 0 "ACTIVE 写在 min 之后（真实格式）⇒ 允许" \
  '[7] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 |ACTIVE | ds=2 | cur=2 | idx=7 | act=1'
chk 4 "非 ACTIVE ⇒ 拒绝" \
  '[6] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=6 | act=0'
chk 4 "跨桌面桌面(ds=3/cur=2) ⇒ 拒绝" \
  '[6] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=3 | cur=2 | idx=6 | act=1'
chk 4 "找不到目标窗 ⇒ 拒绝" \
  '[7] 别的窗口 | firefox | 21,13 1663x889 | min=0 |ACTIVE | ds=2 | cur=2 | idx=7 | act=1'
chk 0 "ds 不限定(-1) 视为可达" \
  '[6] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=-1 | cur=2 | idx=6 | act=1'
echo "OWN-GUARD-RESULT pass=$pass fail=$fail verdict=$([ "$fail" = 0 ] && echo PASS || echo FAIL)"
[ "$fail" = 0 ]
