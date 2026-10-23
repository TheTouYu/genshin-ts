#!/usr/bin/env python3
"""frame-size — 抓帧尺寸一致性门禁：**尺寸恒等、头与缓冲同源、PIL 可读**。

为什么需要（2026-10-23 实测事故）：
`kwin-ss2` 通道给 **2561×1440**（KWin 逻辑宽 1707 × scale 1.5 = 2560.5 → 取整 2561），
`xshm-window` 通道给 **2560×1440** ⇒ 同一台机同一窗口两种帧宽，
20 次采样 9 次是 2561 宽；PIL / `ys-text` / `ys-scrollbar` 对 2561 宽帧一律报
`image file is truncated (6244 bytes not processed)`。
下游随机读不到行，被我们统计成「行消失 / 行抖动 / 列表自己滚了」——**假象来自仪器，不是界面**。

判据（三条硬断言，全部可复算）：
1. N 次连续 `latest --out` 的 `frame.{w,h}` 恒等，且 == 54 字节头 + w*3*h 的推算大小；
2. 每个文件 `PIL.Image.open(...).load()` 成功（未截断）；
3. 文件头里声明的宽高 == `frame.{w,h}`（同一读数两处一致）。

守护不在 ⇒ `BLOCKED`（rc=2），不判 FAIL。
"""
import json
import os
import struct
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
E = os.path.dirname(HERE)
sys.path.insert(0, E)
import ys_env                                              # noqa: E402

CAP = os.path.join(E, 'ys-capture')
N = int(os.environ.get('FRAME_SIZE_SAMPLES', '12'))


def main():
    env = ys_env.env(YS_SLOT_ACTIVE=os.environ.get('YS_SLOT_ACTIVE', ''))
    fails, readings = [], []
    for i in range(N):
        p = f'/tmp/frame-size-{i}.bmp'
        r = subprocess.run([CAP, 'latest', '--out', p, '--format', 'bmp', '--allow-background'],
                           capture_output=True, text=True, env=env)
        if r.returncode != 0:
            msg = (r.stdout or r.stderr).strip()[:160]
            if 'DAEMON_DOWN' in msg or 'daemon' in msg.lower():
                print(f'FRAME-SIZE-RESULT verdict=BLOCKED reason={msg}')
                return 2
            fails.append(f'sample{i}: capture rc={r.returncode} {msg}')
            continue
        d = json.loads(r.stdout)
        f = d.get('frame', {})
        w, h, ch = int(f.get('w') or 0), int(f.get('h') or 0), d.get('channel')
        sz = os.path.getsize(p)
        with open(p, 'rb') as fh:
            hdr = fh.read(54)
        hw, hh = struct.unpack('<i', hdr[18:22])[0], struct.unpack('<i', hdr[22:26])[0]
        ok_pil = True
        try:
            from PIL import Image
            Image.open(p).load()
        except Exception as e:                                # noqa: BLE001
            ok_pil = False
            fails.append(f'sample{i}: PIL {type(e).__name__}: {str(e)[:60]}')
        readings.append({'i': i, 'w': w, 'h': h, 'hdr': (hw, abs(hh)), 'size': sz,
                         'channel': ch, 'pil': ok_pil})
        if (w, h) != (hw, abs(hh)):
            fails.append(f'sample{i}: 头 {hw}x{abs(hh)} != frame {w}x{h}')
        if sz != 54 + w * h * 3:
            fails.append(f'sample{i}: 大小 {sz} != 54+{w}*{h}*3={54 + w * h * 3}')
        time.sleep(0.05)

    dims = {(r['w'], r['h']) for r in readings}
    sizes = {r['size'] for r in readings}
    if len(dims) > 1:
        fails.append(f'尺寸不恒等：{sorted(dims)}')
    if len(sizes) > 1:
        fails.append(f'文件大小不恒等：{sorted(sizes)}')
    chans = sorted({str(r['channel']) for r in readings})
    print(f'· 采样 {len(readings)}/{N}  尺寸={sorted(dims)}  大小={sorted(sizes)}  通道={chans}')
    for f_ in fails[:8]:
        print(f'  ✗ {f_}')
    verdict = 'PASS' if not fails else 'FAIL'
    print(f'FRAME-SIZE-RESULT pass={len(readings) - len(fails)} fail={len(fails)} '
          f'dims={sorted(dims)} verdict={verdict}')
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
