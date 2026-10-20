#!/bin/bash
# bisect-cure.sh —— 在**活体假死标本**上二分「解卡手势」的最小有效动作（2026-10-20）
#
# 判据链：ys-clickable 的**双向切换**（列表↔网格视图按钮，两者都是"永远会变"的开关）
#   CLICKABLE = 点得动；STUCK = 点不动；AMBIGUOUS = 只变一次（不猜）
#
# 每个变体都：ys-gui-slot 取焦点 → 手势 → 还焦点 → 探针（两次切换）
# 变量：YS_VARIANTS 覆盖变体列表；YS_PROBE_ONLY=1 只探测不动手势（对照组）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOL="${TOOL:-/home/h/genshin-ts/tools/ys-editor}"
WIN="${WIN:-0x04000008}"
OUT="${OUT:-/tmp/cure-bisect}"
mkdir -p "$OUT"
LIST_XY="${LIST_XY:-2455,134}"     # 列表视图按钮
GRID_XY="${GRID_XY:-2507,134}"     # 网格视图按钮
VARIANTS="${YS_VARIANTS:-none metric rclick rdrag1px rdrag mdrag full}"

probe() {  # $1=tag
  local tag="$1"
  timeout 120 "$TOOL/ys-gui-slot" "$WIN" 60 \
    "$TOOL/ys-clickable" --win "$WIN" --roi 600,110,1950,400 \
      --click "${GRID_XY}:网格" --click "${LIST_XY}:列表" --timeout 1.5 \
      --json "$OUT/probe-$tag.json" --frames "$OUT/frames-$tag" 2>&1 | sed "s/^/  [$tag] /"
  return "${PIPESTATUS[0]}"
}

for v in $VARIANTS; do
  echo "=== variant: $v ($(date +%H:%M:%S)) ==="
  if [ "$v" != none ]; then
    timeout 90 "$TOOL/ys-gui-slot" "$WIN" 30 "$TOOL/ys-gesture-cure" "$v" 2>&1 | sed 's/^/  /'
  fi
  probe "$v"
  rc=$?
  echo "  -> variant $v probe_rc=$rc"
  if [ "$rc" = 0 ]; then
    echo "=== MINIMAL EFFECTIVE ACTION: $v ==="
    break
  fi
done
