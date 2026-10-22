#!/usr/bin/env python3
"""gui-test/.04 语音条目采集 v2（键盘导航 + 稳健噪声地板 + 逐条标题断言）

与 v1 的差别（v1 在 2026-10-23 03:1x 实测的失败）：
  · v1 用"基线两帧差"当噪声地板 —— 那两帧里第一帧是**焦点回来前的陈旧帧**，
    地板被算成 0.358（35.8%）⇒ 变化阈值 hi=1.07 永远不可能达到 ⇒ 每次按键都判"没变化"。
    而实际标题已经从 关于风车… 变成 关于酒馆老板（S 键确实逐条前进）。
  · v2：地板取 6 帧的 5 个连续比值的中位数并夹到 [0,0.12]；阈值再夹到 ≤0.45；
        并且**每条都 OCR 标题条做断言**（序号连续、不重复），miss 就重按。

用法: collect04b.py run [cap] [budget_s] [--from-top]
"""
import os, sys, re, json, time, subprocess
import numpy as np
from PIL import Image

ROOT = '/home/h/genshin-ts'
CAP = f'{ROOT}/tools/ys-editor/ys-capture'
YSTEXT = f'{ROOT}/tools/ys-editor/ys-text'
OUT = f'{ROOT}/gui-test/.04'

LIST = (60, 240, 900, 1045)
BODY = (1740, 165, 820, 1145)
TITLE = (1750, 165, 780, 75)
CROP = (1700, 150, 860, 1180)
TITLE_LOCAL = (50, 15, 780, 75)      # 裁块内的标题条

KEY_W, KEY_S = 17, 31
NOISE_RE = re.compile(r'^[\sA-Za-z]{1,2}')


def grab(path):
    r = subprocess.run([CAP, 'latest', '--out', path, '--format', 'bmp'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'grab rc={r.returncode} {(r.stderr or r.stdout).strip()[:160]}')
    return path


def key(code):
    subprocess.run(['ydotool', 'key', f'{code}:1'], capture_output=True)
    subprocess.run(['ydotool', 'key', f'{code}:0'], capture_output=True)


def _hdr(f):
    h = f.read(54)
    w = int.from_bytes(h[18:22], 'little')
    ht = int.from_bytes(h[22:26], 'little', signed=True)
    if int.from_bytes(h[28:30], 'little') != 24 or int.from_bytes(h[30:34], 'little') != 0:
        raise RuntimeError('bad bmp')
    return w, abs(ht), (w * 3 + 3) // 4 * 4, ht < 0


def sample(path, box, rowstep=8, colstep=3):
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


def ocr_region(frame, region, js):
    r = subprocess.run([YSTEXT, frame, '--region', ' '.join(map(str, region)),
                        '--only', 'lines', '--json-out', js], capture_output=True, text=True)
    if r.returncode != 0:
        return [], ''
    try:
        d = json.load(open(js))
    except Exception:
        return [], ''
    lines = d.get('lines', [])
    return lines, ' '.join(l['text'] for l in lines).strip()


def norm(s):
    s = NOISE_RE.sub('', s or '')
    return re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]', '', s).lower()


def list_rows(frame, js):
    lines, _ = ocr_region(frame, LIST, js)
    rows = []
    for l in lines:
        x0, y0, x1, y1 = l['bbox']
        if not (20 <= y1 - y0 <= 70) or (x1 - x0) < 90:
            continue
        if y0 < LIST[1] + 10 or y1 > LIST[1] + LIST[3] - 10:
            continue
        n = norm(l['text'])
        if len(re.findall(r'[\u4e00-\u9fff]', n)) < 2:
            continue
        rows.append({'text': l['text'].strip(), 'norm': n, 'y': (y0 + y1) // 2})
    rows.sort(key=lambda r: r['y'])
    return rows


def measure_noise(path, box, n=6, gap=0.12):
    sigs = []
    for _ in range(n):
        grab(path)
        sigs.append(sample(path, box))
        time.sleep(gap)
    rs = [ratio(sigs[i], sigs[i + 1]) for i in range(len(sigs) - 1)]
    noise = float(np.median(rs)) if rs else 0.02
    return max(0.005, min(0.12, noise)), [round(r, 3) for r in rs]


def wait_settle(path, box, prev, noise, max_wait=2.0, poll=0.045):
    hi = min(0.45, max(0.09, 4.0 * noise))
    lo = max(0.04, 2.0 * noise)
    t0 = time.time()
    changed, t_ch, last = False, 0, prev
    while time.time() - t0 < max_wait:
        grab(path)
        cur = sample(path, box)
        if not changed:
            if ratio(cur, prev) > hi:
                changed = True
                t_ch = int((time.time() - t0) * 1000)
                last = cur
        else:
            if ratio(cur, last) < lo:
                return True, cur, t_ch, int((time.time() - t0) * 1000)
            last = cur
        time.sleep(poll)
    grab(path)
    return changed, sample(path, box), t_ch, int((time.time() - t0) * 1000)


def run(cap=200, budget=240, from_top=True, pilot=2):
    for d in ('frames', 'raw'):
        os.makedirs(f'{OUT}/{d}', exist_ok=True)
    cur = '/tmp/ys04.bmp'
    t_start = time.time()
    log = open(f'{OUT}/raw/entries.jsonl', 'w')
    js_t = '/tmp/ys04-t.json'

    grab(cur)
    rows = list_rows(cur, f'{OUT}/raw/list-baseline.json')
    print('[run] 基线列表', [r['text'] for r in rows], flush=True)

    # 回到第一条：按 W 直到标题不再变化
    if from_top:
        last = None
        for i in range(12):
            key(KEY_W)
            time.sleep(0.28)
            grab(cur)
            _, t = ocr_region(cur, TITLE, js_t)
            print(f'[run] W#{i+1} → {t}', flush=True)
            if last is not None and norm(t) == norm(last):
                break
            last = t
        time.sleep(0.3)

    grab(cur)
    prev_sig = sample(cur, BODY)
    noise, samples = measure_noise(cur, BODY)
    print(f'[run] 噪声地板 median={noise:.3f} samples={samples}', flush=True)
    _, prev_title = ocr_region(cur, TITLE, js_t)
    print('[run] 起点标题 =', prev_title, flush=True)

    recs = []

    def take(kind, t_ch, t_all, title):
        p = f'{OUT}/frames/{len(recs)+1:04d}.jpg'
        save_crop(cur, p)
        _, t = ocr_region(p, TITLE_LOCAL, js_t)      # 断言：裁块里的标题
        d = {'idx': len(recs) + 1, 'kind': kind, 'title': t or title,
             'crop': os.path.relpath(p, OUT), 'change_ms': t_ch, 'settle_ms': t_all,
             't_rel': round(time.time() - t_start, 1)}
        recs.append(d)
        log.write(json.dumps(d, ensure_ascii=False) + '\n')
        log.flush()
        return d

    d0 = take('baseline', 0, 0, prev_title)
    print(f'[0001] baseline {d0["title"]}', flush=True)
    prev_title = d0['title']

    # pilot：连续两条必须换标题
    for i in range(pilot):
        ok = False
        for attempt in range(3):
            key(KEY_S)
            ch, prev_sig, t_ch, t_all = wait_settle(cur, BODY, prev_sig, noise)
            grab(cur)
            _, t = ocr_region(cur, TITLE, js_t)
            if norm(t) and norm(t) != norm(prev_title):
                ok = True
                break
            print(f'[run] pilot S#{i+1} 重试 attempt={attempt+1} title={t} ch={ch}', flush=True)
        d = take('pilot', t_ch, t_all, t)
        print(f'[{d["idx"]:04d}] pilot {d["title"]} change={t_ch}ms settle={t_all}ms', flush=True)
        if not ok:
            print('[run] ✗ pilot 失败：S 未推进标题，停止', flush=True)
            json.dump({'abort': 'pilot-fail', 'recs': recs}, log, ensure_ascii=False)
            return 3
        prev_title = d['title']

    # 正式采集
    stalls = 0
    while len(recs) < cap and time.time() - t_start < budget:
        key(KEY_S)
        ch, prev_sig, t_ch, t_all = wait_settle(cur, BODY, prev_sig, noise)
        grab(cur)
        _, t = ocr_region(cur, TITLE, js_t)
        if not norm(t) or norm(t) == norm(prev_title):
            stalls += 1
            print(f'[run] stall={stalls} title={t} ch={ch} change={t_ch}ms', flush=True)
            if stalls >= 3:
                print('[run] 连续 3 次标题未推进 ⇒ 到底，停止', flush=True)
                break
            continue
        stalls = 0
        d = take('key', t_ch, t_all, t)
        prev_title = d['title']
        if d['idx'] % 10 == 0:
            print(f'[{d["idx"]:04d}] {d["title"]} t={d["t_rel"]}s '
                  f'avg={d["t_rel"]/d["idx"]:.2f}s/条', flush=True)
        if norm(d['title']) == norm(d0['title']):
            print('[run] 标题回到起点 ⇒ 列表循环，停止', flush=True)
            break

    summary = {'count': len(recs), 'elapsed': round(time.time() - t_start, 1),
               'noise': round(noise, 3), 'per_entry_s': round((time.time() - t_start) / max(len(recs), 1), 2),
               'titles': [r['title'] for r in recs]}
    log.write(json.dumps({'summary': summary}, ensure_ascii=False) + '\n')
    log.close()
    json.dump(summary, open(f'{OUT}/raw/run-summary.json', 'w'), ensure_ascii=False, indent=1)
    print('[run] DONE', json.dumps({k: v for k, v in summary.items() if k != 'titles'},
                                   ensure_ascii=False), flush=True)
    print('[run] titles:', ' | '.join(summary['titles']), flush=True)
    return 0


if __name__ == '__main__':
    cap = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    budget = int(sys.argv[3]) if len(sys.argv) > 3 else 240
    sys.exit(run(cap=cap, budget=budget))
