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
_FORCE_CPU = False         # 推理期 CUDA 炸过（见 _infer）⇒ 本进程此后只用 CPU
_FALLBACK = None           # 回退原因（进回执，别让"降级"静默）

# 常驻服务（ys-lookd）的 socket：**同一台机器只该有一个 CUDA context**。
# 2026-10-22 实测：一次性进程冷启动要 11.7s/帧，daemon 热态 ~0.4s/帧（同机同帧差 20 倍），
# 而且每个新进程都要再占 500MB+ 显存 —— 在「原神 + 常驻服务」常态下正好把 6GB 挤爆。
# 所以默认**先问常驻服务**，拿不到才回退本地引擎（YS_OCR_LOCAL=1 可强制本地，排障用）。
LOOKD_SOCK = os.environ.get('YS_LOOKD_SOCK', '/run/user/%d/ys-lookd.sock' % os.getuid())
_MIN_FREE_MIB = int(os.environ.get('YS_OCR_MIN_FREE_MIB', '900'))

# ── CUDA 会话显存参数（2026-10-22 显存专项）───────────────────────────────
# 默认 `arena_extend_strategy=kNextPowerOfTwo`：要 200MiB 就先向驱动要 256MiB 再翻倍留白。
# 实测（3 会话 + 一次 2560×1440 全帧推理、独立进程、per-pid 读 nvidia-smi）：
#   base 852MiB → kSameAsRequested 644MiB（−24%），28 个框的文本指纹逐字相同。
# `gpu_mem_limit` 是**每会话硬顶**：要不到就抛错，而不是继续吃显存。
# 实测边界：256MiB 分配失败 / 384MiB 成功（det 输入 2000×1120 的默认路径）。
# 取 512 而不是 384：`det_max=2560/3000` 是**合法调用**（`cmd=ocr` 的 det_max 参数），
# 512 覆盖到 det≈2400px；**512 在 det_max=3000 上会显式报错**，不是静默降级。
# `YS_OCR_GPU_MEM_LIMIT_MIB=0` 恢复旧行为（排障/对照实验用）。
_GPU_MEM_LIMIT_MIB = int(os.environ.get('YS_OCR_GPU_MEM_LIMIT_MIB', '512'))


def _cuda_params():
    """RapidOCR/ORT 的 CUDA 会话参数（引擎与显存探针共用同一份实现）。"""
    params = {"EngineConfig.onnxruntime.use_cuda": True}
    if _GPU_MEM_LIMIT_MIB > 0:
        params["EngineConfig.onnxruntime.cuda_ep_cfg.arena_extend_strategy"] = "kSameAsRequested"
        params["EngineConfig.onnxruntime.cuda_ep_cfg.gpu_mem_limit"] = _GPU_MEM_LIMIT_MIB * 2 ** 20
    return params


def _free_vram_mib():
    """GPU 剩余显存（MiB）；查不到返回 None（不猜、不阻止）。"""
    try:
        import subprocess
        out = subprocess.run(['nvidia-smi', '--query-gpu=memory.free',
                              '--format=csv,noheader,nounits'],
                             capture_output=True, text=True, timeout=5)
        vals = [int(x) for x in out.stdout.split() if x.strip().isdigit()]
        return max(vals) if vals else None
    except Exception:                                  # noqa: BLE001
        return None


def _daemon_ocr(image, timeout=None, extra=None):
    """向常驻服务要一次 OCR（单一 CUDA context）。任何失败返回 None ⇒ 调用方回退本地。

    `extra` 是透传给服务的实验/排障参数（cache/pipeline/use_cls/det_max/region）：
    A/B 必须只改被测开关、其余全同，否则读数不可比。
    """
    if os.environ.get('YS_OCR_LOCAL') == '1':
        return None
    import socket
    if not os.path.exists(LOOKD_SOCK):
        return None
    timeout = float(os.environ.get('YS_OCR_DAEMON_TIMEOUT', '180')) if timeout is None else timeout
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect(LOOKD_SOCK)
        req = {'cmd': 'ocr', 'frame': os.path.abspath(image)}
        req.update(extra or {})
        s.sendall((json.dumps(req) + '\n').encode())
        buf = b''
        while not buf.endswith(b'\n'):
            chunk = s.recv(1 << 20)
            if not chunk:
                break
            buf += chunk
        s.close()
        resp = json.loads(buf.decode('utf-8') or '{}')
    except Exception:                                  # noqa: BLE001 —— 回退本地，别打死 CLI
        return None
    if resp.get('error') or not isinstance(resp.get('boxes'), list):
        return None
    return resp


def _enable_gpu():
    """按上文①②③三步把 CUDA EP 弄成"真能用"。返回 (ok, 说明)。

    任何一步失败都**不抛**：退回 CPU 继续跑（正确性一致），由调用方决定要不要出声。
    """
    global _GPU_STATE
    if _GPU_STATE is not None:
        return (_GPU_STATE is True), (_GPU_STATE if isinstance(_GPU_STATE, str) else '')
    if _FORCE_CPU:
        return False, (_GPU_STATE if isinstance(_GPU_STATE, str) else '')
    if os.environ.get('YS_OCR_CPU') == '1':
        _GPU_STATE = 'YS_OCR_CPU=1（显式走 CPU）'
        return False, _GPU_STATE
    # 显存预检（2026-10-22）：常态是"原神 + 常驻服务"已占掉大半 6GB。余量不足时
    # **直接走 CPU**，不要先建 context 再炸一次（炸的那次要白付 ~5s 且可能拖慢游戏）。
    _free = _free_vram_mib()
    if _free is not None and _free < _MIN_FREE_MIB:
        _GPU_STATE = '显存余量不足：free=%dMiB < %dMiB ⇒ 直接 CPU' % (_free, _MIN_FREE_MIB)
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
        _ENGINE = RapidOCR(params=_cuda_params() if ok else {})
    except ImportError:
        from rapidocr_onnxruntime import RapidOCR     # 2.x（venv）
        kw = {'det_use_cuda': True, 'cls_use_cuda': True, 'rec_use_cuda': True} if ok else {}
        _ENGINE = RapidOCR(**kw)
    if verbose:
        cap = (f"（gpu_mem_limit={_GPU_MEM_LIMIT_MIB}MiB/会话, arena=kSameAsRequested；"
               f"验证到 det_max≈2400，det_max=3000 会显式报错）") if ok and _GPU_MEM_LIMIT_MIB > 0 else ""
        sys.stderr.write(f"[ys_ocr] 引擎={'CUDA' if ok else 'CPU'}{('（' + why + '）') if why else ''}{cap}\n")
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


def _cuda_failure(exc):
    s = ('%s: %s' % (type(exc).__name__, exc)).lower()
    return any(k in s for k in ('cudnn', 'cuda', 'onnxruntime', 'onnxruntimeerror'))


def _infer(img, verbose=False):
    """一次推理；**CUDA 在推理期炸就重建 CPU 引擎重试一次**。

    为什么"探测通过"不够（2026-10-22 实测）：`_enable_gpu()` 只证明 provider 注册成功；
    显存吃紧时 `cudnnCreate` 会在**第一次 run** 抛 `CUDNN_STATUS_INTERNAL_ERROR`
    （实测 GPU 5166/6144 MiB，游戏与常驻守护都占着显存）。那时整条 OCR 链直接抛异常，
    上游 `ys-slider` / `ys-brief` 两个门禁因此恒红——而 CPU 通道结果**完全正确**
    （同一帧 value_max=100、拖拽目标 x=1584 都能读出来）。
    所以：**能用 GPU 就用，GPU 在跑的时候炸了就降级，并且把降级原因写进回执**
    （静默降级是明令禁止的失能形态）。
    """
    global _ENGINE, _GPU_STATE, _FORCE_CPU, _FALLBACK
    eng = _engine(verbose=verbose)
    try:
        return _normalize(eng(img))
    except Exception as exc:                                  # noqa: BLE001
        if _GPU_STATE is not True or not _cuda_failure(exc):
            raise
        # ONNX 的异常串是多行 traceback，第一行只是 "Traceback..."；要挑出**真正的判据行**
        lines = [ln.strip() for ln in str(exc).splitlines() if ln.strip()]
        pick = next((ln for ln in reversed(lines)
                     if 'cudnn' in ln.lower() or 'cuda_' in ln.lower()), None)
        _FALLBACK = '%s: %s' % (type(exc).__name__, (pick or (lines[-1] if lines else ''))[:200])
        _GPU_STATE = '推理期 CUDA 失败 ⇒ 回退 CPU（%s）' % _FALLBACK
        _FORCE_CPU = True
        _ENGINE = None
        sys.stderr.write('[ys_ocr] %s\n' % _GPU_STATE)
        return _normalize(_engine(verbose=verbose)(img))


def cmd_ocr(a):
    """OCR 一帧：**优先常驻服务**（单一 CUDA context），拿不到才用本地引擎。

    输出形状与字段保持不变（`boxes/n_total/ms/engine/gpu_note/fallback`），
    新增 `via` 标明这次走的哪条通道——"通过"必须带条件，否则读的人分不清
    热引擎还是冷启动（两者差 20 倍，见文件头注释）。
    """
    t0 = time.time()
    wants = [w for w in (a.want or '').split(',') if w]
    via = 'local'
    gt_note = _GPU_STATE if isinstance(_GPU_STATE, str) else None
    fb = _FALLBACK
    engine = 'cuda' if _GPU_STATE is True else 'cpu'

    timing = None
    cached = None
    pipeline = None
    extra = {}
    if a.no_cache:
        extra['cache'] = False
    if a.pipeline:
        extra['pipeline'] = a.pipeline
    if a.use_cls is not None:
        extra['use_cls'] = bool(a.use_cls)
    if a.det_max:
        extra['det_max'] = int(a.det_max)
    if a.region:
        extra['region'] = [int(v) for v in a.region]
    resp = _daemon_ocr(a.image, extra=extra)
    if resp is not None:
        boxes = [dict(b) for b in resp['boxes'] if isinstance(b, dict)]
        n_total = int(resp.get('n_total') or len(boxes))
        # 常驻服务如实报**它自己的引擎**（cuda/cpu）。以前这里写死 'daemon'，
        # 于是"守护其实掉到 CPU 了"在回执里看不出来——显存预检把守护切成 CPU 时，
        # 客户端只会看到 via=daemon、一切正常，延迟却是 3 倍。老版本守护没这个字段 ⇒ 回退 'daemon'。
        via, engine, gt_note, fb = 'daemon', (resp.get('engine') or 'daemon'), None, None
        timing = resp.get('timing')
        cached = resp.get('cached')
        pipeline = resp.get('pipeline')
    else:
        items = _infer(a.image, verbose=True)
        n_total = len(items)
        boxes = []
        for box, txt, sc in items:
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            boxes.append({'text': txt, 'cx': int(sum(xs) / len(xs)),
                          'cy': int(sum(ys) / len(ys)), 'score': round(sc, 4),
                          'box': [[int(p[0]), int(p[1])] for p in box]})
        engine = 'cuda' if _GPU_STATE is True else 'cpu'
        gt_note = _GPU_STATE if isinstance(_GPU_STATE, str) else None
        fb = _FALLBACK
    if wants:
        boxes = [b for b in boxes if any(w in str(b.get('text') or '') for w in wants)]
    ms = int((time.time() - t0) * 1000)
    out = {'channel': 'text', 'image': os.path.abspath(a.image), 'boxes': boxes, 'ms': ms,
           'n_total': n_total, 'engine': engine, 'via': via,
           'gpu_note': gt_note, 'fallback': fb,
           # 分阶段读数/缓存命中：没有它就只能看到"总 ms"，看不出是解码、det 还是 rec 慢
           'timing': timing, 'cached': cached, 'pipeline': pipeline}
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
    # 性能排障/对照实验（只在走常驻服务时生效；本地引擎忽略这些）
    s1.add_argument('--no-cache', dest='no_cache', action='store_true',
                    help='禁用服务端帧级缓存（量"每次真推理"的耗时）')
    s1.add_argument('--pipeline', choices=['plain', 'buckets'], default=None,
                    help='plain=整体引擎调用；buckets=det 一次+按行宽分桶并行 rec（更快，文本可能略有差异）')
    s1.add_argument('--use-cls', dest='use_cls', action='store_true', default=None)
    s1.add_argument('--no-cls', dest='use_cls', action='store_false')
    s1.add_argument('--det-max', dest='det_max', type=int, default=0)
    s1.add_argument('--region', nargs=4, type=int, default=None, metavar=('X', 'Y', 'W', 'H'))
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
