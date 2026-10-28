#!/usr/bin/env bash
# 真机模板重编号后重新校准：读地图模板名 → 生成 device Lua → update 脚本 → guard
# 用法: bash qxqy/calibrate-device.sh [mapId] [scriptGuid]
set -euo pipefail
MAP_ID="${1:-1073741839}"
SCRIPT_GUID="${2:-1073741825}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GSTS="node /home/h/genshin-ts/dist/src/cli/gsts.js"
: "${GSTS_LOCALLOW_DIR:=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow}"
export GSTS_LOCALLOW_DIR
unset LOCALAPPDATA || true
MAP="$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/$MAP_ID.gil"
[ -f "$MAP" ] || MAP="$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/$MAP_ID/$MAP_ID.gil"
[ -f "$MAP" ] || { echo "map not found: $MAP_ID" >&2; exit 1; }

list="$($GSTS assets:ui template list --gil "$MAP" 2>&1)"
prim="$(printf '%s\n' "$list" | awk '/name=flower_prim/{print $1}' | head -1 | cut -d= -f2)"
label="$(printf '%s\n' "$list" | awk '/name=flower_label/{print $1}' | head -1 | cut -d= -f2)"
hit="$(printf '%s\n' "$list" | awk '/name=flower_hit/{print $1}' | head -1 | cut -d= -f2)"
if [ -z "$prim" ] || [ -z "$label" ] || [ -z "$hit" ]; then
  echo "template names not found (flower_prim/label/hit); list follows:" >&2
  printf '%s\n' "$list" | tail -20 >&2
  exit 1
fi
echo "templates: prim=$prim label=$label hit=$hit"
FLOWER_PRIM="$prim" FLOWER_LABEL="$label" FLOWER_HIT="$hit" node "$ROOT/qxqy/build-device.mjs"
$GSTS assets:scripts update --map-id "$MAP_ID" --guid "$SCRIPT_GUID" \
  --source-file "$ROOT/device-package/main-device.lua" --write
python3 /home/h/genshin-ts/tools/gil-guard.py "$MAP" \
  --temp "$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal/110170759/Temp/$MAP_ID.gil"
