#!/usr/bin/env python3
"""_edges.py — 平滑后找强跃变（避免纹理碎裂）。用法：
  python3 _edges.py F --axis x --at 200 --from 90 --to 200 --thr 25 [--band 3]
  axis=x: at=y 扫描线；axis=y: at=x 扫描线。--band 取垂直于线的 k 像素平均后平滑。
"""
import argparse, numpy as np
from PIL import Image
ap=argparse.ArgumentParser(); ap.add_argument('frame'); ap.add_argument('--axis',choices=('x','y'),required=True)
ap.add_argument('--at',type=int,required=True); ap.add_argument('--from',dest='frm',type=int,required=True)
ap.add_argument('--to',type=int,required=True); ap.add_argument('--thr',type=float,default=25)
ap.add_argument('--band',type=int,default=3); ap.add_argument('--smooth',type=int,default=3)
a=ap.parse_args()
im=Image.open(a.frame).convert('RGB'); arr=np.asarray(im).astype(np.float32)
lum=arr[:,:,0]*0.299+arr[:,:,1]*0.587+arr[:,:,2]*0.114
b=max(1,a.band); h=b//2
if a.axis=='x':
    prof=lum[max(0,a.at-h):a.at-h+b, a.frm:a.to].mean(axis=0)
else:
    prof=lum[a.frm:a.to, max(0,a.at-h):a.at-h+b].mean(axis=1)
k=max(1,a.smooth); ker=np.ones(k)/k
sp=np.convolve(prof,ker,mode='same')
d=np.diff(sp)
idx=[i for i in range(1,len(d)-1) if abs(d[i])>=a.thr]
# 合并相邻（3px 内取最大）
out=[]
for i in idx:
    if out and i-out[-1][0]<=3:
        if abs(d[i])>abs(d[out[-1][0]]): out[-1]=(i,d[i],sp[i],sp[i+1])
    else: out.append((i,d[i],sp[i],sp[i+1]))
print('EDGES axis=%s at=%d range=[%d,%d] thr=%.0f'%(a.axis,a.at,a.frm,a.to,a.thr))
for i,dd,l0,l1 in out:
    print('  %5d  d=%+7.1f  %6.1f -> %6.1f'%(a.frm+i,dd,l0,l1))
