#!/bin/bash
# make_map.sh <名字> <mapId 期望?> — 新建地图并 bootstrap（打印真实 ID，绝不猜）
set -u
. /home/h/genshin-ts/tools/ys-editor/ys-game-env.sh >/dev/null 2>&1
NAME="$1"
echo "== 创建前存档列表 =="
node /home/h/genshin-ts/bin/gsts.mjs maps 2>/dev/null | sed -n '1,12p'
echo "== 创建 =="
node /home/h/genshin-ts/bin/gsts.mjs maps:create --name "$NAME" --graphs "${NAME}玩法" 2>&1 | tail -5
echo "== 创建后存档列表 =="
node /home/h/genshin-ts/bin/gsts.mjs maps 2>/dev/null | sed -n '1,12p'
