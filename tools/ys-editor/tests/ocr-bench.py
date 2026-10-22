#!/usr/bin/env python3
"""ocr-bench.py — 固定帧 OCR 基准（同口径：同帧 / 同机 / 同并发）。

为什么单列一个脚本：D502 之后 OCR 有两条通道（`via=daemon` 常驻服务 / `via=local`
本进程引擎）和两种引擎（`engine=cuda|cpu`），**热态与冷启动差 20 倍**。没有同口径
前后数字的"优化"不算优化，所以基准必须同时记录：RPC 往返、daemon 自报耗时、通道、
引擎、显存余量。冷启动（daemon 重启后的第一次）**单独一档**，不许混进热态分位。

用法：
  python3 tools/ys-editor/tests/ocr-bench.py                     # 默认 f06.png × 12 次，daemon RPC
  python3 tools/ys-editor/tests/ocr-bench.py --runs 15 --mode cli # 连客户端进程启动一起量
  python3 tools/ys-editor/tests/ocr-bench.py --mode world         # 量 cmd=world（look 的主通道）
  python3 tools/ys-editor/tests/ocr-bench.py --pipeline buckets --no-cache   # 只量算力通道
  python3 tools/ys-editor/tests/ocr-bench.py --pipeline plain  --cache      # 缓存稳态
  python3 tools/ys-editor/tests/ocr-bench.py --json               # 机读

输出：每次一行 `#i via=… engine=… rpc_ms=… daemon_ms=… free_mib=…`，末尾 p50/p95。
判据（2026-10-22 交付门槛）：固定帧热态 p50 ≤250ms（mode=daemon / cli 均量）。
"""
import argparse
import json
import os
import socket
import statistics
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
YS_EDITOR = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(YS_EDITOR))
DEFAULT_FRAME = os.path.join(ROOT, '.scratch', 'gui-corpus', 'f06.png')
SOCK = os.environ.get('YS_LOOKD_SOCK', '/run/user/%d/ys-lookd.sock' % os.getuid())


def free_mib():
    """GPU 剩余显存（MiB）+ 当前 SM 时钟（MHz）。查不到返回 (None, None)。

    为什么同时记时钟：2026-10-22 实测这台机 pin 在 855MHz（max 2100），
    同一段代码在 2100MHz 与 855MHz 下的读数不可比（D497）。不记时钟的分位会被误读成回归。
    """
    try:
        out = subprocess.run(['nvidia-smi',
                              '--query-gpu=memory.free,clocks.sm,utilization.gpu',
                              '--format=csv,noheader,nounits'],
                             capture_output=True, text=True, timeout=5)
        vals = [int(x) for x in out.stdout.replace(',', ' ').split() if x.strip().isdigit()]
        return (vals[0] if vals else None), (vals[1] if len(vals) > 1 else None)
    except Exception:                                   # noqa: BLE001
        return None, None


def rpc(req, timeout=180.0):
    """一次 daemon 往返。返回 (resp_dict, rpc_wall_ms)。"""
    t0 = time.time()
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    s.connect(SOCK)
    s.sendall((json.dumps(req) + '\n').encode())
    buf = b''
    while not buf.endswith(b'\n'):
        chunk = s.recv(1 << 20)
        if not chunk:
            break
        buf += chunk
    s.close()
    return json.loads(buf.decode('utf-8') or '{}'), (time.time() - t0) * 1000.0


def one(mode, frame, pipeline=None, cache=False):
    """跑一次；返回 dict(rpc_ms, daemon_ms, via, engine, free_mib, extra)。"""
    req = {'cmd': 'world', 'frame': os.path.abspath(frame), 'ocr': True, 'objects': True} \
        if mode == 'world' else {'cmd': 'ocr', 'frame': os.path.abspath(frame)}
    if mode != 'world':
        req['cache'] = bool(cache)
        if pipeline:
            req['pipeline'] = pipeline
    if mode == 'cli':
        t0 = time.time()
        cmd = [sys.executable, os.path.join(YS_EDITOR, 'ys_ocr.py'),
               'ocr', os.path.abspath(frame), '--json']
        if pipeline:
            cmd += ['--pipeline', pipeline]
        if not cache:
            cmd += ['--no-cache']          # 默认量"每次真推理"；--cache 才是稳态
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        wall = (time.time() - t0) * 1000.0
        doc = json.loads(p.stdout.strip().splitlines()[-1]) if p.stdout.strip() else {}
        free, clk = free_mib()
        return {'rpc_ms': wall, 'daemon_ms': doc.get('ms'), 'via': doc.get('via'),
                'engine': doc.get('engine'), 'free_mib': free,
                'n_total': doc.get('n_total'), 'rc': p.returncode,
                'clock_mhz': clk, 'timing': doc.get('timing'),
                'cached': doc.get('cached')}
    resp, wall = rpc(req)
    free, clk = free_mib()
    extra = {}
    for k in ('ms', 'timing', 'n_total', 'n_boxes', 'cached', 'n_objects', 'n_ocr'):
        if k in resp:
            extra[k] = resp[k]
    return {'rpc_ms': wall, 'daemon_ms': resp.get('ms'), 'via': resp.get('via'),
            'engine': resp.get('engine'), 'free_mib': free, 'clock_mhz': clk,
            'n_total': resp.get('n_total'), 'cached': resp.get('cached'),
            'pipeline': resp.get('pipeline'),
            'error': resp.get('error'), 'extra': extra}


def pct(vals, q):
    """最近秩分位数（小样本不用插值，读数可复算）。"""
    if not vals:
        return None
    s = sorted(vals)
    k = max(0, min(len(s) - 1, int(round(q * (len(s) - 1)))))
    return s[k]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--frame', default=DEFAULT_FRAME)
    ap.add_argument('--runs', type=int, default=12)
    ap.add_argument('--mode', choices=['daemon', 'cli', 'world'], default='daemon')
    ap.add_argument('--warmup', type=int, default=1, help='预热次数（不计入分位）')
    ap.add_argument('--pipeline', choices=['plain', 'buckets'], default=None,
                    help='cmd=ocr 的识别管线（不选则用 daemon 默认）')
    ap.add_argument('--cache', dest='cache', action='store_true', default=False)
    ap.add_argument('--no-cache', dest='cache', action='store_false')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args(argv)
    if not os.path.exists(a.frame):
        print('帧不存在：%s' % a.frame, file=sys.stderr)
        return 2
    if not os.path.exists(SOCK):
        print('常驻服务未运行（%s 不在）⇒ 本基准只量热态，先 systemctl --user start ys-lookd' % SOCK,
              file=sys.stderr)
        return 3
    rows = []
    for i in range(a.warmup):
        # 预热：daemon 首次会在帧缓冲/引擎上付钱。预热也要同管线，否则 A/B 不公平
        one(a.mode, a.frame, a.pipeline, a.cache)
    for i in range(a.runs):
        r = one(a.mode, a.frame, a.pipeline, a.cache)
        rows.append(r)
        if not a.json:
            print('#%-2d mode=%-6s via=%-6s engine=%-5s rpc_ms=%7.1f daemon_ms=%-6s free_mib=%s n=%s%s'
                  % (i + 1, a.mode, r.get('via'), r.get('engine'), r['rpc_ms'],
                     r.get('daemon_ms'), r.get('free_mib'), r.get('n_total'),
                     (' ERR=' + str(r['error'])) if r.get('error') else ''))
    rpc = [r['rpc_ms'] for r in rows]
    dm = [r['daemon_ms'] for r in rows if isinstance(r.get('daemon_ms'), (int, float))]
    out = {'mode': a.mode, 'frame': os.path.abspath(a.frame), 'runs': len(rows),
           'rpc_ms': {'p50': pct(rpc, .5), 'p95': pct(rpc, .95), 'min': min(rpc), 'max': max(rpc)},
           'daemon_ms': ({'p50': pct(dm, .5), 'p95': pct(dm, .95)}
                         if dm else None),
           'free_mib': {'min': min(r['free_mib'] for r in rows if r.get('free_mib')),
                        'max': max(r['free_mib'] for r in rows if r.get('free_mib'))}
           if any(r.get('free_mib') for r in rows) else None,
           'via': sorted({str(r.get('via')) for r in rows}),
           'engine': sorted({str(r.get('engine')) for r in rows}),
           'rows': [{k: v for k, v in r.items() if k != 'extra'} for r in rows]}
    if a.json:
        print(json.dumps(out, ensure_ascii=False))
    else:
        print('—' * 72)
        print('mode=%s frame=%s runs=%d via=%s engine=%s'
              % (a.mode, os.path.basename(a.frame), len(rows), out['via'], out['engine']))
        print('RPC   p50=%.1fms p95=%.1fms min=%.1f max=%.1f'
              % (out['rpc_ms']['p50'], out['rpc_ms']['p95'], out['rpc_ms']['min'], out['rpc_ms']['max']))
        if out['daemon_ms']:
            print('daemon 自报 p50=%.1fms p95=%.1fms'
                  % (out['daemon_ms']['p50'], out['daemon_ms']['p95']))
        if out['free_mib']:
            print('显存余量 %d~%d MiB' % (out['free_mib']['min'], out['free_mib']['max']))
        print('判据：热态 p50 ≤250ms ⇒ %s' % ('PASS' if out['rpc_ms']['p50'] <= 250 else 'FAIL'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
