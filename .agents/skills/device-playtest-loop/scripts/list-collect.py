#!/usr/bin/env python3
"""list-collect — 「逐条列表 + 右面板正文」类页面的通用采集器（键盘导航版）

来历（2026-10-23 原神语音页 198 条实测：2.62–2.93s/条，总占屏 9.3 分钟）：
  ① UI 常自带键盘提示（语音页列表左侧 W/S）⇒ 键盘逐条移动选中项，比鼠标坐标闭环可靠
     （本机游戏内指针 ~2.7× 加速、抓走指针时 xdotool 回读不可信）；
  ② 面板文字常是**两段式动画**（实测 +0.24s 淡出、+2.06s 落定）⇒ 按完必须等 ~2.2s；
     用"区域稳定就抓"的判据会在 1.3s 误判稳定、读到上一条，再按一次 → **静默跳条**；
  ③ 所以每条都要 OCR 标题复核：读到与上一条相同 ⇒ 隔 `--reread` 秒重读，仍未推进才算到底。

用法（**必须在 ys-gui-slot 槽内跑**，且先拿屏幕凭据）：
  . tools/ys-editor/ys-env.sh
  tools/ys-editor/ys-screen-grant grant --task <id> --eta 290 --reason '…' --user-said '<用户原话>'
  W=$(tools/ys-editor/ys-win-id)
  tools/ys-editor/ys-gui-slot "$W" 260 bash -c '. tools/ys-editor/ys-env.sh; \
      python3 .agents/skills/device-playtest-loop/scripts/list-collect.py top --tag p1 --budget 240'

  top   = 先连按上键冲顶（标题饱和即停），再向下逐条采
  cont  = 从当前选中项继续向下（分趟续采用这个；**每趟 ≤240s** 以塞进单次 290s 凭据）

产物：<out>/frames/<tag>-NNNN.jpg（裁块，含标题+正文）+ <out>/raw/entries-<tag>.jsonl（标题/耗时/来源）
离线组装见 `gui-text-collect` 技能：ys-text 出「行 → 段落」，段落按说话人前缀切。
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
CAP = os.path.join(ROOT, 'tools/ys-editor/ys-capture')
YSTEXT = os.path.join(ROOT, 'tools/ys-editor/ys-text')
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


def ocr(frame, region, js, only='lines'):
    r = subprocess.run([YSTEXT, frame, '--region', ' '.join(map(str, region)),
                        '--only', only, '--json-out', js], capture_output=True, text=True)
    if r.returncode != 0:
        return []
    try:
        return json.load(open(js)).get('lines', [])
    except Exception:
        return []


def norm(s):
    s = NOISE_RE.sub('', s or '')
    return re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]', '', s).lower()


def title_of(frame, region, js):
    return ' '.join(l['text'] for l in ocr(frame, region, js)).strip()


def save_crop(bmp, out, crop):
    from PIL import Image
    x, y, w, h = crop
    Image.open(bmp).convert('RGB').crop((x, y, x + w, y + h)).save(out, quality=92)


def parse_box(s):
    v = [int(t) for t in re.split(r'[ ,]+', s.strip()) if t]
    if len(v) != 4:
        sys.exit(f'区域要 4 个整数（x y w h 或 x0 y0 x1 y1 不支持）：{s}')
    return tuple(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['top', 'cont'])
    ap.add_argument('--tag', default='p1')
    ap.add_argument('--out', default=os.path.join(ROOT, 'gui-test/list-collect'))
    ap.add_argument('--cap', type=int, default=400, help='最多采多少条')
    ap.add_argument('--budget', type=int, default=240, help='本趟时间预算（秒），≤240 才塞得进 290s 凭据')
    ap.add_argument('--wait', type=float, default=2.2, help='按完键等多久再抓（面板落定时间，实测 2.06s）')
    ap.add_argument('--reread', type=float, default=1.0, help='标题没变时多久后复核重读')
    ap.add_argument('--stalls', type=int, default=3, help='连续几次未推进判到底')
    ap.add_argument('--key-down', type=int, default=31, help='evdev 键码：下一条（S=31 / ↓=108）')
    ap.add_argument('--key-up', type=int, default=17, help='evdev 键码：上一条（W=17 / ↑=103）')
    ap.add_argument('--title-region', default='1750 165 780 75')
    ap.add_argument('--crop', default='1700 150 860 1180')
    a = ap.parse_args()

    title_region = parse_box(a.title_region)
    crop = parse_box(a.crop)
    os.makedirs(f'{a.out}/frames', exist_ok=True)
    os.makedirs(f'{a.out}/raw', exist_ok=True)
    cur = '/tmp/list-collect.bmp'
    js = '/tmp/list-collect.json'
    t0 = time.time()
    log = open(f'{a.out}/raw/entries-{a.tag}.jsonl', 'w')
    recs = []

    if a.mode == 'top':
        last = None
        for i in range(12):
            for _ in range(25):
                key(a.key_up)
                time.sleep(0.12)
            time.sleep(a.wait + 0.2)
            grab(cur)
            t = title_of(cur, title_region, js)
            print(f'[top] 第{i + 1}轮冲顶后标题={t}', flush=True)
            if last is not None and norm(t) == norm(last):
                break
            last = t
        else:
            print('[top] ⚠ 12 轮仍未见饱和，起点可能不是列表首条', flush=True)

    grab(cur)
    first = title_of(cur, title_region, js)
    print(f'[{a.tag}] 起点={first}', flush=True)

    def take(kind, t):
        p = f'{a.out}/frames/{a.tag}-{len(recs) + 1:04d}.jpg'
        save_crop(cur, p, crop)
        d = {'idx': len(recs) + 1, 'kind': kind, 'title': t,
             'crop': os.path.relpath(p, a.out), 'wait_s': a.wait,
             't_rel': round(time.time() - t0, 1)}
        recs.append(d)
        log.write(json.dumps(d, ensure_ascii=False) + '\n')
        log.flush()
        return d

    take('start', first)
    last, stalls = first, 0
    while len(recs) < a.cap and time.time() - t0 < a.budget:
        key(a.key_down)
        time.sleep(a.wait)
        grab(cur)
        t = title_of(cur, title_region, js)
        if norm(t) == norm(last):                      # 读早了 or 到底 → 复核重读
            time.sleep(a.reread)
            grab(cur)
            t = title_of(cur, title_region, js)
        if not norm(t) or norm(t) == norm(last):
            stalls += 1
            print(f'[{a.tag}] stall={stalls} title={t}', flush=True)
            if stalls >= a.stalls:
                print('[done] 连续未推进 ⇒ 到底', flush=True)
                break
            continue
        stalls = 0
        d = take('key', t)
        last = t
        if d['idx'] % 10 == 0:
            el = time.time() - t0
            print(f'[{d["idx"]:04d}] {t} t={el:.0f}s avg={el / d["idx"]:.2f}s/条', flush=True)

    summary = {'tag': a.tag, 'mode': a.mode, 'count': len(recs),
               'elapsed': round(time.time() - t0, 1),
               'per_entry_s': round((time.time() - t0) / max(len(recs), 1), 2),
               'first': first, 'last': recs[-1]['title'] if recs else None,
               'titles': [r['title'] for r in recs]}
    log.write(json.dumps({'summary': summary}, ensure_ascii=False) + '\n')
    log.close()
    json.dump(summary, open(f'{a.out}/raw/summary-{a.tag}.json', 'w'), ensure_ascii=False, indent=1)
    print(f'[done] {a.tag} count={summary["count"]} elapsed={summary["elapsed"]}s '
          f'avg={summary["per_entry_s"]}s/条 last={summary["last"]}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
