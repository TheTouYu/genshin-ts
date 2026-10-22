#!/bin/bash
# collect02.sh — 单个 ys-gui-slot 焦点时段内采集角色故事页全部标签（.02 版）
# 相比 .01 的改进：
#   1) 每步滚动后用「连续两帧 md5 相同」等稳定，不用固定 sleep
#   2) 到底判定：一次 no-change 后再滚一次复认，两次相同才算到底
#   3) 每帧立即落盘，中途超时也有部分产物
# 槽内执行：YS_SLOT_ACTIVE=1 已由 ys-gui-slot 导出
set -u
cd /home/h/genshin-ts
. tools/ys-editor/ys-env.sh
PC=tools/ys-editor/ys-pointer-click
CAP=tools/ys-editor/ys-capture
PUT=tools/ys-editor/ys-put
D=gui-test/.02/frames
LOG=gui-test/.02/collect.log
: > "$LOG"

PX=1150; PY=240; PW=1300; PH=1130   # 正文面板区域（.01/.02 帧离线验证过）
PANEL_X=1850; PANEL_Y=780           # 正文面板悬停点（滚轮作用区）

grab()  { "$CAP" latest --out "$1" --format png >>"$LOG" 2>&1; }
md5p()  { magick "$1" -crop ${PW}x${PH}+${PX}+${PY} +repage -format '%#' info: 2>/dev/null; }

# settle <out.png>：抓帧直到连续两帧面板 md5 相同（动画结束），echo 最终 md5
settle() {
  local out="$1" ma="" mb="" i
  grab "$out"; ma=$(md5p "$out")
  for i in 1 2 3 4 5 6 7 8; do
    grab "$out.p.png"; mb=$(md5p "$out.p.png")
    if [ "$ma" = "$mb" ]; then rm -f "$out.p.png"; echo "$ma"; return 0; fi
    mv "$out.p.png" "$out"; ma="$mb"
  done
  echo "$ma"
}

# 滚轮（槽内允许的注入通道）
wdown() { xdotool click --repeat "$1" --delay 60 5; }
wup()   { xdotool click --repeat "$1" --delay 40 4; }

TABS=(
  "profile|角色详细|147|222"
  "story1|角色故事1|152|324"
  "story2|角色故事2|152|426"
  "story3|角色故事3|150|528"
  "vision|神之眼|131|631"
  "story4|角色故事4|159|732"
  "story5|角色故事5|158|836"
  "loom|命运的织机|163|937"
)

grab "$D/p00-initial.png"
echo "== initial frame" >>"$LOG"

PREV_K00=""
for T in "${TABS[@]}"; do
  IFS='|' read -r id label cx cy <<<"$T"
  echo "== [$id] $label click($cx,$cy) $(date +%T)" >>"$LOG"
  "$PC" "$cx" "$cy" >>"$LOG" 2>&1 || echo "  [WARN] click rc=$?" >>"$LOG"
  "$PUT" "$PANEL_X" "$PANEL_Y" >>"$LOG" 2>&1
  wup 14                      # 回顶
  M00=$(settle "$D/${id}-k00.png")
  echo "  k00 md5=$M00" >>"$LOG"
  if [ -n "$PREV_K00" ] && [ "$M00" = "$PREV_K00" ]; then
    echo "  [WARN] k00 same as prev tab — click may have missed" >>"$LOG"
  fi
  PREV_K00="$M00"

  PREV="$M00"; N=1; NOCHANGE=0
  for i in $(seq 1 26); do
    wdown 4
    M=$(settle "$D/${id}-t.png")
    if [ "$M" = "$PREV" ]; then
      NOCHANGE=$((NOCHANGE+1))
      if [ "$NOCHANGE" -ge 2 ]; then echo "  bottom at k$((N-1)) (confirmed no-change x2), frames=$N" >>"$LOG"; break; fi
    else
      NOCHANGE=0
      mv "$D/${id}-t.png" "$D/${id}-k$(printf %02d "$N").png"
      PREV="$M"; N=$((N+1))
    fi
    [ "$i" -eq 26 ] && echo "  [WARN] 26 steps without bottom-confirm, frames=$N" >>"$LOG"
  done
  rm -f "$D/${id}-t.png"
done
echo "DONE $(date +%T)" >>"$LOG"
