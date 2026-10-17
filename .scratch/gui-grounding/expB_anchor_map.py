#!/usr/bin/env python3
"""实验 B：锚图 = 多锚点局部 NCC 候选 + RANSAC 4 参数相似变换(s,θ,tx,ty) + inlier 校验。
基帧 menu.png；锚点 = 2 个已标定控件（D316 坐标交叉验证背书）+ 若干纹理锚（梯度能量挑点，64×64），
共 5~12 个。被测图 = expA 已落盘的 12 张 menu 变换帧 + menu 原帧（identity 自检）+ 10 张真实异态帧（负样本）。
打分核 ncc_map 与 ys_look._ncc_np 逐式同构（FFT+积分图+fail-closed），脚本开头做等价断言自检。
判据: inliers>=3 且中位残差<=2px 判"接受"；估出 s 误差>2% 或 t 误差>8px 判"假接受"。
输出: results/expB.json, logs/expB.log, crops/anchor_*.png
"""
import sys, os, json, time
sys.path.insert(0, '/home/h/genshin-ts/tools/ys-editor')
import numpy as np
from PIL import Image
import ys_look

NCC1 = ys_look._ncc_np
ROOT = '/home/h/genshin-ts/.scratch/gui-grounding'
REG = '/home/h/genshin-ts/tools/ys-editor/calib/regress'
W, H = 2560, 1440
CX, CY = W / 2, H / 2
MIN_STD = ys_look.MIN_STD
R_SEARCH, K_CAND, FLOOR = 384, 3, 0.5
INLIER_PX, MIN_INLIERS, MAX_MED_RESID = 4.0, 3, 2.0
RANSAC_ITERS = 300
rng = np.random.default_rng(7)   # 固定种子，可重跑

def load_f32(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32) / 255.0

def ncc_map(I, T):
    """与 ys_look._ncc_np 完全同式（分子 FFT 互相关 + 分母积分图 + fail-closed），
    区别仅在于返回整张分数图而非 argmax——供取 top-K 峰用。"""
    H_, W_, C = I.shape; h, w, _ = T.shape
    if h > H_ or w > W_:
        return np.zeros((1, 1))
    Fs = (H_ + h - 1, W_ + w - 1)
    Tf = (T - T.mean())[::-1, ::-1, :]
    cross = np.zeros((H_ - h + 1, W_ - w + 1), np.float64)
    for c in range(C):
        A = np.fft.rfft2(I[:, :, c], Fs); B = np.fft.rfft2(Tf[:, :, c], Fs)
        cross += np.fft.irfft2(A * B, Fs)[h - 1:H_, w - 1:W_]
    def integ(X):
        P = np.zeros((X.shape[0] + 1, X.shape[1] + 1), np.float64)
        P[1:, 1:] = np.cumsum(np.cumsum(X, 0), 1); return P
    P1 = integ(I.sum(2)); P2 = integ((I ** 2).sum(2))
    S1 = P1[h:, w:] - P1[:-h, w:] - P1[h:, :-w] + P1[:-h, :-w]
    S2 = P2[h:, w:] - P2[:-h, w:] - P2[h:, :-w] + P2[:-h, :-w]
    n = h * w * C
    den = np.sqrt(np.maximum(S2 - S1 * S1 / n, 0.0))
    Tn = float(np.sqrt(float(((T - T.mean()) ** 2).sum())))
    den_min = np.sqrt(float(n)) * MIN_STD
    valid = (den > den_min) & (Tn > np.sqrt(float(h * w * C)) * MIN_STD)
    out = np.zeros_like(cross)
    out[valid] = cross[valid] / (den[valid] * Tn)
    return np.clip(out, -1.0, 1.0)

def selfcheck():
    """等价断言：ncc_map 的 max 与 ys_look._ncc_np 的 score 逐一对上。"""
    I = load_f32(f'{REG}/menu.png')[400:1200, 300:1500].copy()
    for tp in ['playtest-tile', 'sidebar-save-mgr']:
        T = load_f32(f'/home/h/genshin-ts/tools/ys-editor/templates/{tp}.png')
        m = ncc_map(I, T)
        x, y, s, _ = NCC1(I, T)
        assert abs(m.max() - s) < 1e-9, (tp, m.max(), s)
        assert (int(np.argmax(m)) % m.shape[1]) == x and (int(np.argmax(m)) // m.shape[1]) == y
    print('selfcheck ncc_map == _ncc_np: OK')

def pick_texture_anchors(I0, keep_out, n_want, size=64):
    """梯度能量选点（积分图盒和），避开 keep_out 半径 100px、彼此 >=300px。"""
    lum = I0.sum(2)                      # (H,W) 亮度面
    gx = np.abs(np.diff(lum, axis=1, prepend=lum[:, :1]))
    gy = np.abs(np.diff(lum, axis=0, prepend=lum[:1, :]))
    E = gx + gy
    ii = np.zeros((H + 1, W + 1)); ii[1:, 1:] = np.cumsum(np.cumsum(E, 0), 1)
    half = 32
    box = ii[2 * half:H, 2 * half:W] - ii[:H - 2 * half, 2 * half:W] \
        - ii[2 * half:H, :W - 2 * half] + ii[:H - 2 * half, :W - 2 * half]
    order = np.dstack(np.unravel_index(np.argsort(box.ravel())[::-1], box.shape))[0]
    picked = []
    for yy, xx in order:
        cx, cy = xx + half, yy + half
        if any((cx - a[0]) ** 2 + (cy - a[1]) ** 2 < 300 ** 2 for a in keep_out + picked):
            continue
        picked.append((cx, cy))
        if len(picked) >= n_want:
            break
    return picked

def topk_peaks(m, k, floor, suppress=24):
    out = []
    mm = m.copy()
    for _ in range(k):
        idx = int(np.argmax(mm)); y, x = divmod(idx, mm.shape[1])
        v = mm[y, x]
        if v < floor:
            break
        out.append((x, y, float(v)))
        y0, y1 = max(0, y - suppress), min(mm.shape[0], y + suppress + 1)
        x0, x1 = max(0, x - suppress), min(mm.shape[1], x + suppress + 1)
        mm[y0:y1, x0:x1] = -2
    return out

def ransac_similarity(pairs, iters=RANSAC_ITERS):
    """pairs: list of (p complex base, q complex observed). 返回 (a,b,inliers,med_res)。"""
    best = (0, 1e9, None, None)
    n = len(pairs)
    if n < 2:
        return None
    for _ in range(iters):
        i, j = rng.choice(n, 2, replace=False)
        (p1, q1), (p2, q2) = pairs[i], pairs[j]
        if abs(p1 - p2) < 1e-6:
            continue
        a = (q1 - q2) / (p1 - p2)
        b = q1 - a * p1
        res = np.abs(a * np.array([p for p, _ in pairs], dtype=complex) + b
                     - np.array([q for _, q in pairs], dtype=complex))
        inl = res <= INLIER_PX
        cnt = int(inl.sum())
        med = float(np.median(res[inl])) if cnt else 1e9
        if cnt > best[0] or (cnt == best[0] and med < best[1]):
            best = (cnt, med, a, b)
    cnt, med, a, b = best
    if a is None or cnt < 2:
        return None
    # inlier 上最小二乘精修（复数线性 LS: q = a*p + b）
    mask = np.abs(a * np.array([p for p, _ in pairs], dtype=complex) + b
                  - np.array([q for _, q in pairs], dtype=complex)) <= INLIER_PX
    P = np.array([p for p, _ in pairs], dtype=complex)[mask]
    Q = np.array([q for _, q in pairs], dtype=complex)[mask]
    A = np.column_stack([P, np.ones_like(P)])          # 未知 [a, b]
    sol, *_ = np.linalg.lstsq(A, Q, rcond=None)
    a2, b2 = complex(sol[0]), complex(sol[1])
    res2 = np.abs(a2 * np.array([p for p, _ in pairs], dtype=complex) + b2
                  - np.array([q for _, q in pairs], dtype=complex))
    inl2 = res2 <= INLIER_PX
    return a2, b2, int(inl2.sum()), float(np.median(res2[inl2])) if inl2.any() else 1e9

def main():
    selfcheck()
    I0 = load_f32(f'{REG}/menu.png')
    locs = json.load(open(f'{ROOT}/research/template_locations.json'))
    anchors = []
    for tp in ['playtest-tile', 'sidebar-save-mgr']:
        v = locs[f'{tp}|menu.png']
        cw, ch = min(v['w'], 120), min(v['h'], 120)
        x0 = v['x'] + (v['w'] - cw) // 2; y0 = v['y'] + (v['h'] - ch) // 2
        anchors.append(dict(name=f'ctrl:{tp}', kind='control', x0=x0, y0=y0, w=cw, h=ch,
                            arr=I0[y0:y0 + ch, x0:x0 + cw].copy()))
    keep_out = [(a['x0'] + a['w'] / 2, a['y0'] + a['h'] / 2) for a in anchors]
    for i, (cx, cy) in enumerate(pick_texture_anchors(I0, keep_out, 8)):
        x0, y0 = int(cx - 32), int(cy - 32)
        anchors.append(dict(name=f'tex{i}', kind='texture', x0=x0, y0=y0, w=64, h=64,
                            arr=I0[y0:y0 + 64, x0:x0 + 64].copy()))
    for a in anchors:
        Image.fromarray((a['arr'] * 255).astype(np.uint8)).save(f"{ROOT}/crops/anchor_{a['name'].replace(':', '_')}.png")
    print('anchors:', [(a['name'], a['w'], a['h'], a['x0'] + a['w'] // 2, a['y0'] + a['h'] // 2) for a in anchors])

    def run_frame(I, tag, truth=None):
        t0 = time.perf_counter()
        cand = []   # (anchor_idx, complex p, complex q, score)
        for i, a in enumerate(anchors):
            p = complex(a['x0'] + a['w'] / 2, a['y0'] + a['h'] / 2)
            wx0 = max(0, int(p.real) - R_SEARCH); wy0 = max(0, int(p.imag) - R_SEARCH)
            wx1 = min(W, int(p.real) + R_SEARCH + a['w']); wy1 = min(H, int(p.imag) + R_SEARCH + a['h'])
            if wx1 - wx0 < a['w'] + 8 or wy1 - wy0 < a['h'] + 8:
                continue
            win = np.ascontiguousarray(I[wy0:wy1, wx0:wx1])
            m = ncc_map(win, a['arr'])
            for x, y, v in topk_peaks(m, K_CAND, FLOOR):
                q = complex(wx0 + x + a['w'] / 2, wy0 + y + a['h'] / 2)
                cand.append((i, p, q, v))
        t_cand = time.perf_counter() - t0
        pairs = [(p, q) for _, p, q, _ in cand]
        fit = ransac_similarity(pairs) if len(pairs) >= 2 else None
        dt = time.perf_counter() - t0
        if not fit:
            return dict(frame=tag, accepted=False, inliers=0, n_cand=len(cand),
                        cand_secs=round(t_cand, 3), secs=round(dt, 3))
        a, b, inl, med = fit
        rec = dict(frame=tag, accepted=bool(inl >= MIN_INLIERS and med <= MAX_MED_RESID),
                   inliers=inl, med_resid=round(med, 2), n_cand=len(cand),
                   s_hat=round(abs(a), 4), deg_hat=round(float(np.degrees(np.angle(a))), 2),
                   t_hat=[round(b.real, 1), round(b.imag, 1)],
                   cand_secs=round(t_cand, 3), secs=round(dt, 3))
        if truth:
            s, dx, dy = truth
            bt = complex(CX * (1 - s) + dx, CY * (1 - s) + dy)
            errs = [abs(a * complex(A_['x0'] + A_['w'] / 2, A_['y0'] + A_['h'] / 2) + b
                        - complex(CX + s * (A_['x0'] + A_['w'] / 2 - CX) + dx,
                                  CY + s * (A_['y0'] + A_['h'] / 2 - CY) + dy))
                    for A_ in anchors]
            rec.update(scale_err_pct=round(abs(abs(a) - s) / s * 100, 2),
                       trans_err_px=round(float(abs(b - bt)), 1),
                       anchor_loc_med_px=round(float(np.median(errs)), 1),
                       anchor_loc_max_px=round(float(np.max(errs)), 1))
            rec['false_accept'] = bool(rec['accepted'] and
                                       (rec['scale_err_pct'] > 2 or rec['trans_err_px'] > 8))
        return rec

    out = []
    TRANS = {'scale0.75': (0.75, 0, 0), 'scale0.9': (0.9, 0, 0), 'scale1.1': (1.1, 0, 0),
             'scale1.25': (1.25, 0, 0), 'shift+64x': (1.0, 64, 0), 'shift-64x': (1.0, -64, 0),
             'shift+64y': (1.0, 0, 64), 'shift-64y': (1.0, 0, -64),
             'bright+10%': (1.0, 0, 0), 'bright-10%': (1.0, 0, 0),
             'combo1': (1.25, 64, 0), 'combo2': (0.75, -64, 0)}
    out.append(run_frame(I0, 'identity', truth=(1.0, 0, 0)))
    for tfn, truth in TRANS.items():
        I = load_f32(f'{ROOT}/crops/menu_{tfn}.png')
        out.append(run_frame(I, tfn, truth=truth))
    for fr in sorted(os.listdir(REG)):
        if fr.endswith('.png') and fr != 'menu.png':
            out.append(run_frame(load_f32(f'{REG}/{fr}'), f'NEG:{fr}'))
    json.dump(dict(anchors=[{k: v for k, v in a.items() if k != 'arr'} for a in anchors],
                   results=out, params=dict(R=R_SEARCH, K=K_CAND, FLOOR=FLOOR,
                                            INLIER_PX=INLIER_PX, MIN_INLIERS=MIN_INLIERS,
                                            MAX_MED_RESID=MAX_MED_RESID, ITERS=RANSAC_ITERS)),
              open(f'{ROOT}/results/expB.json', 'w'), ensure_ascii=False, indent=1)
    for r in out:
        print(json.dumps(r, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
