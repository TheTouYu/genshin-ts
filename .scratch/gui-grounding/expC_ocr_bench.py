#!/usr/bin/env python3
"""实验 C：OCR 引擎现实测评（文本锚可行性）。
裁切区（真实回归帧）：
  pause-buttons : pause.png (920,498)-(1620,986) 700×488 三按钮区
                 （pick: pause-resume(1270,628)=1.0 / pause-abort(1270,856)=0.9999 与 D316 实点吻合）
  settle2-leave : settle2.png (1590,1150)-(2190,1440) 600×290（settle-leave 模板 1.0000 命中 @1890,1366）
  pause-abort-tpl: 仓库已标定模板 300×56（小图边界用例）
基准文案（独立于被测引擎的信源）：
  继续挑战/重新挑战/中断挑战 = manifest.tsv「pause.png PAUSE 试玩暂停菜单（继续/重新/中断挑战）」+ D316 实点会话
  离开 = settle-leave 模板出处（controls.json）+ settle2 帧上 1.0000 全同像素命中
引擎：tesseract 5.5.3 chi_sim (psm 6/7) vs rapidocr-onnxruntime 1.4.4（venv-rapidocr，CPU）。
指标：耗时（进程墙钟）、逐标签字符正确率（difflib 对齐，人工信源为基准）。
输出: results/expC.json + logs/expC.log
"""
import subprocess, json, time, os, difflib, sys
from PIL import Image

ROOT = '/home/h/genshin-ts/.scratch/gui-grounding'
REG = '/home/h/genshin-ts/tools/ys-editor/calib/regress'
CROPS = [
    dict(name='pause-buttons', src=f'{REG}/pause.png', box=(920, 498, 1620, 986),
         refs=['继续挑战', '重新挑战', '中断挑战']),
    dict(name='settle2-leave', src=f'{REG}/settle2.png', box=(1590, 1150, 2190, 1440),
         refs=['离开']),
    dict(name='pause-abort-tpl', src='/home/h/genshin-ts/tools/ys-editor/templates/pause-abort.png',
         box=None, refs=['中断挑战']),
]

def norm(s):
    return ''.join(s.split())

def label_score(ref, texts):
    """返回 (最佳匹配串, 命中字符数/len(ref))"""
    best = ('', -1.0)
    for t in texts:
        m = sum(b.size for b in difflib.SequenceMatcher(None, ref, norm(t)).get_matching_blocks())
        if m > best[1]:
            best = (norm(t), m)
    return best[0], round(best[1] / len(ref), 3)

RAPID_CODE = r'''
import json,sys,time
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR
ocr=RapidOCR()
out={}
first=True
for line in sys.stdin.read().splitlines():
    if not line: continue
    img=np.asarray(Image.open(line).convert('RGB'))
    t0=time.perf_counter(); res=ocr(img); dt=time.perf_counter()-t0
    items=[]
    if res and res[0]:
        for it in res[0]:
            box,txt,conf=it[0],it[1],it[2]
            items.append(dict(text=txt, conf=round(float(conf),4),
                              cx=round(float((box[0][0]+box[2][0])/2),1),
                              cy=round(float((box[0][1]+box[2][1])/2),1)))
    out[line]=dict(items=items, secs=round(dt,3), cold=first); first=False
print(json.dumps(out,ensure_ascii=False))
'''

def main():
    os.makedirs(f'{ROOT}/crops', exist_ok=True)
    for c in CROPS:
        im = Image.open(c['src']).convert('RGB')
        if c['box']:
            im = im.crop(c['box'])
        p = f"{ROOT}/crops/{c['name']}.png"
        im.save(p); c['path'] = p; c['size'] = im.size

    # tesseract（每次都是冷进程，含模型加载——真实调用形态）
    for c in CROPS:
        for psm in (6, 7):
            t0 = time.perf_counter()
            r = subprocess.run(['tesseract', c['path'], 'stdout', '-l', 'chi_sim',
                                '--psm', str(psm)], capture_output=True, text=True)
            dt = time.perf_counter() - t0
            c[f'tess_psm{psm}'] = dict(text=norm(r.stdout), secs=round(dt, 3), rc=r.returncode)

    # rapidocr（常驻进程形态：init 一次，首图冷、后续热）
    pr = subprocess.run([f'{ROOT}/venv-rapidocr/bin/python', '-c', RAPID_CODE],
                        input='\n'.join(c['path'] for c in CROPS),
                        capture_output=True, text=True)
    if pr.returncode != 0:
        print('RAPIDOCR FAILED:', pr.stderr[-600:]); sys.exit(1)
    rapid = json.loads(pr.stdout)

    total_ref = sum(len(x) for c in CROPS for x in c['refs'])
    for c in CROPS:
        rr = rapid[c['path']]
        c['rapid'] = dict(items=rr['items'], secs=rr['secs'], cold=rr['cold'],
                          text=''.join(i['text'] for i in rr['items']))
        for eng, texts in (('tess_psm6', [c['tess_psm6']['text']]),
                           ('tess_psm7', [c['tess_psm7']['text']]),
                           ('rapid', [i['text'] for i in rr['items']])):
            lab = {}
            for ref in c['refs']:
                bt, acc = label_score(ref, texts)
                lab[ref] = dict(best=bt, char_acc=acc)
            c[eng + '_labels'] = lab

    json.dump(CROPS, open(f'{ROOT}/results/expC.json', 'w'), ensure_ascii=False, indent=1)
    print(f"{'crop':16s} {'engine':10s} {'secs':>6s}  per-label(acc)  text")
    for c in CROPS:
        for eng, secs in (('tess_psm6', c['tess_psm6']['secs']), ('tess_psm7', c['tess_psm7']['secs']),
                          ('rapid', c['rapid']['secs'])):
            labs = ' '.join(f"{r}:{c[eng+'_labels'][r]['char_acc']:.2f}({c[eng+'_labels'][r]['best']})"
                            for r in c['refs'])
            txt = c['tess_psm6' if eng=='tess_psm6' else 'tess_psm7' if eng=='tess_psm7' else 'rapid']['text']
            print(f"{c['name']:16s} {eng:10s} {secs:6.2f}s  {labs}  |{txt[:44]}|")

if __name__ == '__main__':
    main()
