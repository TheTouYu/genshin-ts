#!/usr/bin/env python3
"""降尺度全帧 OCR：0.5x/0.6x 缩放后跑（det 面积∝scale²），框映射回原图；测耗时与掉字。"""
import glob, json, os, sys, time, unicodedata
from collections import Counter
import cv2, numpy as np
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); REPO=os.path.abspath(os.path.join(HERE,'..','..'))
sys.path.insert(0, os.path.join(REPO,'tools','ys-editor'))
import ys_ocr
from rapidocr import RapidOCR
def norm(t): return ''.join(ch for ch in unicodedata.normalize('NFKC',t or '') if not ch.isspace())
def cmp(base,var):
    nb,nv=Counter(),Counter()
    for t in base: nb.update(norm(t))
    for t in var: nv.update(norm(t))
    return round(sum((nb&nv).values())/max(1,sum(nb.values())),4)
def main():
    ys_ocr._enable_gpu()
    eng=RapidOCR(params={'Global.use_cls':False,'EngineConfig.onnxruntime.use_cuda':True,
        'EngineConfig.onnxruntime.cuda_ep_cfg.arena_extend_strategy':'kSameAsRequested'})
    fs=sorted(glob.glob(os.path.join(REPO,'.scratch/gui-corpus/f*.png')))[:8]
    base_txt={}
    # baseline（默认管线，含 cls）——这是掉字比较的参照
    rows=[]
    for f in fs:
        img=np.asarray(Image.open(f).convert('RGB'))
        r=eng(img); base_txt[f]=list(r.txts or [])
    out={}
    for scale in (0.5,0.6,0.75):
        ms=[]; rec=[]
        for f in fs:
            img=np.asarray(Image.open(f).convert('RGB'))
            small=cv2.resize(img,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA)
            t0=time.perf_counter(); r=eng(small); dt=(time.perf_counter()-t0)*1000
            ms.append(dt); rec.append(cmp(base_txt[f], list(r.txts or [])))
        ms.sort()
        out[scale]={'median_ms':round(ms[len(ms)//2],1),'min_ms':round(ms[0],1),'max_ms':round(ms[-1],1),
                    'recall_mean':round(sum(rec)/len(rec),4),'recall_min':round(min(rec),4)}
        print(scale, out[scale], flush=True)
    # 同帧二次（内容缓存）成本
    img=np.asarray(Image.open(fs[0]).convert('RGB'))
    import hashlib
    t0=time.perf_counter(); h=hashlib.blake2b(np.ascontiguousarray(img).tobytes(),digest_size=8).hexdigest(); hms=(time.perf_counter()-t0)*1000
    print('frame_hash_ms', round(hms,1))
    json.dump(out, open('.scratch/gui-perf/ocr-downscale.json','w'), indent=1)
    return 0
sys.exit(main())
