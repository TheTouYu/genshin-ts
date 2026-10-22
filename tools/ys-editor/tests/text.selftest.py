#!/usr/bin/env python3
"""text.selftest.py — `ys-text` 的离线自测（只用仓库已有帧，不抓屏、不抬窗）。

判据（每条都是可复算的读数，不是"看起来对"）：
  ① 结构契约：schema=ys-text/1、lines/paragraphs/source 齐全，bbox 是 4 个整数且**落在 region 内**；
  ② 段落可复算：每个 paragraph.text 必须等于它 lines[] 逐行文本拼接；段落对**全部行**形成划分
     （不重不漏）；行序号升序；
  ③ x,y,w,h 语义：--region 1100 170 1420 1270 的行 bbox 必须 ≥(1100,170) 且 ≤(2520,1440)
     （区域坐标是 x,y,w,h 而不是 x0,y0,x1,y1 —— 这是本工具最容易写错的一处）；
  ④ 模式：--only lines 不输出 paragraphs；--text 打印行数 == 段落数；
  ⑤ 降级：不给 --refine 时 refined=false 且 refine_note 说明"未给"（零网络默认路径）；
  ⑥ 错误路径：帧不存在 rc=3；--region 越界 rc=2。
硬断言只放在**不该抖**的量上（段数按实测 10~14 区间、行数 ≥15）；gap_refills 这类依赖
引擎版本的值只打印、不当断言（否则引擎一升级测试就红）。

用法：python3 tools/ys-editor/tests/text.selftest.py
退出码：0 PASS / 1 FAIL
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(YS))
TEXT = os.path.join(YS, 'ys-text')
F1 = os.path.join(REPO, 'gui-test/.01/frames/p00-initial.png')
F2 = os.path.join(REPO, 'gui-test/.01/frames/story1-k00.png')
REGION = ['1100', '170', '1420', '1270']

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


def run(args, **kw):
    return subprocess.run([sys.executable, TEXT] + args, capture_output=True, text=True,
                          timeout=180, **kw)


def main():
    print('══ ys-text 自测（离线帧）══')
    for f in (F1, F2):
        if not os.path.exists(f):
            print('  SKIP 缺帧样本：%s' % f)
            return 0
    tmp = tempfile.mkdtemp(prefix='ys-text-selftest-')
    out1 = os.path.join(tmp, 'p00.json')
    t = run([F1] + [x for a in ('--region',) for x in (a,)] + REGION + ['--json-out', out1])
    ck('rc=0', t.returncode == 0, 'rc=%d %s' % (t.returncode, (t.stderr or '')[-200:]))
    if t.returncode != 0:
        return 1
    d = json.load(open(out1, encoding='utf-8'))
    ck('schema', d.get('schema') == 'ys-text/1', str(d.get('schema')))
    ck('source.region', d['source'].get('region') == [1100, 170, 1420, 1270],
       str(d['source'].get('region')))
    ck('source.refined=False', d['source'].get('refined') is False,
       str(d['source'].get('refine_note')))
    lines, paras = d.get('lines') or [], d.get('paragraphs') or []
    ck('lines>=15', len(lines) >= 15, 'n=%d' % len(lines))
    ck('10<=paras<=14', 10 <= len(paras) <= 14, 'n=%d（实测人工 12；story1 参照 11~12）'
       % len(paras))
    ints = all(isinstance(l['bbox'], list) and len(l['bbox']) == 4
               and all(isinstance(v, int) for v in l['bbox']) for l in lines)
    ck('bbox 是 4 整数', ints)
    inreg = all(1100 <= l['bbox'][0] and 170 <= l['bbox'][1]
                and l['bbox'][2] <= 2520 and l['bbox'][3] <= 1440 for l in lines)
    ck('bbox 在 region 内（帧坐标）', inreg)
    seen = []
    join_ok = True
    for p in paras:
        idx = p.get('lines') or []
        seen.extend(idx)
        want = ''.join(lines[i]['text'] for i in idx)
        if want != p['text']:
            join_ok = False
    ck('段落文本 == 逐行拼接', join_ok)
    ck('段落对行形成划分（不重不漏）', sorted(seen) == list(range(len(lines))),
       'covered=%d/%d' % (len(seen), len(lines)))
    ck('行序号在段内升序', all(p['lines'] == sorted(p['lines']) for p in paras))
    ck('行覆盖了正文首行', '角色故事' in (paras[0]['text'] if paras else ''),
       (paras[0]['text'][:16] if paras else ''))
    ck('UID 独立成段（不吸进正文）',
       any(p['text'].startswith('UID') for p in paras),
       str([p['text'][:12] for p in paras[-2:]]))
    print('  NOTE 读数 lines=%d paras=%d colw=%s median_gap=%s gap_refills=%s engine=%s ms=%s'
          % (len(lines), len(paras), d['source'].get('colw'), d['source'].get('median_gap'),
             d['source'].get('gap_refills'), d['source'].get('engine'), d['source'].get('ms')))

    t2 = run([F2, '--region', '1100', '170', '1420', '1270', '--only', 'lines'])
    d2 = json.loads(t2.stdout) if t2.returncode == 0 else {}
    ck('--only lines 不出 paragraphs', t2.returncode == 0 and 'paragraphs' not in d2
       and len(d2.get('lines') or []) > 0)
    t3 = run([F2, '--region', '1100', '170', '1420', '1270', '--text'])
    n_para = len(json.loads(run([F2, '--region', '1100', '170', '1420', '1270']).stdout)
                 ['paragraphs'])
    ck('--text 行数 == 段落数', t3.returncode == 0 and len(t3.stdout.strip().splitlines()) == n_para,
       '%d vs %d' % (len(t3.stdout.strip().splitlines()), n_para))
    t4 = run([os.path.join(tmp, 'nope.png')])
    ck('缺帧 rc=3', t4.returncode == 3, 'rc=%d' % t4.returncode)
    t5 = run([F1, '--region', '2500', '1400', '200', '200'])
    ck('region 越界 rc=2', t5.returncode == 2, 'rc=%d' % t5.returncode)

    print('TEXT-SELFTEST pass=%d fail=%d verdict=%s'
          % (PASS, FAIL, 'PASS' if FAIL == 0 else 'FAIL'))
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
