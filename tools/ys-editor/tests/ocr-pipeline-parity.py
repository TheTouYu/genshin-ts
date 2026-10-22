#!/usr/bin/env python3
"""ocr-pipeline-parity.py — `cmd=ocr` 两条识别管线的**字符级一致性**门禁。

为什么需要：性能优化最容易悄悄丢字。`plain`（RapidOCR 整体调用：det+cls+rec）与
`buckets`（det 一次 + 按行宽分桶并行 rec，跳 cls）在**同一帧**上必须给出同一批文本，
否则"变快"只是"少认"。本脚本逐帧比对文本多重集与框中心偏移，任何差异都指名报出。

判据（默认口径）：
  · 文本多重集**完全相等**（不是子集：多认与少认都算差异）；
  · 每个相同文本的框中心偏移 ≤ 8px（det 输入尺度不同导致的抖动上限）。

用法：
  python3 tools/ys-editor/tests/ocr-pipeline-parity.py                       # 默认 4 帧
  python3 tools/ys-editor/tests/ocr-pipeline-parity.py --frames f06 f07 neg-world
  python3 tools/ys-editor/tests/ocr-pipeline-parity.py --det-max 1280 --json
退出码：0 全一致 / 1 有差异 / 3 服务不在。
"""
import argparse
import json
import os
import socket
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
CORPUS = os.path.join(REPO, '.scratch', 'gui-corpus')
SOCK = os.environ.get('YS_LOOKD_SOCK', '/run/user/%d/ys-lookd.sock' % os.getuid())
DEFAULT_FRAMES = ['f06', 'f07', 'neg-world', 'f04']


def rpc(req, timeout=180.0):
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
    return json.loads(buf.decode('utf-8') or '{}')


def ocr(frame, pipeline, det_max=2000):
    r = rpc({'cmd': 'ocr', 'frame': frame, 'cache': False,
             'pipeline': pipeline, 'det_max': det_max})
    if r.get('error'):
        raise RuntimeError('OCR 失败（%s）: %s' % (pipeline, r['error']))
    out = {}
    for b in r.get('boxes') or []:
        out.setdefault(str(b.get('text') or ''), []).append((b.get('cx'), b.get('cy')))
    return out, r


def compare(a, b, tol=8):
    """返回差异列表（空 = 一致）。

    a/b 是 {文本: [(cx,cy), …]}——同一文本可能出现在多处（如两处「关闭」），
    所以计数按**出现次数**算，不是按 key 个数。
    """
    diffs = []
    ca = Counter({k: len(v) for k, v in a.items()})
    cb = Counter({k: len(v) for k, v in b.items()})
    for txt in sorted(set(ca) | set(cb)):
        na, nb = ca.get(txt, 0), cb.get(txt, 0)
        if na != nb:
            diffs.append('文本计数不同 %r: plain=%d buckets=%d' % (txt, na, nb))
            continue
        if na == 1:
            (xa, ya), (xb, yb) = a[txt][0], b[txt][0]
            if abs(xa - xb) > tol or abs(ya - yb) > tol:
                diffs.append('框中心偏移 %r: (%d,%d)→(%d,%d)' % (txt, xa, ya, xb, yb))
    return diffs


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', nargs='*', default=DEFAULT_FRAMES)
    ap.add_argument('--det-max', type=int, default=2000)
    ap.add_argument('--tol', type=int, default=8)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args(argv)
    if not os.path.exists(SOCK):
        print('常驻服务未运行（%s 不在）——本门禁要比两条**服务端**管线，先起 ys-lookd' % SOCK,
              file=sys.stderr)
        return 3
    rows, fails = [], 0
    for name in a.frames:
        path = name if os.path.isabs(name) else os.path.join(CORPUS, name + '.png')
        if not os.path.exists(path) and os.path.exists(name):
            path = name
        if not os.path.exists(path):
            print('  ! 帧不存在：%s（跳过）' % path)
            continue
        plain, rp = ocr(path, 'plain', a.det_max)
        buck, rb = ocr(path, 'buckets', a.det_max)
        diffs = compare(plain, buck, a.tol)
        rows.append({'frame': os.path.basename(path),
                     'plain': {'n': rp.get('n_total'), 'ms': rp.get('ms')},
                     'buckets': {'n': rb.get('n_total'), 'ms': rb.get('ms'),
                                 'timing': rb.get('timing')},
                     'diffs': diffs})
        if diffs:
            fails += 1
        if not a.json:
            print('%-12s plain n=%-3s %6sms | buckets n=%-3s %6sms | %s'
                  % (os.path.basename(path), rp.get('n_total'), rp.get('ms'),
                     rb.get('n_total'), rb.get('ms'),
                     '一致' if not diffs else '差异 %d 处' % len(diffs)))
            for d in diffs[:8]:
                print('      - ' + d)
    verdict = 'PASS' if not fails else 'FAIL'
    if a.json:
        print(json.dumps({'verdict': verdict, 'det_max': a.det_max, 'rows': rows},
                         ensure_ascii=False))
    else:
        print('─' * 60)
        print('OCR-PARITY-RESULT frames=%d fail=%d det_max=%d verdict=%s'
              % (len(rows), fails, a.det_max, verdict))
    return 0 if not fails else 1


if __name__ == '__main__':
    sys.exit(main())
