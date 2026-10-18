#!/usr/bin/env python3
"""KWin ScreenShot2 CaptureWindow → numpy；附 XShm 窗口抓帧对照。"""
import ctypes, ctypes.util, json, os, sys, time
import numpy as np
import dbus

def kwin_capture(handle, native=True, timeout=15):
    """按 KWin internalId 抓窗口；返回 (rgb, meta, ms)。raw 模式：pipe 里是裸像素。"""
    bus = dbus.SessionBus()
    obj = bus.get_object('org.kde.KWin', '/org/kde/KWin/ScreenShot2', introspect=False)
    iface = dbus.Interface(obj, 'org.kde.KWin.ScreenShot2')
    opts = {'native-resolution': True} if native else {}
    r, w = os.pipe()
    t0 = time.perf_counter()
    try:
        res = iface.CaptureWindow(handle, dbus.Dictionary(opts, signature='sv'),
                                  dbus.types.UnixFd(w), timeout=timeout)
    finally:
        os.close(w)
    data = b''
    while True:
        chunk = os.read(r, 1 << 22)
        if not chunk:
            break
        data += chunk
    os.close(r)
    ms = (time.perf_counter() - t0) * 1000
    meta = {str(k): (v if not hasattr(v, 'real') else v.real) for k, v in dict(res).items()}
    fmt = int(meta.get('format', 0)); h = int(meta.get('height', 0)); stride = int(meta.get('stride', 0))
    wpx = stride // 4
    arr = np.frombuffer(data, np.uint8).reshape(h, wpx, 4)
    return arr, meta, ms

# ── XShm 窗口抓帧（现有路径）
x11 = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
xext = ctypes.CDLL(ctypes.util.find_library('Xext') or 'libXext.so.6')
libc = ctypes.CDLL(ctypes.util.find_library('c') or 'libc.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p; x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XDefaultScreen.restype = ctypes.c_int; x11.XDefaultScreen.argtypes = [ctypes.c_void_p]
x11.XDefaultVisual.restype = ctypes.c_void_p; x11.XDefaultVisual.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDefaultDepth.restype = ctypes.c_int; x11.XDefaultDepth.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
class XErr(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('display', ctypes.c_void_p), ('resourceid', ctypes.c_ulong),
                ('serial', ctypes.c_ulong), ('error_code', ctypes.c_ubyte),
                ('request_code', ctypes.c_ubyte), ('minor_code', ctypes.c_ubyte)]
_XERR = {'code': 0}
_H = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
def _h(dpy, ev):
    try: _XERR['code'] = int(ctypes.cast(ev, ctypes.POINTER(XErr)).contents.error_code)
    except Exception: _XERR['code'] = -1
    return 0
_HANDLER = _H(_h)
x11.XSetErrorHandler(_HANDLER)
class ShmSeg(ctypes.Structure):
    _fields_ = [('shmseg', ctypes.c_ulong), ('shmid', ctypes.c_int),
                ('shmaddr', ctypes.c_void_p), ('readOnly', ctypes.c_int)]
xext.XShmCreateImage.restype = ctypes.c_void_p
xext.XShmCreateImage.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_int,
                                 ctypes.c_void_p, ctypes.POINTER(ShmSeg), ctypes.c_uint, ctypes.c_uint]
xext.XShmAttach.argtypes = [ctypes.c_void_p, ctypes.POINTER(ShmSeg)]
xext.XShmGetImage.restype = ctypes.c_void_p
xext.XShmGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p,
                              ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
libc.shmget.restype = ctypes.c_int; libc.shmat.restype = ctypes.c_void_p

class XShmGrab:
    def __init__(self, win, w=2560, h=1440, display=':1'):
        self.dpy = x11.XOpenDisplay(display.encode())
        scr = x11.XDefaultScreen(self.dpy); vis = x11.XDefaultVisual(self.dpy, scr)
        dep = x11.XDefaultDepth(self.dpy, scr); self.win, self.w, self.h = win, w, h
        self.size = w * h * 4
        self.shmid = libc.shmget(0, ctypes.c_size_t(self.size), ctypes.c_int(0o100600))
        self.addr = libc.shmat(ctypes.c_int(self.shmid), ctypes.c_void_p(0), ctypes.c_int(0))
        self.seg = ShmSeg(0, self.shmid, self.addr, 0)
        self.img = xext.XShmCreateImage(self.dpy, vis, dep, 2, ctypes.c_void_p(self.addr),
                                        ctypes.byref(self.seg), w, h)
        xext.XShmAttach(self.dpy, ctypes.byref(self.seg)); x11.XSync(self.dpy, 0)
        self.view = np.ctypeslib.as_array((ctypes.c_ubyte * self.size).from_address(self.addr)).reshape(h, w, 4)
    def grab(self):
        _XERR['code'] = 0
        t0 = time.perf_counter()
        ok = xext.XShmGetImage(self.dpy, self.win, self.img, 0, 0, 0xffffffff)
        x11.XSync(self.dpy, 0)
        ms = (time.perf_counter() - t0) * 1000
        if not ok or _XERR['code']:
            raise RuntimeError(f'XShmGetImage 失败 ok={ok} xerr={_XERR["code"]}（窗口不可映射/最小化时常见 BadMatch）')
        return np.array(self.view), ms, bool(ok)

def main():
    handle = sys.argv[1] if len(sys.argv) > 1 else '{02ef18e8-9e9a-420d-8639-cb530e58b04b}'
    xwin = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x01400001
    k, meta, kms = kwin_capture(handle)
    g = XShmGrab(xwin)
    x, xms, ok = g.grab()
    print(json.dumps({'kwin_ms': round(kms, 1), 'kwin_meta': meta, 'kwin_shape': list(k.shape),
                      'xshm_ms': round(xms, 1), 'xshm_ok': ok}, ensure_ascii=False))
    # 通道序/bgr 对比：把 KWin 的 4 通道分别当 BGRA / RGBA 试，取与 XShm 最接近的
    best = None
    for name, idx in (('BGRA', (2, 1, 0)), ('RGBA', (0, 1, 2))):
        a = k[:, :, list(idx)]
        d = np.abs(a.astype(np.int16) - x[:, :, :3].astype(np.int16))
        score = float(d.mean())
        print(f'{name}: mean_abs={score:.2f} (vs XShm)')
        if best is None or score < best[1]:
            best = (name, score)
    print('best channel order:', best[0], 'mean_abs', round(best[1], 3))
    return 0

if __name__ == '__main__':
    sys.exit(main())
