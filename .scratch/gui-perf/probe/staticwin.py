#!/usr/bin/env python3
"""静态测试窗口：固定渐变图案（便于两条路径逐像素对账，排除动画）。"""
import sys, time
from Xlib import X, display
d = display.Display(':1'); s = d.screen()
w = s.root.create_window(200, 200, 640, 400, 0, s.root_depth, X.InputOutput, X.CopyFromParent,
                         background_pixel=0x202020, event_mask=X.ExposureMask)
w.set_wm_name('YS-STATIC-WIN'); w.set_wm_class('ys-static', 'ys-static'); w.map(); d.flush()
gc = w.create_gc()
for y in range(0, 400, 40):
    for x in range(0, 640, 40):
        gc.change(foreground=((x * 3 % 256) << 16) | ((y * 5 % 256) << 8) | ((x + y) % 256))
        w.fill_rectangle(gc, x, y, 40, 40)
d.flush()
time.sleep(float(sys.argv[1] if len(sys.argv) > 1 else 120))
