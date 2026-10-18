#!/usr/bin/env python3
"""prelabel.py — **半自动标注流水线**（cv 预标 → 人工修正 → truth JSON），票 23/24 的数据前置。

为什么需要它：票 24 要 200 帧/~4000 实例；纯手标 3.5–5h，且错一次要重标。
本工具把「画框」这件事外包给 `tools/ys-screen`（cv 平坦皮肤 + OCR 文本行 + 纯图形叶子），
人只做**删/补/改边**，目标 60–90s/帧。修正走**行文本**（不是点 GUI）：可 diff、可 grep、可脚本批改。

四段式（每段都能单独跑）：
  1. 预标   prelabel.py frames <帧目录|帧文件...> --out <目录> [--backend cv|onnx|torch]
              [--split-rows] [--glyphs] [--no-overlay] [--limit N]
            产出每帧三件：`<stem>.json`（truth schema + provenance + review=pending）
                          `<stem>.lines.txt`（**人工修正这一份**）
                          `<stem>.overlay.png`（带编号的框图，看编号→改对应行）
  2. 修正   直接编辑 `<stem>.lines.txt`：删行=删对象；加行=加对象（id 写 `new`）；
            改坐标=改 4 个数字；改 kind/文字=改对应字段；行首 `#` 注释掉=删。
            行格式：`id | kind | x y w h | text1 / text2 | {可选 JSON: state/clipped/badges}`
  3. 回写   prelabel.py apply <stem>.lines.txt --out <stem>.json [--reviewed-by 名字]
            校验（bbox 正整数、kind 合法、越界告警）后写回 truth schema，review 置 done。
  4. 复核   prelabel.py check <truth目录>          # 逐帧 schema 校验（退出码 3 = 有非法）
            tools/ys-coverage --truth <真值目录> --selftest    # 门槛自证
            tools/ys-coverage --truth <真值目录> --pred <预标目录> --pred-format xywh   # 预标召回

预标候选的来源（--split-rows / --glyphs 打开时更全，默认只 containers）：
  · `containers[]`：面板/格子/行/按钮 —— 直接映射 kind；
  · `--split-rows`：容器的 OCR 文本行 ≥2 时，**按文本行拆成多行候选**（修 cv 把 6 行并成一块的通病）；
  · `--glyphs`：`free_glyphs[]` 纯图形叶子 → icon 候选（头像/图标行的召回来源）。
bbox 口径：ys-screen 是 **xyxy**，本工具一律转换成 truth 的 **xywh** 再落盘。

退出码：0 成功 / 2 用法错 / 3 校验失败 / 4 ys-screen 缺失或某帧失败 / 5 帧不存在
"""
import argparse
import glob
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
KINDS = ('panel', 'row', 'tile', 'card', 'button', 'icon', 'avatar', 'chip', 'unknown')
CLICKABLE = ('yes', 'no', 'unknown')
KIND_COLOR = {'panel': (0, 200, 255), 'row': (0, 255, 120), 'tile': (255, 200, 0),
              'card': (255, 120, 255), 'button': (255, 80, 80), 'icon': (255, 255, 255),
              'avatar': (120, 255, 255), 'chip': (180, 120, 255), 'unknown': (160, 160, 160)}


# ---------------------------------------------------------------- 工具
def xywh(b):
    x, y, x1, y1 = b
    return [int(x), int(y), int(x1 - x), int(y1 - y)]


def load_screen(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _overlaps_text(gb, tboxes, ratio=0.6):
    ga = gb[2] * gb[3]
    if ga <= 0:
        return False
    for tb in tboxes:
        x0 = max(gb[0], tb[0]); y0 = max(gb[1], tb[1])
        x1 = min(gb[0] + gb[2], tb[0] + tb[2]); y1 = min(gb[1] + gb[3], tb[1] + tb[3])
        if x1 > x0 and y1 > y0:
            if (x1 - x0) * (y1 - y0) / ga >= ratio:
                return True
    return False


def candidates_from_screen(doc, split_rows=False, glyphs=False, min_icon=28, loose_text=True):
    """把 ys-screen 输出变成候选对象列表（bbox 已是 xywh）。返回 list[dict]。"""
    out = []
    fw, fh = doc.get('_size') or (0, 0)
    for c in doc.get('containers') or []:
        b = c.get('bbox')
        if not b or len(b) != 4:
            continue
        bb = xywh(b)
        if bb[2] <= 4 or bb[3] <= 4:
            continue
        if fw and bb[2] * bb[3] >= 0.5 * fw * fh:
            continue          # 半屏以上的大 blob：cv 在这类界面上的失败形态（_rules：整屏不算单元）
        b_is_degen = bool(fw and bb[2] >= 0.95 * fw and bb[3] >= 0.95 * fh)
        kind = c.get('kind') or 'unknown'
        if kind not in KINDS:
            kind = 'unknown'
        texts = [t for t in (c.get('text') or []) if t]
        out.append({'bbox': bb, 'kind': kind, 'text': texts,
                    'state': c.get('state') or {'selected': False, 'focused': False, 'disabled': False},
                    'badges': [{'type': bd.get('type', 'red'), 'bbox': bd.get('bbox')}
                               for bd in (c.get('badges') or []) if bd.get('bbox')],
                    'clipped': c.get('clipped') or {'edges': [], 'cut_by': None, 'px': 0},
                    'clickable': 'yes' if kind in ('tile', 'card', 'button', 'chip') else 'unknown',
                    'src': 'container'})
        _ths = [t['bbox'][3] - t['bbox'][1] for t in (doc.get('text') or [])
                if b[0] <= t['bbox'][0] and t['bbox'][2] <= b[2]
                and b[1] <= t['bbox'][1] and t['bbox'][3] <= b[3]]
        _split_ok = (split_rows and len(texts) >= 2 and kind in ('panel', 'unknown', 'card')
                     and not b_is_degen and _ths
                     and bb[3] >= 2.2 * sorted(_ths)[len(_ths) // 2]
                     and len(texts) <= 12)
        if _split_ok:
            # 用该容器内的 OCR 文本行拆行：每行一个 row 候选（band = 文本行上下各留 8px）
            tb = [t for t in (doc.get('text') or [])
                  if b[0] <= t['bbox'][0] and t['bbox'][2] <= b[2]
                  and b[1] <= t['bbox'][1] and t['bbox'][3] <= b[3]]
            tb.sort(key=lambda t: t['bbox'][1])
            for t in tb:
                x0, y0, x1, y1 = t['bbox']
                row = [int(b[0]), int(max(b[1], y0 - 8)), int(b[2] - b[0]), int(min(b[3], y1 + 8) - max(b[1], y0 - 8))]
                if row[3] <= 8:
                    continue
                out.append({'bbox': row, 'kind': 'row', 'text': [t.get('text') or ''],
                            'state': {'selected': False, 'focused': False, 'disabled': False},
                            'badges': [], 'clipped': {'edges': [], 'cut_by': None, 'px': 0},
                            'clickable': 'unknown', 'src': 'row-split'})
    if loose_text:
        def _in_hud(x0, y0, x1, y1):
            return ((x1 < 340 and y0 < 120) or (x1 < 380 and y0 > 1300)
                    or (x0 > 2350 and y0 > 1370))

        tboxes = [t['bbox'] for t in (doc.get('text') or []) if t.get('bbox')]
        for t in (doc.get('text') or []):
            tb = t.get('bbox')
            if not tb or len(tb) != 4:
                continue
            x0, y0, x1, y1 = tb
            if x1 - x0 < 30 or y1 - y0 < 14:
                continue
            if _in_hud(x0, y0, x1, y1):
                continue
            inside = any(c['bbox'][0] <= x0 and x1 <= c['bbox'][2]
                         and c['bbox'][1] <= y0 and y1 <= c['bbox'][3]
                         for c in (doc.get('containers') or []) if c.get('bbox')
                         and (not fw or (c['bbox'][2] - c['bbox'][0]) * (c['bbox'][3] - c['bbox'][1])
                              <= 0.35 * fw * fh))
            if inside:
                continue
            out.append({'bbox': [int(x0) - 10, int(y0) - 8, int(x1 - x0) + 20, int(y1 - y0) + 16],
                        'kind': 'row', 'text': [t.get('text') or ''],
                        'state': {'selected': False, 'focused': False, 'disabled': False},
                        'badges': [], 'clipped': {'edges': [], 'cut_by': None, 'px': 0},
                        'clickable': 'unknown', 'src': 'loose-text'})
    if glyphs:
        tboxes = [xywh(t['bbox']) for t in (doc.get('text') or []) if t.get('bbox')]
        for g in doc.get('free_glyphs') or []:
            b = g.get('bbox')
            if not b or len(b) != 4:
                continue
            bb = xywh(b)
            if bb[2] < min_icon or bb[3] < min_icon:
                continue
            if _overlaps_text(bb, tboxes):
                continue
            ar = bb[2] / max(bb[3], 1)
            if ar < 0.45 or ar > 2.2 or bb[2] * bb[3] < 1600:
                continue
            out.append({'bbox': bb, 'kind': 'icon', 'text': [],
                        'state': {'selected': False, 'focused': False, 'disabled': False},
                        'badges': [], 'clipped': {'edges': [], 'cut_by': None, 'px': 0},
                        'clickable': 'unknown', 'src': 'glyph'})
    # 同一行的 loose-text 合并（垂直重叠≥50% 且水平间隙≤60px）——设置行常被切成"标签/值/单位"
    def _vov(a, b):
        y0 = max(a[1], b[1]); y1 = min(a[1] + a[3], b[1] + b[3])
        return max(0, y1 - y0) / max(min(a[3], b[3]), 1)

    def _hgap(a, b):
        return max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]), 0)

    changed = True
    while changed:
        changed = False
        lt = [o for o in out if o['src'] == 'loose-text']
        for i in range(len(lt)):
            for j in range(i + 1, len(lt)):
                a, b = lt[i], lt[j]
                if _vov(a['bbox'], b['bbox']) >= 0.5 and _hgap(a['bbox'], b['bbox']) <= 60:
                    ax, ay, aw, ah = a['bbox']; bx, by, bw, bh = b['bbox']
                    nx, ny = min(ax, bx), min(ay, by)
                    a['bbox'] = [nx, ny, max(ax + aw, bx + bw) - nx, max(ay + ah, by + bh) - ny]
                    a['text'] = a['text'] + b['text']
                    out.remove(b)
                    changed = True
                    break
            if changed:
                break

    # 去重（同框同 kind 只留一个），按 y/x 排序便于人眼对图改正
    seen, uniq = set(), []
    for o in out:
        key = (o['kind'], tuple(o['bbox']))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(o)
    uniq.sort(key=lambda o: (o['bbox'][1], o['bbox'][0]))
    return uniq


def write_lines(path, stem, cands, meta):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('# prelabel lines — 修正规则：删行=删对象；改 4 个数字=改框；kind/text 直接改；\n')
        f.write('# 加对象：抄一行把 id 写 new（apply 时自动编号）；行首 # = 注释掉=删除。\n')
        f.write('# frame=%s image=%s backend=%s units=%d\n' % (stem, meta['image'], meta['backend'], len(cands)))
        f.write('# 格式：id | kind | x y w h | text1 / text2 | {可选 JSON}\n')
        for i, o in enumerate(cands):
            extra = {k: o[k] for k in ('state', 'badges', 'clipped') if o.get(k)}
            if o.get('clickable') and o['clickable'] != 'unknown':
                extra['clickable'] = o['clickable']
            f.write('%d | %s | %d %d %d %d | %s | %s\n'
                    % (i, o['kind'], o['bbox'][0], o['bbox'][1], o['bbox'][2], o['bbox'][3],
                       ' / '.join(o['text']), json.dumps(extra, ensure_ascii=False) if extra else ''))


def parse_lines(path):
    """读行文件 → (objects, errors)。改坏的行只报错不静默丢。"""
    objs, errs = [], []
    with open(path, encoding='utf-8') as f:
        for ln, raw in enumerate(f, 1):
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) < 4:
                errs.append('第 %d 行字段不足（要 ≥4 段）：%s' % (ln, line))
                continue
            rid, kind, coords = parts[0], parts[1], parts[2]
            texts = [t.strip() for t in parts[3].split('/') if t.strip()] if parts[3] else []
            extra = {}
            if len(parts) >= 5 and parts[4]:
                try:
                    extra = json.loads(parts[4])
                except json.JSONDecodeError as exc:
                    errs.append('第 %d 行 JSON 坏了（%s）：%s' % (ln, exc, parts[4]))
            nums = coords.replace(',', ' ').split()
            if len(nums) != 4 or not all(n.lstrip('-').isdigit() for n in nums):
                errs.append('第 %d 行坐标必须是 4 个整数 x y w h：%r' % (ln, coords))
                continue
            x, y, w, h = [int(n) for n in nums]
            if w <= 0 or h <= 0:
                errs.append('第 %d 行 w/h 必须 >0（%d,%d）' % (ln, w, h))
                continue
            if kind not in KINDS:
                errs.append('第 %d 行 kind=%r 不在 %s' % (ln, kind, list(KINDS)))
                continue
            o = {'id': None if rid.lower() == 'new' else int(rid) if rid.isdigit() else None,
                 'parent': None, 'bbox': [x, y, w, h], 'kind': kind, 'text': texts,
                 'clickable': extra.pop('clickable', 'unknown'),
                 'state': extra.pop('state', {'selected': False, 'focused': False, 'disabled': False}),
                 'badges': extra.pop('badges', []),
                 'clipped': extra.pop('clipped', {'edges': [], 'cut_by': None, 'px': 0})}
            o.update(extra)
            objs.append(o)
    return objs, errs


def truth_doc(stem, image, size, objs, meta):
    for i, o in enumerate(objs):
        o['id'] = i
    return {'frame': stem, 'image': image, 'size': size,
            'annotator': meta.get('annotator') or 'prelabel(cv) + 人工修正',
            'criteria': 'truth/_rules.md',
            'review': meta.get('review', 'pending'),
            'provenance': {k: meta[k] for k in ('backend', 'screen_json', 'reviewed_by', 'prelabel_src')
                           if meta.get(k)},
            'layout': meta.get('layout', ''),
            'classes': meta.get('classes', []),
            'units': len(objs),
            'objects': objs}


def render_overlay(image_path, objs, out_path, scale=1.0):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.open(image_path).convert('RGB')
    if scale != 1.0:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    except OSError:
        f = ImageFont.load_default()
    for i, o in enumerate(objs):
        x, y, w, h = [int(v * scale) for v in o['bbox']]
        col = KIND_COLOR.get(o['kind'], (200, 200, 200))
        d.rectangle([x, y, x + w, y + h], outline=col, width=3)
        lbl = str(i)
        tw = d.textlength(lbl, font=f)
        d.rectangle([x + 1, y + 1, x + tw + 8, y + 26], fill=(0, 0, 0))
        d.text((x + 4, y + 2), lbl, fill=col, font=f)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    im.save(out_path)
    return out_path


# ---------------------------------------------------------------- 子命令
def cmd_frames(a):
    screen = a.screen or os.path.join(ROOT, 'tools', 'ys-screen')
    if not os.path.exists(screen):
        print('ys-screen 不存在：%s' % screen, file=sys.stderr)
        return 4
    files = []
    for p in a.frames:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, '*.png')))
        elif os.path.exists(p):
            files.append(p)
        else:
            print('帧不存在：%s' % p, file=sys.stderr)
            return 5
    if a.limit:
        files = files[:a.limit]
    if not files:
        print('没找到帧（%s）' % a.frames, file=sys.stderr)
        return 5
    os.makedirs(a.out, exist_ok=True)
    ok = 0
    for fp in files:
        stem = os.path.splitext(os.path.basename(fp))[0]
        sj = os.path.join(a.out, '_screen', stem + '.json')
        os.makedirs(os.path.dirname(sj), exist_ok=True)
        cmd = [screen, fp, '--json', '--json-out', sj]
        if a.backend and a.backend != 'cv':
            cmd += ['--backend', a.backend]
        if a.backend == 'onnx' and a.detect_model:
            cmd += ['--detect-model', a.detect_model]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print('PRELABEL-FAIL frame=%s rc=%d %s' % (stem, r.returncode, r.stderr.strip()[:300]),
                  file=sys.stderr)
            return 4
        doc = load_screen(sj)
        # ys-screen 的 frame 字段形态不稳（字符串/对象都出现过）：尺寸直接从 PNG 读
        from PIL import Image
        with Image.open(fp) as im:
            size = [im.width, im.height]
        doc['_size'] = size
        cands = candidates_from_screen(doc, a.split_rows, a.glyphs, a.min_icon,
                                       loose_text=not a.no_loose_text)
        meta = {'image': os.path.relpath(os.path.abspath(fp), ROOT).replace(os.sep, '/'),
                'backend': a.backend or 'cv',
                'screen_json': os.path.relpath(os.path.abspath(sj), ROOT).replace(os.sep, '/'),
                'prelabel_src': {k: len([c for c in cands if c['src'] == k])
                                 for k in ('container', 'row-split', 'loose-text', 'glyph')},
                'annotator': 'prelabel(%s) 预标 — **未人工复核**' % (a.backend or 'cv'),
                'review': 'pending'}
        tj = os.path.join(a.out, stem + '.json')
        lj = os.path.join(a.out, stem + '.lines.txt')
        with open(tj, 'w', encoding='utf-8') as f:
            json.dump(truth_doc(stem, meta['image'], size, cands, meta), f, ensure_ascii=False, indent=1)
            f.write('\n')
        write_lines(lj, stem, cands, meta)
        if not a.no_overlay:
            render_overlay(fp, cands, os.path.join(a.out, stem + '.overlay.png'))
        ps = meta['prelabel_src']
        print('PRELABEL frame=%-9s candidates=%-3d container=%-2d row-split=%-2d loose-text=%-2d glyph=%-2d %s'
              % (stem, len(cands), ps['container'], ps['row-split'], ps['loose-text'], ps['glyph'],
                 'overlay=on' if not a.no_overlay else 'overlay=off'))
        ok += 1
    print('PRELABEL-RESULT frames=%d out=%s' % (ok, a.out))
    return 0


def cmd_apply(a):
    objs, errs = parse_lines(a.lines)
    if errs:
        for e in errs:
            print('LINES-INVALID %s: %s' % (a.lines, e), file=sys.stderr)
        return 3
    # 沿用同名 JSON 的 image/size/meta（若存在）
    meta = {'backend': 'cv', 'annotator': 'prelabel + 人工修正', 'review': 'done',
            'reviewed_by': a.reviewed_by}
    image, size, stem = None, None, os.path.splitext(os.path.basename(a.lines))[0].replace('.lines', '')
    if os.path.exists(a.out):
        old = load_screen(a.out)
        image, size, stem = old.get('image'), old.get('size'), old.get('frame') or stem
        meta['backend'] = (old.get('provenance') or {}).get('backend', 'cv')
        meta['screen_json'] = (old.get('provenance') or {}).get('screen_json')
        if a.layout:
            meta['layout'] = a.layout
    elif a.image:
        from PIL import Image
        with Image.open(a.image) as im:
            size = [im.width, im.height]
        image = a.image
    if not size:
        print('回写需要 size：给 --image，或让 --out 指向已存在的预标 JSON', file=sys.stderr)
        return 3
    doc = truth_doc(stem, image, size, objs, meta)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('APPLY lines=%s -> %s units=%d review=done' % (a.lines, a.out, len(objs)))
    return 0


def cmd_render(a):
    doc = load_screen(a.truth)
    image = doc.get('image')
    if not os.path.isabs(image):
        image = os.path.join(ROOT, image)
    out = a.out or os.path.splitext(a.truth)[0] + '.overlay.png'
    render_overlay(image, doc['objects'], out, a.scale)
    print('RENDER %s units=%d -> %s' % (a.truth, len(doc['objects']), out))
    return 0


def cmd_check(a):
    rc = 0
    files = sorted(glob.glob(os.path.join(a.dir, '*.json'))) if os.path.isdir(a.dir) else [a.dir]
    for p in files:
        if os.path.basename(p).startswith('_'):
            continue
        try:
            doc = load_screen(p)
        except (OSError, json.JSONDecodeError) as exc:
            print('CHECK-FAIL %s 不可解析（%s）' % (p, exc))
            rc = 3
            continue
        size = doc.get('size') or [0, 0]
        bad = []
        for o in doc.get('objects') or []:
            b = o.get('bbox') or [0, 0, 0, 0]
            if len(b) != 4 or b[2] <= 0 or b[3] <= 0:
                bad.append('id=%s bbox 非法 %r' % (o.get('id'), b))
            elif b[0] < 0 or b[1] < 0 or b[0] + b[2] > size[0] or b[1] + b[3] > size[1]:
                bad.append('id=%s 越界 %r (size=%s)' % (o.get('id'), b, size))
            if o.get('kind') not in KINDS:
                bad.append('id=%s kind=%r 非法' % (o.get('id'), o.get('kind')))
        print('CHECK %-28s units=%-3d review=%-8s %s'
              % (os.path.basename(p), len(doc.get('objects') or []), doc.get('review', '?'),
                 'OK' if not bad else 'FAIL ' + '; '.join(bad[:3])))
        if bad:
            rc = 3
    return rc


def main(argv=None):
    ap = argparse.ArgumentParser(description='半自动标注流水线：cv 预标 → 行文本修正 → truth JSON')
    sub = ap.add_subparsers(dest='cmd', required=True)

    p1 = sub.add_parser('frames', help='对帧目录/帧文件跑 cv 预标')
    p1.add_argument('frames', nargs='+')
    p1.add_argument('--out', required=True)
    p1.add_argument('--backend', default='cv', choices=('cv', 'onnx', 'torch'))
    p1.add_argument('--detect-model', default=None, help='--backend onnx 时透传给 ys-screen')
    p1.add_argument('--screen', default=None, help='ys-screen 路径（默认仓库 tools/ys-screen）')
    p1.add_argument('--split-rows', action='store_true', help='容器内多行 OCR 文本按行拆成 row 候选')
    p1.add_argument('--glyphs', action='store_true', help='免费图形叶子 → icon 候选')
    p1.add_argument('--no-loose-text', action='store_true',
                    help='不把"容器外的 OCR 文本行"变 row 候选（默认开会；左导航/按钮全靠它）')
    p1.add_argument('--min-icon', type=int, default=28, help='glyph→icon 候选的最小边长（默认 28px）')
    p1.add_argument('--no-overlay', action='store_true')
    p1.add_argument('--limit', type=int, default=None)
    p1.set_defaults(func=cmd_frames)

    p2 = sub.add_parser('apply', help='把人工修正后的 lines.txt 回写成 truth JSON')
    p2.add_argument('lines')
    p2.add_argument('--out', required=True)
    p2.add_argument('--image', default=None, help='--out 不存在时用它读尺寸')
    p2.add_argument('--layout', default=None)
    p2.add_argument('--reviewed-by', default=None)
    p2.set_defaults(func=cmd_apply)

    p3 = sub.add_parser('render', help='渲染带编号框图（看编号改行）')
    p3.add_argument('truth')
    p3.add_argument('--out', default=None)
    p3.add_argument('--scale', type=float, default=1.0)
    p3.set_defaults(func=cmd_render)

    p4 = sub.add_parser('check', help='schema 校验（bbox/kind/越界）')
    p4.add_argument('dir')
    p4.set_defaults(func=cmd_check)

    a = ap.parse_args(argv)
    return a.func(a)


if __name__ == '__main__':
    sys.exit(main())
