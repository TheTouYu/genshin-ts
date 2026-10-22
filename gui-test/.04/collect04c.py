#!/usr/bin/env python3
"""gui-test/.04 语音条目采集 v3（键盘导航 + 两段式自适应等待 + 标题去重）

实测依据（2026-10-23 02:4x，lat.py 时间线）：
  · 按一次 S：标题区像素在 **+0.24s 变一次**（旧字淡出/换行），**+2.06s 再变一次**（新字落定）；
    +3s 的 OCR 才读到新标题。⇒ "变了一次就抓" 会抓到上一条（v1/v2 跳条的真因）。
  · 判据 = 按完先等 ≥1.3s，再等该区域**稳定 0.6s**，才抓帧；典型 2.0–2.4s/条。
  · 2.5s 宽松节奏连按 4 次 → 4 个不同标题，步长 = 1（导航本身没问题，问题全在读的时机）。

用法:
  collect04c.py top   [cap] [budget]   # 先 W 冲到列表顶部再向下采
  collect04c.py cont  [cap] [budget]   # 从当前选中项继续向下采
"""
import os, sys, re, json, time, subprocess
import numpy as np
from PIL import Image

ROOT = '/home/h/genshin-ts'
CAP = f'{ROOT}/tools/ys-editor/ys-capture'
YSTEXT = f'{ROOT}/tools/ys-editor/ys-text'
OUT = f'{ROOT}/gui-test/.04'

BODY = (1740, 165, 820, 1145)
TITLE = (1750, 165, 780, 75)
CROP = (1700, 150, 860, 1180)
TITLE_LOCAL = (50, 15, 780, 75)
FIRST_TITLE = '关于风车'

KEY_W, KEY_S = 17, 31
NOISE_RE = re.compile(r'^[\sA-Za-z]{1,2}')


def grab(path):
    r = subprocess.run([CAP, 'latest', '--out', path, '--format', 'bmp'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'grab rc={r.returncode} {(r.stderr or r.stdout).strip()[:160]}')
    return path


def key(code, hold=0.0):
    subprocess.run(['ydotool', 'key', f'{code}:1'], capture_output=True)
    if hold:
        time.sleep(hold)
    subprocess.run(['ydotool', 'key', f'{code}:0'], capture_output=True)


def _hdr(f):
    h = f.read(54)
    w = int.from_bytes(h[18:22], 'little')
    ht = int.from_bytes(h[22:26], 'little', signed=True)
    if int.from_bytes(h[28:30], 'little') != 24 or int.from_bytes(h[30:34], 'little') != 0:
        raise RuntimeError('bad bmp')
    return w, abs(ht), (w * 3 + 3) // 4 * 4, ht < 0


def sample(path, box, rowstep=6, colstep=3):
    x, y, w, h = box
    with open(path, 'rb') as f:
        w_img, h_img, stride, top_down = _hdr(f)
        step = colstep * 3
        buf = bytearray()
        for ry in range(y, min(y + h, h_img), rowstep):
            fy = ry if top_down else (h_img - 1 - ry)
            f.seek(54 + fy * stride + x * 3)
            buf += f.read(w * 3)[::step]
        return bytes(buf)


def ratio(a, b):
    if not a or len(a) != len(b):
        return 1.0
    d = np.frombuffer(a, dtype=np.uint8).astype(np.int16) - np.frombuffer(b, dtype=np.uint8)
    return float((np.abs(d) > 8).mean())


def save_crop(bmp, out):
    Image.open(bmp).convert('RGB').crop((CROP[0], CROP[1], CROP[0] + CROP[2], CROP[1] + CROP[3])) \
        .save(out, quality=92)


def ocr_lines(frame, region, js):
    r = subprocess.run([YSTEXT, frame, '--region', ' '.join(map(str, region)),
                        '--only', 'lines', '--json-out', js], capture_output=True, text=True)
    if r.returncode != 0:
        return [], ''
    try:
        d = json.load(open(js))
    except Exception:
        return [], ''
    ls = d.get('lines', [])
    return ls, ' '.join(l['text'] for l in ls).strip()


def norm(s):
    s = NOISE_RE.sub('', s or '')
    return re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]', '', s).lower()


def key_and_settle(cur, code, min_wait=1.3, stable=0.6, max_wait=4.0, poll=0.12):
    """按键 → 等区域先变、再稳定 stable 秒（避开"淡出先变一次"的假信号）。"""
    grab(cur)
    prev = sample(cur, TITLE)
    key(code)
    t0 = time.time()
    last_change = 0.0
    last = prev
    while True:
        el = time.time() - t0
        if el > max_wait:
            break
        grab(cur)
        cur_sig = sample(cur, TITLE)
        if ratio(cur_sig, prev) > 0.10:
            last_change = el
            prev = cur_sig
            last = cur_sig
        if el >= min_wait and el - last_change >= stable:
            break
        time.sleep(poll)
    grab(cur)
    return int((time.time() - t0) * 1000)


def run(mode='cont', cap=200, budget=235, store=True, tag=''):
    os.makedirs(f'{OUT}/frames', exist_ok=True)
    os.makedirs(f'{OUT}/raw', exist_ok=True)
    cur = '/tmp/ys04.bmp'
    js = '/tmp/ys04-t.json'
    t_start = time.time()
    tag = tag or mode
    log = open(f'{OUT}/raw/entries-{tag}.jsonl', 'w')
    recs = []

    if mode == 'top':
        # 快冲顶部：W 连发（不判读数，只在末尾核验标题）
        for round_ in range(3):
            for _ in range(25):
                key(KEY_W)
                time.sleep(0.12)
            time.sleep(2.4)
            grab(cur)
            _, t = ocr_lines(cur, TITLE, js)
            print(f'[top] 冲顶后标题={t}', flush=True)
            if norm(t).startswith(FIRST_TITLE):
                break
        else:
            print('[top] ✗ 冲顶失败（标题不是关于风车）', flush=True)

    grab(cur)
    _, title = ocr_lines(cur, TITLE, js)
    print(f'[run:{tag}] 起点标题={title}', flush=True)
    n = 0
    stalls = 0

    def take(kind, ms, t):
        nonlocal n
        n += 1
        p = f'{OUT}/frames/{tag}-{n:04d}.jpg'
        if store:
            save_crop(cur, p)
        d = {'idx': n, 'kind': kind, 'title': t, 'settle_ms': ms,
             'crop': os.path.relpath(p, OUT) if store else None,
             't_rel': round(time.time() - t_start, 1)}
        recs.append(d)
        log.write(json.dumps(d, ensure_ascii=False) + '\n')
        log.flush()
        return d

    take('start', 0, title)
    last_title = title

    while n < cap and time.time() - t_start < budget:
        ms = key_and_settle(cur, KEY_S)
        grab(cur)
        lines, t = ocr_lines(cur, TITLE, js)
        if not norm(t) or norm(t) == norm(last_title):
            stalls += 1
            print(f'[run:{tag}] stall={stalls} title={t} settle={ms}ms', flush=True)
            if stalls >= 3:
                print('[run] 连续 3 次标题未推进 ⇒ 到底', flush=True)
                break
            continue
        stalls = 0
        d = take('key', ms, t)
        last_title = t
        if d['idx'] % 10 == 0:
            el = time.time() - t_start
            print(f'[{d["idx"]:04d}] {t} t={el:.0f}s avg={el/d["idx"]:.2f}s/条', flush=True)

    summary = {'tag': tag, 'mode': mode, 'count': n, 'elapsed': round(time.time() - t_start, 1),
               'per_entry_s': round((time.time() - t_start) / max(n, 1), 2),
               'titles': [r['title'] for r in recs]}
    log.write(json.dumps({'summary': summary}, ensure_ascii=False) + '\n')
    log.close()
    json.dump(summary, open(f'{OUT}/raw/summary-{tag}.json', 'w'), ensure_ascii=False, indent=1)
    print(f'[run] DONE {tag} count={n} elapsed={summary["elapsed"]}s '
          f'avg={summary["per_entry_s"]}s/条', flush=True)
    return 0


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'cont'
    cap = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    budget = int(sys.argv[3]) if len(sys.argv) > 3 else 235
    sys.exit(run(mode=mode, cap=cap, budget=budget))
