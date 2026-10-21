#!/usr/bin/env python3
"""ys_scrollbar.py — 「滚动条 / 滑块（thumb）」检测的**唯一实现**（单一源）。

本模块只依赖 numpy + PIL（零新增依赖），**只读像素，不改任何文件**。
CLI 见 `tools/ys-scrollbar`；`tools/ys-screen`、`tools/ys-scroll --seek-*` 一律 import 本模块，
**任何地方都不得复制判据常数**。

## 为什么需要它（能力缺口）

GUI 感知层能读界面、能注入滚轮/点击/拖动，但**没有「跳到列表某个位置」的能力**：
滚轮一次最多走 ~7 行（请求 48 行只落 5.6 行，游戏有速率上限），内容拖动 0.2–0.45 行/秒。
容器层（`ys-screen --containers`）对 `ws<=20/h>=300` 的细长条候选 **=0**，所以做不出「拖到 50%」这种通用 seek。

## 判据（全部来自 2026-10-21 的实测标定，见 `docs/maintenance/doc-2026-10-21-gui-scrollbar.md`）

实测的三个正样本家族（2560×1440 全帧像素）：

| 帧 | 双竖边 | 带宽 | run | 带内 contrast（band − 两侧背景） | thumb 跨度 |
|---|---|---|---|---|---|
| `.scratch/gui-corpus/f10.png`（设置页·亮滑块+暗槽） | x=2422..2432 | 10 | 670 | 槽 −10..−24 / 滑块 +30..+105 | y 175–850 |
| `.scratch/gui-corpus/f11.png`（同页滚到底） | x=2422..2434 | 12 | 674 | 槽 −10..−17 / 滑块 +29..+65 | y 685–1360 |
| `…/evidence/friends-run-20261021-1555/friends0.png`（好友列表·6px 暗槽+超亮滑块） | x=2402..2408 | 6 | 1032 | 槽 −5..−12 / 滑块 +125 | y ≈120–230 |

**四步判据**：
  ① **竖边**：`|dL/dx| > EDGE_D`，单列最长连续 run ≥ `TRACK_LEN_MIN`；
  ② **带**：两条平行竖边，间距 `TRACK_W`（4–24px），且带宽恒定（左右边逐行同时存在）；
  ③ **轨道**：带的 `d(y)=band−两侧背景` 在 `|d|≥BAND_D_MIN` 上连续（允许 ≤`GAP_TOL` 的缺口），
     非滑块段 `d` 的稳定性 `std ≤ BAND_D_STD_MAX`（挡渐变阴影/斜边）；
  ④ **滑块**：把 `d(y)` 做 2 聚类，**|均值| 大的那一簇**就是滑块（亮条或暗条都收），
     要求单段连续、长度 ∈ `THUMB_LEN × track_len`；否则 `found:false`，**不猜**。

负例闸门（必须不触发）：分隔线/面板边框（带宽恒定但无离群簇）、进度条（横向分支另设严闸）、
列表滚动阴影（宽度不恒定）、竖排图标栏（宽 ≥40 且内部有纹理）、▲▼ 提示块（宽 24–90 且 run <300）。

## 返回

    {"found": bool, "orientation": "v"|"h"|None,
     "track_bbox": [x0,y0,x1,y1], "thumb_bbox": [x0,y0,x1,y1],
     "position_ratio": float, "thumb_ratio": float, "estimated_pages": float,
     "evidence": {...}, "reason": str|None}

`found:false` 时 `reason` ∈ {`no_long_edge`, `no_band`, `no_track`,
`band_unstable`, `no_thumb_run`, `thumb_full_length`, `ambiguous_multi_thumb`,
`ambiguous_equal_clusters`}。**宁可漏也不假阳。**

## 其它分辨率

所有常数按 **1440 高**标定；`scale = H/1440` 后 `TRACK_W / TRACK_LEN_MIN / GAP_TOL /
COVER_WIN` 一律乘 `scale`（宽度类四舍五入取整）。
"""
import math

import numpy as np

# ——— 判据常数表（唯一来源；调参只改这里） ———
SCALE_REF_H = 1440.0      # 常数标定参考高度
TRACK_W = (4, 24)         # 带（轨道/滑块）宽度 px —— f10=10 / f11=12 / friends0=6
TRACK_LEN_MIN = 300       # 轨道最短 run px —— f06 最长假竖边 43px 必须被挡
ASPECT_MIN = 8.0          # 长/宽 下界（实测 67–187，留安全余量）
EDGE_D = 4                # 竖边灰阶差阈值（f10/f11 8–12；realrun boundary.png 弱到 5）
EDGE_JITTER = 2           # 竖边列抖动 px：滑块比轨道宽 1–2px，边缘会外移（boundary.png 实测）
GAP_EDGE = 48             # 同一列两条 run 的合并缺口 px（滑块把边缘挤开时用）
MAX_PAIRS = 48            # 参与剖面裁决的假设上限（性能护栏）
SIDE_W = 8                # 两侧背景取样宽度 px
BAND_D_MIN = 5            # 带 vs 侧背景最小对比（暗槽实测只 −5..−24 ⇒ 取 5 是下界）
BAND_D_STD_MAX = 6.0      # 非滑块段 d 的稳定性上界（挡渐变阴影/背景变化）
THUMB_DEV = 12.0          # 滑块簇与轨道簇的最小分离量
THUMB_LEN = (0.04, 0.95)  # 滑块长度 / 轨道长度
BAND_V_STD_MAX = 3.0      # 带内「实心度」：逐行亮度 std 的中位数上界（轨道是实心条，行背景/边框带不是）
GAP_TOL = 30              # 轨道内允许的 `|d|<BAND_D_MIN` 连续缺口 px
COVER_WIN = 240           # 列覆盖率滑窗高度 px
COVER_THR = 0.90          # 列覆盖率阈值
MAX_EDGE_COLS = 24        # 精确 run 计算的列数上限（性能护栏）
MAX_PAIRS = 48            # 参与剖面裁决的假设上限（性能护栏）
TRACK_MARGIN = 8           # 轨道两端离帧边缘的最小留白 px（贴边=被画面裁切，判不了）
MAX_VERIFY = 400          # 真正跑满 ③④ 闸门的假设上限（每条约 0.3ms，全验更稳）
LUM = (0.299, 0.587, 0.114)


def _lum(rgb):
    a = rgb.astype(np.float32)
    return a[:, :, 0] * LUM[0] + a[:, :, 1] * LUM[1] + a[:, :, 2] * LUM[2]


def _scale_params(H):
    s = H / SCALE_REF_H
    return {
        'scale': s,
        'w': (max(2, int(round(TRACK_W[0] * s))), max(4, int(round(TRACK_W[1] * s)))),
        'len_min': int(round(TRACK_LEN_MIN * s)),
        'gap_tol': int(round(GAP_TOL * s)),
        'win': int(round(COVER_WIN * s)),
        'side': max(2, int(round(SIDE_W * s))),
        'jitter': int(round(EDGE_JITTER * s)),
        'gap_edge': int(round(GAP_EDGE * s)),
    }


def _segments(mask, gap=0, min_len=1):
    """bool 1-D → [(start, end_inclusive)]，把间距 ≤gap 的段合并。"""
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        return []
    out = []
    s = p = int(idx[0])
    for v in idx[1:]:
        v = int(v)
        if v - p <= gap + 1:
            p = v
            continue
        out.append((s, p))
        s = p = v
    out.append((s, p))
    return [(a, b) for a, b in out if b - a + 1 >= min_len]


def _longest_run(col, gap=0):
    """bool 1-D → (length, start, end_inclusive)；`gap` 允许合并 ≤gap 的缺口。"""
    a, b = None, None
    segs = _segments(col, gap=gap, min_len=1)
    if not segs:
        return 0, -1, -1
    a, b = max(segs, key=lambda t: t[1] - t[0])
    return int(b - a + 1), int(a), int(b)


def _refine(E, x, y0, y1, J):
    """在 x±J 内挑「该段行上边缘最强」的列，返回真实边缘列（滑块比轨道宽时边缘会外移）。"""
    best_x, best_v = x, -1.0
    for dx in range(-J, J + 1):
        xx = x + dx
        if xx < 0 or xx >= E.shape[1]:
            continue
        v = float(E[y0:y1 + 1, xx].mean())
        if v > best_v:
            best_v, best_x = v, xx
    return best_x


def _two_cluster(vals, iters=8):
    """1-D 2 聚类（k-means，用分位数初始化）→ (c0, c1)。"""
    lo, hi = np.percentile(vals, 10), np.percentile(vals, 90)
    c = np.array([lo, hi], np.float64)
    for _ in range(iters):
        lab = np.abs(vals[:, None] - c[None, :]).argmin(1)
        for k in (0, 1):
            if (lab == k).any():
                c[k] = vals[lab == k].mean()
    return float(c[0]), float(c[1])


def _band_profile(L, xl, xr, s):
    """带的亮度剖面 d(y) = 带均值 − 两侧背景均值（两侧各取 s px）。"""
    H, W = L.shape
    b0, b1 = xl + 1, xr
    if b0 < 0 or b1 > W or b1 - b0 < 1:
        return None
    band = L[:, b0:b1].mean(1)
    l0, l1 = max(0, b0 - s), b0
    r0, r1 = min(W, b1 + s), b1
    if l1 > l0 and r1 > r0:
        side = (L[:, l0:l1].mean(1) + L[:, r0:r1].mean(1)) / 2.0
    elif r1 > r0:
        side = L[:, r0:r1].mean(1)
    else:
        side = L[:, l0:l1].mean(1)
    return band - side, b0, b1


def _thumb_from_d(d, P):
    """③④：从 d(y) 里取轨道段与滑块段。返回 (dict | None, reason)。"""
    spans = _segments(np.abs(d) >= BAND_D_MIN, gap=P['gap_tol'], min_len=P['len_min'])
    if not spans:
        return None, 'no_track'
    t0, t1 = max(spans, key=lambda t: t[1] - t[0])
    # 轨道两端必须都在画面内留白——贴到画面边的「轨道」是被裁切的横条/行背景（实测：f09 的
    # 滑条行 y=664..678 一直顶到 x=2559，是滑块行不是滚动条）
    dim = len(d)
    if t0 < TRACK_MARGIN or t1 > dim - 1 - TRACK_MARGIN:
        return None, 'track_at_frame_edge'
    tlen = t1 - t0 + 1
    dv = d[t0:t1 + 1]

    c0, c1 = _two_cluster(dv)
    if abs(abs(c0) - abs(c1)) < THUMB_DEV:
        return None, 'ambiguous_equal_clusters'
    thumb_center, track_center = (c0, c1) if abs(c0) > abs(c1) else (c1, c0)
    tdev = abs(thumb_center - track_center)
    if tdev < THUMB_DEV:
        return None, 'no_thumb_run'
    tau = max(THUMB_DEV, 0.45 * tdev)
    runs = _segments(np.abs(dv - thumb_center) <= tau, gap=0, min_len=1)
    runs = [r for r in runs if r[1] - r[0] + 1 >= max(8, int(THUMB_LEN[0] * tlen))]
    if not runs:
        return None, 'no_thumb_run'
    runs.sort(key=lambda r: -(r[1] - r[0]))
    if len(runs) > 1 and (runs[0][1] - runs[0][0] + 1) < 1.5 * (runs[1][1] - runs[1][0] + 1):
        return None, 'ambiguous_multi_thumb'
    th0, th1 = runs[0]
    thlen = th1 - th0 + 1
    if thlen > THUMB_LEN[1] * tlen:
        return None, 'thumb_full_length'

    rest = np.ones(tlen, bool)
    rest[th0:th1 + 1] = False
    rest_std = float(np.std(dv[rest])) if rest.sum() >= 20 else 0.0
    if rest.sum() >= 20 and rest_std > BAND_D_STD_MAX:
        return None, 'band_unstable'

    pos = 0.0 if tlen == thlen else (th0 / float(tlen - thlen))
    return {
        't0': t0, 't1': t1, 'th0': t0 + th0, 'th1': t0 + th1,
        'tlen': tlen, 'thlen': thlen,
        'position_ratio': round(min(1.0, max(0.0, pos)), 4),
        'thumb_ratio': round(thlen / float(tlen), 4),
        'estimated_pages': round(tlen / float(thlen), 2),
        'track_center': round(track_center, 2),
        'thumb_center': round(thumb_center, 2),
        'rest_std': round(rest_std, 2),
    }, None


def _detect_axis(L, axis, P):
    """axis='v'：找竖直滚动条；axis='h'：找水平滚动条（转置后同一套逻辑）。

    两阶段：① 竖边成对 → **假设**；② 带剖面签名（轨道 + 滑块）**裁决**。
    裁决按轨道长度降序逐个试，第一个过全部闸门的即答案——单看边缘长会选错
    （滑块比轨道宽 1–2px 时边缘外移，soft 化后很多列都能凑出长边）。
    """
    if axis == 'h':
        L = L.T
    H, W = L.shape
    E = np.abs(np.diff(L, axis=1)) > EDGE_D
    colsum = E.sum(axis=0)
    cand = np.flatnonzero(colsum >= P['len_min'])
    if cand.size == 0:
        return None, 'no_long_edge', {}
    order = cand[np.argsort(-colsum[cand])][:MAX_EDGE_COLS]
    J = P['jitter']
    info = []
    for x in order:
        lo, hi = max(0, x - J), min(E.shape[1], x + J + 1)
        soft = E[:, lo:hi].any(axis=1)
        rl, y0, y1 = _longest_run(soft, gap=P['gap_edge'])
        if rl >= P['len_min']:
            info.append((rl, int(x), y0, y1))
    if not info:
        return None, 'no_long_edge', {}
    info.sort(key=lambda t: -t[0])

    hyps, seen = [], set()
    for i in range(len(info)):
        for j in range(i + 1, len(info)):
            ri, xi, ai, bi = info[i]
            rj, xj, aj, bj = info[j]
            if xi > xj:
                xi, xj, ri, rj, ai, bi, aj, bj = xj, xi, rj, ri, aj, bj, ai, bi
            if (xi, xj) in seen:
                continue
            wdt = xj - xi
            if wdt < P['w'][0] or wdt > P['w'][1]:
                continue
            y0, y1 = max(ai, aj), min(bi, bj)
            if y1 - y0 + 1 < P['len_min']:
                continue
            if (y1 - y0 + 1) / float(min(ri, rj)) < 0.8:
                continue
            seen.add((xi, xj))
            hyps.append((xj - xi, xi, xj, y0, y1))
    if not hyps:
        return None, 'no_band', {'edge_cols': len(info)}
    scored, tried = [], set()
    for _w, xl0, xr0, y0, y1 in hyps:
        # 同一对边出两个假设：原始列 + 边缘细化列（细化可能挑偏，原始列必须也在候选里）
        variants = [(xl0, xr0), (_refine(E, xl0, y0, y1, J), _refine(E, xr0, y0, y1, J))]
        for xl, xr in variants:
            if (xl, xr) in tried:
                continue
            tried.add((xl, xr))
            if not (P['w'][0] <= xr - xl <= P['w'][1]):
                continue
            prof = _band_profile(L, xl, xr, P['side'])
            if prof is None:
                continue
            d, b0, b1 = prof
            spans = _segments(np.abs(d) >= BAND_D_MIN, gap=P['gap_tol'], min_len=P['len_min'])
            tlen = max((t[1] - t[0] + 1 for t in spans), default=0)
            scored.append((tlen, xl, xr, b0, b1))
    if not scored:
        return None, 'no_track', {'pairs': len(hyps)}
    scored.sort(key=lambda t: -t[0])
    fails, passes = {}, []
    for tlen, xl, xr, b0, b1 in scored[:MAX_VERIFY]:
        d, _, _ = _band_profile(L, xl, xr, P['side'])
        th, why = _thumb_from_d(d, P)
        if th is None:
            fails[why] = fails.get(why, 0) + 1
            continue
        # 实心性：轨道是**实心条**（带内每行沿带宽方向的亮度几乎不变）；行背景/边框带内部有
        # 渐变或文字，逐行 std 明显更大（实测：真轨道中位 0.0–1.5，滑条行 y=1112..1126 = 6.6）
        seg = L[th['t0']:th['t1'] + 1, b0:b1]
        solid = float(np.median(seg.std(axis=1))) if seg.size else 99.0
        if solid > BAND_V_STD_MAX:
            fails['band_not_solid'] = fails.get('band_not_solid', 0) + 1
            continue
        th['solid'] = round(solid, 2)
        passes.append((th['tlen'], xl, xr, b0, b1, th))
    passes.sort(key=lambda t: -t[0])
    if passes:
        tlen, xl, xr, b0, b1, th = passes[0]

        def _box(a0, a1):
            if axis == 'v':
                return [int(b0), int(a0), int(b1), int(a1)]
            return [int(a0), int(b0), int(a1), int(b1)]

        out = {
            'found': True,
            'orientation': axis,
            'track_bbox': _box(th['t0'], th['t1']),
            'thumb_bbox': _box(th['th0'], th['th1']),
            'position_ratio': th['position_ratio'],
            'thumb_ratio': th['thumb_ratio'],
            'estimated_pages': th['estimated_pages'],
            'evidence': {
                'band_edges': [int(xl), int(xr)],
                'band_w': int(xr - xl),
                'track_len': int(th['tlen']),
                'thumb_len': int(th['thlen']),
                'track_center': th['track_center'],
                'thumb_center': th['thumb_center'],
                'rest_std': th['rest_std'],
                'band_v_std': th.get('solid'),
                'pairs_scored': len(scored),
            },
            'reason': None,
        }
        return out, None, {}
    why = max(fails.items(), key=lambda kv: kv[1])[0] if fails else 'no_thumb_run'
    return None, why, {'pairs': len(scored), 'fails': fails}


def detect(rgb, orient='auto', debug=False):
    """主入口。`rgb` = HxWx3 数组。`orient` ∈ {'auto','v','h'}。

    `auto`（缺省）= 先竖向再横向，取**第一个过全部闸门**的方向——界面里两种滚动条都可能出现，
    只试竖向会把横向列表判成"没有滚动条"（假阴比假阳更隐蔽：seek 会静默不动）。
    永远不抛异常，失败给 `reason`（取两方向里**最靠后阶段**的失败原因）。
    """
    arr = np.asarray(rgb)
    if arr.ndim != 3 or arr.shape[2] < 3:
        return {'found': False, 'reason': 'bad_image', 'orientation': None,
                'track_bbox': None, 'thumb_bbox': None, 'position_ratio': None,
                'thumb_ratio': None, 'estimated_pages': None, 'evidence': {}}
    L = _lum(arr[:, :, :3])
    H, W = L.shape
    P = _scale_params(H)
    order = ['v', 'h'] if orient not in ('v', 'h') else [orient]
    fails = []
    for ax in order:
        out, why, dbg = _detect_axis(L, ax, P)
        if out is not None:
            if debug:
                out['evidence']['frame_hw'] = [int(H), int(W)]
            return out
        fails.append((ax, why, dbg))
    ax, why, dbg = fails[-1]
    ev = {'frame_hw': [int(H), int(W)], 'tried': [f[0] for f in fails],
          'reasons': dict((f[0], f[1]) for f in fails)}
    ev.update(dbg or {})
    return {'found': False, 'reason': why, 'orientation': None,
            'track_bbox': None, 'thumb_bbox': None, 'position_ratio': None,
            'thumb_ratio': None, 'estimated_pages': None, 'evidence': ev}


def detect_path(path, orient='auto', debug=False):
    from PIL import Image
    with Image.open(path) as im:
        return detect(np.asarray(im.convert('RGB')), orient=orient, debug=debug)
