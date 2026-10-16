#!/bin/bash
# 千星编辑器卡死自救:取消置顶/钉住/全屏并最小化所有 beyondeditor 窗口
XW=$(pgrep -f '[X]wayland' | head -1)
XD=$(tr '\0' '\n' < /proc/$XW/environ | grep '^DISPLAY=' | cut -d= -f2)
XA=$(tr '\0' '\n' < /proc/$XW/environ | grep '^XAUTHORITY=' | cut -d= -f2)
for id in $(DISPLAY=$XD XAUTHORITY=$XA xdotool search --class 'beyondeditor.exe' 2>/dev/null); do
  W=$(printf '0x%x' $id)
  DISPLAY=$XD XAUTHORITY=$XA wmctrl -i -b remove,above,sticky,fullscreen -r $W 2>/dev/null
  DISPLAY=$XD XAUTHORITY=$XA wmctrl -i -b add,hidden -r $W 2>/dev/null
done
