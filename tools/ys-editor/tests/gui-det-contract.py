#!/usr/bin/env python3
"""gui_det 契约回归：Detector.detect(rgb) 的返回形态不能变（D2 改动后必跑）。

  python3 tools/ys-editor/tests/gui-det-contract.py                 # 默认权重
  python3 tools/ys-editor/tests/gui-det-contract.py --w a.pt --w b.pt # 多权重对比
  python3 tools/ys-editor/tests/gui-det-contract.py --device cpu

判据（每条都打印 PASS/FAIL）：
  R1 err is None；R2 返回 list[dict]；R3 每条含 id/bbox(xywh)/kind/score；
  R4 bbox 四元数、w>0 h>0、全部落在图内（±2px）；R5 kind ∈ 八类规范名；
  R6 score ∈ (0,1]；R7 id 唯一；R8 同一帧重复调用结果稳定（无状态泄漏）。
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import gui_det  # noqa: E402

FRAME = ".scratch/gui-corpus/f00.png"
KINDS = set(gui_det.KINDS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", action="append", default=[], help="权重路径（可多次）")
    ap.add_argument("--frame", default=FRAME)
    ap.add_argument("--device", default="")
    args = ap.parse_args()
    weights = args.w or [gui_det.DEFAULT_MODEL]
    rgb = np.asarray(Image.open(args.frame).convert("RGB"))
    h0, w0 = rgb.shape[:2]
    fails = 0

    def chk(name, ok, detail=""):
        nonlocal fails
        print(f"  {'PASS' if ok else 'FAIL'}  {name} {detail}")
        fails += 0 if ok else 1

    for wp in weights:
        print(f"== {wp}  (frame {args.frame} {w0}x{h0})")
        det = gui_det.Detector(model_path=wp,
                               device=args.device or None)
        out = det.detect(rgb)
        out2 = det.detect(rgb)
        chk("R1 err is None", det.err is None, f"err={det.err}")
        chk("R2 list[dict]", isinstance(out, list) and all(isinstance(o, dict) for o in out),
            f"n={len(out)}")
        chk("R3 键齐全", all({"id", "bbox", "kind", "score"} <= set(o) for o in out))
        ok4 = True
        for o in out:
            b = o["bbox"]
            if len(b) != 4 or b[2] <= 0 or b[3] <= 0:
                ok4 = False
                break
            if b[0] < -2 or b[1] < -2 or b[0] + b[2] > w0 + 2 or b[1] + b[3] > h0 + 2:
                ok4 = False
                break
        chk("R4 bbox 合法且在画面内", ok4)
        chk("R5 kind ∈ 八类", all(o["kind"] in KINDS for o in out),
            str(sorted({o["kind"] for o in out})))
        chk("R6 score ∈ (0,1]", all(0 < o["score"] <= 1 for o in out))
        chk("R7 id 唯一", len({o["id"] for o in out}) == len(out))
        chk("R8 重复调用稳定",
            [(o["kind"], tuple(round(v, 3) for v in o["bbox"])) for o in out] ==
            [(o["kind"], tuple(round(v, 3) for v in o["bbox"])) for o in out2])
        print(f"       kinds={det.kinds} row_strip={det.row_strip} in_size={det.in_size}")
        cnt = {}
        for o in out:
            cnt[o["kind"]] = cnt.get(o["kind"], 0) + 1
        print("       counts=", dict(sorted(cnt.items())))
    print(f"GUI-DET-CONTRACT fails={fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
