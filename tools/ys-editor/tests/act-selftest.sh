#!/bin/bash
# act-selftest.sh — ys-act 编排层自测（判据全部来自 ys-watch / ys-afford，本工具不复制判据）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT" || exit 3
# 本套件会调 ys-act，而 ys-act 内部**必走 ys-gui-slot**（真抬窗抢焦点）。
# 这些用例判的是"变化账/rc 透传"，与真焦点无关 ⇒ 走假槽（YS_SLOT_TEST=1，不碰屏幕）。
# 2026-10-21/F-20261021-54：门禁里不许偷偷占用户屏幕；要真屏必须显式 YS_ALLOW_SCREEN_TEST。
export YS_SLOT_TEST="${YS_SLOT_TEST:-1}"
FX=tools/ys-editor/tests/fixtures/unknown
pass=0; fail=0; n=0
ok(){ n=$((n+1)); pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ n=$((n+1)); fail=$((fail+1)); echo "  ✗ $1"; echo "      期望: $2"; echo "      实测: $3"; }
j(){ "$@" --json 2>/dev/null; }

# 1) 领奖前后：必须报 text_removed 领取 + CHANGED
V=$(j ./tools/ys-act --before "$FX/claim-before.png" --after "$FX/claim-after.png" --roi 1650,400,300,220)
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(int(any(e.get("kind")=="text_removed" and e.get("text")=="领取" for e in d["changes"])))')" = 1 ] \
  && ok "claim: 变化事件含 text_removed「领取」" || bad "claim text_removed" "含「领取」两次" "$(echo "$V" | python3 -c 'import sys,json;print([e.get("kind") for e in json.load(sys.stdin)["changes"]])')"
[ "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')" = CHANGED ] \
  && ok "claim: verdict=CHANGED" || bad "claim verdict" CHANGED "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(int(d["badge_before"]>0 and d["badge_after"]==0 and len(d["badge_delta"]["removed"])>0))')" = 1 ] \
  && ok "claim: 红点 3→0，badge_delta.removed 非空（红点=待办）" || bad "claim badge_delta" "before>0 且 after=0 且 removed 非空" "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["badge_before"],d["badge_after"],d["badge_delta"])')"

# 2) 同帧两次：NO-CHANGE
V=$(j ./tools/ys-act --before "$FX/claim-after.png" --after "$FX/claim-after.png")
[ "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')" = NO-CHANGE ] \
  && ok "同帧: verdict=NO-CHANGE" || bad "同帧 verdict" NO-CHANGE "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')"

# 3) 动作 rc≠0：FAIL 且原样透传（不吞）
./tools/ys-act --before "$FX/claim-after.png" --after "$FX/claim-after.png" -- /bin/false >/dev/null 2>&1
RC=$?
[ "$RC" = 1 ] && ok "动作 rc=1 原样透传" || bad "动作 rc 透传" "1" "$RC"
V=$(./tools/ys-act --before "$FX/claim-after.png" --after "$FX/claim-after.png" --json -- /bin/false 2>/dev/null)
[ "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')" = FAIL ] \
  && ok "动作 rc≠0 → verdict=FAIL" || bad "FAIL verdict" FAIL "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')"

# 4) 失败路径
./tools/ys-act --before /nonexistent.png --after "$FX/claim-after.png" >/dev/null 2>&1
[ $? = 3 ] && ok "缺帧 → rc=3" || bad "缺帧 rc" 3 "$?"
./tools/ys-act --bogus >/dev/null 2>&1
[ $? = 2 ] && ok "未知参数 → rc=2（ACT-USAGE-ERROR）" || bad "用法 rc" 2 "$?"

echo "──────────────────────────────"
echo "ACT-RESULT cases=6 assert=$n pass=$pass fail=$fail verdict=$([ $fail -eq 0 ] && echo PASS || echo FAIL)"
[ $fail -eq 0 ]
