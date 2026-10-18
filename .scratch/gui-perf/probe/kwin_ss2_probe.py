#!/usr/bin/env python3
"""KWin ScreenShot2 DBus 探针：CaptureWindow 按窗口 id 抓该窗口自身缓冲。

协议（KWin 6）：CaptureWindow(handle: s, options: a{sv}, pipe: h) → 结果 a{sv}；
像素经 pipe 以 QDataStream 序列化的 QImage 传回（格式：uint32 format, uint32 w, uint32 h,
uint32 bytesPerLine, uint32 dataLen + data, ...）。handle = KWin 的 Window::internalId 字符串。
"""
import json, os, sys, time
import dbus

HANDLE = sys.argv[1] if len(sys.argv) > 1 else '{02ef18e8-9e9a-420d-8639-cb530e58b04b}'
opts = {}
if len(sys.argv) > 2 and sys.argv[2] == 'native':
    opts['native-resolution'] = True

bus = dbus.SessionBus()
obj = bus.get_object('org.kde.KWin', '/org/kde/KWin/ScreenShot2', introspect=False)
iface = dbus.Interface(obj, 'org.kde.KWin.ScreenShot2')
r, w = os.pipe()
t0 = time.perf_counter()
try:
    res = iface.CaptureWindow(HANDLE, dbus.Dictionary(opts, signature='sv'),
                              dbus.types.UnixFd(w), timeout=15)
    ok = True
except Exception as e:                                    # noqa: BLE001
    ok, res = False, f'{type(e).__name__}: {e}'
finally:
    os.close(w)
ms = (time.perf_counter() - t0) * 1000
data = b''
while True:
    chunk = os.read(r, 1 << 20)
    if not chunk:
        break
    data += chunk
os.close(r)
print(json.dumps({'ok': ok, 'ms': round(ms, 1), 'result': str(res)[:300],
                  'bytes': len(data), 'head_hex': data[:40].hex()}, ensure_ascii=False))
if data:
    fmt, w0, h0, bpl = (int.from_bytes(data[i:i+4], 'little') for i in (0, 4, 8, 12))
    print('parsed fmt,w,h,bpl =', fmt, w0, h0, bpl, '| expected bytes', bpl * h0)
