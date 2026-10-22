#!/bin/bash
# brief-selftest.sh — ys-brief 决策简报自测（真投票面板 + 负样本）
#
# 用法: brief-selftest.sh [--only <case>]      case ∈ vote-slider | negative | missing-frame
#   --only 是给**注入用例**（tests/inject/brief-neg.sh）用的：造一次故障只跑受影响的那几条，
#   否则每造一次故障都要重跑整份套件。无参数 = 照旧跑全部（行为不变）。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT" || exit 3
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    *) echo "BRIEF-SELFTEST-USAGE 未知参数 $1（可用 --only <case>）" >&2; exit 3 ;;
  esac
done
want(){ [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }
# case 名写错必须报错，不能"零用例 ⇒ 全绿"：注入用例里 typo 会变成一条永远绿的门禁
case "$ONLY" in
  ""|vote-slider|negative|missing-frame) ;;
  *) echo "BRIEF-SELFTEST-USAGE 未知 case「$ONLY」（可用: vote-slider|negative|missing-frame）" >&2; exit 3 ;;
esac
FX=tools/ys-editor/tests/fixtures/unknown
pass=0; fail=0; n=0
ok(){ n=$((n+1)); pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ n=$((n+1)); fail=$((fail+1)); echo "  ✗ $1"; echo "      期望: $2"; echo "      实测: $3"; }
J(){ ./tools/ys-brief "$FX/$1" --json 2>/dev/null; }

if want vote-slider; then
V=$(J vote-slider.png)
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(int(any("倍率" in f["label"] and f["value"]==105 for f in d["fields"])))')" = 1 ] \
  && ok "vote-slider: 抽出「倍率=105」" || bad "倍率字段" "105" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["fields"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(int(any("支持率" in f["label"] and f["value"]==29 for f in d["fields"])))')" = 1 ] \
  && ok "vote-slider: 抽出「支持率=29%」" || bad "支持率字段" "29%" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["fields"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);c=[x for x in d["checks"] if x["id"]=="C1"];print(int(bool(c) and c[0]["level"]=="WARN" and c[0].get("cur_score")==105 and c[0].get("max_score")==10500))')" = 1 ] \
  && ok "vote-slider: C1 报 WARN（105 vs 10500 分）" || bad "C1 WARN" "cur=105 max=10500" "$(echo "$V" | python3 -c 'import sys,json;print([c for c in json.load(sys.stdin)["checks"] if c["id"]=="C1"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')" = BLOCK ] \
  && ok "vote-slider: verdict=BLOCK（有 WARN 就拦）" || bad "verdict" BLOCK "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["verdict"])')"
fi

if want negative; then
V=$(J events-teams.png)
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(int(not [x for x in d["checks"] if x["level"]=="WARN"] and d["verdict"]=="OK"))')" = 1 ] \
  && ok "events-teams（负样本）: 无 WARN，verdict=OK" || bad "负样本" "无 WARN" "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["verdict"],[c["level"] for c in d["checks"]])')"
fi

if want missing-frame; then
./tools/ys-brief /nonexistent.png >/dev/null 2>&1
[ $? = 3 ] && ok "缺帧 → rc=3" || bad "缺帧 rc" 3 "$?"
fi

echo "──────────────────────────────"
echo "BRIEF-RESULT frames=2 assert=$n pass=$pass fail=$fail verdict=$([ $fail -eq 0 ] && echo PASS || echo FAIL)"
[ $fail -eq 0 ]
