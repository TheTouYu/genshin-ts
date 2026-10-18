"""XShmGetImage in-process probe: 能不能把 85ms 的 XGetImage 降下来。"""
import ctypes, ctypes.util, time, hashlib
import numpy as np
x11 = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
xext = ctypes.CDLL(ctypes.util.find_library('Xext') or 'libXext.so.6')
libc = ctypes.CDLL(ctypes.util.find_library('c') or 'libc.so.6', use_errno=True)
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XDefaultScreen.restype = ctypes.c_int
x11.XDefaultScreen.argtypes = [ctypes.c_void_p]
x11.XDefaultVisual.restype = ctypes.c_void_p
x11.XDefaultVisual.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDefaultDepth.restype = ctypes.c_int
x11.XDefaultDepth.argtypes = [ctypes.c_void_p, ctypes.c_int]
xext.XShmQueryExtension.restype = ctypes.c_bool
xext.XShmQueryExtension.argtypes = [ctypes.c_void_p]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]

class ShmSeg(ctypes.Structure):
    _fields_ = [('shmseg', ctypes.c_ulong), ('shmid', ctypes.c_int),
                ('shmaddr', ctypes.c_void_p), ('readOnly', ctypes.c_int)]

xext.XShmCreateImage.restype = ctypes.c_void_p
xext.XShmCreateImage.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_int,
                                ctypes.c_void_p, ctypes.POINTER(ShmSeg), ctypes.c_uint, ctypes.c_uint]
xext.XShmAttach.restype = ctypes.c_bool
xext.XShmAttach.argtypes = [ctypes.c_void_p, ctypes.POINTER(ShmSeg)]
xext.XShmGetImage.restype = ctypes.c_void_p
xext.XShmGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
x11.XGetImage.restype = ctypes.c_void_p
x11.XGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int]

dpy = x11.XOpenDisplay(b':1')
screen = x11.XDefaultScreen(dpy)
visual = x11.XDefaultVisual(dpy, screen)
depth = x11.XDefaultDepth(dpy, screen)
WIN = 0x01400001
print('display', hex(dpy or 0), 'shm_ext', xext.XShmQueryExtension(dpy), 'depth', depth)
W, H = 2560, 1440
size = W * H * 4
IPC_PRIVATE = 0
libc.shmget.restype = ctypes.c_int
libc.shmat.restype = ctypes.c_void_p
shmid = libc.shmget(IPC_PRIVATE, ctypes.c_size_t(size), ctypes.c_int(0o100600))
addr = libc.shmat(ctypes.c_int(shmid), ctypes.c_void_p(0), ctypes.c_int(0))
print('shmid', shmid, 'addr', hex(addr or 0))
seg = ShmSeg(0, shmid, addr, 0)
img = xext.XShmCreateImage(dpy, visual, depth, 2, ctypes.c_void_p(addr), ctypes.byref(seg), W, H)
print('image', hex(img or 0), 'attach', xext.XShmAttach(dpy, ctypes.byref(seg)))
x11.XSync(dpy, 0)
# time XShmGetImage via shared memory
res = []
prev = None
for i in range(8):
    t0 = time.perf_counter()
    ok = xext.XShmGetImage(dpy, WIN, img, 0, 0, 0xffffffff)
    x11.XSync(dpy, 0)
    t1 = time.perf_counter()
    buf = ctypes.string_at(addr, size)
    arr = np.frombuffer(buf, np.uint8).reshape(H, W, 4)[:, :, :3]
    t2 = time.perf_counter()
    d = None if prev is None else int(np.count_nonzero(np.any(arr != prev, axis=2)))
    prev = arr
    res.append((t1 - t0) * 1000)
    print(f'iter{i} shmget={(t1-t0)*1000:6.2f}ms ok={ok} copy+np={(t2-t1)*1000:5.2f}ms sha={hashlib.sha256(arr.tobytes()).hexdigest()[:10]} diff={d}', flush=True)
    time.sleep(0.12)
xext.XShmDetach(dpy, ctypes.byref(seg))
libc.shmdt(ctypes.c_void_p(addr))
print('median_shm_ms', round(float(np.median(res)), 2))
