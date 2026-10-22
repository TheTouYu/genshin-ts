#!/bin/bash
# 修复类工具：本工具**就是**要改窗口状态（解卡/救援），硬通道的「前后窗口一致」不适用，
# 故显式声明逃生口（shim 见 tools/ys-editor/shims/）。
export YS_ALLOW_RAW=1

# X 会话环境（DISPLAY/XAUTHORITY）只走统一入口；原先自己从 Xwayland 的 /proc environ 抄，已删。
. "$(dirname "$(readlink -f "$0")")/ys-env.sh" >/dev/null 2>&1 || true

# 千星编辑器卡死自救:取消置顶/钉住/全屏并最小化所有 beyondeditor 窗口
for id in $(xdotool search --class 'beyondeditor.exe' 2>/dev/null); do
  W=$(printf '0x%x' "$id")
  wmctrl -i -b remove,above,sticky,fullscreen -r "$W" 2>/dev/null
  wmctrl -i -b add,hidden -r "$W" 2>/dev/null
done
