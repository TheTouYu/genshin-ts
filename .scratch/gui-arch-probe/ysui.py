#!/usr/bin/env python3
"""ysui v1 原型 — 「屏幕界面结构」最小可运行管线（纯 cv2/numpy）。

分层：leaf(可点单元) → grid(行列规整组) → panel(承载面板) → 文本绑定 → 角标/图形 → 跨帧滚动

已实测结论（见 docs/maintenance/design-2026-10-18-gui-structure.md）：
  * flat+rect 对「深色格子/白色药丸按钮/深色列表面板」有效（f06/f07 19/19 格子）
  * 对「白色卡片贴在彩色插画上」无效（卡内有花纹/大图标，内部不平坦）
  * 世界平坦区假阳性用「同皮肤色 + 内含文本」两条判据可清零（5/5）
"""
import json
import time
import numpy as np
import cv2

# ---------- 基础 ----------
def to_lab(rgb8):
    return cv2.cvtColor(rgb8, cv2.COLOR_RGB2LAB).astype(np.float32)


def edge_energy(lab):
    e = None
    for c in range(3):
        g = cv2.Sobel(lab[..., c], cv2.CV_32F, 1, 0, ksize=3)
        h = cv2.Sobel(lab[..., c], cv2.CV_32F, 0, 1, ksize=3)
        m = g * g + h * h
        e = m if e is None else e + m
    return np.sqrt(e)


# ---------- 1) leaf 容器 ----------
def leaf_containers(rgb, scale=0.5, t_edge=6.0, close=5,
                    min_w=40, min_h=26, min_rect=0.55):
    h0, w0 = rgb.shape[:2]
    small = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    lab = to_lab(small)
    E = edge_energy(lab)
    flat = (E < t_edge).astype(np.uint8)
    flat = cv2.morphologyEx(flat, cv2.MORPH_CLOSE, np.ones((close, close), np.uint8))
    n, cc, stats, _ = cv2.connectedComponentsWithStats(flat, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if w < min_w or h < min_h:
            continue
        rect = a / float(w * h)
        if rect < min_rect:
            continue
        m = cc[y:y + h, x:x + w] == i
        med = np.median(lab[y:y + h, x:x + w][m], 0)
        out.append(dict(bbox=[int(x / scale), int(y / scale), int((x + w) / scale), int((y + h) / scale)],
                        rect=round(float(rect), 2),
                        lab=[round(float(v), 1) for v in med],
                        area=int(a / (scale * scale))))
    out.sort(key=lambda d: (d["bbox"][1], d["bbox"][0]))
    return out


def filter_ui(leaves, ocr, pal_tol=3.0):
    """世界平坦区 vs UI：①同皮肤色兄弟（ΔE≤pal_tol）②内含 OCR 文本。命中任一保留。"""
    meds = np.array([b["lab"] for b in leaves], dtype=np.float32) if leaves else np.zeros((0, 3))
    keep = []
    for i, b in enumerate(leaves):
        sib = 0
        if len(meds) > 1:
            d = np.linalg.norm(meds - meds[i], axis=1)
            d[i] = 1e9
            sib = int((d <= pal_tol).sum())
        cnt = 0
        for t in ocr:
            cx, cy = (t["bbox"][0] + t["bbox"][2]) / 2, (t["bbox"][1] + t["bbox"][3]) / 2
            if b["bbox"][0] <= cx <= b["bbox"][2] and b["bbox"][1] <= cy <= b["bbox"][3]:
                cnt += 1
        b["siblings"] = sib
        b["text_in"] = cnt
        # 关键：全屏唯一且无文本 ⇒ 无 UI 证据（世界平坦区典型）
        if sib >= 1 or cnt >= 1:
            keep.append(b)
    return keep


# ---------- 2) 行列规整组（grid） ----------
def group_grid(leaves, tol_ratio=0.35):
    """按 y 中心聚行、行内按 x 中心聚列 → 输出 {rows, n_col, pitch_x, pitch_y, bbox}"""
    if len(leaves) < 2:
        return []
    boxes = sorted(leaves, key=lambda b: ((b["bbox"][1] + b["bbox"][3]) / 2,
                                         (b["bbox"][0] + b["bbox"][2]) / 2))
    hs = np.median([b["bbox"][3] - b["bbox"][1] for b in boxes])
    rows, cur = [], [boxes[0]]
    for b in boxes[1:]:
        cy0 = (cur[-1]["bbox"][1] + cur[-1]["bbox"][3]) / 2
        cy = (b["bbox"][1] + b["bbox"][3]) / 2
        if abs(cy - cy0) <= hs * tol_ratio * 2:
            cur.append(b)
        else:
            rows.append(cur)
            cur = [b]
    rows.append(cur)
    out = []
    for r in rows:
        if len(r) < 2:
            continue
        xs = sorted((b["bbox"][0] + b["bbox"][2]) / 2 for b in r)
        grp = dict(n=len(r), n_col=len(r),
                   bbox=[min(b["bbox"][0] for b in r), min(b["bbox"][1] for b in r),
                         max(b["bbox"][2] for b in r), max(b["bbox"][3] for b in r)],
                   pitch_x=round(float(np.median(np.diff(xs))), 1) if len(r) > 2 else None,
                   cell_w=int(np.median([b["bbox"][2] - b["bbox"][0] for b in r])),
                   cell_h=int(np.median([b["bbox"][3] - b["bbox"][1] for b in r])),
                   members=[b["bbox"] for b in r])
        out.append(grp)
    # 行间 pitch
    for i in range(1, len(out)):
        out[i]["pitch_y"] = round(out[i]["bbox"][1] - out[i - 1]["bbox"][1], 1)
    return out


# ---------- 3) 文本绑定 ----------
def bind_text(leaves, ocr):
    """每个 OCR 框归到包含它中心的最小 leaf；返回 children 列表"""
    kids, free = [], []
    for t in ocr:
        cx, cy = (t["bbox"][0] + t["bbox"][2]) / 2, (t["bbox"][1] + t["bbox"][3]) / 2
        cand = [b for b in leaves
                if b["bbox"][0] <= cx <= b["bbox"][2] and b["bbox"][1] <= cy <= b["bbox"][3]]
        if cand:
            cand.sort(key=lambda b: (b["bbox"][2] - b["bbox"][0]) * (b["bbox"][3] - b["bbox"][1]))
            kids.append(dict(leaf=cand[0]["bbox"], text=t["text"], role="label"))
            t["_bound"] = True
        else:
            free.append(t)
    return kids, free


# ---------- 4) 角标（红点） ----------
def badges(rgb):
    r, g, b = rgb[..., 0].astype(np.int16), rgb[..., 1].astype(np.int16), rgb[..., 2].astype(np.int16)
    m = ((r > 140) & (r - g > 55) & (r - b > 40)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, cc, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a < 90 or not (14 <= w <= 90 and 14 <= h <= 90):
            continue
        if not (0.6 <= w / float(h) <= 1.7):
            continue
        out.append(dict(bbox=[int(x), int(y), int(x + w), int(y + h)], kind="badge",
                        color="red", area=int(a)))
    return out


# ---------- 5) 图形元素（图标/头像）：局部对比显著性 ----------
def glyphs(rgb, leaves, scale=0.5, min_side=16, max_side=140):
    small = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    lab = to_lab(small)
    bg = cv2.medianBlur(small, 31)
    dif = np.abs(to_lab(bg) - lab).sum(2)
    # 只在 leaf 容器之外找（容器内的图标另行绑定）
    mask = np.ones(dif.shape, np.uint8)
    for b in leaves:
        x0, y0, x1, y1 = [int(v * scale) for v in b["bbox"]]
        mask[max(0, y0):y1, max(0, x0):x1] = 0
    m = ((dif > 45) & (mask > 0)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, cc, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if w < min_side or h < min_side or w > max_side or h > max_side:
            continue
        if a < 0.25 * w * h:
            continue
        out.append(dict(bbox=[int(x / scale), int(y / scale), int((x + w) / scale), int((y + h) / scale)],
                        kind="glyph", fill=round(float(a / (w * h)), 2)))
    out.sort(key=lambda d: -d["fill"])
    return out


# ---------- 6) 跨帧滚动 ----------
def scroll_delta(ocr_a, ocr_b, min_move=8):
    """同名文本（≥2 字）在两帧的位移中位数 → (dy, dx, n_matched, n_a, n_b)"""
    A = {t["text"].strip(): t for t in ocr_a if len(t["text"].strip()) >= 2}
    B = {t["text"].strip(): t for t in ocr_b if len(t["text"].strip()) >= 2}
    common = [k for k in A if k in B]
    if not common:
        return dict(dy=0, dx=0, n_match=0, n_a=len(A), n_b=len(B), moved=0)
    dy = np.median([B[k]["bbox"][1] - A[k]["bbox"][1] for k in common])
    dx = np.median([B[k]["bbox"][0] - A[k]["bbox"][0] for k in common])
    moved = sum(1 for k in common if abs(B[k]["bbox"][1] - A[k]["bbox"][1]) >= min_move)
    return dict(dy=int(dy), dx=int(dx), n_match=len(common), n_a=len(A), n_b=len(B), moved=moved,
                gone=[k for k in A if k not in B][:6], new=[k for k in B if k not in A][:6])


# ---------- 主入口 ----------
def analyze(rgb, ocr):
    t = {}
    t0 = time.time()
    leaves = leaf_containers(rgb)
    t["leaf_ms"] = int((time.time() - t0) * 1000)
    t0 = time.time()
    leaves = filter_ui(leaves, ocr)
    t["filter_ms"] = int((time.time() - t0) * 1000)
    t0 = time.time()
    groups = group_grid(leaves)
    t["group_ms"] = int((time.time() - t0) * 1000)
    t0 = time.time()
    kids, free = bind_text(leaves, ocr)
    t["bind_ms"] = int((time.time() - t0) * 1000)
    t0 = time.time()
    bg = badges(rgb)
    t["badge_ms"] = int((time.time() - t0) * 1000)
    t0 = time.time()
    gl = glyphs(rgb, leaves)
    t["glyph_ms"] = int((time.time() - t0) * 1000)
    return dict(leaves=leaves, groups=groups, children=kids, free_text=[x["text"] for x in free],
                badges=bg, glyphs=gl, timing=t)


if __name__ == "__main__":
    import sys
    C = "/home/h/genshin-ts/.scratch/gui-corpus"
    for fr in sys.argv[1:] or ["f00", "f04", "f05", "f06", "f07"]:
        rgb = np.asarray(cv2.cvtColor(cv2.imread("%s/%s.png" % (C, fr)), cv2.COLOR_BGR2RGB))
        ocr = json.load(open("/tmp/ysb/%s.json" % fr))["text"]
        r = analyze(rgb, ocr)
        print("== %s leaves=%d groups=%d badges=%d glyphs=%d  timing=%s" %
              (fr, len(r["leaves"]), len(r["groups"]), len(r["badges"]), len(r["glyphs"]), r["timing"]))
        for g in r["groups"]:
            print("   row n=%d bbox=%s cell=%dx%d pitch_x=%s pitch_y=%s" %
                  (g["n"], g["bbox"], g["cell_w"], g["cell_h"], g["pitch_x"], g.get("pitch_y")))
        print("   labels bound=%d free=%s" % (len(r["children"]), r["free_text"][:10]))
        print("   badges=", [b["bbox"] for b in r["badges"]][:12])
