#!/bin/bash
# 修复类工具：本工具**就是**要改窗口状态（解卡/救援），硬通道的「前后窗口一致」不适用，
# 故显式声明逃生口（shim 见 tools/ys-editor/shims/）。
export YS_ALLOW_RAW=1

# 千星编辑器卡死自救:取消置顶/钉住/全屏并最小化所有 beyondeditor 窗口
XW=$(pgrep -f '[X]wayland' | head -1)
XD=$(tr '\0' '\n' < /proc/$XW/environ | grep '^DISPLAY=' | cut -d= -f2)
XA=$(tr '\0' '\n' < /proc/$XW/environ | grep '^XAUTHORITY=' | cut -d= -f2)
for id in $(DISPLAY=$XD XAUTHORITY=$XA xdotool search --class 'beyondeditor.exe' 2>/dev/null); do
  W=$(printf '0x%x' $id)
  DISPLAY=$XD XAUTHORITY=$XA wmctrl -i -b remove,above,sticky,fullscreen -r $W 2>/dev/null
  DISPLAY=$XD XAUTHORITY=$XA wmctrl -i -b add,hidden -r $W 2>/dev/null
done
