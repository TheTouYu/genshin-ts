#!/usr/bin/env python3
"""实验 A：重采样/平移/亮度扰动下 NCC 模板匹配的稳定性。
打分函数 = tools/ys-editor/ys_look.py::_ncc_np（只读复用，FFT+积分图精确 NCC，fail-closed）。
基模板 = 已标定控件（controls.json 阈值背书）在基帧上命中位置的真实裁片，max 边 <=120px。
每个 (模板, 变换):
  - 原尺度: 全帧 NCC top-1
  - 多尺度: 模板按 [0.75,0.875,1.0,1.125,1.25] 双线性重采样后各跑一次全帧 NCC 取全局最优
  - 自检: 从变换图的期望位置裁回与重采样模板对 NCC（防仪器数学错误，<0.95 则剔除该样本并记账）
  - 负样本: 基帧模板对其余 10 张真实回归帧做原尺度全帧 NCC（跨态假命中=历史事故模式）
指标: top-1 命中率(err<=8px) / 假命中(err>32px 且 score>0.8) / 耗时。
输出: results/expA.json, results/expA.csv, logs/expA.log, crops/<base>_<tf>.png
"""
import sys, os, json, time, csv, glob
sys.path.insert(0, '/home/h/genshin-ts/tools/ys-editor')
import numpy as np
from PIL import Image
import ys_look

ROOT = '/home/h/genshin-ts/.scratch/gui-grounding'
REG = '/home/h/genshin-ts/tools/ys-editor/calib/regress'
NCC = ys_look._ncc_np
W, H = 2560, 1440
CX, CY = W / 2, H / 2
HIT_T = 0.9          # controls.json 标定阈值
MAXSIDE = 120
MULTI = [0.75, 0.875, 1.0, 1.125, 1.25]

def load_f32(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32) / 255.0

def warp(img_f32, s, dx, dy, bright):
    """out = c + s*(in-c) + d; 越界填黑(平坦区 NCC fail-closed)。返回 (新图, 期望映射参数)。"""
    im = Image.fromarray((img_f32 * 255).astype(np.uint8))
    a, b_, cc = 1.0 / s, 0.0, CX * (1 - 1.0 / s) - dx / s
    d, e, f = 0.0, 1.0 / s, CY * (1 - 1.0 / s) - dy / s
    out = im.transform((W, H), Image.AFFINE, (a, b_, cc, d, e, f),
                       resample=Image.BILINEAR, fillcolor=(0, 0, 0))
    arr = np.asarray(out, dtype=np.float32) / 255.0
    return np.clip(arr * bright, 0, 1), (s, dx, dy)

def expect(p, s, dx, dy):
    x, y = p
    return (CX + s * (x - CX) + dx, CY + s * (y - CY) + dy)

TRANSFORMS = [
    ('scale0.75',   0.75,  0,  0, 1.0), ('scale0.9',    0.9,   0,  0, 1.0),
    ('scale1.1',    1.1,   0,  0, 1.0), ('scale1.25',   1.25,  0,  0, 1.0),
    ('shift+64x',   1.0,  64,  0, 1.0), ('shift-64x',   1.0, -64,  0, 1.0),
    ('shift+64y',   1.0,   0, 64, 1.0), ('shift-64y',   1.0,   0, -64, 1.0),
    ('bright+10%',  1.0,   0,  0, 1.1), ('bright-10%',  1.0,   0,  0, 0.9),
    ('combo1',      1.25, 64,  0, 1.1), ('combo2',      0.75, -64, 0, 0.9),
]

def main():
    locs = json.load(open(f'{ROOT}/research/template_locations.json'))
    hits = [v for v in locs.values() if v['hit']]
    # 基帧固定为三张，各自只用"自态 >=0.99 且语义正确"的命中（D316 坐标交叉验证背书）：
    #   menu.png: playtest-tile(0.9998@185,390 ~ D316 183,389), sidebar-save-mgr(1.0)
    #   pause.png: pause-abort(0.9999@1270,856 ~ D316 1280,877), pause-resume(1.0)
    #   savelist.png: save-card-title(1.0), mymap-title(1.0)
    # 排除 settle-leave@savelist(0.9102)——那是跨态假命中位置，不是该控件真实所在。
    BASES = {'menu.png': ['playtest-tile', 'sidebar-save-mgr'],
             'pause.png': ['pause-abort', 'pause-resume'],
             'savelist.png': ['save-card-title', 'mymap-title']}
    bases = list(BASES.keys())
    print('base frames:', bases, {f: len(BASES[f]) for f in bases})
    frames_all = sorted(os.path.basename(p) for p in glob.glob(f'{REG}/*.png'))

    tpls = {}   # base -> list of dict
    for base in bases:
        lst = []
        for name in BASES[base]:
            v = locs[f'{name}|{base}']
            cw, ch = min(v['w'], MAXSIDE), min(v['h'], MAXSIDE)
            x0 = v['x'] + (v['w'] - cw) // 2
            y0 = v['y'] + (v['h'] - ch) // 2
            I = load_f32(f'{REG}/{base}')
            crop = I[y0:y0 + ch, x0:x0 + cw].copy()
            lst.append(dict(name=f"{v['tpl']}", kind='control', x0=x0, y0=y0,
                            w=cw, h=ch, cx=x0 + cw / 2, cy=y0 + ch / 2, arr=crop))
        tpls[base] = lst
        print(base, '->', [(t['name'], t['w'], t['h'], int(t['cx']), int(t['cy'])) for t in lst])

    rows, skip_log = [], []
    os.makedirs(f'{ROOT}/crops', exist_ok=True)
    for base in bases:
        I0 = load_f32(f'{REG}/{base}')
        for tfn, s, dx, dy, br in TRANSFORMS:
            It, _ = warp(I0, s, dx, dy, br)
            Image.fromarray((It * 255).astype(np.uint8)).save(f'{ROOT}/crops/{base[:-4]}_{tfn}.png')
            for t in tpls[base]:
                ex, ey = expect((t['cx'], t['cy']), s, dx, dy)
                ew, eh = t['w'] * s, t['h'] * s
                ex0, ey0 = ex - ew / 2, ey - eh / 2
                inside = ex0 >= 0 and ey0 >= 0 and ex0 + ew <= W and ey0 + eh <= H
                if not inside:
                    skip_log.append(f"{base}|{t['name']}|{tfn}|offscreen")
                    continue
                # 自检: 期望位置裁回 vs 重采样模板
                self_sc = -1.0
                if It[round(ey0):round(ey0 + eh), round(ex0):round(ex0 + ew)].shape[:2] == (round(eh), round(ew)):
                    back = It[round(ey0):round(ey0 + eh), round(ex0):round(ex0 + ew)]
                    tr = np.asarray(Image.fromarray((t['arr'] * 255).astype(np.uint8))
                                    .resize((round(ew), round(eh)), Image.BILINEAR), dtype=np.float32) / 255.0
                    if back.shape == tr.shape:
                        _, _, self_sc, _ = NCC(np.ascontiguousarray(back), np.ascontiguousarray(tr))
                if self_sc < 0.95:
                    skip_log.append(f"{base}|{t['name']}|{tfn}|selfcheck={self_sc:.3f}")
                    continue
                rec = dict(base=base, tpl=t['name'], tw=t['w'], th=t['h'], tf=tfn,
                           ex=round(ex, 1), ey=round(ey, 1), selfcheck=round(self_sc, 4))
                # 原尺度
                t0 = time.perf_counter()
                x, y, sc, _ = NCC(It, t['arr'])
                rec['s1_pos'] = [round(x + t['w'] / 2, 1), round(y + t['h'] / 2, 1)]
                rec['s1_score'] = round(sc, 4)
                rec['s1_err'] = round(float(np.hypot(x + t['w'] / 2 - ex, y + t['h'] / 2 - ey)), 1)
                rec['s1_secs'] = round(time.perf_counter() - t0, 3)
                # 多尺度
                t0 = time.perf_counter()
                best = (-2, None, None, None)
                for f in MULTI:
                    tw_, th_ = max(8, round(t['w'] * f)), max(8, round(t['h'] * f))
                    tr = np.asarray(Image.fromarray((t['arr'] * 255).astype(np.uint8))
                                    .resize((tw_, th_), Image.BILINEAR), dtype=np.float32) / 255.0
                    x, y, sc, _ = NCC(It, tr)
                    if sc > best[0]:
                        best = (sc, x + tw_ / 2, y + th_ / 2, f)
                dt = time.perf_counter() - t0
                rec['ms_score'], rec['ms_pos'] = round(best[0], 4), [round(best[1], 1), round(best[2], 1)]
                rec['ms_err'] = round(float(np.hypot(best[1] - ex, best[2] - ey)), 1)
                rec['ms_factor'], rec['ms_secs'] = best[3], round(dt, 3)
                rows.append(rec)
                print(f"[A] {base[:-4]:6s} {t['name']:18s} {tfn:10s} s1(err={rec['s1_err']:7.1f} sc={rec['s1_score']:.3f}) "
                      f"ms(err={rec['ms_err']:7.1f} sc={rec['ms_score']:.3f} f={best[3]}) self={self_sc:.3f}", flush=True)
        # 负样本: 该基帧的模板 vs 其它真实帧（原尺度全帧）
        for t in tpls[base]:
            for fr in frames_all:
                if fr == base:
                    continue
                I = load_f32(f'{REG}/{fr}')
                x, y, sc, _ = NCC(I, t['arr'])
                rows.append(dict(base=base, tpl=t['name'], tw=t['w'], th=t['h'],
                                 tf=f'NEG:{fr}', ex=-1, ey=-1, selfcheck=1.0,
                                 s1_pos=[round(x + t['w'] / 2, 1), round(y + t['h'] / 2, 1)],
                                 s1_score=round(sc, 4), s1_err=-1, s1_secs=0,
                                 ms_score=None, ms_pos=None, ms_err=-1, ms_factor=None, ms_secs=0))
                if sc > 0.8:
                    print(f"[A-NEG>0.8] {t['name']:18s} vs {fr:26s} score={sc:.4f} at ({x+t['w']//2},{y+t['h']//2})", flush=True)

    json.dump(dict(rows=rows, skipped=skip_log, multi_factors=MULTI),
              open(f'{ROOT}/results/expA.json', 'w'), ensure_ascii=False, indent=1)
    with open(f'{ROOT}/results/expA.csv', 'w', newline='') as fp:
        wtr = csv.DictWriter(fp, fieldnames=list(rows[0].keys()) if rows else ['base'])
        wtr.writeheader(); wtr.writerows(rows)
    print(f"rows={len(rows)} skipped={len(skip_log)}")
    for s in skip_log[:20]:
        print('SKIP', s)

if __name__ == '__main__':
    main()
