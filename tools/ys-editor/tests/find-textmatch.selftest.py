#!/usr/bin/env python3
"""find-textmatch.selftest.py — `ys-find` 文本归一化/档位匹配 + 指针工具越界防护的**离线**自测。

背景（交付单 task-3；事故读数来自 `.03`）：
  ① 列表页按名字点击几乎不可用：`ys-pointer-click --text` 经 ys-find 做 **NFKC 全等**，而 OCR 把
     同一条目读成 `关于风车·` / `关于风车…` / `关于风车` ⇒ rc=4 占 **19/37（51%）**。
  ② 两套坐标：帧/物理 2560×1440（ys-find bbox、xdotool 回读）与 KWin 逻辑几何 1707×960
     （ys-wins 的窗口几何，×1.5）。工具回执不标空间 ⇒ 历史上「按逻辑坐标去点帧坐标，首点就错一行」。

本自测分四段（全程离线：不占屏、不注入键鼠、不碰活体桌面）：
  A 纯函数：归一化 + 三档（exact→prefix→contains）+ 反例；并打印「新口径 vs 旧 NFKC 全等」匹配率。
  B CLI 端到端：`ys-find --resolve` 的 prefix 回退、`--text-exact` 严格行为、JSON 里的
    `space`/`space_size`/`matched_candidate`/`match_kind`（需 OCR 后端 + 测试帧；缺则 SKIP 并明说）。
  C 单一实现：解析实现只此一处（ys-pointer-click 不得自带第二份归一化），并打印它复用 ys-find 的调用行。
  D 越界防护：`ys-put --check` 与 `ys-pointer-click` 的越界用例（rc=2 + 空间提示 + **零注入**），
    两个方向都贴回执（实测空间相等 / 模拟 1.5 缩放主机）。

用法: python3 tools/ys-editor/tests/find-textmatch.selftest.py
退出码: 0 全 PASS（B 段缺后端时 SKIP 不算失败）/ 1 有失败项
机读行: FIND-FUZZY-RESULT pass=n fail=m verdict=PASS
"""
import importlib.machinery
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.dirname(HERE)                    # tools/ys-editor
TOOLS = os.path.dirname(YS)                   # tools
ROOT = os.path.dirname(TOOLS)
FIND = os.path.join(TOOLS, 'ys-find')         # ← 交付单写的 tools/ys-editor/ys-find 是笔误
PUT = os.path.join(YS, 'ys-put')
CLICK = os.path.join(YS, 'ys-pointer-click')
FRAME = os.path.join(HERE, 'fixtures', 'savelist-orderB.png')
LABEL = '输入探针v'                            # 只以**前缀**存在的名字（v2 才有全等）
LABEL_FULL = '输入探针v2'

PASS = 0
FAIL = 0
SKIP = 0


def ck(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('  PASS %s%s' % (name, (' — %s' % detail) if detail else ''))
    else:
        FAIL += 1
        print('  FAIL %s%s' % (name, (' — %s' % detail) if detail else ''))


def skip(name, why):
    global SKIP
    SKIP += 1
    print('  SKIP %s — %s' % (name, why))


def load_ys_find():
    loader = importlib.machinery.SourceFileLoader('ysfind', FIND)
    spec = importlib.util.spec_from_loader('ysfind', loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


# ── A 纯函数 fixture（交付单给的成对样本；不改屏、不读帧） ────────────────────────────
POSITIVE_PAIRS = [
    ('关于风车·', '关于风车…'),          # 点号 vs 省略号
    ('关于至冬的妖精·', '关于至冬的妖精'),  # 尾点号 vs 无标点
    ('关于「呼啸社」…', '关于「呼啸社」·'),  # 省略号 vs 间隔号，且含引号
]
NEGATIVE_PAIRS = [
    ('关于酒馆老板', '关于果酒湖…'),       # 完全不同的条目，必须不匹配
    ('关于酒馆老板', '关于果酒湖'),
]
# 前缀档的“报候选但不许冒充全等”用例（交付单：关于风车 不得匹配 关于风车与磨坊 之外的另一条目）
TIER_BOXES = [{'text': '关于风车与磨坊', 'cx': 10, 'cy': 20},
              {'text': '关于酒馆老板', 'cx': 30, 'cy': 40}]


def old_norm(s):
    """旧口径基线（**只在本测试里算匹配率用**，不是生产实现）：NFKC + 去空白 + casefold。"""
    import unicodedata
    t = unicodedata.normalize('NFKC', s or '')
    return ''.join(ch for ch in t if not ch.isspace()).casefold()


def part_a(m):
    print('[A] 纯函数：归一化 + 档位匹配 + 反例')
    # 归一化本身
    ck('A1 归一化去掉尾标点', m.normalize_text('关于风车…') == m.normalize_text('关于风车·') == '关于风车',
       repr(m.normalize_text('关于风车…')))
    ck('A2 归一化不动中间标点（v1/v2 仍是两个名字）',
       m.normalize_text('输入探针-v1') != m.normalize_text('输入探针-v2'))

    for cand, want in POSITIVE_PAIRS:
        k = m.classify(cand, want)
        ck('A3 正向 %r ↔ %r = exact' % (cand, want), k == 'exact', str(k))

    for cand, want in NEGATIVE_PAIRS:
        k = m.classify(cand, want)
        ck('A4 反例 %r ⇏ %r = 不匹配' % (cand, want), k is None, str(k))
    # 反向也必须是反例（对称性）
    ck('A4b 反例反向 %r ⇏ %r' % (NEGATIVE_PAIRS[0][1], NEGATIVE_PAIRS[0][0]),
       m.classify(NEGATIVE_PAIRS[0][1], NEGATIVE_PAIRS[0][0]) is None)

    # 档位：只有前缀命中时，报**候选**且 match_kind=prefix（不许标成 exact）
    hits = m.match_boxes(TIER_BOXES, '关于风车')
    ck('A5 前缀档报出唯一候选', len(hits) == 1 and hits[0][0]['text'] == '关于风车与磨坊',
       str([(b['text'], k) for b, k in hits]))
    ck('A5b 前缀命中不许冒充全等', bool(hits) and hits[0][1] == 'prefix',
       hits[0][1] if hits else 'no-hit')
    ck('A5c 反例条目没被前缀捎带进来', all(b['text'] != '关于酒馆老板' for b, _ in hits))

    # 高档位优先：全等存在时，不把前缀候选混进同一档（「输入探针」vs「输入探针v2」两张不同存档）
    both = [{'text': '输入探针', 'cx': 1, 'cy': 2}, {'text': '输入探针v2', 'cx': 3, 'cy': 4}]
    hits2 = m.match_boxes(both, '输入探针')
    ck('A6 全等档优先：只返回全等那一个', len(hits2) == 1 and hits2[0][0]['text'] == '输入探针'
       and hits2[0][1] == 'exact', str([(b['text'], k) for b, k in hits2]))

    # --text-exact 的语义 = 只认全等（前缀不回退）
    ck('A7 --text-exact：前缀不再命中',
       m.classify('关于风车与磨坊', '关于风车', 'exact') is None)
    ck('A7b --text-exact：全等仍命中',
       m.classify('关于风车·', '关于风车…', 'exact') == 'exact')

    # 匹配率：新口径 vs 旧口径基线（正向样本 6 条 = 3 对 × 双向）
    pairs = [(c, w) for c, w in POSITIVE_PAIRS] + [(w, c) for c, w in POSITIVE_PAIRS]
    new_ok = sum(1 for c, w in pairs if m.classify(c, w) == 'exact')
    old_ok = sum(1 for c, w in pairs if old_norm(c) == old_norm(w))
    neg_ok = sum(1 for c, w in NEGATIVE_PAIRS if m.classify(c, w) is None)
    print('  MATCH-RATE 新口径(归一化+档位) %d/%d = %.1f%% ｜ 旧口径(NFKC 全等) %d/%d = %.1f%%'
          % (new_ok, len(pairs), 100.0 * new_ok / len(pairs), old_ok, len(pairs),
             100.0 * old_ok / len(pairs)))
    print('  NEG-RATE   反例正确拒绝 %d/%d = %.1f%%' % (neg_ok, len(NEGATIVE_PAIRS),
                                                        100.0 * neg_ok / len(NEGATIVE_PAIRS)))
    ck('A8 新口径正向匹配率 100%', new_ok == len(pairs))
    ck('A9 反例全部正确拒绝', neg_ok == len(NEGATIVE_PAIRS))
    return {'new': new_ok, 'old': old_ok, 'total': len(pairs), 'neg': neg_ok}


# ── B CLI 端到端（离线帧 + 本地 OCR；缺后端就 SKIP，不伪装成 PASS） ──────────────────
def backend_ok():
    env_py = os.environ.get('YS_RAPIDOCR_PY')
    if env_py:
        return os.path.exists(env_py)
    if os.path.exists('/usr/lib/python3.14/site-packages/rapidocr'):
        return True
    return os.path.exists(os.path.join(ROOT, '.scratch', 'gui-grounding', 'venv-rapidocr', 'bin', 'python'))


def run(cmd, env=None, timeout=240):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    return p.returncode, p.stdout or '', p.stderr or ''


def part_b():
    print('[B] CLI 端到端：ys-find --resolve 的档位回退 / --text-exact / 回执字段')
    if not os.path.exists(FRAME):
        skip('B 段', '缺测试帧 %s' % FRAME)
        return
    if not backend_ok():
        skip('B 段', '没有 OCR 后端（/usr/lib/python3.14/site-packages/rapidocr 或 .scratch venv 均缺）')
        return

    rc, out, err = run([sys.executable, FIND, '--frame', FRAME, '--resolve', '--text', LABEL])
    d = {}
    try:
        d = json.loads(out)
    except Exception:
        pass
    ck('B1 前缀回退 rc=0', rc == 0, 'rc=%d' % rc)
    ck('B2 match_kind=prefix', d.get('match_kind') == 'prefix', str(d.get('match_kind')))
    ck('B3 matched_candidate=真实候选', d.get('matched_candidate') == LABEL_FULL,
       repr(d.get('matched_candidate')))
    ck('B4 space=frame', d.get('space') == 'frame', str(d.get('space')))
    ck('B5 space_size 与帧一致', d.get('space_size') == '2560x1440', str(d.get('space_size')))
    ck('B6 回执保留 matched_text（兼容）', d.get('matched_text') == LABEL_FULL,
       repr(d.get('matched_text')))

    rc2, out2, err2 = run([sys.executable, FIND, '--frame', FRAME, '--resolve',
                           '--text', LABEL, '--text-exact'])
    ck('B7 --text-exact：前缀不再命中 ⇒ rc=4', rc2 == 4, 'rc=%d' % rc2)
    ck('B8 --text-exact 诊断写明口径', '全等（--text-exact）' in err2, err2.strip().splitlines()[:1])

    rc3, out3, err3 = run([sys.executable, FIND, '--frame', FRAME, '--text', LABEL_FULL])
    ck('B9 人类可读回执打印匹配档位', '匹配档位:' in out3 and 'exact=1' in out3,
       [ln.strip() for ln in out3.splitlines() if '匹配档位' in ln][:1])
    ck('B10 人类可读回执标坐标空间', '坐标空间: frame 2560x1440' in out3,
       [ln.strip() for ln in out3.splitlines() if '坐标空间' in ln][:1])
    rc4, out4, err4 = run([sys.executable, FIND, '--frame', FRAME, '--text', LABEL_FULL, '--json'])
    try:
        d4 = json.loads(out4)
    except Exception:
        d4 = {}
    ck('B11 --json 带 space/match_kind', d4.get('space') == 'frame' and
       any(b.get('match_kind') == 'exact' for b in (d4.get('channels', {}).get('text', {})
                                                    .get('boxes') or [])),
       str(d4.get('space')))


# ── C 单一实现（解析只此一处） ─────────────────────────────────────────────────
def part_c():
    print('[C] 单一实现：ys-pointer-click 复用 ys-find 的解析，不自带第二份')
    src_find = open(FIND, encoding='utf-8').read()
    src_click = open(CLICK, encoding='utf-8').read()
    ck('C1 ys-find 只有一份 normalize_text', len(re.findall(r'^def normalize_text\(', src_find, re.M)) == 1)
    ck('C2 ys-find 只有一份 classify', len(re.findall(r'^def classify\(', src_find, re.M)) == 1)
    ck('C3 ys-find 只有一份 match_boxes', len(re.findall(r'^def match_boxes\(', src_find, re.M)) == 1)
    ck('C4 ys-pointer-click 不含第二份归一化（无 unicodedata/normalize_text）',
       'unicodedata' not in src_click and 'normalize_text' not in src_click)
    ck('C5 ys-pointer-click 不含第二份 classify', 'def classify' not in src_click)
    call = [ln.strip() for ln in src_click.splitlines() if '"$FIND" "${fa[@]}"' in ln]
    ck('C6 ys-pointer-click 调 ys-find --resolve 取坐标', bool(call), call[0] if call else '')
    ck('C7 --text-exact 已透传（anchor/text 两条解析路径都传）',
       src_click.count('fa+=(--text-exact)') >= 2,
       'count=%d' % src_click.count('fa+=(--text-exact)'))


# ── D 越界防护（rc=2 + 空间提示 + 零注入；两个方向） ─────────────────────────────
def make_stubs():
    stub = tempfile.mkdtemp(prefix='find-textmatch.')
    log = os.path.join(stub, 'ydotool.log')
    with open(os.path.join(stub, 'xdotool'), 'w', encoding='utf-8') as f:
        f.write('#!/bin/bash\ncase "${1:-}" in\n'
                '  getdisplaygeometry) echo "2560 1440" ;;\n'
                '  getmouselocation) printf "X=0\\nY=0\\nSCREEN=0\\nWINDOW=1\\n" ;;\n'
                '  *) echo "stub xdotool: unsupported: $*" >&2; exit 9 ;;\n'
                'esac\n')
    with open(os.path.join(stub, 'ydotool'), 'w', encoding='utf-8') as f:
        f.write('#!/bin/bash\necho "ydotool $*" >> "%s"\nexit 0\n' % log)
    for n in ('xdotool', 'ydotool'):
        os.chmod(os.path.join(stub, n), 0o755)
    return stub, log


def part_d():
    print('[D] 越界防护：实测指针空间 > 无读数不判；越界 rc=2 + 空间提示 + 零注入')
    stub, log = make_stubs()
    base = dict(os.environ)
    base.update({'PATH': stub + ':/usr/bin:/bin', 'DISPLAY': ':99', 'YS_SLOT_ACTIVE': '1',
                 'YS_SESSION_PATH': '/nonexistent/find-textmatch-session.json',
                 'YS_STUB_LOG': log})
    base.pop('YS_POINTER_W', None)
    base.pop('YS_POINTER_H', None)

    def env(**kw):
        e = dict(base)
        e.update({k: str(v) for k, v in kw.items()})
        return e

    def injected():
        try:
            return open(log, encoding='utf-8').read().strip()
        except OSError:
            return ''

    # 在界内：--check 只算不干
    rc, out, err = run([PUT, '--check', '2000', '800'], env=env())
    try:
        j = json.loads(out.strip().splitlines()[0])
    except Exception:
        j = {}
    ck('D1 --check 在界内 rc=0', rc == 0, 'rc=%d' % rc)
    ck('D2 --check 回执 space=pointer', j.get('space') == 'pointer', str(j.get('space')))
    ck('D3 --check 回执 coords_space_size=2560x1440', j.get('coords_space_size') == '2560x1440',
       str(j.get('coords_space_size')))
    ck('D4 --check 不移动指针（零 ydotool 调用）', injected() == '')

    # 方向一：坐标系相等（本机真实几何）——越界只可能是算错
    rc, out, err = run([PUT, '--check', '3000', '1500'], env=env())
    ck('D5 越界(相等空间) rc=2', rc == 2, 'rc=%d' % rc)
    ck('D6 提示实测空间尺寸', '不在指针空间 2560×1440 内' in err, err.strip().splitlines()[:1])
    ck('D7 提示「KWin 逻辑几何只用于窗口几何」',
       'KWin 逻辑几何 1707×960 只用于窗口几何' in err,
       [ln for ln in err.splitlines() if 'KWin' in ln][:1])
    ck('D8 不静默钳制', '不静默钳制' in err)

    # 方向二：模拟 1.5 缩放主机（指针空间 1707×960 < 帧 2560×1440）
    e2 = env(YS_POINTER_W=1707, YS_POINTER_H=960)
    rc, out, err = run([PUT, '--check', '2000', '800'], env=e2)
    ck('D9 越界(指针空间 1707×960) rc=2', rc == 2, 'rc=%d' % rc)
    ck('D10 原文给出「你可能在传帧坐标（2560×1440），指针目标是逻辑坐标（1707×960）」',
       '你可能在传帧坐标（2560×1440），指针目标是逻辑坐标（1707×960）' in err,
       [ln for ln in err.splitlines() if '你可能在传帧坐标' in ln][:1])
    ck('D11 给出换算比例 2560/1707', '按 2560/1707 换算' in err)

    # ys-pointer-click：旧坐标用法必须在**任何注入/进槽之前**停
    rc, out, err = run([CLICK, '3000', '1500'], env=env())
    ck('D12 ys-pointer-click 越界 rc=2', rc == 2, 'rc=%d' % rc)
    ck('D13 ys-pointer-click 越界提示含空间', '越界防护' in err and '2560×1440' in err,
       err.strip().splitlines()[:1])
    ck('D14 ys-pointer-click 越界零注入', injected() == '', injected()[:80])
    rc, out, err = run([CLICK, '2000', '800'], env=e2)
    ck('D15 ys-pointer-click 模拟缩放主机越界 rc=2', rc == 2, 'rc=%d' % rc)
    ck('D16 同一句话（帧 vs 逻辑）', '你可能在传帧坐标（2560×1440），指针目标是逻辑坐标（1707×960）' in err)
    ck('D17 零注入', injected() == '')
    # 负坐标也是越界
    rc, out, err = run([PUT, '--check', '-5', '10'], env=env())
    ck('D18 负坐标 rc=2', rc == 2, 'rc=%d' % rc)


def main():
    print('══ find-textmatch 自测（离线：不占屏、不注入键鼠）══')
    if not os.path.exists(FIND):
        print('✗ 缺被测对象：%s' % FIND)
        return 2
    m = load_ys_find()
    rate = part_a(m)
    part_b()
    part_c()
    part_d()
    print('────────────────────────────────')
    print('匹配率汇总: 新口径 %d/%d=%.1f%% ｜ 旧口径(NFKC 全等) %d/%d=%.1f%% ｜ 反例拒绝 %d/%d'
          % (rate['new'], rate['total'], 100.0 * rate['new'] / rate['total'],
             rate['old'], rate['total'], 100.0 * rate['old'] / rate['total'],
             rate['neg'], len(NEGATIVE_PAIRS)))
    if SKIP:
        print('（SKIP %d 项：见上，非失败）' % SKIP)
    print('FIND-FUZZY-RESULT pass=%d fail=%d verdict=%s'
          % (PASS, FAIL, 'PASS' if FAIL == 0 else 'FAIL'))
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
