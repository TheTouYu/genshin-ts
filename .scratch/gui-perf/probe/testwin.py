#!/usr/bin/env python3
"""可控测试窗口：600x400，背景色每 200ms 变一次（用于验证「最小化/被遮挡/跨桌面」时能否拿到活帧）。"""
import time, sys
from Xlib import X, display, Xatom
from Xlib.ext import shape  # noqa: F401

d = display.Display(':1')
s = d.screen()
w = s.root.create_window(100, 100, 600, 400, 0, s.root_depth,
                         X.InputOutput, X.CopyFromParent, background_pixel=s.white_pixel,
                         event_mask=X.ExposureMask | X.StructureNotifyMask)
w.set_wm_name('YS-TEST-WIN')
w.set_wm_class('ys-test', 'ys-test')
w.map()
d.flush()
gc = w.create_gc()
i = 0
t_end = time.time() + float(sys.argv[1] if len(sys.argv) > 1 else 120)
while time.time() < t_end:
    # 颜色 = f(i)：R 变化，G/B 固定，便于判"帧是否在变"
    r = (i * 7) % 256
    gc.change(foreground=(r << 16) | 0x004000)
    w.fill_rectangle(gc, 0, 0, 600, 400)
    d.flush()
    i += 1
    # 广播当前色值到窗口标题，便于外部读取（不依赖像素）
    w.set_wm_name('YS-TEST-WIN-%03d' % r)
    d.flush()
    time.sleep(0.2)
