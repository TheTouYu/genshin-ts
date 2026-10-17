#!/bin/bash
# slider-selftest.sh — ys-slider 离线自测（1 真滑条帧 + 3 负样本）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT" || exit 3
FX=tools/ys-editor/tests/fixtures/unknown
pass=0; fail=0; n=0
ok(){ n=$((n+1)); pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ n=$((n+1)); fail=$((fail+1)); echo "  ✗ $1"; echo "      期望: $2"; echo "      实测: $3"; }
J(){ ./tools/ys-slider "$FX/$1" --json 2>/dev/null; }

V=$(J vote-slider.png)
[ "$(echo "$V" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["sliders"]))')" = 1 ] \
  && ok "vote-slider: 检出 1 条滑条" || bad "vote-slider n" 1 "$(echo "$V" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["sliders"]))')"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin)["sliders"][0];print(d["value_max"])')" = 100 ] \
  && ok "vote-slider: value_max=100（OCR 两端口径）" || bad "value_max" 100 "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sliders"][0]["value_max"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin)["sliders"][0];t=[x for x in d["drag_targets"] if x["value"]==100];print(int(bool(t) and abs(t[0]["x"]-1584)<=40))')" = 1 ] \
  && ok "vote-slider: 拖到上限的目标点 x≈1584" || bad "drag_target max" "x≈1584±40" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sliders"][0]["drag_targets"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin)["sliders"][0];print(int(abs(d["track_bbox"][1]+d["track_bbox"][3]//2-876)<=16 and d["track_bbox"][2]>=300))')" = 1 ] \
  && ok "vote-slider: 轨道 y≈876 且宽度 ≥300" || bad "track_bbox" "y≈876±16, w≥300" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sliders"][0]["track_bbox"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin)["sliders"][0];print(int(d["knob_cx"] is not None and abs(d["knob_cx"]-978)<=60))')" = 1 ] \
  && ok "vote-slider: 滑块 x≈978（菱形钮）" || bad "knob_cx" "≈978±60" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sliders"][0]["knob_cx"])')"

for f in claim-before events-teams battle-report; do
  V=$(J $f.png)
  [ "$(echo "$V" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["sliders"]))')" = 0 ] \
    && ok "$f（负样本）: 0 条滑条" || bad "$f 负样本" 0 "$(echo "$V" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["sliders"]))')"
done

./tools/ys-slider /nonexistent.png >/dev/null 2>&1
[ $? = 3 ] && ok "缺帧 → rc=3" || bad "缺帧 rc" 3 "$?"

echo "──────────────────────────────"
echo "SLIDER-RESULT frames=8 assert=$n pass=$pass fail=$fail verdict=$([ $fail -eq 0 ] && echo PASS || echo FAIL)"
[ $fail -eq 0 ]
