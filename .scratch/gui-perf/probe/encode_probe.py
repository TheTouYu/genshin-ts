"""测 2560x1440 帧各种落盘格式的编码成本（warm, in-process）。输入=刚抓的 BGRX 帧。"""
import ctypes, ctypes.util, time, os, io
import numpy as np
from PIL import Image
import cv2
x11=ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6'); xext=ctypes.CDLL(ctypes.util.find_library('Xext') or 'libXext.so.6')
libc=ctypes.CDLL(ctypes.util.find_library('c') or 'libc.so.6')
x11.XOpenDisplay.restype=ctypes.c_void_p; x11.XOpenDisplay.argtypes=[ctypes.c_char_p]
x11.XDefaultScreen.restype=ctypes.c_int; x11.XDefaultScreen.argtypes=[ctypes.c_void_p]
x11.XDefaultVisual.restype=ctypes.c_void_p; x11.XDefaultVisual.argtypes=[ctypes.c_void_p,ctypes.c_int]
x11.XDefaultDepth.restype=ctypes.c_int; x11.XDefaultDepth.argtypes=[ctypes.c_void_p,ctypes.c_int]
x11.XSync.argtypes=[ctypes.c_void_p,ctypes.c_int]
class ShmSeg(ctypes.Structure): _fields_=[('shmseg',ctypes.c_ulong),('shmid',ctypes.c_int),('shmaddr',ctypes.c_void_p),('readOnly',ctypes.c_int)]
xext.XShmCreateImage.restype=ctypes.c_void_p; xext.XShmCreateImage.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_void_p,ctypes.POINTER(ShmSeg),ctypes.c_uint,ctypes.c_uint]
xext.XShmAttach.argtypes=[ctypes.c_void_p,ctypes.POINTER(ShmSeg)]
xext.XShmGetImage.restype=ctypes.c_void_p; xext.XShmGetImage.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
libc.shmget.restype=ctypes.c_int; libc.shmat.restype=ctypes.c_void_p
dpy=x11.XOpenDisplay(b':1'); scr=x11.XDefaultScreen(dpy); vis=x11.XDefaultVisual(dpy,scr); dep=x11.XDefaultDepth(dpy,scr)
W,H=2560,1440; size=W*H*4
shmid=libc.shmget(0,ctypes.c_size_t(size),ctypes.c_int(0o100600)); addr=libc.shmat(ctypes.c_int(shmid),ctypes.c_void_p(0),ctypes.c_int(0))
seg=ShmSeg(0,shmid,addr,0); img=xext.XShmCreateImage(dpy,vis,dep,2,ctypes.c_void_p(addr),ctypes.byref(seg),W,H)
xext.XShmAttach(dpy,ctypes.byref(seg)); x11.XSync(dpy,0)
xext.XShmGetImage(dpy,0x01400001,img,0,0,0xffffffff); x11.XSync(dpy,0)
bgra=np.frombuffer(ctypes.string_at(addr,size),np.uint8).reshape(H,W,4)
rgb=np.ascontiguousarray(bgra[:,:,:3][:,:,::-1])   # 正确 RGB
bgr=np.ascontiguousarray(bgra[:,:,:3])
print('frame',rgb.shape,'mean',rgb.mean().round(1))
def t(fn,n=3):
    ts=[]
    for _ in range(n):
        t0=time.perf_counter(); r=fn(); ts.append((time.perf_counter()-t0)*1000)
    return round(min(ts),1), round(float(np.median(ts)),1), r
im=Image.fromarray(rgb)
print('PIL png lvl0 ',t(lambda: im.save(io.BytesIO(),format='PNG',compress_level=0))[:2])
print('PIL png lvl1 ',t(lambda: im.save(io.BytesIO(),format='PNG',compress_level=1))[:2])
print('PIL png lvl6 ',t(lambda: im.save(io.BytesIO(),format='PNG',compress_level=6))[:2])
print('PIL jpg q85  ',t(lambda: im.save(io.BytesIO(),format='JPEG',quality=85))[:2])
print('cv2 png lvl1 ',t(lambda: cv2.imencode('.png',bgr,[cv2.IMWRITE_PNG_COMPRESSION,1]))[:2])
print('cv2 png lvl0 ',t(lambda: cv2.imencode('.png',bgr,[cv2.IMWRITE_PNG_COMPRESSION,0]))[:2])
print('cv2 jpg q90  ',t(lambda: cv2.imencode('.jpg',bgr,[cv2.IMWRITE_JPEG_QUALITY,90]))[:2])
print('PIL bmp      ',t(lambda: im.save(io.BytesIO(),format='BMP'))[:2])
# 写 /dev/shm 落盘成本
def wr_raw():
    with open('/dev/shm/probe.raw','wb') as f: f.write(bgra.tobytes())
def wr_png1():
    im.save('/dev/shm/probe.png',format='PNG',compress_level=1)
def wr_bmp():
    im.save('/dev/shm/probe.bmp',format='BMP')
print('write raw   ',t(wr_raw)[:2], os.path.getsize('/dev/shm/probe.raw')//1024//1024,'MB')
print('write png l1',t(wr_png1)[:2], os.path.getsize('/dev/shm/probe.png')//1024,'KB')
print('write bmp   ',t(wr_bmp)[:2], os.path.getsize('/dev/shm/probe.bmp')//1024//1024,'MB')
def rd(n): 
    return lambda: open(n,'rb').read()
print('read raw 11MB',t(rd('/dev/shm/probe.raw'))[:2])
