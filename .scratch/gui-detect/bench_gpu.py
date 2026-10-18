#!/usr/bin/env python3
"""bench_gpu.py — 票 24 的**对象检测候选路线基准台**（只读本机已装件；不下载、不安装）。

为什么要有它：AGI-BAR 口径 1/2 要求「单帧检测 ≤10ms（GPU）」与「走学习型检测」，
而"GPU 上很快"是**断言不是读数**——2026-10-18 实测：ort 1.29 的 CUDA EP 缺失依赖时
**不报错，只打一行 warning 然后静默回落 CPU**（`Failed to create CUDAExecutionProvider …
Require cuDNN 9.* and CUDA 13.*`），会话照常跑。所以本台子对每条路线都**强制打印真实 device/provider**，
拿不到 GPU 就明确写 CPU 而不是假装。

跑法（在**能看见 GPU** 的会话里跑；本脚本自己会检测并打印环境）：
  python3 .scratch/gui-detect/bench_gpu.py                # 默认 640², 50 iter
  python3 .scratch/gui-detect/bench_gpu.py --size 640 --iters 50 --out .scratch/gui-detect/bench-gpu.json
  python3 .scratch/gui-detect/bench_gpu.py --bench unet|ort|yolo|cold --yolo-weights path/to.pt

输出：人读表格 + `--out` JSON（每项含 device/provider 证据，可复算）。
退出码：0 跑完（含"没 GPU 就只跑 CPU"）；2 用法错；4 某条路线**声称用了 GPU 实际没起**（fail-closed）。
"""
import argparse
import json
import os
import platform
import statistics
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DEFAULT = os.path.join(HERE, 'bench-gpu.json')

# 本机已有的 .onnx（不下载；取到几个就测几个）
ONNX_CANDIDATES = [
    '/home/h/.cache/uv/archive-v0/wtUjtuyTQ3HTOYcT/rapidocr_onnxruntime/models/ch_PP-OCRv4_det_infer.onnx',
    '/home/h/.cache/uv/archive-v0/wtUjtuyTQ3HTOYcT/rapidocr_onnxruntime/models/ch_PP-OCRv4_rec_infer.onnx',
    '/home/h/.cache/uv/archive-v0/G5UoKHw0urLbO-aQ/faster_whisper/assets/silero_vad_v6.onnx',
]


# ---------------------------------------------------------------- 环境
def env_probe():
    info = {}
    devs = sorted([p for p in os.listdir('/dev') if p.startswith('nvidia')])
    info['dev_nvidia_nodes'] = devs
    try:
        info['nvidia_smi_L'] = subprocess.run(['nvidia-smi', '-L'], capture_output=True,
                                              text=True, timeout=10).stdout.strip()
    except Exception as exc:                                    # noqa: BLE001
        info['nvidia_smi_L'] = 'FAIL: %s' % exc
    try:
        import torch
        info['torch'] = torch.__version__
        info['torch_cuda_build'] = torch.version.cuda
        info['torch_cuda_available'] = bool(torch.cuda.is_available())
        info['torch_device_count'] = torch.cuda.device_count()
        if info['torch_cuda_available']:
            info['torch_device_name'] = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            info['torch_vram_mb'] = round(props.total_memory / 2 ** 20)
            info['torch_capability'] = '%d.%d' % (props.major, props.minor)
        info['torch_cudnn'] = torch.backends.cudnn.version()
    except Exception as exc:                                    # noqa: BLE001
        info['torch'] = 'FAIL: %s' % exc
    try:
        import onnxruntime as ort
        info['onnxruntime'] = ort.__version__
        info['ort_providers_available'] = ort.get_available_providers()
    except Exception as exc:                                    # noqa: BLE001
        info['onnxruntime'] = 'FAIL: %s' % exc
    info['python'] = platform.python_version()
    info['cpu_count'] = os.cpu_count()
    return info


# ---------------------------------------------------------------- U-Net（轻量检测/分割网络的代表）
def build_unet(base=16, depth=4):
    """标准 U-Net（3x3 conv + ReLU，depth 次 2x 下采样 + 对称上采样 + skip concat）。"""
    import torch
    import torch.nn as nn

    def block(cin, cout):
        return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1), nn.ReLU(inplace=True),
                             nn.Conv2d(cout, cout, 3, padding=1), nn.ReLU(inplace=True))

    class UNet(nn.Module):
        def __init__(self):
            super().__init__()
            chans = [base * (2 ** i) for i in range(depth + 1)]
            self.chans = chans
            self.enc = nn.ModuleList()
            cin = 3
            for c in chans[:-1]:
                self.enc.append(block(cin, c))
                cin = c
            self.bottleneck = block(chans[-2], chans[-1])
            self.up = nn.ModuleList()
            self.dec = nn.ModuleList()
            for i in reversed(range(depth)):
                self.up.append(nn.ConvTranspose2d(chans[i + 1], chans[i], 2, 2))
                self.dec.append(block(chans[i] * 2, chans[i]))
            self.head = nn.Conv2d(chans[0], 5, 1)
            self.pool = nn.MaxPool2d(2)

        def forward(self, x):
            skips = []
            for e in self.enc:
                x = e(x)
                skips.append(x)
                x = self.pool(x)
            x = self.bottleneck(x)
            for i in range(depth):
                x = self.up[i](x)
                x = torch.cat([x, skips[depth - 1 - i]], dim=1)
                x = self.dec[i](x)
            return self.head(x)

    return UNet()


def count_flops(model, size):
    """前向一次、用 hook 累加每个 conv 的 2*k*k*Cin/groups*Cout*H_out*W_out（精确，不靠手推形状）。"""
    import torch
    import torch.nn as nn
    total = {'flops': 0.0}

    def hook(mod, inp, out):
        k = mod.kernel_size[0] * mod.kernel_size[1]
        cin = mod.in_channels // getattr(mod, 'groups', 1)
        cout = mod.out_channels
        total['flops'] += 2.0 * k * cin * cout * out.shape[-2] * out.shape[-1]

    hs = []
    for mod in model.modules():
        if isinstance(mod, (nn.Conv2d, nn.ConvTranspose2d)):
            hs.append(mod.register_forward_hook(hook))
    was = next(model.parameters()).requires_grad
    with torch.no_grad():
        model.eval()(torch.zeros(1, 3, size, size))
    for h in hs:
        h.remove()
    return total['flops'] / 1e9


def time_calls(fn, iters, warmup, sync=False):
    for _ in range(warmup):
        fn()
    if sync:
        import torch
        torch.cuda.synchronize()
    ts = []
    for _ in range(iters):
        if sync:
            torch.cuda.synchronize()
        t0 = time.perf_counter()
        fn()
        if sync:
            torch.cuda.synchronize()
        ts.append((time.perf_counter() - t0) * 1000.0)
    return statistics.median(ts), min(ts)


def bench_unet(size, iters, warmup, bases=('8', '12', '16')):
    import torch
    res = {'size': size, 'runs': []}
    for base_s in bases:
        _bench_one_unet(res, size, iters, warmup, int(base_s))
    return res


def _bench_one_unet(res, size, iters, warmup, base):
    import torch
    model = build_unet(base=base)
    gflop = count_flops(model, size)
    res['model'] = res.get('model') or 'unet(base=%d..,depth=4)@%d' % (base, size)
    res.setdefault('gflop_by_base', {})[str(base)] = round(gflop, 2)
    res['gflop'] = round(gflop, 2)
    x = torch.randn(1, 3, size, size)

    cases = [('cpu', 'fp32', None)]
    if torch.cuda.is_available():
        cases += [('cuda', 'fp32', None), ('cuda', 'fp16', None)]
    for dev, dtype, _ in cases:
        try:
            m = model.to(dev)
            xx = x.to(dev)
            if dtype == 'fp16':
                m = m.half()
                xx = xx.half()
            else:
                m = m.float()
                xx = xx.float()
            m.eval()

            def call(m=m, xx=xx):
                with torch.no_grad():
                    return m(xx)
            med, best = time_calls(call, iters, warmup, sync=(dev == 'cuda'))
            row = {'base': base, 'device': dev, 'dtype': dtype, 'median_ms': round(med, 2),
                   'min_ms': round(best, 2), 'gflops': round(gflop / (med / 1000.0), 1),
                   'ms_at_9p3_gflop': round(med * 9.3 / gflop, 2) if gflop else None}
            res['runs'].append(row)
        except Exception as exc:                                # noqa: BLE001
            res['runs'].append({'base': base, 'device': dev, 'dtype': dtype,
                                'error': str(exc)[:300]})


# ---------------------------------------------------------------- onnxruntime EP
def bench_ort(size, iters, warmup):
    import onnxruntime as ort
    import numpy as np
    out = {'runs': []}
    models = [p for p in ONNX_CANDIDATES if os.path.exists(p)]
    out['models_found'] = models
    for path in models:
        base = os.path.basename(path)
        dims = None   # 输入形状从 session 自己读（不需要 onnx 包）
        for eps, tag in (('cpu', ['CPUExecutionProvider']),
                         ('cuda', ['CUDAExecutionProvider', 'CPUExecutionProvider'])):
            if tag[0] == 'CUDAExecutionProvider' and 'CUDAExecutionProvider' not in ort.get_available_providers():
                continue
            try:
                so = ort.SessionOptions()
                so.log_severity_level = 3
                t0 = time.perf_counter()
                sess = ort.InferenceSession(path, sess_options=so, providers=tag)
                load_ms = (time.perf_counter() - t0) * 1000
                actual = sess.get_providers()
                real_gpu = 'CUDAExecutionProvider' in actual
                inp = sess.get_inputs()[0]
                name = inp.name
                shape = [d if isinstance(d, int) and d > 0 else 1 for d in inp.shape]
                arr = np.random.rand(*shape).astype(np.float32)
                for _ in range(warmup):
                    sess.run(None, {name: arr})
                ts = []
                for _ in range(iters):
                    t1 = time.perf_counter()
                    sess.run(None, {name: arr})
                    ts.append((time.perf_counter() - t1) * 1000)
                out['runs'].append({'model': base, 'requested': eps, 'actual_providers': actual,
                                    'gpu_active': real_gpu, 'load_ms': round(load_ms),
                                    'median_ms': round(statistics.median(ts), 2),
                                    'min_ms': round(min(ts), 2), 'input': shape})
            except Exception as exc:                            # noqa: BLE001
                out['runs'].append({'model': base, 'requested': eps, 'error': str(exc)[:400]})
    return out



def build_cnn_proxy(base=16, strides=(2, 2, 2, 2, 2)):
    """YOLO 类检测器规模代表：5 次 stride-2 3x3（640→20）+ 两个 head conv。**随机权重，只测算力**。"""
    import torch
    import torch.nn as nn

    class Proxy(nn.Module):
        def __init__(self):
            super().__init__()
            chs = [3] + [base * (2 ** i) for i in range(4)] + [base * 16]
            layers = []
            for i in range(len(chs) - 1):
                layers += [nn.Conv2d(chs[i], chs[i + 1], 3, stride=strides[i] if i < len(strides) else 1,
                                     padding=1, bias=False), nn.BatchNorm2d(chs[i + 1]), nn.ReLU(inplace=True)]
            self.backbone = nn.Sequential(*layers)
            self.head = nn.Sequential(nn.Conv2d(chs[-1], base * 8, 1), nn.ReLU(inplace=True),
                                      nn.Conv2d(base * 8, 4 + 1 + 80, 1))   # YOLO 输出头形态（4+1+80）

        def forward(self, x):
            return self.head(self.backbone(x))

    return Proxy()


def bench_proxy(size, iters, warmup, bases=('16', '24')):
    """检测器规模对照：报 GFLOP、ms、以及折算到 YOLO11n(≈2.6 GFLOP@640) 的 ms。"""
    import torch
    res = {'size': size, 'runs': [], 'gflop_by_base': {}}
    for base_s in bases:
        base = int(base_s)
        model = build_cnn_proxy(base)
        gflop = count_flops(model, size)
        res['gflop_by_base'][base_s] = round(gflop, 2)
        x = torch.randn(1, 3, size, size)
        cases = [('cpu', 'fp32', False)]
        if torch.cuda.is_available():
            cases += [('cuda', 'fp32', True), ('cuda', 'fp16', True)]
        for dev, dtype, sync in cases:
            try:
                m = model.to(dev)
                xx = x.to(dev)
                if dtype == 'fp16':
                    m, xx = m.half(), xx.half()
                m.eval()

                def call(m=m, xx=xx):
                    with torch.no_grad():
                        return m(xx)
                med, best = time_calls(call, iters, warmup, sync=sync)
                res['runs'].append({'base': base, 'device': dev, 'dtype': dtype,
                                    'median_ms': round(med, 2), 'min_ms': round(best, 2),
                                    'gflops': round(gflop / (med / 1000.0), 1),
                                    'ms_at_2p6_gflop': round(med * 2.6 / gflop, 2) if gflop else None})
            except Exception as exc:                            # noqa: BLE001
                res['runs'].append({'base': base, 'device': dev, 'dtype': dtype,
                                    'error': str(exc)[:300]})
    return res


def bench_yolo(weights, iters, warmup):
    out = {'runs': []}
    try:
        from ultralytics import YOLO
    except Exception as exc:                                    # noqa: BLE001
        out['skip'] = 'ultralytics 未安装（%s）——装包需用户授权' % str(exc)[:120]
        return out
    if not weights or not os.path.exists(weights):
        out['skip'] = '缺权重文件（--yolo-weights）；下权重需用户授权'
        return out
    try:
        import numpy as np
        m = YOLO(weights)
        names = list(m.names.values())[:8]
        img = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
        for _ in range(warmup):
            m.predict(img, verbose=False)
        ts = []
        for _ in range(iters):
            t0 = time.perf_counter()
            m.predict(img, verbose=False)
            ts.append((time.perf_counter() - t0) * 1000)
        out['runs'].append({'weights': os.path.basename(weights), 'classes': names,
                            'device': getattr(m, 'device', '?'),
                            'median_ms': round(statistics.median(ts), 2),
                            'min_ms': round(min(ts), 2)})
    except Exception as exc:                                    # noqa: BLE001
        out['runs'].append({'error': str(exc)[:400]})
    return out


# ---------------------------------------------------------------- 冷启动
def bench_cold():
    def t(code):
        t0 = time.perf_counter()
        r = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True)
        return {'ms': round((time.perf_counter() - t0) * 1000), 'rc': r.returncode,
                'err': (r.stderr or '').strip().splitlines()[-1][:200] if r.returncode else ''}
    png = os.path.join(ROOT, '.scratch', 'gui-corpus', 'f06.png')
    return {
        'import_numpy': t('import numpy'),
        'import_cv2': t('import cv2'),
        'imread_1440p_png': t('import cv2,time;t=time.perf_counter();cv2.imread(%r);print((time.perf_counter()-t)*1000)' % png),
        'import_onnxruntime': t('import onnxruntime'),
        'import_torch': t('import torch'),
    }


def fmt_table(env, unet, ort_res, yolo, cold, proxy=None):
    L = []
    L.append('## 环境读数\n')
    for k, v in env.items():
        L.append('- `%s` = %s' % (k, v))
    if unet:
        L.append('\n## U-Net（%s，%.2f GFLOP/帧）\n' % (unet['model'], unet['gflop']))
        L.append('| base | GFLOP | device | dtype | median ms | min ms | 有效 GFLOP/s | 折算 9.3GFLOP 的 ms |')
        L.append('|---|---|---|---|---|---|---|---|')
        for r in unet['runs']:
            if 'error' in r:
                L.append('| %s | %s | %s | %s | ERROR: %s | | | |'
                         % (r['base'], unet['gflop_by_base'].get(str(r['base']), '?'),
                            r['device'], r['dtype'], r['error'][:60]))
            else:
                L.append('| %s | %s | %s | %s | **%.2f** | %.2f | %.1f | %s |'
                         % (r['base'], unet['gflop_by_base'].get(str(r['base']), '?'),
                            r['device'], r['dtype'], r['median_ms'], r['min_ms'], r['gflops'],
                            r['ms_at_9p3_gflop']))
    if proxy:
        L.append('\n## 检测器规模对照（YOLO11n ≈2.6 GFLOP@640，随机权重只测算力）\n')
        L.append('| base | GFLOP | device | dtype | median ms | min ms | 有效 GFLOP/s | 折算 2.6GFLOP 的 ms |')
        L.append('|---|---|---|---|---|---|---|---|')
        for r in proxy['runs']:
            if 'error' in r:
                L.append('| %s | %s | %s | %s | ERROR: %s | | | |'
                         % (r['base'], proxy['gflop_by_base'].get(str(r['base']), '?'),
                            r['device'], r['dtype'], r['error'][:60]))
            else:
                L.append('| %s | %s | %s | %s | **%.2f** | %.2f | %.1f | %s |'
                         % (r['base'], proxy['gflop_by_base'].get(str(r['base']), '?'),
                            r['device'], r['dtype'], r['median_ms'], r['min_ms'], r['gflops'],
                            r['ms_at_2p6_gflop']))
    if ort_res:
        L.append('\n## onnxruntime（本机已有权重，1 次前向）\n')
        L.append('| 模型 | 请求 EP | 实际 providers | GPU 真起 | load ms | median ms |')
        L.append('|---|---|---|---|---|---|')
        for r in ort_res.get('runs', []):
            if 'error' in r:
                L.append('| %s | %s | ERROR: %s | | | |' % (r.get('model'), r.get('requested'), r['error'][:60]))
            else:
                L.append('| %s | %s | %s | %s | %s | **%s** |'
                         % (r['model'], r['requested'], ','.join(r['actual_providers']),
                            'YES' if r['gpu_active'] else 'NO', r['load_ms'], r['median_ms']))
    if yolo:
        L.append('\n## YOLO\n')
        L.append(json.dumps(yolo, ensure_ascii=False, indent=1))
    if cold:
        L.append('\n## 冷启动（每进程一次，不计入单帧预算但决定"要不要常驻"）\n')
        L.append('| 项 | ms | rc |')
        L.append('|---|---|---|')
        for k, v in cold.items():
            L.append('| %s | %s | %s |' % (k, v['ms'], v['rc']))
    return '\n'.join(L)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=640)
    ap.add_argument('--iters', type=int, default=50)
    ap.add_argument('--warmup', type=int, default=10)
    ap.add_argument('--bench', default='all',
                    choices=['all', 'unet', 'proxy', 'ort', 'yolo', 'cold'])
    ap.add_argument('--proxy-bases', default='16,24', help='检测器规模对照的宽度（FLOPs∝base²）')
    ap.add_argument('--yolo-weights', default=None)
    ap.add_argument('--unet-bases', default='8,12,16', help='逗号分隔的 U-Net 宽度（FLOPs∝base²）')
    ap.add_argument('--out', default=OUT_DEFAULT)
    a = ap.parse_args(argv)

    env = env_probe()
    res = {'env': env, 'args': vars(a)}
    gpu_claims_failed = False
    do = (lambda k: a.bench in ('all', k))
    if do('unet'):
        res['unet'] = bench_unet(a.size, a.iters, a.warmup, a.unet_bases.split(','))
    if do('proxy'):
        res['proxy'] = bench_proxy(a.size, a.iters, a.warmup, a.proxy_bases.split(','))
    if do('ort'):
        res['ort'] = bench_ort(a.size, a.iters, a.warmup)
        for r in res['ort'].get('runs', []):
            if r.get('requested') == 'cuda' and not r.get('gpu_active') and 'error' not in r:
                gpu_claims_failed = True
    if do('yolo'):
        res['yolo'] = bench_yolo(a.yolo_weights, a.iters, a.warmup)
    if do('cold'):
        res['cold'] = bench_cold()
    print(fmt_table(env, res.get('unet'), res.get('ort'), res.get('yolo'), res.get('cold'),
                    res.get('proxy')))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print('\nJSON-OUT %s' % a.out)
    if gpu_claims_failed:
        print('FAIL-CLOSED：请求 CUDA EP 但实际 provider 里没有 CUDA ⇒ 这份"GPU 数字"是 CPU 冒充的', file=sys.stderr)
        return 4
    return 0


if __name__ == '__main__':
    sys.exit(main())
