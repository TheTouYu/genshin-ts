#!/usr/bin/env python3
"""strip_probe.py — 扫描期「条带 OCR + 上一屏复用」的离线硬判据实验。

问题（2026-10-21 反馈轮）：滚动扫描每屏 0.77–0.95s，因为整页变了，页级复用必然失效。
候选协议：滚动后只 OCR **新露出的底部条带**（高度 = moved_px + 行高重叠），
上一屏行按位移复用，再合并去重。

判据（硬）：
  1. 行级召回 100%（全帧 OCR 的行，合并结果里都要有）；
  2. 行序不得错（合并后的行首签名序列与全帧一致）；
  3. 条带 OCR 耗时应显著低于全帧（目标 ≤50%）。

做法（全离线、不占屏）：用真实好友帧 `friends0.png`（首屏）+ `now.png`（后续屏的新内容）
合成滚动后帧：`next = friends0[dy:] 上移 + now 的底部 dy 行补底`；dy ∈ {400,800,1200}。
全帧 OCR vs 条带 OCR（region=[0,H-(dy+overlap),W,dy+overlap]）都走常驻 daemon `cmd=ocr`。

用法：python3 .scratch/gui-service/strip_probe.py
输出：.scratch/gui-service/evidence/strip-probe.json
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import instruments  # noqa: E402

SRC = os.path.join(HERE, "evidence", "friends-run-20261021-1555")
OUT = os.path.join(HERE, "evidence", "strip-probe.json")
OVERLAP = 200          # 条带与上一屏的重叠像素（≥1 行）
ROW_TOL = 70           # 同一行的 y 聚类容差（行距 ~155）


def _boxes(resp):
    out = []
    for b in (resp or {}).get("boxes") or []:
        txt = (b.get("text") or "").strip()
        if not txt:
            continue
        ys = [p[1] for p in (b.get("box") or [])]
        xs = [p[0] for p in (b.get("box") or [])]
        out.append({"text": txt, "y": (min(ys) + max(ys)) / 2.0 if ys else b.get("cy"),
                    "x": (min(xs) + max(xs)) / 2.0 if xs else b.get("cx"),
                    "cy": b.get("cy")})
    return out


def rows(boxes):
    """按 y 聚类成行；行内按 x 排序；返回 [(y, [text,...]), ...]。"""
    rows_ = []
    for b in sorted(boxes, key=lambda b: (b["y"], b["x"])):
        if rows_ and abs(b["y"] - rows_[-1][0]) <= ROW_TOL:
            rows_[-1][1].append(b["text"])
            rows_[-1][2].append(b["x"])
        else:
            rows_.append([b["y"], [b["text"]], [b["x"]]])
    out = []
    for y, texts, xs in rows_:
        order = sorted(range(len(texts)), key=lambda i: xs[i])
        out.append((round(y, 1), [texts[i] for i in order]))
    return out


def ocr(frame, region=None):
    req = {"cmd": "ocr", "frame": os.path.abspath(frame)}
    if region:
        req["region"] = [int(v) for v in region]
    r = instruments.daemon_rpc(req, timeout=120)
    return _boxes(r), r.get("ms"), (r or {}).get("error")


def main(argv=None):
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(os.path.join(SRC, "friends0.png")).convert("RGB"))
    b = np.asarray(Image.open(os.path.join(SRC, "now.png")).convert("RGB"))
    H, W = a.shape[:2]
    full_a_boxes, _, _ = ocr(os.path.join(SRC, "friends0.png"))
    full_a_rows = rows(full_a_boxes)
    cases = []
    for dy in (400, 800, 1200):
        # 合成「滚动 dy 后」的帧：a 上移 dy，底部 dy 行用 b 的底部内容补
        nxt = a[dy:].copy()
        pad = np.zeros((dy, W, 3), dtype=np.uint8)
        pad[-dy:] = b[-dy:]
        nxt = np.vstack([nxt, pad])
        p = os.path.join("/tmp", "strip-next-%d.png" % dy)
        Image.fromarray(nxt).save(p, compress_level=1)
        full_boxes, full_ms, full_err = ocr(p)
        strip_top = max(0, H - (dy + OVERLAP))
        strip_boxes, strip_ms, strip_err = ocr(p, region=[0, strip_top, W, H - strip_top])
        # 上一屏里仍在视口内的行（y>=dy）按位移复用
        prev = [(y - dy, t) for y, t in full_a_rows if y >= dy]
        strip_rows = [(y + strip_top, t) for y, t in rows(strip_boxes)]
        merged = prev + strip_rows
        # 去重：按行首文本 + y 接近
        ded = []
        for y, t in merged:
            if any(abs(y - y2) <= ROW_TOL and t[:1] == t2[:1] for y2, t2 in ded):
                continue
            ded.append((y, t))
        ded.sort(key=lambda z: z[0])
        full_rows = rows(full_boxes)
        # 行匹配：行首文本相同（OCR 可能把首文本粘到相邻行，退化为包含任一文本）
        def key(t):
            return t[0] if t else ""
        full_keys = [key(t) for _, t in full_rows]
        ded_keys = [key(t) for _, t in ded]
        hit = sum(1 for k in full_keys if k in ded_keys)
        order_ok = [k for k in ded_keys if k in full_keys] == [k for k in full_keys if k in ded_keys]
        cases.append({"dy": dy, "full_ms": full_ms, "strip_ms": strip_ms,
                      "full_rows": len(full_rows), "strip_rows": len(strip_rows),
                      "merged_rows": len(ded), "row_recall": round(hit / max(1, len(full_keys)), 4),
                      "order_ok": order_ok, "full_keys": full_keys, "merged_keys": ded_keys,
                      "full_err": full_err, "strip_err": strip_err})
        print(json.dumps({k: cases[-1][k] for k in
                          ("dy", "full_ms", "strip_ms", "full_rows", "merged_rows",
                           "row_recall", "order_ok")}, ensure_ascii=False), flush=True)
    res = {"schema": "gui.strip-probe/1", "src": SRC, "overlap": OVERLAP,
           "cases": cases,
           "pass": all(c["row_recall"] >= 1.0 and c["order_ok"] and
                       (c["strip_ms"] or 1e9) <= 0.5 * (c["full_ms"] or 0) for c in cases)}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print("STRIP-PROBE pass=%s -> %s" % (res["pass"], OUT))
    return 0 if res["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
