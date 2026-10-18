#!/usr/bin/env python3
"""_comps.py — ROI 内连通域 → bbox 列表（图标/按钮/文字块定位）。
  python3 _comps.py F --roi x0,y0,x1,y1 --thr 200 [--mode gt|lt] [--minarea 150] [--dilate 2] [--band r,g,b]
  --mode gt: lum>thr 为前景；lt: lum<thr；--band: 只用某通道区间，如 --band 0.5,1.0 表示 b 比 r 高
  --dilate N: 先膨胀 N 像素再连通（合并图标笔画），bbox 仍按原掩膜
"""
import argparse, numpy as np
from PIL import Image
from scipy import ndimage
ap=argparse.ArgumentParser(); ap.add_argument('frame')
ap.add_argument('--roi',required=True); ap.add_argument('--thr',type=float,default=200)
ap.add_argument('--mode',choices=('gt','lt'),default='gt'); ap.add_argument('--minarea',type=int,default=150)
ap.add_argument('--dilate',type=int,default=0); ap.add_argument('--blueness',type=float,default=None)
ap.add_argument('--sort',choices=('y','x','area'),default='y')
a=ap.parse_args()
x0,y0,x1,y1=[int(v) for v in a.roi.replace(' ','').split(',')]
im=Image.open(a.frame).convert('RGB'); arr=np.asarray(im).astype(int)
sub=arr[y0:y1,x0:x1]
lum=sub[:,:,0]*0.299+sub[:,:,1]*0.587+sub[:,:,2]*0.114
m=(lum>a.thr) if a.mode=='gt' else (lum<a.thr)
if a.blueness is not None:
    m=m & ((sub[:,:,2]-sub[:,:,0])>a.blueness)
work=m.copy()
if a.dilate>0:
    work=ndimage.binary_dilation(work,iterations=a.dilate)
lab,n=ndimage.label(work)
objs=ndimage.find_objects(lab)
res=[]
for i,sl in enumerate(objs):
    if sl is None: continue
    mm=m[sl] & (lab[sl]==i+1)
    if mm.sum()<a.minarea: continue
    ys,xs=np.nonzero(mm)
    res.append([x0+sl[1].start+xs.min(), y0+sl[0].start+ys.min(),
                xs.max()-xs.min()+1, ys.max()-ys.min()+1, int(mm.sum())])
key={'y':lambda r:(r[1],r[0]),'x':lambda r:(r[0],r[1]),'area':lambda r:-r[4]}[a.sort]
res.sort(key=key)
print('COMPS roi=%s thr=%.0f mode=%s n=%d'%(a.roi,a.thr,a.mode,len(res)))
for r in res: print('  [%d, %d, %d, %d]  area=%d'%(r[0],r[1],r[2],r[3],r[4]))
