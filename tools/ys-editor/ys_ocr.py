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

**GPU 加速（2026-10-18 实测：单帧 3673ms → 528ms，7×）**
本机是 RTX 3060；`onnxruntime-cuda`(1.29) + `cudnn 9` 由 pacman 装在系统 python。
但让 RapidOCR 真用上 CUDA 需要**同时**满足三个非显然条件，缺一个就**静默退回 CPU**
（只留一行容易被忽略的 warning）：
  ① 先 `ctypes.CDLL('/usr/lib/libcudnn.so.9', RTLD_GLOBAL)` 把 cuDNN 链进进程，
     否则 ORT 加载 provider 时报 `undefined symbol: cudnnGetConvolutionBackwardDataAlgorithm_v7`；
  ② `register_execution_provider_library('CUDAExecutionProvider', <capi>/libonnxruntime_providers_cuda.so)`
     —— ORT 1.29 把 CUDA EP 拆成独立 so，光有包不会自动注册；
  ③ `ort.get_device()` 在本机返回 **`'GPU-DNNL'`**（装了 DnnlExecutionProvider），
     而 RapidOCR 3.10 的判断是 `get_device() == "GPU"` ⇒ 永远为假。
     这是 RapidOCR 的 bug，本文件用一行 monkey-patch 绕过；升级 RapidOCR 后应重验这一条。
  `YS_OCR_CPU=1` 可强制走 CPU（对照实验/排障用）。
  ⚠️ 与 `onnxruntime-gpu`(pip) 那套**不要混装**：两者抢同一个 `onnxruntime` 包名。
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_ENGINE = None
_GPU_STATE = None          # None=未探测 / True=GPU / False=CPU / str=失败原因


def _enable_gpu():
    """按上文①②③三步把 CUDA EP 弄成"真能用"。返回 (ok, 说明)。

    任何一步失败都**不抛**：退回 CPU 继续跑（正确性一致），由调用方决定要不要出声。
    """
    global _GPU_STATE
    if _GPU_STATE is not None:
        return (_GPU_STATE is True), (_GPU_STATE if isinstance(_GPU_STATE, str) else '')
    if os.environ.get('YS_OCR_CPU') == '1':
        _GPU_STATE = 'YS_OCR_CPU=1（显式走 CPU）'
        return False, _GPU_STATE
    try:
        import ctypes
        import ctypes.util
        # ① cuDNN 必须先链进进程（Arch 的 cudnn9 与 ORT 1.29 的符号解析顺序问题）
        path = ctypes.util.find_library('cudnn') or '/usr/lib/libcudnn.so.9'
        try:
            ctypes.CDLL(path, mode=ctypes.RTLD_GLOBAL)
        except OSError:
            ctypes.CDLL('/usr/lib/libcudnn.so.9', mode=ctypes.RTLD_GLOBAL)
        import onnxruntime as ort
        # ② ORT ≥1.29 的 CUDA EP 是独立 so，必须显式注册
        capi = os.path.join(os.path.dirname(ort.__file__), 'capi')
        cuda_so = os.path.join(capi, 'libonnxruntime_providers_cuda.so')
        if os.path.exists(cuda_so):
            try:
                ort.register_execution_provider_library('CUDAExecutionProvider', cuda_so)
            except Exception:                      # noqa: BLE001 —— 已注册过就继续
                pass
        if 'CUDAExecutionProvider' not in ort.get_available_providers():
            _GPU_STATE = 'CUDAExecutionProvider 不在 available providers'
            return False, _GPU_STATE
        # ③ RapidOCR 3.10 的 `get_device() == "GPU"` 在本机恒为假（实际返回 'GPU-DNNL'）
        if ort.get_device() != 'GPU':
            ort.get_device = lambda: 'GPU'
        _GPU_STATE = True
        return True, ''
    except Exception as e:                         # noqa: BLE001
        _GPU_STATE = f"{type(e).__name__}: {e}"
        return False, _GPU_STATE


def _engine(verbose=False):
    """进程内复用同一份引擎（模型加载只付一次）。"""
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE
    ok, why = _enable_gpu()
    # 两套包名都要认：系统 pacman 包叫 `rapidocr`(3.10，params API)，
    # 老的 venv 里叫 `rapidocr_onnxruntime`(2.x，**只有 kwargs API**)。两者的 CUDA 开关不同。
    try:
        from rapidocr import RapidOCR          # 3.x
        _ENGINE = RapidOCR(params={"EngineConfig.onnxruntime.use_cuda": True} if ok else {})
    except ImportError:
        from rapidocr_onnxruntime import RapidOCR     # 2.x（venv）
        kw = {'det_use_cuda': True, 'cls_use_cuda': True, 'rec_use_cuda': True} if ok else {}
        _ENGINE = RapidOCR(**kw)
    if verbose:
        sys.stderr.write(f"[ys_ocr] 引擎={'CUDA' if ok else 'CPU'}{('（' + why + '）') if why else ''}\n")
    return _ENGINE


def _normalize(result):
    """把两代 RapidOCR 的输出统一成 [(box, txt, score)]。

    2.x (`rapidocr_onnxruntime`)：`eng(img)` 返回 `(list_of_[box,txt,score], elapse)`。
    3.x (`rapidocr`)：返回 `RapidOCROutput`，字段 `boxes`(ndarray N×4×2)/`txts`/`scores`，
         **不能再按元组解包**（`TypeError: cannot unpack non-iterable RapidOCROutput`）。
    两代归一，调用方只认一种形状。
    """
    if isinstance(result, tuple) and len(result) == 2 and isinstance(result[0], (list, tuple)):
        return [(it[0], it[1], float(it[2])) for it in (result[0] or [])]
    boxes = getattr(result, 'boxes', None)
    txts = getattr(result, 'txts', None) or ()
    scores = getattr(result, 'scores', None) or ()
    out = []
    for i, b in enumerate(boxes if boxes is not None else []):
        pts = b.tolist() if hasattr(b, 'tolist') else b
        out.append((pts, txts[i] if i < len(txts) else '',
                    float(scores[i]) if i < len(scores) else 0.0))
    return out


def cmd_ocr(a):
    eng = _engine(verbose=True)
    t0 = time.time()
    items = _normalize(eng(a.image))
    ms = int((time.time() - t0) * 1000)
    wants = [w for w in (a.want or '').split(',') if w]
    boxes = []
    for box, txt, sc in items:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        if wants and not any(w in txt for w in wants):
            continue
        boxes.append({'text': txt, 'cx': int(sum(xs) / len(xs)), 'cy': int(sum(ys) / len(ys)),
                      'score': round(sc, 4),
                      'box': [[int(p[0]), int(p[1])] for p in box]})
    out = {'channel': 'text', 'image': os.path.abspath(a.image), 'boxes': boxes, 'ms': ms,
           'n_total': len(items),
           'engine': 'cuda' if _GPU_STATE is True else 'cpu'}
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
