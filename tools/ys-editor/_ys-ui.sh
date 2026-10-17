#!/bin/bash
# _ys-ui.sh — UI 判据/像素原语（**全部转发 ys-state**；坐标与阈值只存在 ys-state 一处）
#
# 为什么改成转发（2026-10-17 验收契约 §1/§6，门槛⑤ 单一源）：
#   本文件原来自带 judge / is_light / is_dark 的阈值（R>200 且 G>190、G<=B+25）与取样语义，
#   与 ys-state 的判据是**两份实现**；同屏两处判据可以给出相反答案，这正是要消灭的重复。
#   现在坐标、阈值、谓词只在 `tools/ys-editor/ys-state`；这里只保留**函数签名**做薄转发，
#   既有调用方（ys-playtest-start / ys-playtest-stop / ys-round 等）不改签名即可继续用。
#
# 用法：
#   . "$(dirname "$0")/_ys-ui.sh"
#   judge  X Y                 → "r g b"（该点原始像素，调试用）
#   is_light X Y               → 0/1（转发 ys-state 的 light 谓词）
#   is_dark  X Y               → 0/1
#   wait_light X Y 次数        → 轮询到 is_light 成立（每次间隔 0.25s）
#   wait_dark  X Y 次数
#   probe <探针名>              → 0/1（控件是否可见；探针名见 `ys-state --probes`）
#   wait_probe <探针名> [次数]   → 轮询到该探针可见（缺省 60 次 ≈ 15s）
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
YS_STATE="${YS_STATE:-$HERE/ys-state}"
YS_FRAME_ARGS=()
[ -n "${YS_PROBE_FRAME:-}" ] && YS_FRAME_ARGS=(--frame "$YS_PROBE_FRAME")

judge() {  # $1=x $2=y  → 打印 "r g b"（失败时 stdout 为空 + stderr 出声，别静默）
  local o
  o=$("$YS_STATE" --pixel "$1" "$2" ${YS_FRAME_ARGS[@]+"${YS_FRAME_ARGS[@]}"} 2>/tmp/_ys-ui-px.err)
  if [ -z "$o" ] && [ -s /tmp/_ys-ui-px.err ]; then
    echo "[_ys-ui] ⚠ --pixel 失败：$(head -1 /tmp/_ys-ui-px.err)" >&2
  fi
  [ -n "$o" ] && printf '%s\n' "$o"
}
is_light() { "$YS_STATE" --pred light "$1" "$2" ${YS_FRAME_ARGS[@]+"${YS_FRAME_ARGS[@]}"} >/dev/null 2>&1; }
is_dark()  { "$YS_STATE" --pred dark  "$1" "$2" ${YS_FRAME_ARGS[@]+"${YS_FRAME_ARGS[@]}"} >/dev/null 2>&1; }
wait_light() { local i=0 n=${3:-60}; while [ "$i" -lt "$n" ]; do is_light "$1" "$2" && return 0; sleep 0.25; i=$((i+1)); done; return 1; }
wait_dark()  { local i=0 n=${3:-60}; while [ "$i" -lt "$n" ]; do is_dark  "$1" "$2" && return 0; sleep 0.25; i=$((i+1)); done; return 1; }

probe() {       # $1=探针名
  "$YS_STATE" --probe "$1" ${YS_FRAME_ARGS[@]+"${YS_FRAME_ARGS[@]}"} >/dev/null 2>&1
}
wait_probe() {  # $1=探针名 $2=次数
  local i=0 n=${2:-60}
  while [ "$i" -lt "$n" ]; do probe "$1" && return 0; sleep 0.25; i=$((i+1)); done
  return 1
}
