#!/usr/bin/env python3
"""list-collect — 「逐条列表 + 右面板正文」类页面的通用采集器（键盘导航版）

来历（2026-10-23 原神语音页 198 条实测：2.62–2.93s/条，总占屏 9.3 分钟）：
  ① UI 常自带键盘提示（语音页列表左侧 W/S）⇒ 键盘逐条移动选中项，比鼠标坐标闭环可靠
     （本机游戏内指针 ~2.7× 加速、抓走指针时 xdotool 回读不可信）；
  ② **"按完要等 2.2s"曾解释成面板两段式动画——该解释 2026-10-23 已被实测推翻**：
     真因是抓帧通道陈旧（XShm 按窗读回在窗口看不见时滞后 0.3–2.23s，最长实测冻结 2.71s；
     同一时段合成器通道连续帧都在变）。守护侧已修（内容身份 content_id + 交叉通道稽核 +
     有人读时切合成器通道）⇒ 现在按"内容身份推进"门控即可，不再固定等 2.2s；
     用"区域稳定就抓"的判据仍会在动画中段误判稳定、读到上一条 → **静默跳条**；
  ③ 所以每条都要 OCR 标题复核：读到与上一条相同 ⇒ 继续等新帧，仍未推进才算到底。

## 2026-10-23 改：固定等待 ⇒ 帧新鲜度门控（实测差 4–6 倍的原因就在这）

标定读数：**按键→画面变化 0.02–0.19s、`frame.age_ms` 5–54ms、正确循环 0.37–0.68s/条
（含标题 OCR）**；而 `.03` 把等待加到 3.6s 仍失败、`.04` 固定 2.2s/条 ⇒ 差 4–6 倍。

现在默认（门控模式）：
  · 按 S 后**轮询** `ys-capture latest`（`--poll` 30ms），直到
    **内容身份推进**（`content.id` 变化；旧守护没有该字段时退回 `src`）
    **且** `frame.age_ms < --max-age`（默认 500ms）才算换了一条；
  · 内容身份没变 ⇒ **不判陈旧**，继续轮询（旧版这种样本会被当成"到底"）；
  · `age_ms` 超阈 ⇒ 判陈旧（旧帧）并重抓，**不**拿它下结论；
  · 总超时 `--timeout`（默认 2s）⇒ 本轮没推进（键被吞/到底），由 `--stalls` 决定何时收工；
  · 标题比较走**归一化**：去 `… · ： : 空白` 后 casefold。同一行标题会在
    `… / · / ： / 无` 之间抖动，不归一化会把"同一条"判成"新一条"。

`--legacy-wait`：回到旧行为（固定 `--wait 2.2` + `--reread` 复核）。只有门控在新页面上
取数可疑时才用它——它有已知的"静默跳条/白烧 3~6 倍时间"风险。

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

自测（**纯逻辑，不碰屏幕、不注入**）：
  python3 .agents/skills/device-playtest-loop/scripts/list-collect.py --self-test
覆盖：① `src` 不变 + `age_ms` 小 ⇒ 不判陈旧、继续等（不记条）；② `age_ms` 超阈 ⇒ 判陈旧重抓；
③ 标题抖动（`X·` → `X…`）⇒ 判同一条、不重复记。末行机读：`SELFTEST-PASS n/n`。
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
# 左侧键盘提示（语音页的 W/S）这类「1~2 个 ASCII 前缀 + 中文」才剥；纯 ASCII 标题不动它
NOISE_RE = re.compile(r'^[\sA-Za-z]{1,2}(?=[\u4e00-\u9fff])')
# 标题抖动字符：同一行的标题会在 省略号/间隔号/全半角冒号 之间有/无地来回变
JITTER = str.maketrans({c: None for c in '…·•：:'})
# ys-capture 的 rc：陈旧帧是**正常现象**（重抓即可），其余多半是"这块屏现在不是我们的"
TRANSIENT_RC = {8, 10, 13}      # 8=STALE_FRAME 10=FORMAT_NOT_READY 13=CONTENT_NOT_ADVANCED
DEFAULT_MAX_AGE = 500           # ms：超过它就不算"刚变化的帧"
DEFAULT_TIMEOUT = 2.0           # s：一次按键最多等多久看到新帧
DEFAULT_POLL = 0.03             # s：轮询间隔（30ms）


# ─────────────────────────── 帧回执解析（判据唯一源） ───────────────────────────
def parse_frame(d, rc=0):
    """ys-capture latest 的 JSON → 统一的帧回执。

    字段口径（2026-10-23 实测，写错就全记 null）：`src`/`channel`/`content` 在**顶层**；
    `seq` / `age_ms` / `crc32` 在 `frame` 子对象里；`content.id` 是**内容身份**（只在内容变时前进），
    比 `src` 更该用来判"画面有没有推进"（内容不变时 src 本来就保持不变）。
    """
    d = d or {}
    fr = d.get('frame') or {}
    ct = d.get('content') or {}
    ct = ct if isinstance(ct, dict) else {}
    ok = rc == 0 and bool(d.get('ok'))
    out = {'ok': ok, 'rc': rc, 'src': d.get('src'), 'seq': fr.get('seq'),
           'age_ms': fr.get('age_ms'), 'crc32': fr.get('crc32'),
           'content_id': ct.get('id'), 'static_ms': ct.get('static_ms'),
           'channel': d.get('channel'), 'demand_wait_ms': d.get('demand_wait_ms'),
           'error': None}
    if not ok:
        out['error'] = d.get('error') or ('rc=%d' % rc)
    return out


def grab_once(path=None):
    """读一次 `ys-capture latest`。给了 path 就顺带把帧落成 bmp（OCR/裁块用）。"""
    cmd = [CAP, 'latest', '--json']
    if path:
        cmd += ['--out', path, '--format', 'bmp']
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return parse_frame({}, -1) | {'error': '%s: %s' % (type(exc).__name__, exc)}
    raw = (r.stdout or '').strip()
    d = {}
    if raw:
        try:
            d = json.loads(raw.splitlines()[-1])
        except (ValueError, IndexError):
            d = {}
    return parse_frame(d, r.returncode)


def norm_title(s):
    """标题归一化：去 `… · ： : 空白` ⇒ casefold（同一条不做成两条的判据）。"""
    s = NOISE_RE.sub('', s or '')
    return re.sub(r'\s+', '', s.translate(JITTER)).casefold()


def advanced(last_title, title):
    """标题是否推进（判据唯一源：归一化后非空且与上一条不同）。"""
    n = norm_title(title)
    return bool(n) and n != norm_title(last_title)


class Freshener:
    """帧新鲜度门控：等到「src 变了 且 age_ms < max_age」的那一帧。

    grab 可注入（自测用假 grabber），sleep/now 也可注入（自测用假时钟，0 秒跑完）。
    判据三条，一一对应旧版的两个坑：
      · 内容身份没变 ⇒ **不**陈旧，继续轮询（旧版在这里判"到底"）；
      · age_ms 超阈 / 抓帧失败 ⇒ 陈旧，重抓（不拿它下结论）；
      · 超时 ⇒ 本轮没推进，交回上层（stalls 计数决定何时收工）。
    """

    def __init__(self, grab, max_age_ms=DEFAULT_MAX_AGE, timeout_s=DEFAULT_TIMEOUT,
                 poll_s=DEFAULT_POLL, sleep_fn=time.sleep, now_fn=time.monotonic):
        self.grab = grab
        self.max_age_ms = max_age_ms
        self.timeout_s = timeout_s
        self.poll_s = poll_s
        self.sleep = sleep_fn
        self.now = now_fn

    @staticmethod
    def key_of(frame):
        """推进判据的键：优先 content_id（内容身份），旧守护没有就用 src 路径。"""
        cid = (frame or {}).get('content_id')
        if cid is not None:
            return ('id', cid)
        return ('src', (frame or {}).get('src'))

    def wait_advance(self, prev_key):
        if not isinstance(prev_key, tuple):
            prev_key = ('src', prev_key)      # 兼容旧调用（传 src 字符串）
        t0 = self.now()
        polls = stale = 0
        last = None
        while True:
            f = self.grab()
            last = f
            polls += 1
            fresh = (f.get('ok') and f.get('age_ms') is not None
                     and f['age_ms'] <= self.max_age_ms)
            if fresh and self.key_of(f) != prev_key and self.key_of(f)[1] is not None:
                return f, {'verdict': 'advanced', 'polls': polls,
                           'stale_skips': stale,
                           'elapsed_ms': int((self.now() - t0) * 1000),
                           'content_id': f.get('content_id'), 'channel': f.get('channel')}
            if not fresh:
                stale += 1                     # ② 陈旧/读不到 ⇒ 重抓
            if self.now() - t0 >= self.timeout_s:
                return None, {'verdict': 'timeout', 'polls': polls,
                              'stale_skips': stale,
                              'elapsed_ms': int((self.now() - t0) * 1000),
                              'last': last}
            self.sleep(self.poll_s)            # 内容没推进 ⇒ 继续等（不记条、不 sleep 长值）


# ─────────────────────────── 真机动作（槽内才可用） ───────────────────────────
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


# ─────────────────────────────── 自测（纯逻辑） ───────────────────────────────
class FakeClock:
    def __init__(self):
        self.t = 1000.0

    def now(self):
        return self.t

    def sleep(self, s):
        self.t += s


def fake_grabber(seq):
    """按序列吐帧回执，用完后重复最后一个 ⇒ 超时分支能自然收敛。"""
    box = {'i': 0}

    def grab():
        i = min(box['i'], len(seq) - 1)
        box['i'] += 1
        return seq[i]
    return grab


def mk(src, age, ok=True, rc=0):
    return {'ok': ok, 'rc': rc, 'src': src, 'seq': 1, 'age_ms': age,
            'crc32': 'deadbeef', 'error': None if ok else 'rc=%d' % rc}


def selftest():
    total = [0]
    fails = []

    def ck(name, cond, detail=''):
        total[0] += 1
        if not cond:
            fails.append(name)
        print('  %s %s%s' % ('PASS' if cond else 'FAIL', name,
                             ('  [%s]' % detail) if detail else ''))

    # ── T1：字段口径（src 顶层 / age_ms·seq·crc32 在 frame 里）
    f = parse_frame({'ok': True, 'src': '/dev/shm/ys-capture/ring-1.rgb',
                     'frame': {'seq': 42, 'age_ms': 31, 'crc32': '1a2b3c4d'}}, 0)
    ck('T1 字段口径：src 取顶层、age_ms/seq/crc32 取 frame',
       f['src'].endswith('ring-1.rgb') and f['seq'] == 42 and f['age_ms'] == 31
       and f['crc32'] == '1a2b3c4d' and f['ok'], str(f))

    # ── T2（分支①）：src 不变 + age_ms 小 ⇒ 不判陈旧、继续等、不得记一条
    clock = FakeClock()
    lv = Freshener(fake_grabber([mk('a', 20), mk('a', 18), mk('a', 22), mk('b', 30)]),
                   max_age_ms=500, timeout_s=2.0, sleep_fn=clock.sleep, now_fn=clock.now)
    fr, diag = lv.wait_advance('a')      # 基线 = 当前帧的 src（与真机调用口径一致）
    ck('T2 ①src 不变+age 小 ⇒ 不判陈旧（stale_skips=0），继续等到真变化',
       fr is not None and fr['src'] == 'b' and diag['stale_skips'] == 0, str(diag))
    ck('T2b ①期间不记条：前 3 帧同 src 都没被当成本轮推进',
       diag['polls'] == 4 and diag['verdict'] == 'advanced', str(diag))

    # ── T3（分支②）：age_ms 超阈 ⇒ 判陈旧并重抓（同一 src 与已变 src 两种都算）
    clock = FakeClock()
    lv = Freshener(fake_grabber([mk('a', 20), mk('a', 900), mk('a', 40), mk('b', 25)]),
                   max_age_ms=500, timeout_s=2.0, sleep_fn=clock.sleep, now_fn=clock.now)
    fr, diag = lv.wait_advance('a')
    ck('T3 ②age_ms 超阈 ⇒ 判陈旧重抓（stale_skips=1），不拿旧帧下结论',
       fr is not None and fr['src'] == 'b' and diag['stale_skips'] == 1 and diag['polls'] == 4,
       str(diag))
    clock = FakeClock()
    lv = Freshener(fake_grabber([mk('b', 900), mk('b', 40)]),
                   max_age_ms=500, timeout_s=2.0, sleep_fn=clock.sleep, now_fn=clock.now)
    fr, diag = lv.wait_advance('a')
    ck('T3b ②src 变了但 age 超阈 ⇒ 仍判陈旧，等下一帧',
       fr is not None and fr['src'] == 'b' and fr['age_ms'] == 40
       and diag['stale_skips'] == 1, str(diag))
    clock = FakeClock()
    lv = Freshener(fake_grabber([mk('a', 20), mk('x', None, ok=False, rc=7)]),
                   max_age_ms=500, timeout_s=0.12, sleep_fn=clock.sleep, now_fn=clock.now)
    fr, diag = lv.wait_advance('a')
    ck('T3c ②抓帧失败也算陈旧（rc=7 ⇒ stale_skips>0），超时后返回 None',
       fr is None and diag['verdict'] == 'timeout' and diag['stale_skips'] > 0, str(diag))

    # ── T4（分支③）：标题抖动不重复记
    ck('T4a ③X· ⇔ X…（间隔号/省略号抖动）判同一条', not advanced('X·', 'X…'),
       '%r vs %r' % (norm_title('X·'), norm_title('X…')))
    ck('T4b ③X： ⇔ X: ⇔ 空白（全半角冒号）判同一条',
       not advanced('X：甘雨', 'X: 甘雨') and not advanced('甘雨', ' 甘雨 '),
       '%r' % norm_title('X：甘雨'))
    ck('T4c 空标题不推进（OCR 空 ⇒ 不算新一条）', not advanced('甘雨', '') and not advanced('', ''))
    ck('T4d 真不同标题仍推进（归一化没有把判据泡软）',
       advanced('甘雨', '钟离') and advanced('', '甘雨'))

    # ── T5：内容身份优先于 src（src 变了但 content_id 没变 ⇒ 不算推进）
    clock = FakeClock()
    lv = Freshener(fake_grabber([
        {'ok': True, 'rc': 0, 'src': '/a', 'content_id': 7, 'age_ms': 20},
        {'ok': True, 'rc': 0, 'src': '/b', 'content_id': 7, 'age_ms': 20},   # src 变、内容没变
        {'ok': True, 'rc': 0, 'src': '/b', 'content_id': 8, 'age_ms': 20}]),
        max_age_ms=500, timeout_s=2.0, sleep_fn=clock.sleep, now_fn=clock.now)
    fr, diag = lv.wait_advance(('id', 7))
    ck('T5 content_id 优先：src 变而内容没变不算推进，等到 id=8 才记',
       fr is not None and fr['content_id'] == 8 and diag['polls'] == 3, str(diag))

    n = total[0]
    print('%s %d/%d' % ('SELFTEST-PASS' if not fails else 'SELFTEST-FAIL', n - len(fails), n))
    return 0 if not fails else 1


# ──────────────────────────────── 主流程 ────────────────────────────────
def main():
    ap = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description='逐条列表 + 右面板正文采集器（键盘导航；默认用帧新鲜度门控代替固定等待）',
        epilog=__doc__.split('## 2026-10-23 改')[0])
    ap.add_argument('mode', nargs='?', choices=['top', 'cont'],
                    help='top=先冲顶再向下采 cont=从当前选中项继续（--self-test 时省略）')
    ap.add_argument('--tag', default='p1')
    ap.add_argument('--out', default=os.path.join(ROOT, 'gui-test/list-collect'))
    ap.add_argument('--cap', type=int, default=400, help='最多采多少条')
    ap.add_argument('--budget', type=int, default=240,
                    help='本趟时间预算（秒），≤240 才塞得进 290s 凭据')
    ap.add_argument('--max-age', type=int, default=DEFAULT_MAX_AGE,
                    help='帧新鲜度阈值（ms，默认 %d）：age_ms 超过它 ⇒ 判陈旧重抓' % DEFAULT_MAX_AGE)
    ap.add_argument('--timeout', type=float, default=DEFAULT_TIMEOUT,
                    help='一次按键最多等多久看到新帧（秒，默认 %.1f）' % DEFAULT_TIMEOUT)
    ap.add_argument('--poll', type=float, default=DEFAULT_POLL,
                    help='轮询 ys-capture latest 的间隔（秒，默认 %.2f）' % DEFAULT_POLL)
    ap.add_argument('--wait', type=float, default=2.2,
                    help='回退模式的固定等待（秒，默认 2.2；仅 --legacy-wait 与 top 冲顶落定使用）')
    ap.add_argument('--reread', type=float, default=1.0,
                    help='回退模式：标题没变时多久后复核重读（秒；仅 --legacy-wait）')
    ap.add_argument('--legacy-wait', action='store_true',
                    help='回退到旧行为：固定 --wait + --reread（已知会静默跳条/白烧 3~6 倍时间）')
    ap.add_argument('--stalls', type=int, default=3, help='连续几次未推进判到底')
    ap.add_argument('--key-down', type=int, default=31, help='evdev 键码：下一条（S=31 / ↓=108）')
    ap.add_argument('--key-up', type=int, default=17, help='evdev 键码：上一条（W=17 / ↑=103）')
    ap.add_argument('--title-region', default='1750 165 780 75')
    ap.add_argument('--crop', default='1700 150 860 1180')
    ap.add_argument('--self-test', action='store_true',
                    help='纯逻辑自测（注入假 grabber/假时钟，不碰屏幕、不注入）')
    a = ap.parse_args()
    if a.self_test:
        return selftest()
    if not a.mode:
        ap.error('缺少 mode（top|cont），或改用 --self-test')

    title_region = parse_box(a.title_region)
    crop = parse_box(a.crop)
    os.makedirs(f'{a.out}/frames', exist_ok=True)
    os.makedirs(f'{a.out}/raw', exist_ok=True)
    cur = '/tmp/list-collect.bmp'
    js = '/tmp/list-collect.json'
    t0 = time.time()
    log = open(f'{a.out}/raw/entries-{a.tag}.jsonl', 'w')
    recs = []
    fresh = Freshener(lambda: grab_once(), max_age_ms=a.max_age,
                      timeout_s=a.timeout, poll_s=a.poll)

    def frame_and_title():
        """抓一帧落盘 + OCR 标题；返回 (帧回执, 标题)。"""
        meta = grab_once(cur)
        return meta, (title_of(cur, title_region, js) if meta['ok'] else '')

    if a.mode == 'top':
        last = None
        for i in range(12):
            for _ in range(25):
                key(a.key_up)
                time.sleep(0.12)
            # 冲顶是批量动作：落定仍用固定等待（逐条快门控只对单次按键成立）
            time.sleep(a.wait + 0.2)
            _, t = frame_and_title()
            print(f'[top] 第{i + 1}轮冲顶后标题={t}', flush=True)
            if last is not None and norm_title(t) == norm_title(last):
                break
            last = t
        else:
            print('[top] ⚠ 12 轮仍未见饱和，起点可能不是列表首条', flush=True)

    meta, first = frame_and_title()
    cur_key = Freshener.key_of(meta)
    print(f'[{a.tag}] 起点={first}', flush=True)

    def take(kind, t, wait_s):
        p = f'{a.out}/frames/{a.tag}-{len(recs) + 1:04d}.jpg'
        save_crop(cur, p, crop)
        d = {'idx': len(recs) + 1, 'kind': kind, 'title': t,
             'crop': os.path.relpath(p, a.out), 'wait_s': wait_s,
             't_rel': round(time.time() - t0, 1)}
        recs.append(d)
        log.write(json.dumps(d, ensure_ascii=False) + '\n')
        log.flush()
        return d

    take('start', first, 0)
    last, stalls = first, 0
    while len(recs) < a.cap and time.time() - t0 < a.budget:
        key(a.key_down)
        if a.legacy_wait:
            # ── 回退模式：固定等待 + 复核重读（旧行为，一字不改）
            time.sleep(a.wait)
            meta, t = frame_and_title()
            cur_key = Freshener.key_of(meta)
            if norm_title(t) == norm_title(last):
                time.sleep(a.reread)
                meta, t = frame_and_title()
                cur_key = Freshener.key_of(meta)
            wait_s = a.wait
        else:
            # ── 门控模式：等「内容身份推进 且 age_ms 新鲜」的帧
            fr, diag = fresh.wait_advance(cur_key)
            if fr is None:                       # 超时：键被吞 or 到底
                stalls += 1
                print(f'[{a.tag}] stall={stalls} 未等到新帧（{diag["elapsed_ms"]}ms, '
                      f'stale={diag["stale_skips"]}）', flush=True)
                if stalls >= a.stalls:
                    print('[done] 连续未推进 ⇒ 到底', flush=True)
                    break
                continue
            cur_key = Freshener.key_of(fr)
            meta, t = frame_and_title()
            wait_s = round(diag['elapsed_ms'] / 1000.0, 3)
            if not advanced(last, t):
                # ③ 帧变了但标题还是同一条（抖动/动画中段）⇒ 继续等下一个新帧，不 sleep、不记条
                cur_key = Freshener.key_of(meta)
                fr2, diag2 = fresh.wait_advance(cur_key)
                if fr2 is not None:
                    cur_key = Freshener.key_of(fr2)
                    meta, t = frame_and_title()
                    wait_s = round((diag['elapsed_ms'] + diag2['elapsed_ms']) / 1000.0, 3)
        if not advanced(last, t):
            stalls += 1
            print(f'[{a.tag}] stall={stalls} title={t}', flush=True)
            if stalls >= a.stalls:
                print('[done] 连续未推进 ⇒ 到底', flush=True)
                break
            continue
        stalls = 0
        d = take('key', t, wait_s)
        last = t
        if d['idx'] % 10 == 0:
            el = time.time() - t0
            print(f'[{d["idx"]:04d}] {t} t={el:.0f}s avg={el / d["idx"]:.2f}s/条', flush=True)

    summary = {'tag': a.tag, 'mode': a.mode, 'count': len(recs),
               'elapsed': round(time.time() - t0, 1),
               'per_entry_s': round((time.time() - t0) / max(len(recs), 1), 2),
               'gate': 'legacy-wait' if a.legacy_wait else 'freshness',
               'max_age_ms': a.max_age, 'timeout_s': a.timeout,
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
