"""验证 XShmGetImage 的内容正确性/新鲜度：同一时刻 SHM vs XGetImage vs import 三方对账。"""
import ctypes, ctypes.util, time, hashlib, subprocess, sys
import numpy as np
from Xlib import display as xdisplay, X

x11 = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
xext = ctypes.CDLL(ctypes.util.find_library('Xext') or 'libXext.so.6')
libc = ctypes.CDLL(ctypes.util.find_library('c') or 'libc.so.6', use_errno=True)
x11.XOpenDisplay.restype = ctypes.c_void_p; x11.XOpenDisplay.argtypes=[ctypes.c_char_p]
x11.XDefaultScreen.restype = ctypes.c_int; x11.XDefaultScreen.argtypes=[ctypes.c_void_p]
x11.XDefaultVisual.restype = ctypes.c_void_p; x11.XDefaultVisual.argtypes=[ctypes.c_void_p, ctypes.c_int]
x11.XDefaultDepth.restype = ctypes.c_int; x11.XDefaultDepth.argtypes=[ctypes.c_void_p, ctypes.c_int]
x11.XSync.argtypes=[ctypes.c_void_p, ctypes.c_int]
xext.XShmQueryExtension.restype = ctypes.c_bool; xext.XShmQueryExtension.argtypes=[ctypes.c_void_p]
class ShmSeg(ctypes.Structure):
    _fields_=[('shmseg',ctypes.c_ulong),('shmid',ctypes.c_int),('shmaddr',ctypes.c_void_p),('readOnly',ctypes.c_int)]
xext.XShmCreateImage.restype=ctypes.c_void_p
xext.XShmCreateImage.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_void_p,ctypes.POINTER(ShmSeg),ctypes.c_uint,ctypes.c_uint]
xext.XShmAttach.restype=ctypes.c_bool; xext.XShmAttach.argtypes=[ctypes.c_void_p,ctypes.POINTER(ShmSeg)]
xext.XShmGetImage.restype=ctypes.c_void_p
xext.XShmGetImage.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
libc.shmget.restype=ctypes.c_int; libc.shmat.restype=ctypes.c_void_p
dpy=x11.XOpenDisplay(b':1'); scr=x11.XDefaultScreen(dpy); vis=x11.XDefaultVisual(dpy,scr); dep=x11.XDefaultDepth(dpy,scr)
W,H=2560,1440; size=W*H*4; WIN=0x01400001
shmid=libc.shmget(0, ctypes.c_size_t(size), ctypes.c_int(0o100600))
addr=libc.shmat(ctypes.c_int(shmid), ctypes.c_void_p(0), ctypes.c_int(0))
seg=ShmSeg(0,shmid,addr,0)
img=xext.XShmCreateImage(dpy,vis,dep,2,ctypes.c_void_p(addr),ctypes.byref(seg),W,H)
assert xext.XShmAttach(dpy,ctypes.byref(seg)); x11.XSync(dpy,0)
def shm_frame():
    t0=time.perf_counter()
    ok=xext.XShmGetImage(dpy,WIN,img,0,0,0xffffffff); x11.XSync(dpy,0)
    t1=time.perf_counter()
    a=np.frombuffer(ctypes.string_at(addr,size),np.uint8).reshape(H,W,4)[:,:,:3].copy()
    return a,(t1-t0)*1000
def xget_frame(D):
    win=D.create_resource_object('window',WIN)
    t0=time.perf_counter(); raw=win.get_image(0,0,W,H,X.ZPixmap,0xffffffff); t1=time.perf_counter()
    a=np.frombuffer(raw.data,np.uint8).reshape(H,W,4)[:,:,:3].copy()
    return a,(t1-t0)*1000
def diff(a,b): return int(np.count_nonzero(np.any(a!=b,axis=2)))
D=xdisplay.Display(':1')
A,ms=shm_frame(); print(f'shm ms={ms:.2f} mean={A.mean():.1f}')
B,ms2=xget_frame(D); print(f'xget ms={ms2:.2f} mean={B.mean():.1f} diff(shm,xget)={diff(A,B)}')
C,ms3=shm_frame(); print(f'shm2 ms={ms3:.2f} diff(xget,shm2)={diff(B,C)} diff(shm,shm2)={diff(A,C)}')
# import 对账
subprocess.run(['import','-window',hex(WIN),'-depth','8','rgb:.scratch/gui-perf/probe/imp_check.rgb'],check=True)
I=np.fromfile('.scratch/gui-perf/probe/imp_check.rgb',np.uint8).reshape(H,W,3)
print(f'import mean={I.mean():.1f} diff(shm,import)={diff(A,I)} diff(xget,import)={diff(B,I)}')
# 与"别的窗口"(浏览器全屏 spectacle)对比
subprocess.run(['spectacle','-b','-n','-f','-o','.scratch/gui-perf/probe/spec_check.png'],check=True)
from PIL import Image
S=np.asarray(Image.open('.scratch/gui-perf/probe/spec_check.png').convert('RGB'))
print(f'spectacle mean={S.mean():.1f} same_size={S.shape==A.shape} diff(shm,spectacle)={diff(A,S)}')
# 连续 SHM 采样 10 帧，看动画是否持续
time.sleep(0.3)
print('--- 连续 12 帧 SHM (100ms 间隔) ---')
prev=None
for i in range(12):
    a,ms=shm_frame(); d=None if prev is None else diff(prev,a)
    prev=a; print(f'{i:2d} ms={ms:5.2f} sha={hashlib.sha256(a.tobytes()).hexdigest()[:10]} diff_vs_prev={d}')
    time.sleep(0.1)
