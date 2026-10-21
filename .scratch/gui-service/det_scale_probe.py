#!/usr/bin/env python3
"""det_scale_probe.py — OCR 检测尺度实验：det_max 2000 vs 1600/1280 的耗时与文字召回。

问题：world 冷路径 ~800ms 里 det（整帧检测）占 150ms 左右；把 det 输入长边从 2000
降到 1280 可把 det 面积降到 41%，但小字号可能漏检。**用同一批语料帧做前后对照**：
  · 耗时：server total_ms / det_ms / rec_ms
  · 召回：以 det_max=2000 的结果为基线，按文本框 IoU≥0.5 做一对一匹配，比较文字
    （字符多重集交集 / 基数字符数），并统计"基线有、候选无"的框数与例子。
只读离线帧，不动屏幕。用法：
  python3 .scratch/gui-service/det_scale_probe.py [--frames 6] [--det 2000 1600 1280]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import instruments  # noqa: E402

CORPUS = os.path.join(REPO, ".scratch", "gui-corpus")
OUT = os.path.join(HERE, "evidence", "det-scale.json")


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = ix * iy
    ua = a[2] * a[3] + b[2] * b[3] - inter
    return inter / ua if ua > 0 else 0.0


def _timing(d):
    """保留未知字段（黑名单式）：只剔除大对象，避免白名单重建让新字段静默蒸发。"""
    out = dict(d)
    for k in ("objects", "boxes", "error", "code", "frame_sha", "ruleset"):
        out.pop(k, None)
    return out


def ocr(frame, det):
    r = instruments.daemon_rpc({"cmd": "ocr_objects", "frame": frame, "cache": False,
                                "ocr": True, "max_objects": 400, "reset": True,
                                "det_max": int(det)}, timeout=120)
    return r


def compare(base, cand):
    """基线框 → 候选框 一对一匹配（IoU 贪心），返回字符召回与漏框。"""
    bb = [o for o in (base.get("objects") or []) if (o.get("text") or "").strip()]
    cc = [o for o in (cand.get("objects") or []) if (o.get("text") or "").strip()]
    used = set()
    matched_chars = 0
    base_chars = sum(len(o["text"]) for o in bb)
    missing, examples = 0, []
    for o in bb:
        best, bi = 0.0, None
        for j, p in enumerate(cc):
            if j in used:
                continue
            v = iou(o["bbox"], p["bbox"])
            if v > best:
                best, bi = v, j
        if bi is None or best < 0.5:
            missing += 1
            if len(examples) < 5:
                examples.append(o["text"][:30])
            continue
        used.add(bi)
        matched_chars += sum((Counter(o["text"]) & Counter(cc[bi]["text"])).values())
    return {
        "n_base": len(bb), "n_cand": len(cc),
        "char_recall": round(matched_chars / base_chars, 4) if base_chars else 1.0,
        "missing_boxes": missing,
        "missing_examples": examples,
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=6)
    ap.add_argument("--det", nargs="+", type=int, default=[2000, 1600, 1280])
    a = ap.parse_args(argv)
    frames = [os.path.join(CORPUS, "f%02d.png" % i) for i in range(a.frames)]
    rows = []
    for f in frames:
        base = ocr(f, 2000)
        row = {"frame": os.path.basename(f), "base": _timing(base)}
        for det in a.det:
            if det == 2000:
                continue
            cand = ocr(f, det)
            row[str(det)] = _timing(cand)
            row[str(det)].update(compare(base, cand))
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
    # 汇总
    summary = {}
    for det in a.det:
        if det == 2000:
            continue
        vals = [r[str(det)] for r in rows if str(det) in r]
        summary[str(det)] = {
            "det_ms_p50": sorted(v["det_ms"] for v in vals)[len(vals) // 2],
            "total_ms_p50": sorted(v["total_ms"] for v in vals)[len(vals) // 2],
            "char_recall_mean": round(sum(v["char_recall"] for v in vals) / len(vals), 4),
            "char_recall_min": min(v["char_recall"] for v in vals),
            "missing_boxes": sum(v["missing_boxes"] for v in vals),
            "n_base": sum(v["n_base"] for v in vals),
        }
    out = {"frames": rows, "summary": summary}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    print("[det-scale] ->", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
