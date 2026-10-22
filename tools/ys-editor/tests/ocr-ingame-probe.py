#!/usr/bin/env python3
"""ocr-ingame-probe.py — 游戏内 OCR 实测探针（只取帧 + 识别，不抬窗、不点、不注入）。

为什么需要它：实验室口径（固定离线帧、独立进程）只能回答"参数值多少"，回答不了
"用户正在玩的这个界面 OCR 要多久、read 出来的字对不对"。用户验收的是**活体帧**。
所以本探针把三件事一次做完并落盘：
  ① 取活体帧（默认 `ys-capture latest`，失败则回退守护自抓 `cmd=ocr` 无 frame 路径）；
  ② `cmd=ocr`（**cache 关**、`pipeline=plain`）→ 每次都真推理；
  ③ 记 `p50/p95 + engine + 每行文本/置信度/位置 + 当时显存/时钟`，证据落
     `.scratch/gui-service/evidence/ingame-ocr-<时间>/`。

两种口径必须分开报（这是本工具的核心，不许混）：
  --mode same    同一帧连打 N 次  ⇒ 只证明"引擎热不热"，不代表游戏里的成本
  --mode change  每次先抓新帧再 OCR ⇒ 游戏里真实成本（换帧必 miss）

用法：
  python3 tools/ys-editor/tests/ocr-ingame-probe.py --runs 10 --mode change
  python3 tools/ys-editor/tests/ocr-ingame-probe.py --runs 8 --mode same --pipeline plain
输出（人类看 report.md；机读 summary.json）：
  report.md   —— p50/p95/engine/显存/时钟 + **人工核对表**（位置｜文本｜置信度）
  summary.json / run_XX.json / frame_XX.bmp
退出码：0 正常 / 3 取不到可信帧 / 4 守护不可用 / 2 用法
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
YS_EDITOR = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(YS_EDITOR))
SOCK = os.environ.get('YS_LOOKD_SOCK', '/run/user/%d/ys-lookd.sock' % os.getuid())
CAPTURE = os.path.join(YS_EDITOR, 'ys-capture')
DEFAULT_OUT = os.path.join(ROOT, '.scratch', 'gui-service', 'evidence')


def gpu():
    try:
        out = subprocess.run(['nvidia-smi', '--query-gpu=clocks.sm,utilization.gpu,memory.free,'
                              'power.draw', '--format=csv,noheader,nounits'],
                             capture_output=True, text=True, timeout=5).stdout.strip()
        clk, util, free, pw = [x.strip() for x in out.split(',')]
        return {'clk_sm': clk, 'util': util, 'free_mib': int(float(free)), 'power_w': pw}
    except Exception:                                        # noqa: BLE001
        return {}


def rpc(req, timeout=180.0):
    t0 = time.time()
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    s.connect(SOCK)
    s.sendall((json.dumps(req) + '\n').encode())
    buf = b''
    while not buf.endswith(b'\n'):
        ch = s.recv(1 << 20)
        if not ch:
            break
        buf += ch
    s.close()
    return json.loads(buf.decode() or '{}'), (time.time() - t0) * 1000.0


def capture(stem):
    """ys-capture latest → 落盘帧。先要 png（用户核对要看图），失败退 bmp。

    返回 (ok, ms, path|None, 说明)。D482：png 预编码可能为空（rc=10 FORMAT_NOT_READY），
    所以 bmp 是可靠格式——但 bmp 11MB 不好贴给用户看，故先试 png。
    """
    last = ''
    for fmt in ('png', 'bmp'):
        path = '%s.%s' % (stem, fmt)
        t0 = time.time()
        try:
            p = subprocess.run([CAPTURE, 'latest', '--out', path, '--format', fmt,
                                '--max-age-ms', '5000'], capture_output=True, text=True,
                               timeout=20)
        except Exception as e:                               # noqa: BLE001
            last = '%s: %s' % (type(e).__name__, e)
            continue
        ms = (time.time() - t0) * 1000
        if p.returncode == 0 and os.path.exists(path):
            return True, ms, path, ''
        last = ((p.stdout or p.stderr or '').strip()[:200] + ' [fmt=%s]' % fmt)
    return False, ms, None, last


def pct(vals, q):
    s = sorted(vals)
    return s[max(0, min(len(s) - 1, int(round(q * (len(s) - 1)))))] if s else None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, default=10)
    ap.add_argument('--mode', choices=['same', 'change'], default='change')
    ap.add_argument('--source', choices=['auto', 'capture', 'live'], default='auto')
    ap.add_argument('--pipeline', default='plain', choices=['plain', 'buckets'])
    ap.add_argument('--out', default='')
    ap.add_argument('--cache', action='store_true', help='打开服务端帧缓存（默认关：要真推理）')
    a = ap.parse_args(argv)
    if not os.path.exists(SOCK):
        print('常驻服务不在（%s）⇒ 先用 systemctl --user start ys-lookd' % SOCK, file=sys.stderr)
        return 4
    stamp = time.strftime('%Y%m%d-%H%M%S')
    outdir = a.out or os.path.join(DEFAULT_OUT, 'ingame-ocr-%s' % stamp)
    os.makedirs(outdir, exist_ok=True)
    rows, gpus = [], []
    frame_stem = os.path.join(outdir, 'frame_%02d')
    got_frame = None
    for i in range(a.runs):
        g0 = gpu()
        gpus.append(g0)
        cap_ms, cap_note, path = None, '', None
        want_capture = a.source in ('auto', 'capture') and (a.mode == 'change' or i == 0)
        if want_capture:
            ok, cap_ms, fp, cap_note = capture(frame_stem % i)
            if ok:
                path = got_frame = fp
            else:                                  # 取帧失败 ⇒ 回退守护自抓（必须置 None！
                path = None                        # 否则会把一个不存在的路径发给守护，报 BAD_FRAME）
                if a.source == 'capture':
                    print('取帧失败（ys-capture）：%s' % cap_note, file=sys.stderr)
                    return 3
                print('[warn] ys-capture 不可用（%s）⇒ 回退 cmd=ocr 活体抓帧' % cap_note[:120],
                      file=sys.stderr)
        use_live = path is None          # 没拿到文件 ⇒ 让守护自抓（via=daemon-live）
        if a.mode == 'same' and got_frame:
            path, use_live = got_frame, False     # 同一帧连打
        req = {'cmd': 'ocr', 'cache': bool(a.cache), 'pipeline': a.pipeline}
        if path and not use_live:
            req['frame'] = os.path.abspath(path)
        tok0 = time.time()
        resp, rpc_ms = rpc(req)
        tok = (time.time() - tok0) * 1000
        if resp.get('error'):
            print('第 %d 次 OCR 失败：%s' % (i + 1, resp['error']), file=sys.stderr)
            return 4
        boxes = resp.get('boxes') or []
        row = {'i': i, 'via': resp.get('via'), 'engine': resp.get('engine'),
               'pipeline': resp.get('pipeline'), 'cached': resp.get('cached'),
               'ocr_ms': resp.get('ms'), 'rpc_ms': round(rpc_ms, 1),
               'capture_ms': round(cap_ms, 1) if cap_ms is not None else None,
               'frame': os.path.abspath(path) if (path and not use_live) else '<live>',
               'capture_note': cap_note, 'n_boxes': len(boxes),
               'timing': resp.get('timing'), 'gpu': g0,
               'lines': [{'text': b.get('text'), 'score': b.get('score'),
                          'cx': b.get('cx'), 'cy': b.get('cy'), 'box': b.get('box')}
                         for b in boxes]}
        rows.append(row)
        with open(os.path.join(outdir, 'run_%02d.json' % i), 'w', encoding='utf-8') as f:
            json.dump(row, f, ensure_ascii=False, indent=1)
        print('#%-2d via=%-11s engine=%-4s ocr=%-6sms rpc=%6.1f cap=%s n=%d free=%sMiB clk=%s' % (
            i + 1, row['via'], row['engine'], row['ocr_ms'], row['rpc_ms'],
            ('%.0f' % cap_ms) if cap_ms is not None else '  -', len(boxes),
            g0.get('free_mib'), g0.get('clk_sm')), flush=True)
    ocr_ms = [r['ocr_ms'] for r in rows]
    rpc_ms = [r['rpc_ms'] for r in rows]
    summary = {'stamp': stamp, 'mode': a.mode, 'source': a.source, 'pipeline': a.pipeline,
               'cache': bool(a.cache), 'runs': a.runs,
               'engine': sorted({str(r['engine']) for r in rows}),
               'via': sorted({str(r['via']) for r in rows}),
               'ocr_ms': {'p50': pct(ocr_ms, .5), 'p95': pct(ocr_ms, .95),
                          'min': min(ocr_ms), 'max': max(ocr_ms)},
               'rpc_ms': {'p50': pct(rpc_ms, .5), 'p95': pct(rpc_ms, .95)},
               'capture_ms': {'p50': pct([r['capture_ms'] for r in rows if r['capture_ms']], .5)},
               'gpu': {'clk_min': min([g.get('clk_sm') for g in gpus if g.get('clk_sm')],
                                      default=None),
                       'free_min': min([g.get('free_mib') for g in gpus if g.get('free_mib')],
                                       default=None),
                       'free_max': max([g.get('free_mib') for g in gpus if g.get('free_mib')],
                                       default=None)},
               'runs_detail': rows}
    for name in ('summary.json', 'bench.json'):
        with open(os.path.join(outdir, name), 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=1)
    # ── 人工核对表（最后一行帧；用户在游戏里逐条对照）──
    last = rows[-1]['lines']
    last_sorted = sorted(last, key=lambda l: (l['cy'] or 0, l['cx'] or 0))
    md = ['# 游戏内 OCR 人工核对表', '',
          '- 证据目录：`%s`' % outdir,
          '- 口径：`mode=%s` `pipeline=%s` `cache=%s` via=%s engine=%s' % (
              a.mode, a.pipeline, bool(a.cache), ','.join(summary['via']),
              ','.join(summary['engine'])),
          '- **怎么核**：按下表「位置」在游戏里找到那行字，逐条对照「文本」列。'
          '错的/漏的直接在表里标 ✗；置信度低于 0.9 的行重点看。', '',
          '| # | 位置(cx,cy) | 文本 | 置信度 | 核对 |', '|---|---|---|---|---|']
    for k, l in enumerate(last_sorted):
        md.append('| %d | (%d,%d) | `%s` | %.3f |  |' % (
            k + 1, l['cx'] or 0, l['cy'] or 0, (l['text'] or '').replace('|', '\\|'),
            l['score'] or 0))
    md += ['', '## 速度读数（每次真推理，cache=%s）' % bool(a.cache), '',
           '| 项 | p50 | p95 | min | max |', '|---|---|---|---|---|',
           '| OCR 服务端 ms | %s | %s | %s | %s |' % (
               summary['ocr_ms']['p50'], summary['ocr_ms']['p95'],
               summary['ocr_ms']['min'], summary['ocr_ms']['max']),
           '| RPC 往返 ms | %s | %s | - | - |' % (
               summary['rpc_ms']['p50'], summary['rpc_ms']['p95']),
           '| 抓帧 ms（p50） | %s | - | - | - |' % summary['capture_ms']['p50'], '',
           '显存余量 %s–%s MiB；GPU 时钟最低 %s MHz（本机常态锁 855）。' % (
               summary['gpu']['free_min'], summary['gpu']['free_max'], summary['gpu']['clk_min'])]
    open(os.path.join(outdir, 'report.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
    print('—' * 68)
    print('OCR  p50=%s p95=%s ms  engine=%s via=%s  (mode=%s, cache=%s)' % (
        summary['ocr_ms']['p50'], summary['ocr_ms']['p95'], summary['engine'],
        summary['via'], a.mode, bool(a.cache)))
    print('证据 -> %s（report.md / summary.json / run_XX.json / frame_XX.bmp）' % outdir)
    return 0


if __name__ == '__main__':
    sys.exit(main())
