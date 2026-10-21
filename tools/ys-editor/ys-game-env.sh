#!/bin/bash
# ys-game-env.sh — 千星「我方地图 / 存档 / 窗口」事实（被 ys-env.sh 自动 source）
#
# 为什么单独一份：这些是**项目事实**（哪张图、哪个 UID、哪个窗口），
# 与「桌面会话环境」（DISPLAY/XAUTHORITY，每次重启都变）分开维护。
# 2026-10-17 教训：preflight 的第 ④ 段（节点图挂载）因为缺 GSTS_LOCALLOW_DIR/YS_MAP_ID
#   而**静默跳过**，于是「挂载被试玩回写抹掉」这类致命状态根本没被检查 —— 默认前提未取读数。
# ⇒ 本文件让 ④ 永远可跑；不需要外部 source。

# ── 千星存档根（CLI 必需；缺它会报 LOCALAPPDATA not found）
export GSTS_LOCALLOW_DIR="${GSTS_LOCALLOW_DIR:-$HOME/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow}"
export YS_UID="${YS_UID:-110170759}"
export YS_BEYOND="$GSTS_LOCALLOW_DIR/miHoYo/原神/BeyondLocal"
export YS_PLAYER="$YS_BEYOND/$YS_UID"
export YS_SAVEDIR="${YS_SAVEDIR:-$YS_PLAYER/Beyond_Local_Save_Level}"
export YS_TEMPDIR="$YS_PLAYER/Temp"
export YS_LOGDIR="${YS_LOGDIR:-$YS_PLAYER/Beyond_Debug_Log}"

# ── 我方地图（game① 云阶；新建于 2026-10-17）
export YS_MAP_ID="${YS_MAP_ID:-1073741832}"
export YS_GRAPH_ID="${YS_GRAPH_ID:-1073741825}"
# 新版存档布局是嵌套目录：Save_Level/<mapId>/<mapId>.gil
export YS_GIL="${YS_GIL:-$YS_SAVEDIR/$YS_MAP_ID/$YS_MAP_ID.gil}"

# ── 我方工具 / CLI
export YS_TOOLS="${YS_TOOLS:-/home/h/genshin-ts/tools/ys-editor}"
export GSTS="${GSTS:-node /home/h/genshin-ts/bin/gsts.mjs}"

# ── 窗口 id（游戏窗固定；沙箱/资源管理器 id **每次重启都变**，按标题动态解析）
export WIN_GAME="${WIN_GAME:-}"   # 真值在 ys_resolve_wins 里按 class 解析（别写死 id）

ys_win_by_title() {  # $1=标题子串 → 打印窗口 id（找不到返回 1）
  local id
  id="$(wmctrl -l 2>/dev/null | awk -v t="$1" 'index($0,t){print $1; exit}')"
  [ -n "$id" ] && printf '%s\n' "$id"
}
ys_resolve_wins() {   # 需要 DISPLAY/XAUTHORITY 已就绪（由 ys-env.sh 在 load 之后调用）
  if [ -z "${WIN_SANDBOX:-}" ]; then WIN_SANDBOX="$(ys_win_by_title 千星沙箱)"; export WIN_SANDBOX; fi
  if [ -z "${WIN_RES:-}" ]; then WIN_RES="$(ys_win_by_title 资源管理器)"; export WIN_RES; fi
  # 2026-10-21：**游戏窗 id 也必须在这里动态解析**。此前 WIN_GAME 写死 0x01400001，
  # 游戏重启后就变成死 id；凡是 `${YS_WIN:-0x01400001}` 的工具在没有显式传参时全部静默失败
  # （实测：ys-esc 的 ESC 发不出去、import -window 抓图失败）。一处解析，31 个工具同时受益。
  if [ -z "${YS_WIN:-}" ]; then
    YS_WIN="$(python3 -c 'import sys; sys.path.insert(0, "'"$YS_TOOLS"'"); import ys_look; print(ys_look.WIN or "")' 2>/dev/null)"
    [ -n "$YS_WIN" ] && export YS_WIN
  fi
  [ -n "${YS_WIN:-}" ] && export WIN_GAME="$YS_WIN"
}
