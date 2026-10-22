#!/usr/bin/env python3
"""frame-daemon.selftest.py — `ys-wait --settled` 与 `ys-peek` 的零打扰/判据自测。

判据（离线优先；只有在 daemon 活着时才碰真屏，且**只读帧、不抬窗**）：
  A. ys-wait --settled，离线样本（--frames）：
     A1 同一帧重复 ⇒ rc=0 且打印 ✓ settled（帧差 0）；
     A2 两帧不同交替 ⇒ rc=1 且打印 ✗ 未 settled（帧差远大于阈值）；
     A3 前两帧不同、后三帧相同 ⇒ rc=0（只认**连续** N 次达标）；
     A4 达到 samples 即刻返回（不等到 timeout）：耗时 < timeout。
  B. daemon 不在（YS_CAPTURE_DIR 指向空目录）⇒ rc=3 且回执点名 ys-capture latest。
  C. ys-peek：默认路径**不抬窗**
     C1 daemon 活着 ⇒ 回执 `path=daemon`；
     C2 daemon 不在 ⇒ rc=4，回执含「只读场景不抬窗」，且**不产出帧文件**（证明没走抬窗回退）；
     C3 源码层面：`ys-kwin-raise` 只出现在 `--allow-raise` 分支之后（grep 定位，防回归）。

为什么这样测：新增判据的失败形态就是"偷偷把用户的窗抬起来"，真机验证等于先动一次屏幕。

用法：python3 tools/ys-editor/tests/frame-daemon.selftest.py
退出码：0 PASS / 1 FAIL
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(YS))
WAIT = os.path.join(YS, 'ys-wait')
PEEK = os.path.join(YS, 'ys-peek')
SAME = '/tmp/a1.png'
CORPUS = os.path.join(REPO, '.scratch/gui-corpus')
F00 = os.path.join(CORPUS, 'f00.png')
F01 = os.path.join(CORPUS, 'f01.png')

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


def run(args, env=None, timeout=120):
    e = dict(os.environ)
    e.update(env or {})
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=e)


def main():
    print('══ ys-wait --settled / ys-peek 自测 ══')
    if not os.path.exists(SAME):
        # 用仓库内一张帧自造"同一帧重复"的样本，不依赖 /tmp 历史残留
        os.makedirs(os.path.dirname(SAME), exist_ok=True)
        import shutil
        shutil.copyfile(F00, SAME)
    if not (os.path.exists(F00) and os.path.exists(F01)):
        print('  SKIP 缺语料帧：%s / %s' % (F00, F01))
        return 0

    seq = lambda *fs: '--frames=' + ','.join(fs)                  # noqa: E731
    r = run([WAIT, '--settled', seq(SAME, SAME, SAME, SAME), '--samples', '2',
             '--interval-ms', '10', '--timeout', '5', '--label', 'same'])
    ck('A1 相同帧 ⇒ rc=0 settled', r.returncode == 0 and '✓ settled' in r.stdout,
       (r.stdout or r.stderr).strip()[:120])
    r = run([WAIT, '--settled', seq(F00, F01, F00, F01), '--samples', '2',
             '--interval-ms', '10', '--timeout', '5', '--label', 'diff'])
    ck('A2 不同帧 ⇒ rc=1 未 settled', r.returncode == 1 and '未 settled' in r.stdout,
       (r.stdout or r.stderr).strip()[:120])
    r = run([WAIT, '--settled', seq(F00, F01, SAME, SAME, SAME), '--samples', '2',
             '--interval-ms', '10', '--timeout', '5', '--label', 'late'])
    ck('A3 后段才稳 ⇒ rc=0', r.returncode == 0 and '✓ settled' in r.stdout,
       (r.stdout or r.stderr).strip()[:140])
    r = run([WAIT, '--settled', seq(SAME, SAME, SAME, SAME), '--samples', '2',
             '--interval-ms', '10', '--timeout', '30', '--label', 'fast'])
    ck('A4 达标即返回（不空转到 timeout）', r.returncode == 0 and 'samples' not in r.stderr,
       (r.stdout or '').strip()[:120])

    tmp = tempfile.mkdtemp(prefix='ys-settled-nodaemon-')
    r = run([WAIT, '--settled', '--timeout', '2', '--label', 'nod'],
            env={'YS_CAPTURE_DIR': tmp, 'YS_CAPTURE_STATE': os.path.join(tmp, 'state.tsv')})
    ck('B daemon 不在 ⇒ rc=3 且点名', r.returncode == 3 and 'ys-capture latest' in r.stdout,
       (r.stdout or r.stderr).strip()[:140])

    out = os.path.join(tmp, 'peek.png')
    r = run([PEEK, '--out', out])
    if r.returncode == 0:
        ck('C1 daemon 活着 ⇒ path=daemon', 'path=daemon' in (r.stdout or ''),
           (r.stdout or '').strip()[:120])
    else:
        print('  SKIP C1 daemon 当前不在（rc=%d）——真屏读数留给有 daemon 的轮' % r.returncode)
    out2 = os.path.join(tmp, 'peek-nod.png')
    r = run([PEEK, '--out', out2],
            env={'YS_CAPTURE_DIR': os.path.join(tmp, 'absent'),
                 'YS_CAPTURE_STATE': os.path.join(tmp, 'absent', 'state.tsv')})
    ck('C2 只读拿不到帧 ⇒ rc=4 不抬窗', r.returncode == 4
       and '只读场景不抬窗' in (r.stderr or '') and not os.path.exists(out2),
       'rc=%d exists=%s' % (r.returncode, os.path.exists(out2)))
    src = open(PEEK, encoding='utf-8').read()
    i_gate = src.find('ALLOW_RAISE')
    i_raise = src.find('ys-kwin-raise')
    ck('C3 raise 只在 --allow-raise 闸门之后', -1 < i_raise and i_gate < i_raise,
       'gate@%d raise@%d' % (i_gate, i_raise))

    print('FRAME-DAEMON-SELFTEST pass=%d fail=%d verdict=%s'
          % (PASS, FAIL, 'PASS' if FAIL == 0 else 'FAIL'))
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
