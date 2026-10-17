#!/usr/bin/env python3
"""ys_ocr.py — 纯文件图像识别后端（文本通道 + 图标通道），**不碰屏幕**。

为什么单独一个文件：OCR 依赖装在专用 venv（`.scratch/gui-grounding/venv-rapidocr`），
不能污染系统 python；而 NCC 打分核复用 `ys_look._ncc_np`（与 daemon 同式），
所以本文件用 venv python 跑、输出 JSON 给 `tools/ys-find` 之类的系统侧工具消费。

用法（用 venv python 调）:
  .scratch/gui-grounding/venv-rapidocr/bin/python tools/ys-editor/ys_ocr.py \
      ocr   <图片> [--want 标签1,标签2] [--json]
  .scratch/gui-grounding/venv-rapidocr/bin/python tools/ys-editor/ys_ocr.py \
      match <图片> <模板.png> [--topk 3] [--json]

输出（--json）：{"channel":"text","image":…,"boxes":[{"text":…,"cx":…,"cy":…,"score":…,"box":[…]}],"ms":…}
             {"channel":"icon","image":…,"matches":[{"cx":…,"cy":…,"score":…}],"ms":…}

口径（2026-10-17 实测）：RapidOCR 在真实按钮裁区/全帧上中文标签 100% 字符命中，
全帧 2560×1440 冷启动 ~2.5s（含模型 init）。坐标是**框中心**，不是可点击点；
点击点由调用方按控件几何决定（见 tools/ys-find 的 --expect 对账）。
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def cmd_ocr(a):
    from rapidocr_onnxruntime import RapidOCR
    t0 = time.time()
    eng = RapidOCR()
    res, _ = eng(a.image)
    ms = int((time.time() - t0) * 1000)
    wants = [w for w in (a.want or '').split(',') if w]
    boxes = []
    for item in (res or []):
        box, txt, sc = item[0], item[1], float(item[2])
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        if wants and not any(w in txt for w in wants):
            continue
        boxes.append({'text': txt, 'cx': int(sum(xs) / len(xs)), 'cy': int(sum(ys) / len(ys)),
                      'score': round(sc, 4),
                      'box': [[int(p[0]), int(p[1])] for p in box]})
    out = {'channel': 'text', 'image': os.path.abspath(a.image), 'boxes': boxes, 'ms': ms,
           'n_total': len(res or [])}
    print(json.dumps(out, ensure_ascii=False) if a.json else
          '\n'.join('%-8s (%d,%d) %.2f' % (b['text'], b['cx'], b['cy'], b['score']) for b in boxes))
    return 0


def cmd_match(a):
    """模板匹配（fail-closed）：模板或图读不出就报错，绝不返回"大概在那儿"。"""
    import numpy as np
    from PIL import Image
    t0 = time.time()
    import ys_look
    I = np.asarray(Image.open(a.image).convert('RGB'), dtype=np.float32) / 255.0
    T = np.asarray(Image.open(a.tpl).convert('RGB'), dtype=np.float32) / 255.0
    if ys_look.MIN_STD is not None and float(T.std()) < ys_look.MIN_STD:
        print(json.dumps({'error': '模板方差过低（几乎纯色），拒绝匹配以免假命中',
                          'tpl_std': float(T.std())}, ensure_ascii=False))
        return 3
    h, w = T.shape[0], T.shape[1]
    matches, work = [], I
    for _ in range(max(1, a.topk)):
        try:
            x, y, sc, backend = ys_look._ncc_np(work, T)
        except RuntimeError as exc:
            print(json.dumps({'error': str(exc)}, ensure_ascii=False))
            return 3
        matches.append({'cx': int(x + w // 2), 'cy': int(y + h // 2),
                        'score': round(float(sc), 4), 'x': int(x), 'y': int(y),
                        'backend': backend})
        # top-k：把已找到位置周围抹平再找下一个，避免同一个峰重复返回
        y0, y1 = max(0, y - h // 2), min(work.shape[0], y + h + h // 2)
        x0, x1 = max(0, x - w // 2), min(work.shape[1], x + w + w // 2)
        work = work.copy()
        work[y0:y1, x0:x1, :] = work[y0:y1, x0:x1, :].mean(axis=(0, 1), keepdims=True)
    out = {'channel': 'icon', 'image': os.path.abspath(a.image), 'tpl': os.path.abspath(a.tpl),
           'matches': matches, 'ms': int((time.time() - t0) * 1000)}
    print(json.dumps(out, ensure_ascii=False) if a.json else
          '\n'.join('(%d,%d) %.4f' % (m['cx'], m['cy'], m['score']) for m in matches))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd')
    s1 = sub.add_parser('ocr')
    s1.add_argument('image')
    s1.add_argument('--want', default='')
    s1.add_argument('--json', action='store_true')
    s2 = sub.add_parser('match')
    s2.add_argument('image')
    s2.add_argument('tpl')
    s2.add_argument('--topk', type=int, default=3)
    s2.add_argument('--json', action='store_true')
    a = ap.parse_args(argv)
    if a.cmd == 'ocr':
        return cmd_ocr(a)
    if a.cmd == 'match':
        return cmd_match(a)
    ap.print_help()
    return 2


if __name__ == '__main__':
    sys.exit(main())
