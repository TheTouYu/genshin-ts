#!/bin/bash
# trigger-matrix.sh —— 假死**触发矩阵**：谁把它弄死的（2026-10-20）
#
# 每一步 = 「先确认健康（full 手势 + 探针）→ 施加一个候选触发 → 探针判活」
# 候选触发：wait（不动）/ slot（只切焦点：激活+还焦点）/ hover（只把指针移到树上）/
#           click1（点一次会改变 UI 的树行）/ click2（连点两次）/ rightclick（右键点一下）
# 判据：探针 verdict；记录每一步的 JSON 与帧到 $OUT。
set -u
TOOL="${TOOL:-/home/h/genshin-ts/tools/ys-editor}"
WIN="${WIN:-0x04000008}"
OUT="${OUT:-/tmp/trigger-matrix}"
mkdir -p "$OUT"
TIMELINE="$OUT/timeline.txt"
LIST_XY="${LIST_XY:-2455,134}"
GRID_XY="${GRID_XY:-2507,134}"
TREE_A="${TREE_A:-120,300}"   # 职业节点图
TREE_B="${TREE_B:-120,260}"   # 状态节点图
TRIGGERS="${TRIGGERS:-wait slot hover click1 click2 rightclick}"

note() { echo "$(date +%H:%M:%S) $*" | tee -a "$TIMELINE"; }

probe() { # $1=tag ; 返回 0=CLICKABLE
  timeout 120 "$TOOL/ys-gui-slot" "$WIN" 60 \
    "$TOOL/ys-clickable" --win "$WIN" --roi 600,110,1950,400 \
      --click "${GRID_XY}:网格" --click "${LIST_XY}:列表" --timeout 1.5 \
      --json "$OUT/probe-$1.json" > "$OUT/probe-$1.log" 2>&1
  local rc=$?
  note "  probe[$1] rc=$rc $(python3 -c "import json;d=json.load(open('$OUT/probe-$1.json'));print(d['verdict'],[ (s['label'],s['changed_px']) for s in d['steps']])" 2>/dev/null)"
  return $rc
}

cure() { # 用 full 手势解卡，最多 2 次
  local i
  for i in 1 2; do
    timeout 90 "$TOOL/ys-gui-slot" "$WIN" 30 "$TOOL/ys-gesture-cure" full > "$OUT/cure-$i.log" 2>&1
    probe "cure$i" && return 0
  done
  return 1
}

for trig in $TRIGGERS; do
  note "=== trigger: $trig ==="
  cure || { note "FATAL 无法恢复到健康态，停止"; break; }
  case "$trig" in
    wait)
      for i in $(seq 1 50); do sleep 0.1; done ;;
    slot)
      timeout 60 "$TOOL/ys-gui-slot" "$WIN" 20 true > "$OUT/trig-slot.log" 2>&1 ;;
    hover)
      timeout 60 "$TOOL/ys-gui-slot" "$WIN" 20 bash -c \
        "ydotool mousemove -a 120 300 2>/dev/null || ydotool mousemove 120 300" > "$OUT/trig-hover.log" 2>&1 ;;
    click1)
      timeout 60 "$TOOL/ys-gui-slot" "$WIN" 20 "$TOOL/ys-pointer-click" "${TREE_A%,*}" "${TREE_A#*,}" \
        > "$OUT/trig-click1.log" 2>&1 ;;
    click2)
      timeout 90 "$TOOL/ys-gui-slot" "$WIN" 40 bash -c \
        "$TOOL/ys-pointer-click ${TREE_A%,*} ${TREE_A#*,}; $TOOL/ys-pointer-click ${TREE_B%,*} ${TREE_B#*,}" \
        > "$OUT/trig-click2.log" 2>&1 ;;
    rightclick)
      timeout 60 "$TOOL/ys-gui-slot" "$WIN" 20 bash -c \
        "ydotool click 0xC1" > "$OUT/trig-rightclick.log" 2>&1 ;;
  esac
  note "  trigger applied rc=$?"
  probe "after-$trig"
done
