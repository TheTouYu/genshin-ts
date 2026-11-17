#!/usr/bin/env bash
# 力输入套件 UI 部署：46 控件（23 textbox + 23 cursor-area）挂容器节点 1073741863
# 顺序=先全部文本框 → 再热区（后建=叠上层）→ 踢球热区最后。每步 --write 自动备份。
set -u
export GSTS_LOCALLOW_DIR=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow
cd /home/h/genshin-ts
MAP="$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741827/1073741827.gil"
NODE=1073741863
LOG=/tmp/fk-deploy-ui.log
: > "$LOG"

# 锁定起点 SHA
sha256sum "$MAP" | tee -a "$LOG"

# type name x y w h
CONTROLS=(
  "client-textbox fk_title 240 640 320 40"
  "client-textbox fk_status 280 306 400 36"
  "client-textbox fk_vx 170 596 200 44"
  "client-textbox fk_vy 170 552 200 44"
  "client-textbox fk_vz 170 508 200 44"
  "client-textbox fk_vs 170 464 200 44"
  "client-textbox fk_xm 310 596 56 44"
  "client-textbox fk_xp 374 596 56 44"
  "client-textbox fk_ym 310 552 56 44"
  "client-textbox fk_yp 374 552 56 44"
  "client-textbox fk_zm 310 508 56 44"
  "client-textbox fk_zp 374 508 56 44"
  "client-textbox fk_sm 310 464 56 44"
  "client-textbox fk_sp 374 464 56 44"
  "client-textbox fk_p1 104 404 84 44"
  "client-textbox fk_p2 196 404 84 44"
  "client-textbox fk_p3 288 404 84 44"
  "client-textbox fk_p4 380 404 84 44"
  "client-textbox fk_p5 472 404 84 44"
  "client-textbox fk_apply 134 352 116 44"
  "client-textbox fk_clear 262 352 116 44"
  "client-textbox fk_reset 390 352 116 44"
  "client-textbox fk_step 505 352 100 44"
  "client-cursor-area fk_az_xm 310 596 52 40"
  "client-cursor-area fk_az_xp 374 596 52 40"
  "client-cursor-area fk_az_ym 310 552 52 40"
  "client-cursor-area fk_az_yp 374 552 52 40"
  "client-cursor-area fk_az_zm 310 508 52 40"
  "client-cursor-area fk_az_zp 374 508 52 40"
  "client-cursor-area fk_az_sm 310 464 52 40"
  "client-cursor-area fk_az_sp 374 464 52 40"
  "client-cursor-area fk_az_p1 104 404 80 40"
  "client-cursor-area fk_az_p2 196 404 80 40"
  "client-cursor-area fk_az_p3 288 404 80 40"
  "client-cursor-area fk_az_p4 380 404 80 40"
  "client-cursor-area fk_az_p5 472 404 80 40"
  "client-cursor-area fk_az_apply 134 352 112 40"
  "client-cursor-area fk_az_clear 262 352 112 40"
  "client-cursor-area fk_az_reset 390 352 112 40"
  "client-cursor-area fk_az_step 505 352 96 40"
  "client-cursor-area fk_kick1 1380 636 376 40"
  "client-cursor-area fk_kick2 1380 588 376 40"
  "client-cursor-area fk_kick3 1380 540 376 40"
  "client-cursor-area fk_kick4 1380 492 376 40"
  "client-cursor-area fk_kick5 1380 444 376 40"
  "client-cursor-area fk_kick6 1380 396 376 40"
)

declare -A IDS
fail=0
for line in "${CONTROLS[@]}"; do
  read -r TYPE NAME X Y W H <<< "$line"
  out=$(node ./bin/gsts.mjs assets:ui create --type "$TYPE" --on "container:$NODE" --name "$NAME" --gil "$MAP" --write --yes 2>&1)
  id=$(echo "$out" | grep -oE 'newId=[0-9]+' | cut -d= -f2)
  if [[ -z "$id" ]]; then
    echo "CREATE FAIL $NAME: $out" | tee -a "$LOG"
    fail=1; break
  fi
  IDS[$NAME]=$id
  echo "created $NAME id=$id" >> "$LOG"
done

if [[ $fail -eq 0 ]]; then
  for line in "${CONTROLS[@]}"; do
    read -r TYPE NAME X Y W H <<< "$line"
    id=${IDS[$NAME]}
    out=$(node ./bin/gsts.mjs assets:ui update "$id" --position "$X,$Y" --size "$W,$H" --gil "$MAP" --write 2>&1)
    if ! echo "$out" | grep -q "writePerformed=true"; then
      echo "UPDATE FAIL $NAME($id): $out" | tee -a "$LOG"
      fail=1; break
    fi
    echo "updated $NAME($id) pos=$X,$Y size=$W,$H" >> "$LOG"
  done
fi

echo "exit_fail=$fail" | tee -a "$LOG"
sha256sum "$MAP" | tee -a "$LOG"
node ./bin/gsts.mjs assets:ui list --gil "$MAP" 2>/dev/null | grep -c "fk_" | tee -a "$LOG"
