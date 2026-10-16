#!/bin/bash
# env.sh — 三个游戏主线的环境变量（每个 bash 调用先 source 本文件）
# 用途：免去每轮重查路径；压缩/换会话后由看板指回本文件。
# 用法： source /home/h/genshin-ts/.scratch/three-games/env.sh

# ── 千星存档根（CLI 必需；CLI 无此变量会报 LOCALAPPDATA not found）
export GSTS_LOCALLOW_DIR="$HOME/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow"

# ── 派生路径
export YS_UID=110170759
export YS_BEYOND="$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal"
export YS_PLAYER="$YS_BEYOND/$YS_UID"          # UID 层级（易漏！路径少它必报「没有那个文件」）
export YS_SAVEDIR="$YS_PLAYER/Beyond_Local_Save_Level"
export YS_TEMPDIR="$YS_PLAYER/Temp"

# ── 当前项目（游戏①，新建于 2026-10-17 03:56）
export YS_MAP_ID=1073741832

# ── 桌面/注入
export DISPLAY="${DISPLAY:-:1}"
export YDOTOOL_SOCKET="${YDOTOOL_SOCKET:-/run/user/1000/.ydotool_socket}"

# ── 窗口 id（实测，2026-10-17）
export WIN_GAME=0x01400001      # 原神（编辑器本体，2560x1440@0,0）
export WIN_RES=0x03800005       # 资源管理器（384x1371@0,0）
export WIN_SANDBOX=0x03800008   # 千星沙箱（2176x1371@384,0）

# ── 我方工具
export YS_TOOLS=/home/h/genshin-ts/tools/ys-editor
export GSTS="node /home/h/genshin-ts/bin/gsts.mjs"
