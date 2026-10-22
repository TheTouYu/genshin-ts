#!/usr/bin/env python3
"""find-wording.selftest.py — `ys-find` 无判据时**不许把"没给判据"说成"不知道/没找到"**。

背景（2026-10-22 独立模型实测卡点 #4）：
  不给 `--expect` 时旧输出是 `结论: unknown`，模型读成"工具没找到目标"，于是换通道重找。
  实测真相是**候选就在上面列着**（2 个匹配），缺的只是判据。

判据（离线，用仓库已有帧，只跑文本通道）：
  ① 无 --expect：rc=0，stdout 含「未给判据，仅列 N 个匹配」与「如需结论请加 --expect」，
     且**不含** `结论: unknown`；N 与实际列出的匹配数一致；
  ② 有 --expect：照旧给判据结论（agree/disagree），并打印 `判据: --expect x,y（容差 Npx）`；
  ③ --json：`expect_given` 字段为 false/true，`verdict_note` 带同一句话。

用法：python3 tools/ys-editor/tests/find-wording.selftest.py
退出码：0 PASS / 1 FAIL
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(YS))
FIND = os.path.join(os.path.dirname(YS), 'ys-find')        # tools/ys-find
FRAME = os.path.join(REPO, 'gui-test/.01/frames/p00-initial.png')
LABEL = '角色故事2'

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


def find(args):
    return subprocess.run([sys.executable, FIND, '--frame', FRAME] + args,
                          capture_output=True, text=True, timeout=180)


def main():
    print('══ ys-find 措辞自测 ══')
    if not os.path.exists(FRAME):
        print('  SKIP 缺帧：%s' % FRAME)
        return 0
    r = find(['--text', LABEL])
    out = r.stdout or ''
    n_listed = out.count(LABEL)
    ck('① rc=0', r.returncode == 0, 'rc=%d' % r.returncode)
    ck('① 打印「未给判据，仅列 N 个匹配」', '未给判据，仅列' in out and '个匹配' in out,
       [l for l in out.splitlines() if '结论' in l][:1])
    ck('① 给出下一步（加 --expect）', '如需结论请加 --expect' in out)
    ck('① 不再出现「结论: unknown」', '结论: unknown' not in out)
    import re
    m = re.search(r'未给判据，仅列 (\d+) 个匹配', out)
    ck('① N 与实际列出的匹配数一致', bool(m) and int(m.group(1)) == n_listed,
       'N=%s listed=%d' % (m.group(1) if m else '?', n_listed))

    r2 = find(['--text', LABEL, '--expect', '1210,235'])
    out2 = r2.stdout or ''
    ck('② 有 --expect 时给判据结论', ('结论: agree' in out2 or '结论: disagree' in out2),
       [l for l in out2.splitlines() if l.startswith('结论')][:1])
    ck('② 打印判据行', '判据: --expect 1210,235' in out2)

    r3 = find(['--text', LABEL, '--json'])
    d = json.loads(r3.stdout) if r3.returncode in (0, 4) else {}
    ck('③ json expect_given=false', d.get('expect_given') is False, str(d.get('expect_given')))
    ck('③ json verdict_note 带同一句', '未给判据' in (d.get('verdict_note') or ''),
       (d.get('verdict_note') or '')[:40])

    print('FIND-WORDING-SELFTEST pass=%d fail=%d verdict=%s'
          % (PASS, FAIL, 'PASS' if FAIL == 0 else 'FAIL'))
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
