#!/usr/bin/env bash
# 把 device-package/1073741856.final3.gil 原样恢复到真机地图（Save_Level + Temp + 注册）
# 用途：编辑器旧内存覆盖了盘外写入后，一条命令恢复到已验证的部署态。
set -euo pipefail
export GSTS_LOCALLOW_DIR="${GSTS_LOCALLOW_DIR:-/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow}"
unset LOCALAPPDATA || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal/110170759"
MAP="$BASE/Beyond_Local_Save_Level/1073741856/1073741856.gil"
TEMP="$BASE/Temp/1073741856.gil"
SRC="$ROOT/device-package/1073741856.final3.gil"
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
mkdir -p "$(dirname "$MAP")"
cp "$SRC" "$MAP"
cp "$SRC" "$TEMP"
sha256sum "$MAP" "$TEMP"
cd /home/h/genshin-ts
node dist/src/cli/gsts.js maps:resync --map-id 1073741856 | tail -3
