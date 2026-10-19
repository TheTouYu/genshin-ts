#!/usr/bin/env python3
"""eval_v2.py — GUI 检测器评测台（**CALIBER-v2 口径**，可一键重跑）。

CALIBER-v2 五条硬口径（.scratch/gui-corpus/CALIBER-v2.md），本脚本逐条落地：
  ① 分 kind 报 P/R/F1（`row` 与 `glyph_icon` 必须单列，并报每类 GT 数）；
  ② 按界面族分开报（游戏界面族 / 编辑器族 / 世界 HUD 族），切分/对照都按族；
  ③ 每帧带真值覆盖（真值单元数 + audit 未覆盖检查结果）；
  ④ 单帧口径（尺寸/长宽比/对比度/局部平坦度切片）与多帧口径（N 帧出现率+位置抖动）两套数，
     并给 多帧/单帧 的 P、R 比值；
  ⑤ 每次训练带「未退化」证据 → 用 `--models a=..,b=..` 并列同一条验证集。

两个口径同时输出（**不许只看 micro**）：
  · legacy  = 训练链路口径（d2.evaluate：同 kind 且 IoU≥0.5 即命中，非一对一）→ 与 D2-improve 表可直接比；
  · strict  = 标准 1:1 贪心匹配（按 score 降序），P/R/F1 有通常含义，CALIBER-v2 主口径。

用法：
  # 阶段 A：旧数据（15 个版本目录按「同帧取最新」去重）跑 v1/v2 两模型
  python3 .scratch/gui-detect/eval_v2.py --preset old --channel both
  # 阶段 B/C：perception 交付 truth-merged 后一键重跑（含 gui-collect 多帧组）
  python3 .scratch/gui-detect/eval_v2.py --preset all --channel prod
  # 只跑训练时用的留族验证集（未退化证据，数字与 D2-improve 直接并列）
  python3 .scratch/gui-detect/eval_v2.py --preset old --d2-val
  # 换模型/换权重
  python3 .scratch/gui-detect/eval_v2.py --models v3=tools/ys-editor/models/gui-det-v3.pt
"""
import argparse
import json
import math
import os
import random
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
VAL_STEMS = set()      # split.json 的验证帧（glyph 专项据此分 val / train 两侧）
HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(ROOT, ".scratch", "gui-corpus")
COLLECT = os.path.join(ROOT, ".scratch", "gui-collect")

# 旧数据源顺序 = build_dataset.py 的 11 个目录（列表序靠后 = 版本更新，覆盖前面）
OLD_DIRS = ["truth", "truth-v2", "truth-v3", "truth-v4", "truth-v5", "truth-v6",
            "truth-v7", "truth-v8-game", "truth-v8-editor", "truth-v8-fix", "truth-v9-fixed"]
# 帧图像可能在的目录（truth JSON 的 image 字段失效时兜底）
IMG_DIRS = [CORPUS, CORPUS + "/truth-v2", CORPUS + "/truth-v3", CORPUS + "/truth-v4",
            CORPUS + "/truth-v5", CORPUS + "/truth-v6", CORPUS + "/truth-v7",
            CORPUS + "/truth-v8-game", CORPUS + "/truth-v8-editor", CORPUS + "/truth-v8-fix",
            CORPUS + "/truth-v9-fixed", CORPUS + "/capture-2026-10-18/reps",
            CORPUS + "/video-20261018/reps", COLLECT + "/menu/frames", COLLECT + "/world/frames"]
MULTI_DIRS = [COLLECT + "/menu", COLLECT + "/world"]
OCR_DIRS = [CORPUS + "/capture-2026-10-18/repjson"]

KEY_KINDS = ["row", "glyph_icon"]        # CALIBER-v2：必须单列
CANON_KINDS = ["panel", "row", "button", "tile", "chip", "icon", "card", "avatar", "glyph_icon"]
# GT 里可能出现、但**检测器不训练**的 kind（2026-10-19：bar = HUD 状态条，只有 2 实例/8 帧同界面）。
# 它们**不计分**，但必须被报出来（静默丢弃是本仓已踩 5 次的同族坑）。
NON_SCORING_GT_KINDS = ["bar"]
EXTRA_GT_KINDS = []          # 运行期由 compute 填充：GT 中所有不在 CANON_KINDS 的 kind 及计数
# 族判定：按 layout/族名/文件名文本（标注技能 §五.6：族名标签不可信，故逐帧把判定依据打进报告）
FAM_EDITOR = ("编辑器", "视口", "时间轴", "资源管理器", "装饰物", "关卡设置", "单位状态",
              "背景音乐", "物件元件", "技能节点图", "桌面窗口", "调色板", "工作区", "轨道")
FAM_WORLD = ("负样本", "世界实景", "世界 HUD", "提瓦特世界场景", "世界场景", "大世界")
FAM_NAMES = ["game_ui", "editor", "world_hud"]


# ---------------------------------------------------------------- 工具
def _as_pil(x):
    """ndarray / 路径 / PIL → PIL RGB（三条调用路径共用，避免 ndarray 被当路径打开）。"""
    if isinstance(x, Image.Image):
        return x.convert("RGB")
    if isinstance(x, np.ndarray):
        return Image.fromarray(x).convert("RGB")
    return Image.open(x).convert("RGB")


def iou_xywh(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    ih = max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0.0


def ver_of(dirname):
    """版本序：truth=1 / truth-vN=N / truth-vN-fix=N+0.5（与 merge_truth.py 同规则）。"""
    n = os.path.basename(dirname)
    if n == "truth":
        return 1.0
    m = re.match(r"truth-v(\d+)(-fix)?$", n)
    if m:
        return int(m.group(1)) + (0.5 if m.group(2) else 0.0)
    return 99.0


def family_of(layout, prov_family, stem):
    """返回 (族, 依据)。编辑器 > 世界HUD > 游戏界面。"""
    fam_txt = prov_family or ""
    text = " ".join([fam_txt, layout or "", stem or ""])
    if any(k in text for k in FAM_EDITOR):
        return "editor", ("provenance" if any(k in fam_txt for k in FAM_EDITOR) else "layout-rule")
    if any(k in text for k in FAM_WORLD):
        return "world_hud", ("provenance" if any(k in fam_txt for k in FAM_WORLD)
                             else "layout-rule")
    return "game_ui", ("provenance" if fam_txt else "default")


# ---------------------------------------------------------------- 数据装载
def load_truth_dir(d, tag):
    """读一个 truth 目录 → {stem: frame}（跳过 _/baseline/summary，要求 objects 是 list）。"""
    out = {}
    if not os.path.isdir(d):
        return out
    for p in sorted(os.listdir(d)):
        if not p.endswith(".json"):
            continue
        stem = p[:-5]
        if stem.startswith("_") or stem.startswith("baseline") or stem.startswith("summary"):
            continue
        try:
            doc = json.load(open(os.path.join(d, p), encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(doc.get("objects"), list):
            continue
        out[stem] = {"stem": stem, "doc": doc, "src": os.path.join(d, p), "truth_dir": d,
                     "tag": tag, "mtime": os.path.getmtime(os.path.join(d, p))}
    return out


def load_manifest(dirs):
    """读各 truth 目录的 MANIFEST.json（perception 交付约定）→ {stem: entry}。

    字段：family / family_source / family_evidence / quality_grade / grade_reason /
    area_max_frac / audit_uncovered / objects。有 MANIFEST 时**族只认它**（Lead 硬前提 1）。
    """
    out, srcs = {}, []
    for d in dirs:
        p = os.path.join(d, "MANIFEST.json")
        if not os.path.exists(p):
            continue
        try:
            m = json.load(open(p, encoding="utf-8"))
        except Exception as e:                             # noqa: BLE001
            print(f"[manifest] {p} 读失败：{e}")
            continue
        srcs.append(p)
        for stem, ent in (m or {}).items():
            if isinstance(ent, dict):
                out[stem] = {**ent, "_manifest": p}
    return out, srcs


def collect_frames(dirs):
    """多目录 → 帧集合，同一 stem 取版本序最高（并列取 mtime 新）；返回 (frames, manifest)。"""
    cand = defaultdict(list)
    for d in dirs:
        for stem, fr in load_truth_dir(d, os.path.basename(d)).items():
            cand[stem].append(fr)
    frames, manifest = [], {}
    for stem, lst in sorted(cand.items()):
        lst.sort(key=lambda x: (ver_of(x["truth_dir"]), x["mtime"]))
        win = lst[-1]
        frames.append(win)
        manifest[stem] = {"from": os.path.basename(win["truth_dir"]),
                          "superseded": [os.path.basename(x["truth_dir"]) for x in lst[:-1]]}
    return frames, manifest


def resolve_image(fr):
    doc = fr["doc"]
    cands = []
    if doc.get("image"):
        cands.append(doc["image"])
    for base in IMG_DIRS:
        for ext in (".png", ".jpg"):
            cands.append(os.path.join(base, fr["stem"] + ext))
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


def normalize_frame(fr, family_override=None, infer_unknown=False, manifest=None,
                    glyph_drop_bars=False):
    """truth doc → 统一帧结构。GT bbox 统一存 **xywh**（truth schema 口径）。

    口径断言（CALIBER 已踩坑：xywh↔xyxy 混用 P/R 差 20 倍且不报错）：
      · truth 的 bbox 是 xywh：要求 x+w ≤ W+2 且 y+h ≤ H+2；
      · 越界比例 >20% 说明口径读错了 → 直接报错停下，不许静默继续。
    """
    doc = fr["doc"]
    W, H = (doc.get("size") or [2560, 1440])[:2]
    objs, bad = [], 0
    for o in doc["objects"]:
        b = o.get("bbox")
        if not (isinstance(b, list) and len(b) == 4):
            continue
        x, y, w, h = [float(v) for v in b]
        if x + w > W + 2 or y + h > H + 2:
            bad += 1
        kind = o.get("kind") or "unknown"
        if kind == "unknown" and infer_unknown:      # 旧 dataset 口径（build_dataset 的几何猜类）
            area = w * h / (W * H)
            if area > 0.15:
                kind = "panel"
            elif h < 130 and w > 3 * h:
                kind = "row"
            elif w < 70 and h < 70:
                kind = "icon"
            else:
                kind = "tile"
        if glyph_drop_bars and kind == "glyph_icon" and w > 150:
            continue                          # 条/数值文本按 CALIBER「无底图标」定义不算 glyph_icon
        objs.append({"bbox": [x, y, w, h], "kind": kind,
                     "id": o.get("id"), "text": o.get("text") or [],
                     "note": o.get("note") or ""})
    if objs and bad / len(objs) > 0.2:
        raise SystemExit(f"[bbox 口径] {fr['stem']}: {bad}/{len(objs)} 个框越界，疑似 xyxy 当 xywh 读")
    img = resolve_image(fr)
    if not img:
        return None
    prov = doc.get("_provenance") or {}
    ent = (manifest or {}).get(fr["stem"]) or {}
    if manifest is not None:                 # 有 MANIFEST：族只认它，不拿 layout 文本猜
        fam = ent.get("family")
        if not fam or str(fam).upper() in ("NONE", "UNKNOWN", ""):
            return None                      # 读到 NONE 就跳过该帧（不猜）
        src = "manifest"
        grade = ent.get("quality_grade")
    else:
        fam, src = family_of(doc.get("layout"), prov.get("family"), fr["stem"])
        grade = None
    if family_override and fr["stem"] in family_override:
        fam, src = family_override[fr["stem"]], "override"
    area_max = max([o["bbox"][2] * o["bbox"][3] / (W * H) for o in objs] or [0.0])
    if ent.get("area_max_frac") is not None:
        area_max = float(ent["area_max_frac"])
    return {"stem": fr["stem"], "image": img, "W": W, "H": H, "objects": objs,
            "layout": doc.get("layout") or "", "family": fam, "family_src": src,
            "grade": grade, "from": os.path.basename(fr["truth_dir"]), "bad_bbox": bad,
            "area_max": round(area_max, 3)}


def load_multi_group(d):
    """.scratch/gui-collect/<case>/：truth.json（units，参考帧 GT）+ frames/*.png（多帧）。"""
    tp = os.path.join(d, "truth.json")
    fd = os.path.join(d, "frames")
    if not (os.path.exists(tp) and os.path.isdir(fd)):
        return None
    t = json.load(open(tp, encoding="utf-8"))
    W, H = (t.get("size") or [2560, 1440])[:2]
    gts = []
    for u in t.get("units") or []:
        b = u.get("bbox")
        if isinstance(b, list) and len(b) == 4:
            gts.append({"bbox": [float(v) for v in b], "kind": u.get("kind") or "unknown",
                        "id": u.get("id")})
    frames = [(os.path.join(fd, p), p[:-4]) for p in sorted(os.listdir(fd))
              if p.endswith((".png", ".jpg"))]
    if not frames:
        return None
    return {"case": os.path.basename(d), "dir": d, "W": W, "H": H, "objects": gts,
            "ref": t.get("frame") or frames[0][1], "frames": frames,
            "family": "world_hud" if "world" in os.path.basename(d) else "game_ui"}


# ---------------------------------------------------------------- 检测通道
def _postprocess_grouped(objs, w0, h0, nms_thr=0.5, min_side=8, group_of=None):
    """NMS 分组可以自定义：group_of='perkind' 全类内；'avatar' 只让 avatar 独立成组。"""
    out = []
    for o in objs:
        x, y, w, h = o["bbox"]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(w0, x + w), min(h0, y + h)
        if x1 - x0 < min_side or y1 - y0 < min_side:
            continue
        out.append({**o, "bbox": [x0, y0, x1 - x0, y1 - y0]})
    def g(o):
        if group_of == "perkind":
            return o["kind"]
        if group_of == "avatar":
            return "avatar" if o["kind"] == "avatar" else "_rest"
        return "_all"
    keep = []
    for o in sorted(out, key=lambda z: -z.get("score", 0)):
        if all(g(k) != g(o) or iou_xywh(o["bbox"], k["bbox"]) < nms_thr for k in keep):
            keep.append(o)
    return keep


def postprocess_perkind(objs, w0, h0, nms_thr=0.5, min_side=8):
    """**类内** NMS（实验）：与 gui_det.postprocess 逐行相同，只把 NMS 限定在同 kind 内部。

    为什么要有这一支：线上 postprocess 是**类无关** NMS，同几何的 panel/icon/button/avatar
    互相压制，只有最高分那一类活下来 —— 这正是 v2 的 avatar 输出 0 与 chip/icon 错类的机制。
    默认走 agnostic（线上现状），本函数只用于量化「换成类内 NMS 会怎样」。
    """
    out = []
    for o in objs:
        x, y, w, h = o["bbox"]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(w0, x + w), min(h0, y + h)
        if x1 - x0 < min_side or y1 - y0 < min_side:
            continue
        out.append({**o, "bbox": [x0, y0, x1 - x0, y1 - y0]})
    keep = []
    for o in sorted(out, key=lambda z: -z.get("score", 0)):
        if all(k["kind"] != o["kind"] or iou_xywh(o["bbox"], k["bbox"]) < nms_thr
               for k in keep):
            keep.append(o)
    return keep


_ORIG_POSTPROCESS = None          # 只记一次线上原函数，避免多个 detector 互相套娃


class ProdDetector:
    """生产入口 tools/ys-editor/gui_det.Detector.detect（PIL 缩放→前向→decode→NMS）。"""

    name = "prod"

    def __init__(self, path, nms="agnostic"):
        sys.path.insert(0, os.path.join(ROOT, "tools", "ys-editor"))
        import gui_det
        self.gui_det = gui_det
        global _ORIG_POSTPROCESS
        self.nms = nms
        if _ORIG_POSTPROCESS is None:
            _ORIG_POSTPROCESS = gui_det.postprocess
        gui_det.postprocess = _ORIG_POSTPROCESS          # 每次从线上原函数重建，不叠加
        orig = _ORIG_POSTPROCESS
        if nms == "agnostic":                   # A/B：强制关掉 scoped（纯类无关）
            gui_det.postprocess = (
                lambda objs, w0, h0, nms_thr=0.5, min_side=8:
                orig(objs, w0, h0, nms_thr, min_side, scoped=()))
        elif nms == "perkind":                  # 实验：全类内 NMS
            gui_det.postprocess = (
                lambda objs, w0, h0, nms_thr=0.5, min_side=8:
                _postprocess_grouped(objs, w0, h0, nms_thr, min_side, "perkind"))
        self.det = gui_det.Detector(model_path=path)
        if self.det.err:
            raise SystemExit(f"[prod] {path}: {self.det.err}")
        self.path = path
        self.kinds = list(self.det.kinds)
        self.lat = []

    def run(self, frame_or_path):
        rgb = frame_or_path if isinstance(frame_or_path, np.ndarray) else \
            np.asarray(_as_pil(frame_or_path))
        t0 = time.perf_counter()
        out = self.det.detect(rgb)
        self.lat.append((time.perf_counter() - t0) * 1000)
        if self.det.err:                    # fail-closed：不让"返回空"冒充"没检出"
            raise RuntimeError(f"[prod/{self.nms}] detect 失败：{self.det.err}")
        return [{"bbox": [float(v) for v in o["bbox"]], "kind": o["kind"],
                 "score": float(o["score"])} for o in out]


class TrainDetector:
    """训练链路口径：d2.Net 前向 + d2.decode/decode_rows（**无 NMS**，与 d2.evaluate 逐字一致）。"""

    name = "train"

    def __init__(self, path):
        import torch
        sys.path.insert(0, HERE)
        import d2
        self.torch, self.d2 = torch, d2
        ck = torch.load(path, map_location="cpu", weights_only=False)
        meta = ck.get("meta") or {}
        self.kinds = list(ck["kinds"])
        self.res = tuple(meta.get("res") or (640, 360))
        self.row_strip = bool(meta.get("row_strip"))
        self.logw = bool(meta.get("logw"))
        self.net = d2.Net(nc=len(self.kinds), row_strip=self.row_strip).to(d2.DEV)
        self.net.load_state_dict(ck["model"])
        self.net.eval()
        self.path = path
        self.lat = []

    def run(self, frame_or_path):
        torch = self.torch
        im = _as_pil(frame_or_path)
        w0, h0 = im.size
        t0 = time.perf_counter()
        x = torch.from_numpy(((np.asarray(im.resize(self.res, Image.BILINEAR), np.float32) / 255.0
                               - 0.5) / 0.5).transpose(2, 0, 1)).unsqueeze(0).to(self.d2.DEV)
        with torch.no_grad():
            o = self.net(x)
            if self.row_strip:
                hm, wh, r = o
                dets = self.d2.decode(hm[0].float().cpu(), wh[0].float().cpu(), w0, h0,
                                      res=self.res, logw=self.logw, kinds=self.kinds)
                dets += self.d2.decode_rows(r, w0, h0, res=self.res)
            else:
                hm, wh = o
                dets = self.d2.decode(hm[0].float().cpu(), wh[0].float().cpu(), w0, h0,
                                      res=self.res, logw=self.logw, kinds=self.kinds)
        self.lat.append((time.perf_counter() - t0) * 1000)
        return dets


# ---------------------------------------------------------------- 打点
def score(dets, gts, iou_thr=0.5):
    """**严格 1:1 贪心**（按 score 降序，同类内 IoU≥thr）+ legacy 口径，一次算完。

    返回 per-kind 与总计的 {gt, det, tp, fp, fn, leg_hit, leg_ndet}，以及错类矩阵。
    错类矩阵 = 「IoU≥0.5 但 kind 不同」的 (gt_kind → det_kind) 计数（量化 icon/tile/chip 同构错类）。
    """
    by_kind_gt, by_kind_det = defaultdict(list), defaultdict(list)
    for g in gts:
        by_kind_gt[g["kind"]].append(g)
    for d in dets:
        by_kind_det[d["kind"]].append(d)
    acc = defaultdict(lambda: Counter())
    conf = Counter()
    for kind in set(by_kind_gt) | set(by_kind_det):
        gk = by_kind_gt.get(kind, [])
        dk = sorted(by_kind_det.get(kind, []), key=lambda x: -x["score"])
        taken = [False] * len(gk)
        tp = 0
        for d in dk:
            best, bi = 0.0, -1
            for i, g in enumerate(gk):
                if taken[i]:
                    continue
                v = iou_xywh(d["bbox"], g["bbox"])
                if v > best:
                    best, bi = v, i
            if bi >= 0 and best >= iou_thr:
                taken[bi] = True
                tp += 1
        c = acc[kind]
        c["gt"] += len(gk)
        c["det"] += len(dk)
        c["tp"] += tp
        c["fn"] += len(gk) - tp
        c["fp"] += len(dk) - tp
        c["leg_hit"] += sum(1 for g in gk
                            if any(iou_xywh(d["bbox"], g["bbox"]) >= iou_thr for d in dk))
        c["leg_ndet"] += sum(1 for d in dk
                             if any(iou_xywh(d["bbox"], g["bbox"]) >= iou_thr for g in gk))
    for d in dets:                       # 错类：与某个 GT IoU≥thr 但 kind 不同
        for g in gts:
            if g["kind"] != d["kind"] and iou_xywh(d["bbox"], g["bbox"]) >= iou_thr:
                conf[(g["kind"], d["kind"])] += 1
    tot = Counter()
    for c in acc.values():
        tot.update(c)
    return {k: dict(v) for k, v in acc.items()}, dict(tot), conf


def prf(c):
    tp, det, gt = c.get("tp", 0), c.get("det", 0), c.get("gt", 0)
    p = tp / det if det else 0.0
    r = tp / gt if gt else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return round(p, 3), round(r, 3), round(f, 3)


def geom_stats(frame, obj):
    """单帧几何切片：长宽比 / 高度 / 对比度 / 局部平坦度（都在原图坐标下量）。"""
    x, y, w, h = obj["bbox"]
    return {"aspect": (w / h) if h > 0 else 99.0, "h": h, "w": w, "area": w * h}


def frame_feats(img_rgb, frame):
    """按帧算 GT 的对比度/平坦度（灰度 std + 平均梯度幅值），返回与 objects 对齐的列表。"""
    g = (0.299 * img_rgb[:, :, 0] + 0.587 * img_rgb[:, :, 1] + 0.114 * img_rgb[:, :, 2])
    H, W = g.shape
    out = []
    for o in frame["objects"]:
        x, y, w, h = [int(round(v)) for v in o["bbox"]]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + max(1, w)), min(H, y + max(1, h))
        crop = g[y0:y1, x0:x1]
        st = geom_stats(frame, o)
        if crop.size < 16:
            st.update(contrast=0.0, flat=0.0)
        else:
            st["contrast"] = float(crop.std())
            gx = np.abs(np.diff(crop, axis=1)).mean() if crop.shape[1] > 1 else 0.0
            gy = np.abs(np.diff(crop, axis=0)).mean() if crop.shape[0] > 1 else 0.0
            st["flat"] = float(gx + gy)
        out.append(st)
    return out


# ---------------------------------------------------------------- 评测主循环
def eval_frames(frames, detectors, feats=True):
    """逐帧跑所有模型（单遍）；GT 特征与检出一并留在记录里供切片/错类复用。"""
    res = {m: {"frames": [], "lat": []} for m in detectors}
    for fr in frames:
        rgb = np.asarray(Image.open(fr["image"]).convert("RGB"))
        fts = frame_feats(rgb, fr) if feats else None
        gts = [o for o in fr["objects"] if o["kind"] in CANON_KINDS]   # unknown 不参与计分
        for mname, det in detectors.items():
            n0 = len(det.lat)
            objs = det.run(rgb)
            dt = det.lat[n0:]
            per_kind, tot, conf = score(objs, gts)
            res[mname]["frames"].append({
                "stem": fr["stem"], "family": fr["family"], "family_src": fr["family_src"],
                "grade": fr.get("grade"),
                "from": fr["from"], "layout": fr["layout"], "W": fr["W"], "H": fr["H"],
                "gt": len(fr["objects"]), "gt_scored": len(gts), "area_max": fr["area_max"],
                "unk": len(fr["objects"]) - len(gts),
                "n_det": len(objs), "per_kind": per_kind, "tot": tot,
                "conf": {f"{a}->{b}": v for (a, b), v in conf.items()},
                "feats": fts, "_gts": gts, "_dets": objs,
                "ms": round(sum(dt) / max(1, len(dt)), 1)})
            res[mname]["lat"] += dt
    return res


def aggregate(frame_recs, kind_filter=None):
    """把逐帧记录聚合成 per-kind / per-family / 总计。kind_filter 用于族内微平均。"""
    per_kind = defaultdict(lambda: Counter())
    per_fam = defaultdict(lambda: Counter())
    fam_frames = Counter()
    for r in frame_recs:
        fam_frames[r["family"]] += 1
        for k, c in r["per_kind"].items():
            if kind_filter and k not in kind_filter:
                continue
            per_kind[k].update(c)
            per_fam[r["family"]].update(c)
    total = defaultdict(int)
    for c in per_kind.values():
        for k, v in c.items():
            total[k] += v
    out = {"per_kind": {k: dict(v) for k, v in per_kind.items()},
           "per_family": {k: dict(v) for k, v in per_fam.items()},
           "fam_frames": dict(fam_frames),
           "total": {k: total.get(k, 0) for k in ("gt", "det", "tp", "fp", "fn",
                                                  "leg_hit", "leg_ndet")}}
    return out


def gt_redundancy(frames, thr=0.8):
    """帧级 GT 重复度：这一帧的框有多少比例在**同族另一帧**里能找到同 kind IoU≥0.8 的对应。

    为什么按"帧对"而不是"族内全配对"：同族不同界面也会共享屏幕固定位置（顶栏/左栏），
    全配对会把「不同界面共用同一块屏幕区域」误判成重复。按帧对取**最大值**才对应真正的
    「同一界面连拍」——那才是泄漏风险（CALIBER-v2：随机切分让同界面帧泄漏进验证集）。

    输出：dup[stem] = {peer, ratio}；ratio≥0.8 视为同界面重复帧。
    """
    out = {}
    for fam in FAM_NAMES:
        fs = [f for f in frames if f["family"] == fam]
        for i, a in enumerate(fs):
            own = [o["bbox"] for o in a["objects"]]
            if not own:
                continue
            best = {"peer": None, "ratio": 0.0, "kind": None}
            for j, b in enumerate(fs):
                if i == j:
                    continue
                hit = kindhit = 0
                for (bb, kb) in [(o["bbox"], o["kind"]) for o in a["objects"]]:
                    cand = [(o["bbox"], o["kind"]) for o in b["objects"] if o["kind"] == kb]
                    if any(iou_xywh(bb, cb) >= thr for cb, _ in cand):
                        hit += 1
                ratio = hit / len(own)
                if ratio > best["ratio"]:
                    best = {"peer": b["stem"], "ratio": round(ratio, 3)}
            out[a["stem"]] = best
    return out


def geom_slices(frame_recs, kinds=("row", "glyph_icon", "tile", "icon", "chip", "button")):
    """按 GT 特征切片算 strict recall：长宽比 / 高度（固定桶）+ 对比度 / 平坦度（三分位桶）。

    命中判据与 strict 口径一致：同类且 IoU≥0.5（这里只需"该 GT 是否被同类检出接住"）。
    """
    rows = defaultdict(lambda: {"n": 0, "hit": 0})
    per_kind = defaultdict(list)      # kind → [(feat, hit)]
    for r in frame_recs:
        if not r.get("feats"):
            continue
        for o, f in zip(r["_gts"], r["feats"]):
            if o["kind"] not in kinds:
                continue
            hit = any(d["kind"] == o["kind"] and iou_xywh(d["bbox"], o["bbox"]) >= 0.5
                      for d in r["_dets"])
            per_kind[o["kind"]].append((f, hit))
    for k, lst in per_kind.items():
        specs = [("aspect", [(0, 2), (2, 6), (6, 1e9)], ["≤2", "2–6", ">6"]),
                 ("h", [(0, 32), (32, 64), (64, 1e9)], ["≤32px", "33–64px", ">64px"])]
        for key in ("contrast", "flat"):
            vals = [f[key] for f, _ in lst]
            if len(vals) > 3:
                q = np.quantile(vals, [1 / 3, 2 / 3])
                specs.append((key, [(0, float(q[0])), (float(q[0]), float(q[1])),
                                    (float(q[1]), 1e9)], ["低", "中", "高"]))
        for key, edges, labs in specs:
            for (lo, hi), lb in zip(edges, labs):
                n = sum(1 for f, _ in lst if lo <= f[key] < hi)
                hh = sum(1 for f, hit in lst if lo <= f[key] < hi and hit)
                rec = rows[f"{k}/{key}/{lb}"]
                rec["n"] += n
                rec["hit"] += hh
    return {k: {"n": v["n"], "hit": v["hit"], "r": round(v["hit"] / v["n"], 3) if v["n"] else None}
            for k, v in rows.items()}


def glyph_report(frames, results, ref=None, iou_thr=0.5, val_stems=None):
    """world_hud 的 glyph_icon 专项：三个数（帧级 GT / 独立样本 / 独立界面）+ 逐 glyph 检出率。

    为什么必须逐 glyph：31 个样本太少，总 P/R 会把「17 个学会了、14 个从没检出过」平均掉。
    独立样本的定义：参考帧上的 glyph 列表（同一界面多帧是同一批 glyph，不能重复计数）。
    """
    wh = [f for f in frames if f["family"] == "world_hud"]
    gl = [(f, [o for o in f["objects"] if o["kind"] == "glyph_icon"]) for f in wh]
    gl = [(f, g) for f, g in gl if g]
    if not gl:
        return None
    ref_f = next((f for f, g in gl if f["stem"] == (ref or gl[0][0]["stem"])), gl[0][0])
    ref_glyphs = [o for o in ref_f["objects"] if o["kind"] == "glyph_icon"]
    eval_frames = [f for f, g in gl if f["stem"] != ref_f["stem"]]
    val_stems = set(val_stems or [])
    ev_val = [f for f in eval_frames if f["stem"] in val_stems]
    ev_tr = [f for f in eval_frames if f["stem"] not in val_stems]
    total_frames_gt = sum(len(g) for f, g in gl)
    rows = []
    for gi, o in enumerate(ref_glyphs):
        w, h = o["bbox"][2], o["bbox"][3]
        is_bar = (w > 150)          # 条/数值：宽 >150px（与 truth 的独立 kind `bar` 口径一致）
        label = (o.get("text") or o.get("note") or [""])
        label = label[0] if isinstance(label, list) and label else str(label)
        cell = {"idx": gi + 1, "bbox": [round(v) for v in o["bbox"]], "w": round(w), "h": round(h),
                "bar": is_bar, "label": (label or "")[:14]}
        def _hit(res, f):
            rec = next((fr for fr in res["frames"] if fr["stem"] == f["stem"]), None)
            return bool(rec) and any(d["kind"] == "glyph_icon"
                                     and iou_xywh(d["bbox"], o["bbox"]) >= iou_thr
                                     for d in rec["_dets"])
        for m, res in results.items():
            cell[m] = (sum(1 for f in ev_val if _hit(res, f)), len(ev_val),
                       sum(1 for f in ev_tr if _hit(res, f)), len(ev_tr))
        rows.append(cell)
    rows.sort(key=lambda c: (-max((v for v, _nv, _t, _nt in [c[m] for m in results]), default=0),
                             c["idx"]))
    return {"ref": ref_f["stem"], "n_eval_frames": len(eval_frames),
            "n_val": len(ev_val), "n_train": len(ev_tr),
            "frames": [f["stem"] for f in eval_frames],
            "total_frames_gt": total_frames_gt, "distinct": len(ref_glyphs),
            "n_interfaces": 1, "rows": rows}


# ---------------------------------------------------------------- 多帧口径
def multi_frame(group, det):
    """N 帧同界面 → 跨帧聚类（同类且与簇中位框 IoU≥0.5），多帧口径 = 支撑帧数过半的簇。"""
    per_frame = []
    for p, _name in group["frames"]:
        per_frame.append((p, det.run(p)))
    clusters = []
    for fi, (p, dets) in enumerate(per_frame):
        for d in dets:
            best, bc = 0.0, None
            for c in clusters:
                if c["kind"] != d["kind"]:
                    continue
                v = iou_xywh(d["bbox"], c["med"])
                if v >= 0.5 and v > best:
                    best, bc = v, c
            if bc is None:
                bc = {"kind": d["kind"], "boxes": [], "frames": set(), "scores": [],
                      "med": list(d["bbox"])}
                clusters.append(bc)
            bc["boxes"].append(d["bbox"])
            bc["frames"].add(fi)
            bc["scores"].append(d["score"])
            if len(bc["boxes"]) > 1:              # 中位框随簇增长滚动更新
                bc["med"] = [float(v) for v in np.median(np.array(bc["boxes"], float), axis=0)]
    N = len(per_frame)
    keep, jit = [], []
    for c in clusters:
        arr = np.array(c["boxes"], float)
        c["med"] = list(np.median(arr, axis=0))
        sup = len(c["frames"])
        if sup >= max(2, math.ceil(N * 0.5)):
            keep.append({"bbox": c["med"], "kind": c["kind"],
                         "score": float(np.mean(c["scores"])), "support": sup})
            cx, cy = c["med"][0] + c["med"][2] / 2, c["med"][1] + c["med"][3] / 2
            ds = [math.hypot(b[0] + b[2] / 2 - cx, b[1] + b[3] / 2 - cy) for b in c["boxes"]]
            jit.append({"kind": c["kind"], "support": sup, "jitter": float(np.median(ds))})
    # 单帧口径：参考帧 + 全 N 帧（表里用均值，避免单帧偶然性）
    ref_idx = next((i for i, (_p, n) in enumerate(per_frame) if n == group["ref"]), 0)
    singles = [score(dets, group["objects"]) for _p, dets in per_frame]
    return {"case": group["case"], "N": N, "ref": group["ref"],
            "single": per_frame[ref_idx][1], "singles": singles,
            "multi": keep, "clusters": len(clusters),
            "support": sorted((c["support"] for c in keep), reverse=True),
            "jitter": jit}


# ---------------------------------------------------------------- 报告
def md_table(head, rows):
    out = ["| " + " | ".join(head) + " |", "|" + "|".join(["---"] * len(head)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(x) for x in r) + " |")
    return "\n".join(out)


def build_report(args, frames, manifest, audit, results, multi, tag):
    L = []
    L.append(f"# GUI 检测评测（CALIBER-v2）· {tag}")
    L.append("")
    L.append(f"- 生成时间：{time.strftime('%Y-%m-%d %H:%M:%S')}")
    L.append(f"- 命令：`{' '.join([sys.executable] + sys.argv)}`")
    L.append(f"- 真值源：`{args.truth or args.preset}`（preset={args.preset}）｜帧={len(frames)}"
             f"｜原始 JSON 去重前={sum(1 + len(v['superseded']) for v in manifest.values())}")
    L.append(f"- 通道：{args.channel}｜模型：{', '.join(f'`{k}`' for k in results)}"
             f"｜NMS：{args.nms}（agnostic=线上现状，perkind=实验）")
    L.append("- 口径：strict=同类 1:1 贪心匹配（IoU≥0.5，按 score 降序）；"
             "legacy=d2.evaluate 原口径（同 kind IoU≥0.5 即命中，非一对一）")
    L.append("")

    # ---- 0 数据面
    fam_cnt = Counter(f["family"] for f in frames)
    gt_cnt = Counter(o["kind"] for f in frames for o in f["objects"])
    L.append("## 0. 数据面（含真值覆盖）")
    L.append("")
    rows = []
    for fam in FAM_NAMES:
        fs = [f for f in frames if f["family"] == fam]
        if not fs:
            continue
        g = Counter(o["kind"] for f in fs for o in f["objects"])
        aud = [audit.get(f["stem"]) for f in fs]
        ran = [a for a in aud if a and a.get("uncovered") is not None]
        bad = [a for a in ran if a["uncovered"] >= 3]
        grades = Counter(f.get("grade") or "—" for f in fs)
        rows.append([fam, len(fs), sum(len(f["objects"]) for f in fs),
                     "/".join(f"{k}{v}" for k, v in sorted(grades.items())),
                     f"{len(ran)}/{len(fs)}", len(bad),
                     ", ".join(f"{k}={v}" for k, v in sorted(g.items(), key=lambda x: -x[1]))])
    L.append(md_table(["族", "帧", "GT 单元", "质量等级", "audit 有读数", "audit≥3 帧",
                       "kind 分布"], rows))
    L.append("")
    def_src = Counter(f["family_src"] for f in frames)
    L.append(f"- 族判定依据：{dict(def_src)}（`layout-rule`=按 layout 文本规则；"
             f"`default`=无族名，落游戏界面族；`override`=人工指定）")
    unk = sum(1 for f in frames for o in f["objects"] if o["kind"] not in CANON_KINDS)
    # 统计"GT 有但类表没有"的 kind（bar 等）——必须出现在报告里，不许静默
    _extra = {}
    for f in frames:
        for o in f["objects"]:
            k = o.get("kind")
            if k and k not in CANON_KINDS:
                _extra[k] = _extra.get(k, 0) + 1
    EXTRA_GT_KINDS.clear(); EXTRA_GT_KINDS.extend(sorted(_extra.items()))
    L.append(f"- 非标准 kind（`unknown` 等，**不计入 P/R**）：{unk} 个单元")
    sup = [(k, v["from"], v["superseded"]) for k, v in manifest.items() if v["superseded"]]
    L.append(f"- 版本覆盖（同帧多版本只取最新）：{len(sup)} 帧；"
             + "；".join(f"{k}←{frm}（舍弃 {'/'.join(s)}）" for k, frm, s in sup[:4]))
    L.append("")

    red = gt_redundancy(frames)
    hot = [(k, v) for k, v in red.items() if v["ratio"] >= 0.8]
    if hot:
        fam_of = {f["stem"]: f["family"] for f in frames}
        L.append("**同界面重复帧（与同族另一帧的 GT 重合率 ≥0.8）——GT 数≠独立样本数，分族留出前必须看这张表**")
        L.append("")
        L.append(md_table(["帧", "族", "GT", "最像的帧", "重合率"],
                          [[k, fam_of.get(k, "?"), len(next(f for f in frames if f["stem"] == k)["objects"]),
                            v["peer"], v["ratio"]] for k, v in
                           sorted(hot, key=lambda x: -x[1]["ratio"])[:20]]))
        L.append(f"…共 {len(hot)} 帧重复（≥0.8）；重复帧 {len(hot)}/{len(frames)}")
        L.append("")

    # ---- 1 总表
    L.append("## 1. 总表（strict 1:1）")
    L.append("")
    rows = []
    for m, res in results.items():
        agg = res["agg"]
        t = agg["total"]
        p, r, f1 = prf(t) if t else (0, 0, 0)
        leg_r = round(t["leg_hit"] / t["gt"], 3) if t.get("gt") else None
        leg_p = round(t["leg_ndet"] / t["det"], 3) if t.get("det") else None
        lat = sorted(res["lat"])
        p50 = round(lat[len(lat) // 2], 1) if lat else None
        rows.append([m, res["n_frames"], t.get("gt", 0), t.get("det", 0), t.get("tp", 0),
                     t.get("fp", 0), t.get("fn", 0), p, r, f1, leg_p, leg_r, p50])
    L.append(md_table(["模型", "帧", "GT", "检出", "TP", "FP", "FN", "P", "R", "F1",
                       "legacy P", "legacy R", "p50ms"], rows))
    L.append("")

    # ---- 2 分 kind
    L.append("## 2. 分 kind（CALIBER-v2 ①：row / glyph_icon 单列）")
    L.append("")
    print("  GT kind 不在检测器类表（不计分）：%s" % (", ".join("%s=%d" % kv for kv in EXTRA_GT_KINDS) or "无"))
    kinds = [k for k in CANON_KINDS]
    for k in sorted(set().union(*[set(r["agg"]["per_kind"]) for r in results.values()])):
        if k not in kinds:
            kinds.append(k)
    head = ["kind", "GT"] + [f"{m} P|R|F1" for m in results] + ["消失（GT>0 但模型无此类）"]
    rows = []
    for k in kinds:
        n_gt = max((r["agg"]["per_kind"].get(k, {}).get("gt", 0) for r in results.values()),
                   default=0)
        if n_gt == 0 and not any(k in r["agg"]["per_kind"] for r in results.values()):
            continue
        cells = []
        gone = []
        for m, res in results.items():
            c = res["agg"]["per_kind"].get(k)
            if not c or c.get("gt", 0) == 0:
                cells.append("—")
                continue
            p, rr, f1 = prf(c)
            cells.append(f"{p}|{rr}|{f1}")
            if c.get("det", 0) == 0:
                gone.append(m)
        rows.append([k, n_gt] + cells + [",".join(gone) or ""])
    L.append(md_table(head, rows))
    L.append("")

    # ---- 3 分族
    L.append("## 3. 分族（CALIBER-v2 ②：按族留出/对照）")
    L.append("")
    fam_kind = {}      # (m, fam, kind) → Counter（族内逐帧累加）
    for m, res in results.items():
        for fr in res["frames"]:
            for k, c in fr["per_kind"].items():
                fam_kind.setdefault((m, fr["family"], k), Counter()).update(c)
    head = ["族", "帧", "GT"] + [f"{m} P|R|F1" for m in results] + ["族内关键 kind R（strict）"]
    rows = []
    for fam in FAM_NAMES:
        n_gt = max((r["agg"]["per_family"].get(fam, {}).get("gt", 0) for r in results.values()),
                   default=0)
        if n_gt == 0 and not any(fam in r["agg"]["per_family"] for r in results.values()):
            continue
        cells = []
        for m, res in results.items():
            c = res["agg"]["per_family"].get(fam)
            cells.append("—" if not c or not c.get("gt") else "|".join(map(str, prf(c))))
        bits = []
        for k in ("row", "tile", "icon", "button", "panel", "card", "glyph_icon"):
            for m in results:
                cc = fam_kind.get((m, fam, k))
                if cc and cc["gt"]:
                    bits.append(f"{k}:{m}={prf(cc)[1]}")
        nf = sum(1 for fr in next(iter(results.values()))["frames"] if fr["family"] == fam)
        rows.append([fam, nf, n_gt] + cells + ["、".join(bits) or "—"])
    L.append(md_table(head, rows))
    L.append("")

    # ---- 3.5 world HUD / glyph_icon 专项
    gr = glyph_report(frames, results, ref=getattr(args, "glyph_ref", None),
                      val_stems=VAL_STEMS)
    if gr:
        L.append("## 3.5 world HUD / glyph_icon 专项（C 方案：只回答「31 个已知模板能不能学出来」）")
        L.append("")
        L.append(f"**三个数（缺一不可）**：帧级 GT `{gr['total_frames_gt']}` 个 · "
                 f"**独立样本 = {gr['distinct']} 个不同 glyph**（参考帧 `{gr['ref']}` 去重）· "
                 f"有效独立界面 `{gr['n_interfaces']}` 个。")
        L.append(f"评估帧（除参考帧）：{', '.join(gr['frames'])}。"
                 "**本表只证明「已知模板可学」，不证明「新界面/新 glyph 可检出」**。")
        L.append("")
        head = ["#", "bbox(x,y,w,h)", "尺寸", "条/数值", "标签"] + list(results) + ["判定"]
        rows = []
        for c in gr["rows"]:
            cells = [c[m] for m in results]
            best_val = max((v for v, nv, _t, _nt in cells), default=0)
            verdict = ("稳定" if best_val >= gr["n_val"] and gr["n_val"] else
                       "部分" if best_val else "从不")
            rows.append([c["idx"], c["bbox"], f"{c['w']}×{c['h']}", "是" if c["bar"] else "",
                         c["label"]]
                        + [f"val {v}/{nv} · train {t}/{nt}" for v, nv, t, nt in cells]
                        + [verdict])
        L.append(md_table(head, rows))
        L.append("")
        for m in results:
            nv = gr["n_val"] or 1
            stab = sum(1 for c in gr["rows"] if c[m][0] >= nv and nv)
            part = sum(1 for c in gr["rows"] if 0 < c[m][0] < nv)
            never = sum(1 for c in gr["rows"] if c[m][0] == 0)
            tr_hit = sum(1 for c in gr["rows"] if c[m][2] > 0)
            L.append(f"- `{m}`：**val 稳定 {stab}／部分 {part}／从不 {never}**（共 {len(gr['rows'])}，"
                     f"val 帧 {gr['n_val']} 个）；同一批 glyph 在训练帧上有检出 {tr_hit}/{len(gr['rows'])}"
                     f"（train 帧 {gr['n_train']} 个，仅作 in-sample 参考，不算泛化）")
        L.append("")

    # ---- 4 几何切片
    L.append("## 4. 单帧几何切片（CALIBER-v2 ④：尺寸/长宽比/对比度/局部平坦度）")
    L.append("")
    any_slice = False
    for m, res in results.items():
        gs = res["geom"]
        if not gs:
            continue
        any_slice = True
        L.append(f"**{m}**")
        L.append("")
        rows = []
        for k in ("row", "glyph_icon", "tile", "icon", "chip", "button"):
            sub = [(kk, v) for kk, v in gs.items() if kk.startswith(k + "/")]
            if not sub:
                continue
            cells = "; ".join(f"{kk.split('/', 1)[1]} n={v['n']} R={v['r']}"
                              for kk, v in sub if v["n"] >= 5)
            rows.append([k, cells or "（每桶样本 <5，跳过）"])
        L.append(md_table(["kind", "切片 → n / strict R"], rows))
        L.append("")
    if not any_slice:
        L.append("（未算：需要读原图取特征；`--no-feats` 会跳过本节）")
        L.append("")

    # ---- 5 错类
    L.append("## 5. 错类矩阵（IoU≥0.5 但 kind 不同 → 同构错类）")
    L.append("")
    for m, res in results.items():
        conf = Counter()
        for fr in res["frames"]:
            conf.update(fr["conf"])
        if not conf:
            L.append(f"- `{m}`：无错类（没有 IoU≥0.5 的跨类匹配）")
            continue
        top = conf.most_common(8)
        L.append(f"- `{m}`：共 {sum(conf.values())} 次；" +
                 "、".join(f"{k.replace('->', '→')}:{n}" for k, n in top))
    L.append("")

    # ---- 6 单帧 vs 多帧
    L.append("## 6. 单帧 vs 多帧口径（CALIBER-v2 ④：N 帧出现率 + 位置抖动 + P/R 比值）")
    L.append("")
    if not multi:
        L.append("（本次无多帧组：`--preset all` 或 `--multi-dir` 指定 `.scratch/gui-collect/<case>`）")
        L.append("")
    else:
        L.append("多帧组的 GT 取自 `.scratch/gui-collect/<case>/truth.json`（参考帧口径，不在上面的"
                 "帧集合里）；单帧数 = N 帧均值，多帧数 = 跨帧聚类（同类且与簇中位框 IoU≥0.5）后"
                 "支撑帧数过半的簇；位置抖动 = 簇内各帧中心到簇中位中心距离的 p50/p90。")
        L.append("")
    for m, res in results.items():
        groups = multi.get(m) or []
        if not groups:
            continue
        L.append(f"**{m}**")
        L.append("")
        rows = []
        for g in groups:
            ps, rs = [], []
            for _k, t_s, _c in g["singles"]:
                ps.append(t_s.get("tp", 0) / t_s["det"] if t_s.get("det") else 0.0)
                rs.append(t_s.get("tp", 0) / t_s["gt"] if t_s.get("gt") else 0.0)
            p_s, r_s = float(np.mean(ps)), float(np.mean(rs))
            p_smax, r_smax = (max(ps), max(rs))
            gt_s = g["singles"][0][1].get("gt", 0)
            _k_m, t_m, _ = score(g["multi"], g["gts"])
            tp_m, det_m, gt_m = t_m.get("tp", 0), t_m.get("det", 0), t_m.get("gt", 0)
            p_m = tp_m / det_m if det_m else 0.0
            r_m = tp_m / gt_m if gt_m else 0.0
            jit = [j["jitter"] for j in g["jitter"]]
            sup = g["support"]
            rows.append([g["case"], g["N"], gt_s,
                         f"{round(p_s, 3)}/{round(r_s, 3)}",
                         f"最优帧 {round(p_smax, 2)}/{round(r_smax, 2)}",
                         f"{round(p_m, 3)}/{round(r_m, 3)}",
                         f"{round(p_m / p_s, 2) if p_s else '—'} / "
                         f"{round(r_m / r_s, 2) if r_s else '—'}",
                         len(g["multi"]), g["clusters"],
                         f"{round(np.median(sup) / g['N'], 2) if sup else '—'}",
                         (f"{round(float(np.median(jit)), 1)}/"
                          f"{round(float(np.percentile(jit, 90)), 1)}") if jit else "—"])
        L.append(md_table(["组", "N 帧", "GT", "单帧 P/R（N 帧均值）", "单帧最优帧",
                           "多帧 P/R", "P 比 / R 比", "多帧框", "跨帧簇",
                           "出现率中位", "位置抖动 p50/p90 px"], rows))
        L.append("")

    # ---- 7 逐帧明细
    L.append("## 7. 逐帧明细（真值覆盖 + 命中）")
    L.append("")
    for m, res in results.items():
        L.append(f"**{m}**")
        L.append("")
        rows = []
        for fr in res["frames"]:
            t = fr["tot"]
            p, r, f1 = prf(t) if t else (0, 0, 0)
            a = audit.get(fr["stem"]) or {}
            rows.append([fr["stem"], fr["family"], fr.get("grade") or "—", fr["gt"],
                         fr["gt_scored"], fr["unk"], fr["area_max"], a.get("uncovered", "—"),
                         fr["n_det"], t.get("tp", 0), t.get("fp", 0), t.get("fn", 0),
                         p, r, fr["ms"]])
        L.append(md_table(["帧", "族", "等级", "GT", "计分", "unk", "区域框面积占比",
                           "audit 未覆盖", "检出", "TP", "FP", "FN", "P", "R", "ms"], rows))
        L.append("")
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", choices=["old", "merged", "all"], default="merged",
                    help="old=11 个版本目录去重（阶段 A 旧数据）；merged=truth-merged；all=+gui-collect 多帧")
    ap.add_argument("--truth", default="", help="直接指定单一真值目录（覆盖 preset）")
    ap.add_argument("--models", default="v1=tools/ys-editor/models/gui-det-v1.pt,"
                                       "v2=tools/ys-editor/models/gui-det-v2.pt")
    ap.add_argument("--channel", choices=["prod", "train", "both"], default="prod")
    ap.add_argument("--multi-dir", action="append", default=[])
    ap.add_argument("--d2-val", action="store_true", help="只评 d2.Data(seed=0) 的留族验证集帧")
    ap.add_argument("--frame-list", default="", help="只评文件里列出的 stem（一行一个，可带注释 #）")
    ap.add_argument("--audit-ocr", default="", help="OCR 目录；给定时自动跑 audit_truth.py")
    ap.add_argument("--no-feats", action="store_true", help="跳过几何切片（省读原图）")
    ap.add_argument("--glyph-ref", default="", help="glyph 专项的参考帧（缺省取 world_hud 第一帧）")
    ap.add_argument("--infer-unknown", action="store_true",
                    help="把 kind=unknown 按几何猜类（旧 dataset 口径，仅为与历史表对齐）")
    ap.add_argument("--exclude-c-grade", action="store_true",
                    help="剔除旧 QC 判为 C 级的 4 帧（c42/c29/c19/v088，与旧 dataset 对齐）")
    ap.add_argument("--no-audit", action="store_true", help="不跑 audit_truth.py")
    ap.add_argument("--glyph-drop-bars", action="store_true",
                    help="剔除 glyph_icon 里的条/数值（原图 w>150 或 h>60），与含版对照")
    ap.add_argument("--split-file", default="", help="dataset-v2/split.json：用同一份切分评")
    ap.add_argument("--eval-split", choices=["all", "train", "val"], default="all")
    ap.add_argument("--grade-filter", default="",
                    help="只评指定质量等级，如 A,B（读 MANIFEST 的 quality_grade）")
    ap.add_argument("--nms", choices=["ship", "agnostic", "perkind"], default="ship",
                    help="ship=线上现状（含 gui_det.NMS_SCOPED_KINDS，当前 avatar）；"
                         "agnostic=强制 scoped=() 的纯类无关 NMS（A/B 用）；"
                         "perkind=实验（全类内 NMS）")
    ap.add_argument("--out", default="")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()

    os.chdir(ROOT)
    # ---- 帧集合
    if args.truth:
        dirs = [args.truth]
        src_desc = args.truth
    elif args.preset == "old":
        dirs = [os.path.join(CORPUS, d) for d in OLD_DIRS]
        src_desc = "old(11 版本目录，同帧取最新)"
    elif args.preset == "merged":
        dirs = [os.path.join(CORPUS, "truth-merged")]
        src_desc = "truth-merged"
    else:
        dirs = [os.path.join(CORPUS, "truth-merged")] + [os.path.join(CORPUS, d) for d in OLD_DIRS]
        src_desc = "merged+old"
    if not os.path.isdir(dirs[0]) and not args.truth:
        raise SystemExit(f"真值目录不存在：{dirs[0]}")
    for d in dirs:
        if not os.path.isdir(d):
            raise SystemExit(f"真值目录不存在：{d}")
    global VAL_STEMS
    VAL_STEMS = set()
    raw_frames, manifest = collect_frames(dirs)
    man, man_paths = load_manifest(dirs)
    if man_paths:
        print(f"[manifest] {len(man_paths)} 份 → {len(man)} 帧带 family/grade/audit 权威读数")
    C_GRADE = {"c42_195441", "c29_195243", "c19_195135", "v088_0513"}
    norm = [normalize_frame(x, infer_unknown=args.infer_unknown,
                            manifest=man if man else None,
                            glyph_drop_bars=args.glyph_drop_bars) for x in raw_frames]
    no_fam = [x["stem"] for x, f in zip(raw_frames, norm) if f is None]
    frames = [f for f in norm if f]
    if no_fam:
        print(f"[manifest] 跳过 {len(no_fam)} 帧（family 缺失/NONE，不猜）：{no_fam[:6]}")
    if args.exclude_c_grade:
        n0 = len(frames)
        frames = [f for f in frames if f["stem"] not in C_GRADE]
        print(f"[exclude-c] 剔除 {n0 - len(frames)} 帧 C 级")
    if args.grade_filter:
        keep_g = {g.strip().upper() for g in args.grade_filter.split(",") if g.strip()}
        n0 = len(frames)
        frames = [f for f in frames if (f.get("grade") or "").upper() in keep_g]
        print(f"[grade] 只留 {sorted(keep_g)}：{n0} → {len(frames)} 帧")
    dropped = len(raw_frames) - len(frames)
    if args.split_file:
        sp = json.load(open(os.path.join(ROOT, args.split_file), encoding="utf-8"))
        VAL_STEMS = set(sp.get("val", []))
        if args.eval_split != "all":
            keep = set(sp[args.eval_split])
            n0 = len(frames)
            frames = [f for f in frames if f["stem"] in keep]
            print(f"[split] {args.split_file} → {args.eval_split}：{n0} → {len(frames)} 帧")
    if args.frame_list:
        keep = {ln.strip() for ln in open(os.path.join(ROOT, args.frame_list), encoding="utf-8")
                if ln.strip() and not ln.strip().startswith("#")}
        frames = [f for f in frames if f["stem"] in keep]
    if args.d2_val:
        sys.path.insert(0, HERE)
        import d2
        val = d2.Data(os.path.join(ROOT, ".scratch/gui-detect/dataset"), 0.25, seed=0)
        stems = {os.path.splitext(os.path.basename(it["path"]))[0] for it in val.val}
        frames = [f for f in frames if f["stem"] in stems]
        print(f"[d2-val] 留族验证帧 {len(frames)} 个：{sorted(stems)[:8]}")
    if not frames:
        raise SystemExit("没有可评的帧")

    # ---- 多帧组
    multi_groups = [load_multi_group(d) for d in (args.multi_dir or
                                                 (MULTI_DIRS if args.preset == "all" else []))]
    multi_groups = [g for g in multi_groups if g]

    # ---- audit（复用 audit_truth.py，不重写口径）
    audit = {}
    for stem, ent in man.items():
        if ent.get("audit_uncovered") is not None:
            audit[stem] = {"uncovered": ent["audit_uncovered"], "ocr": "manifest",
                           "units": ent.get("objects") or ent.get("units")}
    if audit:
        print(f"[audit] 采用 MANIFEST 自带 audit_uncovered：{len(audit)} 帧")
    ocr_dirs = [] if (args.no_audit or audit) else ([args.audit_ocr] if args.audit_ocr else (
        OCR_DIRS if (args.preset in ("old", "merged", "all") or args.truth) else []))
    kept = {f["stem"] for f in frames}
    win_dirs = sorted({fr["truth_dir"] for fr in raw_frames if fr["stem"] in kept})
    for td in win_dirs:
        # 优先真值目录自带的 _ocr/（merge 交付约定），其次 --audit-ocr / 历史 OCR 目录
        for od in [os.path.join(td, "_ocr")] + list(ocr_dirs):
            if not (os.path.isdir(td) and os.path.isdir(od)):
                continue
            outj = os.path.join(HERE, "eval-out", "_audit_tmp.json")
            os.makedirs(os.path.dirname(outj), exist_ok=True)
            r = subprocess.run([sys.executable, os.path.join(CORPUS, "tools", "audit_truth.py"),
                                "--truth-dir", td, "--ocr-dir", od, "--rules",
                                "--json-out", outj], capture_output=True, text=True)
            if r.returncode != 0:
                print(f"[audit] 失败（跳过）：{r.stderr.strip()[:200]}")
                continue
            for row in json.load(open(outj, encoding="utf-8")):
                if row.get("ocr") is None:
                    continue
                prev = audit.get(row["frame"])
                if prev is None or prev.get("uncovered", 99) > row.get("uncovered", 99):
                    audit[row["frame"]] = row
    print(f"[audit] {len(audit)} 帧有未覆盖读数"
          f"（≥3 处 = {sum(1 for a in audit.values() if a['uncovered'] >= 3)} 帧）")

    # ---- 模型
    models = {}
    for spec in args.models.split(","):
        if not spec.strip():
            continue
        name, _, path = spec.partition("=")
        models[name.strip()] = os.path.join(ROOT, path.strip())
    chans = ["prod", "train"] if args.channel == "both" else [args.channel]
    detectors = {}
    for mname, path in models.items():
        for ch in chans:
            try:
                det = (ProdDetector(path, nms=args.nms) if ch == "prod"
                       else TrainDetector(path))
            except Exception as e:                       # noqa: BLE001
                print(f"[skip] {mname}/{ch}: {e}")
                continue
            detectors[f"{mname}" + ("" if len(chans) == 1 else f".{ch}")] = det
    if not detectors:
        raise SystemExit("没有可用检测器")

    # ---- 跑
    t0 = time.time()
    raw_res = eval_frames(frames, detectors, feats=not args.no_feats)
    results = {}
    for mname, res in raw_res.items():
        agg = aggregate(res["frames"])
        results[mname] = {"frames": res["frames"], "lat": res["lat"], "agg": agg,
                          "n_frames": len(res["frames"]),
                          "geom": {} if args.no_feats else geom_slices(res["frames"])}

    # ---- 多帧
    multi = {}
    for mname, det in detectors.items():
        multi[mname] = [dict(multi_frame(g, det), gts=g["objects"]) for g in multi_groups] \
            if multi_groups else []

    # ---- 落盘
    tag = args.tag or f"{args.preset}-{args.channel}"
    outd = args.out or os.path.join(HERE, "eval-out", tag)
    outd = os.path.join(ROOT, outd) if not os.path.isabs(outd) else outd
    os.makedirs(outd, exist_ok=True)
    md = build_report(args, frames, manifest, audit, results, multi, f"{tag}（{src_desc}）")
    open(os.path.join(outd, "report.md"), "w", encoding="utf-8").write(md)
    json_out = {
        "meta": {"tag": tag, "preset": args.preset, "channel": args.channel,
                 "dirs": [os.path.relpath(d, ROOT) for d in dirs], "n_frames": len(frames),
                 "dropped_no_image": dropped, "cmd": [sys.executable] + sys.argv,
                 "time": time.strftime("%Y-%m-%d %H:%M:%S")},
        "audit": {k: {"uncovered": v["uncovered"], "ocr": v["ocr"], "units": v["units"]}
                  for k, v in audit.items()},
        "frames": [{"stem": f["stem"], "family": f["family"], "family_src": f["family_src"],
                    "from": f["from"], "W": f["W"], "H": f["H"], "layout": f["layout"],
                    "gt": len(f["objects"]), "area_max": f["area_max"],
                    "kinds": dict(Counter(o["kind"] for o in f["objects"]))}
                   for f in frames],
        "models": {}, "multi": {}, "gt_redundancy": gt_redundancy(frames)}
    for m, res in results.items():
        t = res["agg"]["total"]
        json_out["models"][m] = {
            "path": models.get(m.split(".")[0]),
            "strict": dict(zip(["P", "R", "F1"], prf(t) if t else (0, 0, 0))),
            "total": t, "per_kind": res["agg"]["per_kind"],
            "per_family": res["agg"]["per_family"],
            "legacy_micro_R": round(t.get("leg_hit", 0) / t["gt"], 4) if t.get("gt") else None,
            "geom": res.get("geom", {}),
            "lat_ms": ({"p50": round(sorted(res["lat"])[len(res["lat"]) // 2], 1),
                        "p90": round(sorted(res["lat"])[int(0.9 * (len(res["lat"]) - 1))], 1)}
                       if res["lat"] else None)}
    for m, gs in multi.items():
        json_out["multi"][m] = [{"case": g["case"], "N": g["N"], "ref": g["ref"],
                                 "n_gt": len(g["gts"]), "n_multi": len(g["multi"]),
                                 "clusters": g["clusters"]} for g in gs]
    json.dump(json_out, open(os.path.join(outd, "report.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"[done] {len(frames)} 帧 × {len(detectors)} 检测器 · {time.time() - t0:.1f}s")
    print(f"[out ] {os.path.relpath(outd, ROOT)}/report.md")
    print("[一屏摘要]")
    for m, res in results.items():
        t = res["agg"]["total"]
        p, r, f1 = prf(t) if t else (0, 0, 0)
        print(f"  {m:<10} strict P={p} R={r} F1={f1} · legacy R="
              f"{round(t.get('leg_hit', 0) / max(1, t.get('gt', 1)), 3)} · det={t.get('det', 0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
