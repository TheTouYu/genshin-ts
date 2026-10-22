#!/bin/bash
# probe-selftest.sh — ys-probe 二次探索自测（离线：给每个变体的"动作后帧"）
#
# 用法: probe-selftest.sh [--only <case>]      case ∈ first | second | none | usage
#   --only 是给**注入用例**用的：造一次故障只需要跑受影响的那一条，
#   否则注入一次就要重跑整份套件（实测 4 例 27s，注入用例各跑一遍就翻倍）。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT" || exit 3
FX=tools/ys-editor/tests/fixtures/unknown
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    *) echo "PROBE-SELFTEST-USAGE 未知参数 $1" >&2; exit 3 ;;
  esac
done
want(){ [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }
pass=0; fail=0; n=0
ok(){ n=$((n+1)); pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ n=$((n+1)); fail=$((fail+1)); echo "  ✗ $1"; echo "      期望: $2"; echo "      实测: $3"; }

# 1) 第一个变体就生效 → working=click，且**提前停止**（不试后面的变体）
if want first; then
# 只用 2 个变体：断言"只试了 1 个"在 2 个变体下同样成立，而**注入时**（不提前停止）
# 只会多跑 1 次 ys-act（每次 ~6s）——3 个变体会让注入用例多花 6s，纯浪费。
V=$(./tools/ys-probe --before "$FX/claim-before.png" --after click="$FX/claim-after.png" \
      --after double="$FX/claim-after.png" --variants click,double --json 2>/dev/null)
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["working"])')" = click ] \
  && ok "首个变体生效 → working=click" || bad "working" click "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["working"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["attempts"]))')" = 1 ] \
  && ok "命中即停：只试了 1 个变体（不做无谓动作）" || bad "提前停止" 1 "$(echo "$V" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["attempts"]))')"
fi

# 2) 第一个无变化、第二个生效（"再点一次才生效"的真实形态）→ working=double
if want second; then
V=$(./tools/ys-probe --before "$FX/claim-after.png" --after click="$FX/claim-after.png" \
      --after double="$FX/claim-before.png" --variants click,double --json 2>/dev/null)
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);a=d["attempts"];print(int(d["working"]=="double" and a[0]["verdict"]=="NO-CHANGE" and a[1]["verdict"]=="CHANGED"))')" = 1 ] \
  && ok "click 无变化 → double 有变化：两次尝试都留证" || bad "第二次生效" "click=NO-CHANGE, double=CHANGED, working=double" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["attempts"])')"
fi

# 3) 全部无变化 → NONE + 退出码 1
if want none; then
./tools/ys-probe --before "$FX/claim-after.png" --after click="$FX/claim-after.png" \
   --after double="$FX/claim-after.png" --variants click,double >/dev/null 2>&1
[ $? = 1 ] && ok "全部无变化 → rc=1（NONE）" || bad "无变化 rc" 1 "$?"
fi

# 4) 用法错误 → rc=4
if want usage; then
./tools/ys-probe --bogus >/dev/null 2>&1
[ $? = 4 ] && ok "未知参数 → rc=4" || bad "用法 rc" 4 "$?"
fi

echo "──────────────────────────────"
echo "PROBE-RESULT cases=${ONLY:-4} assert=$n pass=$pass fail=$fail verdict=$([ $fail -eq 0 ] && echo PASS || echo FAIL)"
[ $fail -eq 0 ]
