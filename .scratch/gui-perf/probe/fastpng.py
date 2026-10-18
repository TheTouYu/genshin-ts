"""测自写 PNG 编码（filter=0, zlib level 0/1）能不能把 2560x1440 PNG 压进 20ms。"""
import zlib, struct, time, numpy as np, io
W,H=2560,1440
rgb=np.random.randint(0,255,(H,W,3),dtype=np.uint8)
def png_encode(rgb, level=1):
    h,w,_=rgb.shape
    raw=np.empty((h,w*3+1),np.uint8); raw[:,0]=0; raw[:,1:]=rgb.reshape(h,w*3)
    def chunk(typ,data):
        return struct.pack('>I',len(data))+typ+data+struct.pack('>I',zlib.crc32(typ+data)&0xffffffff)
    ihdr=struct.pack('>IIBBBBB',w,h,8,2,0,0,0)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',ihdr)+chunk(b'IDAT',zlib.compress(raw.tobytes(),level))+chunk(b'IEND',b'')
for lvl in (0,1,6):
    ts=[]
    for _ in range(3):
        t0=time.perf_counter(); b=png_encode(rgb,lvl); ts.append((time.perf_counter()-t0)*1000)
    print(f'fastpng lvl{lvl} min={min(ts):.1f}ms med={sorted(ts)[1]:.1f}ms size={len(b)//1024}KB')
# 用真实屏帧再测一次
import subprocess
subprocess.run(['import','-window','0x01400001','-depth','8','rgb:/dev/shm/probe2.rgb'],check=True)
real=np.fromfile('/dev/shm/probe2.rgb',np.uint8).reshape(H,W,3)
for lvl in (0,1):
    ts=[]
    for _ in range(3):
        t0=time.perf_counter(); b=png_encode(real,lvl); ts.append((time.perf_counter()-t0)*1000)
    print(f'REAL fastpng lvl{lvl} min={min(ts):.1f}ms med={sorted(ts)[1]:.1f}ms size={len(b)//1024}KB')
    open(f'/dev/shm/real_l{lvl}.png','wb').write(b)
