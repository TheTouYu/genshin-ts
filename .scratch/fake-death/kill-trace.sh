#!/bin/bash
# kill-trace.sh —— 抓「一次点击把输入弄死」的**完整 X 协议轨迹**（2026-10-20）
# 前置：指针注入必须活着（ys-clickable 自带自证，失效会直接 ERROR 而不是 STUCK）
# 产物：$OUT/xrec.tsv（xrec 全客户端 + 全请求）+ 每一步 probe JSON + timeline
set -u
TOOL="${TOOL:-/home/h/genshin-ts/tools/ys-editor}"
WIN="${WIN:-0x04000008}"
OUT="${OUT:-/tmp/kill-trace}"
mkdir -p "$OUT"
TL="$OUT/timeline.txt"
BASE_W="$(xdotool getwindowgeometry "$WIN" 2>/dev/null | awk '/Geometry/{print $2}' | cut -dx -f1)"
BASE_W="${BASE_W:-2560}"
GRID_X=$(( BASE_W - 53 )); LIST_X=$(( BASE_W - 105 ))
note() { echo "$(date +%H:%M:%S) $*" | tee -a "$TL"; }

probe() {
  timeout 120 "$TOOL/ys-gui-slot" "$WIN" 60 \
    "$TOOL/ys-clickable" --win "$WIN" --roi 600,110,$((BASE_W-620)),400 \
      --click "${GRID_X},134:网格" --click "${LIST_X},134:列表" --timeout 1.5 \
      --json "$OUT/probe-$1.json" > "$OUT/probe-$1.log" 2>&1
  local rc=$?
  note "  probe[$1] rc=$rc $(python3 -c "import json;d=json.load(open('$OUT/probe-$1.json'));print(d.get('verdict'),d.get('pointer_movable'),[(s.get('label'),s.get('changed_px'),s.get('verdict')) for s in d.get('steps',[])])" 2>/dev/null)"
  return $rc
}

note "window width=$BASE_W grid=($GRID_X,134) list=($LIST_X,134)"
# 0) 起点必须健康
if ! probe pre; then
  note "起点不健康，先解卡"
  timeout 90 "$TOOL/ys-gui-slot" "$WIN" 30 "$TOOL/ys-gesture-cure" full >/dev/null 2>&1
  probe pre2 || { note "FATAL 起点无法恢复"; exit 1; }
fi
# 1) 起记录仪（全客户端，20s）
"$TOOL/ys-xrec" --out "$OUT/xrec.tsv" --seconds 22 --all >/dev/null 2>&1 &
REC=$!
for i in $(seq 1 30); do [ -f "$OUT/xrec.tsv" ] && break; sleep 0.1; done
sleep 1 # --guard-force
note "recorder up pid=$REC"
# 2) 致死点击（树行）
note "KILL CLICK on tree row (120,300)"
timeout 60 "$TOOL/ys-gui-slot" "$WIN" 20 "$TOOL/ys-pointer-click" 120 300 >> "$OUT/killclick.log" 2>&1
note "  killclick rc=$?"
sleep 1 # --guard-force
# 3) 判活
probe post
wait $REC 2>/dev/null
note "recorder done lines=$(wc -l < "$OUT/xrec.tsv" 2>/dev/null)"
