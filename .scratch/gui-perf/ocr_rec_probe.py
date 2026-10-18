#!/usr/bin/env python3
"""rec 单环节探针：cudnn 搜索模式 / 固定输入宽 / batch 对 rec 耗时的真实影响。

背景：73 个文本框 rec 650-837ms（≈9ms/框），远超一张 48×W 的 CRNN 应有成本。
怀疑 = CUDA EP `cudnn_conv_algo_search: EXHAUSTIVE` 在每个新输入宽度上重新基准搜索。
"""
import argparse, glob, os, sys, time
import numpy as np
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); REPO=os.path.abspath(os.path.join(HERE,'..','..'))
sys.path.insert(0, os.path.join(REPO,'tools','ys-editor'))
import ys_ocr
from rapidocr.utils.process_img import get_rotate_crop_image
from rapidocr.ch_ppocr_rec.typings import TextRecInput
FR=sorted(glob.glob(os.path.join(REPO,'.scratch/gui-corpus/video-20261018/reps/*.jpg')))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--frame',default='v000'); ap.add_argument('--detmax',type=int,default=1600)
    ap.add_argument('--heur',action='store_true'); ap.add_argument('--fixedw',type=int,default=0)
    ap.add_argument('--batch',type=int,default=6); ap.add_argument('--reps',type=int,default=3)
    a=ap.parse_args()
    ok,why=ys_ocr._enable_gpu()
    from rapidocr import RapidOCR
    params={'Global.use_cls':False,'EngineConfig.onnxruntime.use_cuda':True}
    if a.heur: params['EngineConfig.onnxruntime.cuda_ep_cfg.cudnn_conv_algo_search']='HEURISTIC'
    e=RapidOCR(params=params)
    f=[x for x in FR if a.frame in x][0]
    img=np.asarray(Image.open(f).convert('RGB'))
    det=e.text_det or e._load_det_model(); det.limit_type='max'; det.limit_side_len=a.detmax
    d=det(img)
    crops=[get_rotate_crop_image(img,np.array(b,copy=True)) for b in d.boxes]
    rec=e.text_rec or e._load_rec_model()
    rec.rec_batch_num=a.batch
    if a.fixedw: rec.rec_image_shape=(3,48,a.fixedw)
    ts=[]
    for i in range(a.reps):
        t0=time.perf_counter(); r=rec(TextRecInput(img=crops,return_word_box=False)); ts.append((time.perf_counter()-t0)*1000)
    print({'frame':os.path.basename(f),'n_boxes':len(crops),'heur':a.heur,'fixedw':a.fixedw,
           'batch':a.batch,'rec_ms':[round(x,1) for x in ts],'gpu':ok},flush=True)
    return 0
sys.exit(main())
