#!/usr/bin/env python3
"""gui-test/.04 语音条目采集器（单进程、槽内运行、像素级变化检测）

设计要点（相对 .03 旧链路的修复）：
  1. 抓帧走 daemon 预编码 bmp（11MB，~20ms），不用 png（--pre 只编 bmp，png 会 rc=10）；
  2. 变化检测**只读 BMP 的稀疏扫描行**（~1ms），不做整帧 PIL 解码，不做逐条 OCR；
  3. 每条只落一块 860x1180 的裁块（标题+正文，~250KB），不落 11MB 全窗帧；
  4. 列表 OCR 只每屏一次（导航若支持 ↓ 键则连列表 OCR 都不需要）。

模式：
  probe  —— 只读：抓帧 + 列表 OCR，不注入
  pilot  —— 点击定标 + 方向键导航可行性实验（一次短占用）
  run    —— 全量采集（导航 = down 键，失败回退点击）
"""
import os, sys, re, json, time, hashlib, subprocess
import numpy as np
from PIL import Image

ROOT = '/home/h/genshin-ts'
CAP = f'{ROOT}/tools/ys-editor/ys-capture'
YSTEXT = f'{ROOT}/tools/ys-editor/ys-text'
OUT = f'{ROOT}/gui-test/.04'

LIST = (60, 240, 900, 1045)       # x,y,w,h  列表区（帧坐标=2560x1440）
BODY = (1740, 240, 820, 1070)     # 正文区（变化检测 + 裁块）
TITLE = (1750, 165, 780, 75)      # 标题条
CROP = (1700, 150, 860, 1180)     # 落盘裁块（标题+正文）

KEY_DOWN, KEY_UP = 108, 103


# ---------- 抓帧 / 稀疏读数 ----------
def grab(path):
    r = subprocess.run([CAP, 'latest', '--out', path, '--format', 'bmp'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'grab rc={r.returncode} {(r.stderr or r.stdout).strip()[:200]}')
    return path


def _hdr(f):
    """返回 (w, |h|, stride, top_down)。

    ⚠ ys-capture 的 bmp 是**自顶向下**（biHeight = -1440）。2026-10-23 踩过：
    把 biHeight 当无符号读成 4294965856，再按自底向上算偏移 ⇒ seek 越过 EOF
    ⇒ read() 返回 b'' ⇒ md5 恒等于空串 d41d8cd98f ⇒ **每次"没变化"**，
    点击明明生效也被判成没生效（仪器撒谎的典型）。
    """
    h = f.read(54)
    w = int.from_bytes(h[18:22], 'little')
    ht = int.from_bytes(h[22:26], 'little', signed=True)
    bpp = int.from_bytes(h[28:30], 'little')
    comp = int.from_bytes(h[30:34], 'little')
    if bpp != 24 or comp != 0:
        raise RuntimeError(f'unsupported bmp bpp={bpp} comp={comp}')
    return w, abs(ht), (w * 3 + 3) // 4 * 4, ht < 0


def sparse_sig(path, box, rowstep=8, colstep=3):
    """只读该区域每 rowstep 行、每 colstep 像素的原始字节 → md5。约 1ms。"""
    x, y, w, h = box
    with open(path, 'rb') as f:
        w_img, h_img, stride, top_down = _hdr(f)
        base = 54
        md = hashlib.md5()
        y1 = min(y + h, h_img)
        step = colstep * 3
        for ry in range(y, y1, rowstep):
            fy = ry if top_down else (h_img - 1 - ry)
            f.seek(base + fy * stride + x * 3)
            md.update(f.read(w * 3)[::step])
        return md.hexdigest()


def save_crop(bmp, png, box=CROP, level=3):
    img = Image.open(bmp).convert('RGB').crop((box[0], box[1], box[0] + box[2], box[1] + box[3]))
    img.save(png, compress_level=level)
    return png


# ---------- 输入注入 ----------
def loc():
    out = subprocess.run(['xdotool', 'getmouselocation', '--shell'],
                         capture_output=True, text=True).stdout
    d = dict(l.split('=', 1) for l in out.strip().splitlines() if '=' in l)
    return int(d['X']), int(d['Y'])


def move(x, y, tol=4, rounds=10):
    for _ in range(rounds):
        cx, cy = loc()
        dx, dy = x - cx, y - cy
        if abs(dx) <= tol and abs(dy) <= tol:
            return True
        subprocess.run(['ydotool', 'mousemove', '-x', str(dx), '-y', str(dy)],
                       capture_output=True)
        time.sleep(0.02)
    return False


def click_at(x, y, hold=0.12):
    move(x, y)
    subprocess.run(['ydotool', 'click', '0x40'], capture_output=True)
    time.sleep(hold)
    subprocess.run(['ydotool', 'click', '0x80'], capture_output=True)


def key(code):
    subprocess.run(['ydotool', 'key', f'{code}:1'], capture_output=True)
    subprocess.run(['ydotool', 'key', f'{code}:0'], capture_output=True)


# ---------- 等待判据 ----------
def wait_change(path, box, prev, timeout=1.8, poll=0.03):
    """轮询直到区域内像素签名 ≠ prev；返回 (changed, new_sig, waited_ms)。"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        grab(path)
        s = sparse_sig(path, box)
        if s != prev:
            return True, s, int((time.time() - t0) * 1000)
        time.sleep(poll)
    return False, prev, int((time.time() - t0) * 1000)


def wait_stable(path, box, last, need=2, timeout=1.5, poll=0.05):
    """等区域连续 need 次读数相同；返回 (sig, waited_ms)。"""
    t0 = time.time()
    same = 0
    cur = last
    while time.time() - t0 < timeout:
        grab(path)
        s = sparse_sig(path, box)
        if s == cur:
            same += 1
            if same >= need:
                return s, int((time.time() - t0) * 1000)
        else:
            cur, same = s, 0
        time.sleep(poll)
    return cur, int((time.time() - t0) * 1000)


# ---------- 列表 OCR ----------
NOISE = re.compile(r'^[\sA-Za-z]{1,2}')


def norm(s):
    s = NOISE.sub('', s or '')
    return re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]', '', s).lower()


def list_rows(frame, js, region=LIST):
    r = subprocess.run([YSTEXT, frame, '--region', ' '.join(map(str, region)),
                        '--only', 'lines', '--json-out', js], capture_output=True, text=True)
    if r.returncode != 0:
        return []
    d = json.load(open(js))
    rows = []
    for l in d.get('lines', []):
        x0, y0, x1, y1 = l['bbox']
        h = y1 - y0
        if h < 20 or h > 70 or (x1 - x0) < 90:
            continue
        if y0 < region[1] + 10 or y1 > region[1] + region[3] - 10:
            continue
        n = norm(l['text'])
        if len(re.findall(r'[\u4e00-\u9fff]', n)) < 2:
            continue
        rows.append({'text': l['text'].strip(), 'norm': n,
                     'y': (y0 + y1) // 2, 'bbox': l['bbox'], 'score': l.get('score')})
    rows.sort(key=lambda r: r['y'])
    return rows


def title_of(frame, js):
    r = subprocess.run([YSTEXT, frame, '--region', ' '.join(map(str, TITLE)),
                        '--only', 'lines', '--json-out', js], capture_output=True, text=True)
    if r.returncode != 0:
        return ''
    d = json.load(open(js))
    return ' '.join(l['text'] for l in d.get('lines', [])).strip()


# ---------- 模式 ----------
def mode_probe():
    os.makedirs(f'{OUT}/raw', exist_ok=True)
    f = grab('/tmp/ys04.bmp')
    rows = list_rows(f, f'{OUT}/raw/probe-list.json')
    t = title_of(f, f'{OUT}/raw/probe-title.json')
    print(json.dumps({'rows': rows, 'title': t}, ensure_ascii=False, indent=1))


def mode_pilot():
    log = []
    cur = '/tmp/ys04.bmp'
    step = f'{OUT}/frames'
    os.makedirs(step, exist_ok=True)
    os.makedirs(f'{OUT}/raw', exist_ok=True)

    def rec(tag, **kw):
        kw['tag'] = tag
        log.append(kw)
        print('[pilot]', json.dumps(kw, ensure_ascii=False), flush=True)

    grab(cur)
    rows = list_rows(cur, f'{OUT}/raw/pilot-list.json')
    rec('baseline', rows=[{'t': r['text'], 'y': r['y']} for r in rows],
        title=title_of(cur, f'{OUT}/raw/pilot-title.json'))
    body0 = sparse_sig(cur, BODY)

    # ① 点击第 3 行（验证坐标路径：frame 坐标 = 指针坐标？）
    target = rows[2] if len(rows) > 2 else rows[0]
    t0 = time.time()
    click_at(300, target['y'])
    ch, sig, waited = wait_change(cur, BODY, body0)
    if ch:
        sig, st = wait_stable(cur, BODY, sig)
    save_crop(cur, f'{step}/pilot-click3.png')
    rec('click3', target=target['text'], y=target['y'], changed=ch, waited_ms=waited,
        total_ms=int((time.time() - t0) * 1000),
        title=title_of(cur, f'{OUT}/raw/pilot-t1.json'))
    body0 = sig

    # ② ↓ 键能否移动选中项（若可以，全量采集就不需要坐标与列表 OCR）
    for i in (1, 2):
        t0 = time.time()
        key(KEY_DOWN)
        ch, sig, waited = wait_change(cur, BODY, body0)
        if ch:
            sig, st = wait_stable(cur, BODY, sig)
        save_crop(cur, f'{step}/pilot-down{i}.png')
        rec(f'down{i}', changed=ch, waited_ms=waited, total_ms=int((time.time() - t0) * 1000),
            title=title_of(cur, f'{OUT}/raw/pilot-down{i}.json'))
        body0 = sig

    # ③ ↑ 回退一次，确认可逆（且没丢同步）
    t0 = time.time()
    key(KEY_UP)
    ch, sig, waited = wait_change(cur, BODY, body0)
    if ch:
        sig, st = wait_stable(cur, BODY, sig)
    save_crop(cur, f'{step}/pilot-up1.png')
    rec('up1', changed=ch, waited_ms=waited, total_ms=int((time.time() - t0) * 1000),
        title=title_of(cur, f'{OUT}/raw/pilot-up1.json'))

    json.dump(log, open(f'{OUT}/raw/pilot.json', 'w'), ensure_ascii=False, indent=1)
    print('[pilot] wrote', f'{OUT}/raw/pilot.json')


def mode_run(budget_s=420, nav='key', cap=400):
    """全量采集。nav=key 用 ↓ 导航；nav=click 用列表 OCR + 点击。"""
    os.makedirs(f'{OUT}/frames', exist_ok=True)
    os.makedirs(f'{OUT}/raw', exist_ok=True)
    cur = '/tmp/ys04.bmp'
    recs = []
    seen = {}
    t_start = time.time()
    idx = 0

    def out(d):
        with open(f'{OUT}/raw/entries.jsonl', 'a') as fh:
            fh.write(json.dumps(d, ensure_ascii=False) + '\n')

    grab(cur)
    body0 = sparse_sig(cur, BODY)

    # 起点：先把焦点给列表（点第一行可见条目），并确认正文有实际条目
    rows = list_rows(cur, f'{OUT}/raw/list-00.json')
    if not rows:
        print('[run] 列表 OCR 为空，退出', flush=True)
        return 2

    def take(tag, waited):
        nonlocal idx
        idx += 1
        png = f'{OUT}/frames/{idx:04d}.png'
        save_crop(cur, png)
        t = title_of(cur, '/tmp/ys04-title.json')
        d = {'idx': idx, 'title': t, 'change_ms': waited, 'crop': os.path.relpath(png, OUT),
             'tag': tag, 't_rel': round(time.time() - t_start, 1)}
        recs.append(d)
        out(d)
        print(f'[{idx:04d}] {t}  ({waited}ms, {d["t_rel"]}s)', flush=True)
        return t

    # ① 点击首行，建立"列表有焦点"的前提
    first = rows[0]
    click_at(300, first['y'])
    ch, sig, waited = wait_change(cur, BODY, body0)
    if ch:
        sig, _ = wait_stable(cur, BODY, sig)
    t0 = take('click-first', waited)
    body0 = sig
    seen[norm(t0)] = idx

    # ② 逐条前进
    stalls = 0
    while idx < cap and time.time() - t_start < budget_s:
        if nav == 'key':
            key(KEY_DOWN)
            ch, sig, waited = wait_change(cur, BODY, body0, timeout=1.2)
            if not ch:
                stalls += 1
                if stalls >= 3:
                    print('[run] 连续 3 次无变化 ⇒ 认为到底', flush=True)
                    break
                time.sleep(0.2)
                continue
            stalls = 0
            sig, _ = wait_stable(cur, BODY, sig)
            body0 = sig
            t = take('key', waited)
            if norm(t) in seen:
                print('[run] 标题重复 ⇒ 停止', flush=True)
                break
            seen[norm(t)] = idx
        else:
            rows = list_rows(cur, f'{OUT}/raw/list-{idx:03d}.json')
            todo = [r for r in rows if norm(r['text']) not in seen]
            if not todo:
                scroll_down()
                continue
            r = todo[0]
            click_at(300, r['y'])
            ch, sig, waited = wait_change(cur, BODY, body0)
            if ch:
                sig, _ = wait_stable(cur, BODY, sig)
            body0 = sig
            t = take('click', waited)
            seen[norm(r['text'])] = idx

    json.dump({'count': idx, 'elapsed': round(time.time() - t_start, 1)},
              open(f'{OUT}/raw/run-summary.json', 'w'), ensure_ascii=False, indent=1)
    print(f'[run] done count={idx} elapsed={time.time() - t_start:.0f}s', flush=True)
    return 0


def scroll_down(notches=5):
    move(300, 640)
    subprocess.run(['xdotool', 'click', '--repeat', str(notches), '--delay', '60', '5'],
                   capture_output=True)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'probe'
    if mode == 'probe':
        mode_probe()
    elif mode == 'pilot':
        mode_pilot()
    elif mode == 'run':
        nav = sys.argv[2] if len(sys.argv) > 2 else 'key'
        budget = int(sys.argv[3]) if len(sys.argv) > 3 else 420
        sys.exit(mode_run(budget_s=budget, nav=nav))
    else:
        print('unknown mode', mode)
        sys.exit(2)
