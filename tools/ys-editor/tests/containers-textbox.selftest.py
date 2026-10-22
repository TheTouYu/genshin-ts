#!/usr/bin/env python3
"""containers-textbox.selftest.py — `ys-screen` 容器文本带 bbox（schema v2）的离线判据。

背景（2026-10-22 独立模型实测卡点 #3）：
  `containers[].text` 是 `list[str]`（**无 bbox**），而顶层 `text[]` 每条都带 bbox ⇒ 同一个键名
  `text` 两种形状；那个模型据此得出"全帧 text 没有 bbox"的错误结论，退回去自己造坐标。
  修法：**新增** `containers[].text_boxes[]`（与顶层 text[] 逐字段同形状），`text` 保留兼容。

判据（全部离线；只用仓库内已有帧）：
  ① schema=ys-screen/2，且**每个**容器都有 text_boxes 键（空也要有）；
  ② 每个 text_boxes 条目至少有 {text,bbox,score}，bbox 是 4 个整数（**xyxy**，与顶层 text[] 同口径）；
  ③ 同一容器的 text_boxes 文本序列 == 它的 text 字符串序列（两条通道不许漂）；
  ④ 缓存：第二次跑命中缓存（container_cached=true），且**缓存里也有 text_boxes**
     （v1 缓存没有这个键 ⇒ 必须判 miss 重算，否则新通道在缓存命中时静默消失）；
  ⑤ 全量路径（不带 --containers）同样带 text_boxes，且顶层 text[] 仍是 list[{...}]
     （没有把 text 改成对象列表 ⇒ 既有消费者不破）。

用法：python3 tools/ys-editor/tests/containers-textbox.selftest.py
退出码：0 PASS / 1 FAIL
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(YS))
SCREEN = os.path.join(os.path.dirname(YS), 'ys-screen')   # tools/ys-screen（不在 ys-editor/ 下）
FRAME = os.path.join(REPO, '.scratch/gui-corpus/f06.png')

PASS = 0
FAIL = 0


def ck(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('  PASS %s %s' % (name, detail))
    else:
        FAIL += 1
        print('  FAIL %s %s' % (name, detail))


def screen(args):
    r = subprocess.run([sys.executable, SCREEN, '--json'] + args, capture_output=True,
                       text=True, timeout=180)
    if r.returncode != 0:
        print('  FAIL ys-screen rc=%d %s' % (r.returncode, (r.stderr or '')[-300:]))
        return None
    return json.loads(r.stdout)


def main():
    print('══ ys-screen containers[].text_boxes 自测 ══')
    if not os.path.exists(FRAME):
        print('  SKIP 缺帧：%s' % FRAME)
        return 0
    d = screen(['--containers', '--no-cache', FRAME])
    if d is None:
        return 1
    ck('schema=ys-screen/2', d.get('schema') == 'ys-screen/2', str(d.get('schema')))
    conts = d.get('containers') or []
    ck('有容器可查', len(conts) > 0, 'n=%d' % len(conts))
    ck('每个容器都有 text_boxes 键', all('text_boxes' in c for c in conts),
       'missing=%s' % [c['id'] for c in conts if 'text_boxes' not in c][:4])
    shape_ok = True
    for c in conts:
        for t in c.get('text_boxes') or []:
            if not {'text', 'bbox', 'score'} <= set(t):
                shape_ok = False
            if not (isinstance(t.get('bbox'), list) and len(t['bbox']) == 4
                    and all(isinstance(v, int) for v in t['bbox'])):
                shape_ok = False
    ck('text_boxes 条目形状 {text,bbox(4 int xyxy),score}', shape_ok)
    same = all([t['text'] for t in c.get('text_boxes') or []] == list(c.get('text') or [])
               for c in conts)
    ck('text（兼容）与 text_boxes 文本序列一致', same)
    n_owned = sum(len(c.get('text_boxes') or []) for c in conts)
    ck('容器文本确实带上了 bbox', n_owned > 0, 'n_text_boxes=%d' % n_owned)

    d2 = screen(['--containers', FRAME])
    ck('② 次命中缓存且仍带 text_boxes', d2 is not None
       and d2['timing'].get('container_cached') is True
       and all('text_boxes' in c for c in d2.get('containers') or []),
       'cached=%s' % (d2 or {}).get('timing', {}).get('container_cached'))

    d3 = screen([FRAME])
    ck('全量路径也带 text_boxes', d3 is not None
       and all('text_boxes' in c for c in d3.get('containers') or []))
    top = (d3 or {}).get('text') or []
    ck('顶层 text[] 仍是对象列表（消费者不破）', isinstance(top, list) and top
       and isinstance(top[0], dict) and 'bbox' in top[0], 'n=%d' % len(top))
    if top and d3.get('containers'):
        c0 = next((c for c in d3['containers'] if c.get('text_boxes')), None)
        if c0:
            keys_top = set(top[0].keys())
            keys_tb = set(c0['text_boxes'][0].keys())
            ck('text_boxes 字段集 == 顶层 text[] 字段集', keys_top == keys_tb,
               'only_top=%s only_tb=%s' % (sorted(keys_top - keys_tb),
                                           sorted(keys_tb - keys_top)))

    print('CONTAINER-TEXTBOX-SELFTEST pass=%d fail=%d verdict=%s'
          % (PASS, FAIL, 'PASS' if FAIL == 0 else 'FAIL'))
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
