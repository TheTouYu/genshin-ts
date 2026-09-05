#!/usr/bin/env bash
# 为编译 TickManager 资产准备 donor 地图（只写本资产 .donor，不碰真实游戏地图）。
# 用法：从仓库根运行 bash assets/tick-manager-asset/scripts/make-donor.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DONOR_ROOT="$ROOT/assets/tick-manager-asset/.donor/BeyondLocal"
SAVE_DIR="$DONOR_ROOT/110170759/Beyond_Local_Save_Level"
MAP_ID=1073741908
GIL="$SAVE_DIR/$MAP_ID.gil"

mkdir -p "$SAVE_DIR"
cp "$ROOT/Beyond_Local_Export/足球.gil" "$GIL"

node "$ROOT/bin/gsts.mjs" assets:signals register \
  --gil "$GIL" --name TickUpdate_60 \
  --param manager:entity --param now_ms:int --param interval_s:float --write >/dev/null

node "$ROOT/bin/gsts.mjs" assets:signals register \
  --gil "$GIL" --name TickUpdate_200 \
  --param manager:entity --param now_ms:int --param interval_s:float --write >/dev/null

node "$ROOT/bin/gsts.mjs" assets:signals register \
  --gil "$GIL" --name TickUpdate_1000 \
  --param manager:entity --param now_ms:int --param interval_s:float --write >/dev/null

echo "donor ready: $GIL"
