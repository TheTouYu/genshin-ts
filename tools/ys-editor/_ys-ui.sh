#!/bin/bash
# _ys-ui.sh — 共享 UI 判据库（被 ys-playtest-start/stop source）
# 核心方法：**判据只截 40x40 的小块**（全窗截图 5893ms vs 裁切 166ms，36 倍）
#   用法：. "$(dirname "$0")/_ys-ui.sh"; judge 185 320   → 输出 "r g b"
YS_SNAP="${YS_SNAP:-/tmp/ys-ui-judge.png}"
judge() {  # $1=x $2=y  采样该点颜色（只截 40x40）
  local x=$1 y=$2
  import -window "${YS_WIN:-0x01400001}" -crop 40x40+$((x-20))+$((y-20)) +repage "$YS_SNAP" 2>/dev/null
  magick "$YS_SNAP" -format '%[pixel:p{20,20}]' info: 2>/dev/null | sed -E 's/^[a-z]+\(([0-9]+),([0-9]+),([0-9]+).*/\1 \2 \3/'
}
is_light() { local r g b; read -r r g b <<< "$(judge "$1" "$2")"; [ -n "${r:-}" ] && [ "$r" -gt 200 ] && [ "$g" -gt 190 ]; }
is_dark()  { local r g b; read -r r g b <<< "$(judge "$1" "$2")"; [ -n "${r:-}" ] && { [ "$g" -le $(( b + 25 )) ]; }; }
wait_light() { local i=0; while [ "$i" -lt "$3" ]; do is_light "$1" "$2" && return 0; sleep 0.25; i=$((i+1)); done; return 1; }
wait_dark()  { local i=0; while [ "$i" -lt "$3" ]; do is_dark  "$1" "$2" && return 0; sleep 0.25; i=$((i+1)); done; return 1; }
