#!/usr/bin/env python3
"""OCR 瓶颈探针：det 输入尺寸 / rec 批量 / 线程 / cudnn 搜索模式 的真实成本。"""
import argparse, glob, os, sys, time, threading
import numpy as np
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); REPO=os.path.abspath(os.path.join(HERE,'..','..'))
sys.path.insert(0, os.path.join(REPO,'tools','ys-editor'))
import ys_ocr
from rapidocr.utils.process_img import get_rotate_crop_image
from rapidocr.ch_ppocr_rec.typings import TextRecInput

FR=sorted(glob.glob(os.path.join(REPO,'.scratch/gui-corpus/video-20261018/reps/*.jpg')))

def eng_new(heur=False):
    ok,why = ys_ocr._enable_gpu()
    params={'Global.use_cls':False,'EngineConfig.onnxruntime.use_cuda':True}
    if heur:
        params.update({'EngineConfig.onnxruntime.cuda_ep_cfg.cudnn_conv_algo_search':'HEURISTIC'})
    from rapidocr import RapidOCR
    e=RapidOCR(params=params)
    return e, ok, why

def crops_from(e, img, det_max):
    det=e.text_det or e._load_det_model()
    det.limit_type='max'; det.limit_side_len=int(det_max)
    d=det(img)
    return [get_rotate_crop_image(img, np.array(b,copy=True)) for b in d.boxes]

def rec(e, crops, batch=6):
    e.text_rec = e.text_rec or e._load_rec_model()
    e.text_rec.rec_batch_num=batch
    t0=time.perf_counter(); r=e.text_rec(TextRecInput(img=crops, return_word_box=False))
    return (time.perf_counter()-t0)*1000, list(r.txts or [])

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--heur',action='store_true')
    ap.add_argument('--frame',default=''); ap.add_argument('--detmax',type=int,default=1600)
    a=ap.parse_args()
    e,ok,why=eng_new(a.heur)
    print('gpu',ok,why,'heur',a.heur,flush=True)
    f=[x for x in FR if a.frame in x][0] if a.frame else FR[0]
    img=np.asarray(Image.open(f).convert('RGB')); print('frame',os.path.basename(f),img.shape,flush=True)
    # det 尺寸阶梯（同一个 detector，改 limit 参数）
    for dm in (2000,1600,1280,960):
        det=e.text_det or e._load_det_model(); det.limit_type='max'; det.limit_side_len=dm
        ts=[]
        for _ in range(3):
            t0=time.perf_counter(); d=det(img); ts.append((time.perf_counter()-t0)*1000)
        n=0 if d.boxes is None else len(d.boxes)
        print(f'det max={dm:4d} ms={[round(x,1) for x in ts]} boxes={n}',flush=True)
    crops=crops_from(e,img,a.detmax); print('crops',len(crops),'median h/w',int(np.median([c.shape[0] for c in crops])),int(np.median([c.shape[1] for c in crops])),flush=True)
    for b in (6,16,32):
        ts=[]
        for _ in range(3):
            ms,_t=rec(e,crops,b); ts.append(ms)
        print(f'rec batch={b:2d} ms={[round(x,1) for x in ts]} ({len(crops)} 框)',flush=True)
    # 线程并发（同一 session）
    for th in (2,4):
        parts=[crops[i::th] for i in range(th)]
        for rep in range(2):
            t0=time.perf_counter(); out=[None]*th
            def w(i): out[i]=rec(e,parts[i],6)[0]
            ts=[threading.Thread(target=w,args=(i,)) for i in range(th)]
            [t.start() for t in ts]; [t.join() for t in ts]
            print(f'rec threads={th} rep={rep} wall={(time.perf_counter()-t0)*1000:.1f}ms per-thread={[round(x,1) for x in out]}',flush=True)
    return 0
sys.exit(main())
