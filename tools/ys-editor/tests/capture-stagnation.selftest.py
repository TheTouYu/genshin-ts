#!/usr/bin/env python3
"""capture-stagnation.selftest.py — 「帧停滞」稽核与自愈的回归（全离线，不碰屏幕）。

## 为什么有它（2026-10-23，`gui-test/.03` + `.04` 两次真机采集的共同卡点）

现象：按键后要等 ~2.2s 才在帧里看到新内容；`.04` 一度把它解释成"面板两段式动画"，
后来推翻成"帧停滞"，但**没有修**——只写进了技能文档当注意事项。本轮实测判到根因：

  · daemon 的 XShm 按窗口读回会**滞后**：10s 采样里内容变化间隔 0.05–2.23s（最长冻结 2.23s）；
  · 同一时段 KWin ScreenShot2（合成器通道）**13/13 连续对都在变** ⇒ 画面一直在动。
  ⇒ 「画面在动、XShm 静止」= 主通道陈旧，而不是游戏动画慢。

## 本自测守什么（每条都注入一个假故障，不依赖真机）

  T1 陈旧必须被抓到并自愈：XShm 恒给同一帧、合成器帧在变 ⇒ 必须 stale_events≥1、
     内容换成合成器帧（content_seq 前进）、通道切到 kwin-ss2、state 里 kwin_fallback=1。
  T2 真静止不许误报：两条通道都给同一帧 ⇒ audit_stale=0、verdict=CONTENT_STATIC。
  T3 内容在变就别稽核：XShm 每帧都变 ⇒ content_seq 前进且 stale_events=0（稽核不该被触发）。
  T4 合成器通道不可用要"说出来"，不许静默：verdict=KWIN_UNAVAILABLE 且主通道继续出帧。
  T5 回退可退出：主通道恢复变化（连续两次）⇒ 切回 xshm。
  T6 签名判据本身：同帧不判变、强噪声（±2）不判变、换内容判变。

用法：python3 tools/ys-editor/tests/capture-stagnation.selftest.py
退出码：0 PASS / 1 FAIL
"""
import importlib.util
import os
import sys
import tempfile
import threading
import time
from types import SimpleNamespace

import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
SPEC = importlib.util.spec_from_file_location(
    'ycap', os.path.join(REPO, 'tools', 'ys-editor', 'ys_capture.py'))
Y = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(Y)

W, H = 128, 96
PASS = 0
FAIL = 0


def ck(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  PASS {name} {detail}')
    else:
        FAIL += 1
        print(f'  FAIL {name} {detail}')


def frame(seed=0):
    """确定性帧：seed 变了内容就明显变（整块色块），同 seed 逐字节相同。"""
    a = np.zeros((H, W, 3), np.uint8)
    a[:, :, 0] = (seed * 37) % 256
    a[:, :, 1] = (seed * 91) % 256
    a[:, :, 2] = (seed * 53) % 256
    a[H // 4:H // 2, W // 4:W // 2] = (255 - (seed * 37) % 256, 128, 64)
    return a


class FakeGrabber:
    """替身抓帧器：按注入的序列返回帧（序列耗尽后停在最后一帧）。"""

    def __init__(self, gen):
        self.gen = gen
        self.n = 0
        self.closed = False

    def grab(self):
        self.n += 1
        return self.gen(self.n), 0.5

    def close(self):
        self.closed = True


def make_args(d, **kw):
    a = SimpleNamespace(dir=d, fps=25, win='0x1', class_='fake-win', ring=4, pre='',
                        source='screen', width=W, height=H, fast_sec=0.3, strict_sec=1.5,
                        display=':0', audit=True, audit_after_ms=200,
                        audit_interval_ms=120, audit_max_interval_ms=500,
                        fallback_hold_ms=4000)
    for k, v in kw.items():
        setattr(a, k, v)
    return a


def touch_demand(d):
    """模拟"有人在读帧"：守护只在 demand 新鲜时才付合成器抓帧/稽核。"""
    with open(os.path.join(d.dir, 'demand'), 'w') as f:
        f.write('1')


def run_daemon(d, kwin_gen=None, wait_for=None, timeout=6.0):
    """起 capture+audit 两个线程；等 wait_for(daemon) 成立或超时；停掉并返回。

    同时周期性 touch demand（等价于客户端在轮询 latest）——不 touch 的话守护按设计
    不会走合成器通道，测的就不是被测路径了。
    """
    touch_demand(d)
    ths = [threading.Thread(target=d.capture_loop, daemon=True),
           threading.Thread(target=d.audit_loop, daemon=True)]
    for t in ths:
        t.start()
    t0 = time.time()
    ok = False
    while time.time() - t0 < timeout:
        touch_demand(d)
        if wait_for and wait_for(d):
            ok = True
            break
        time.sleep(0.05)
    time.sleep(0.15)
    d.stop.set()
    for t in ths:
        t.join(timeout=3.0)
    return ok


def case_stale_detected():
    print('T1 陈旧必须被抓到并自愈')
    d = tempfile.mkdtemp(prefix='yscap-stale-')
    Y.AUDIT_PAIR_GAP_S = 0.05                     # 测试提速：稽核三连抓间隔
    dargs = make_args(d)
    dm = Y.Daemon(dargs)
    dm.grabber = FakeGrabber(lambda n: frame(1))          # 主通道：永远同一帧（陈旧）
    kn = {'n': 0}

    def kwin_fake():                                      # 合成器通道：每次都不一样（画面在动）
        kn['n'] += 1
        return frame(2 + kn['n']), 1.0, {'src': 'kwin-ss2', 'format': 18}

    dm._kwin_grab = kwin_fake
    ok = run_daemon(dm, wait_for=lambda x: x.stale_events >= 1)
    st = Y.read_state_fields(d) or {}
    ck('T1a 稽核检出陈旧', ok and dm.stale_events >= 1,
       f'stale_events={dm.stale_events} verdict={dm.audit_verdict}')
    ck('T1b 判定为 XSHM_STALE', dm.audit_verdict == 'XSHM_STALE', dm.audit_verdict)
    ck('T1c 内容换成合成器帧（content_seq 前进）', dm.content_seq >= 2,
       f'content_seq={dm.content_seq}')
    ck('T1d 通道切到 kwin-ss2', dm.last_src == 'kwin-ss2', dm.last_src)
    ck('T1e state.tsv 暴露 v2 字段', st.get('ver') == 'v2' and st.get('kwin_fallback') == '1'
       and int(st.get('stale_events') or 0) >= 1,
       f"ver={st.get('ver')} fallback={st.get('kwin_fallback')} stale={st.get('stale_events')}")
    ck('T1f 静止时长读数存在', int(st.get('static_ms') or -1) >= 0, st.get('static_ms'))


def case_true_static():
    print('T2 真静止不许误报')
    d = tempfile.mkdtemp(prefix='yscap-static-')
    Y.AUDIT_PAIR_GAP_S = 0.05
    dm = Y.Daemon(make_args(d))
    dm.grabber = FakeGrabber(lambda n: frame(7))
    dm._kwin_grab = lambda: (frame(7), 1.0, {'src': 'kwin-ss2', 'format': 18})
    ok = run_daemon(dm, wait_for=lambda x: x.audit_ok >= 1, timeout=5.0)
    ck('T2a 稽核跑了并判为静态', ok and dm.audit_verdict == 'CONTENT_STATIC',
       f'ok={dm.audit_ok} verdict={dm.audit_verdict}')
    ck('T2b 零误报（不切通道）', dm.stale_events == 0 and dm.last_src == 'xshm-window',
       f'stale={dm.stale_events} channel={dm.last_src}')
    ck('T2c 内容仍只有一版', dm.content_seq == 1, f'content_seq={dm.content_seq}')
    ck('T2d state 的 kwin_fallback=0', (Y.read_state_fields(d) or {}).get('kwin_fallback') == '0')


def case_changing_primary():
    print('T3 内容在变就别稽核')
    d = tempfile.mkdtemp(prefix='yscap-live-')
    Y.AUDIT_PAIR_GAP_S = 0.05
    dm = Y.Daemon(make_args(d))
    dm.grabber = FakeGrabber(lambda n: frame(10 + n // 1))   # 每帧都变
    dm._kwin_grab = lambda: (frame(3), 1.0, {'src': 'kwin-ss2', 'format': 18})
    ok = run_daemon(dm, wait_for=lambda x: x.content_seq >= 4, timeout=5.0)
    ck('T3a 内容 id 随内容前进', ok and dm.content_seq >= 4, f'content_seq={dm.content_seq}')
    ck('T3b 不误报陈旧', dm.stale_events == 0, f'stale_events={dm.stale_events}')
    ck('T3c 通道保持 xshm', dm.last_src == 'xshm-window', dm.last_src)


def case_kwin_unavailable():
    print('T4 合成器通道不可用必须说出来')
    d = tempfile.mkdtemp(prefix='yscap-nokwin-')
    Y.AUDIT_PAIR_GAP_S = 0.02
    dm = Y.Daemon(make_args(d, audit_interval_ms=60))

    def boom():
        raise Y.GrabError('KWin: 取不到窗口 internalId（夹具注入）')

    dm.grabber = FakeGrabber(lambda n: frame(5))
    dm._kwin_grab = boom
    ok = run_daemon(dm, wait_for=lambda x: x.audit_unavailable >= 1, timeout=4.0)
    ck('T4a 记账 audit_unavailable', ok and dm.audit_unavailable >= 1,
       f'unavailable={dm.audit_unavailable} verdict={dm.audit_verdict}')
    ck('T4b verdict=KWIN_UNAVAILABLE', dm.audit_verdict == 'KWIN_UNAVAILABLE', dm.audit_verdict)
    ck('T4c 主通道继续出帧（不熄火）', dm.seq >= 3 and dm.content_seq >= 1,
       f'seq={dm.seq} content_seq={dm.content_seq} last_err={dm.last_err[:60]}')
    ck('T4d 没有假装检出陈旧', dm.stale_events == 0, f'stale={dm.stale_events}')


def case_resume():
    print('T5 回退可退出')
    d = tempfile.mkdtemp(prefix='yscap-resume-')
    dm = Y.Daemon(make_args(d))
    seq = iter([frame(1), frame(2), frame(3), frame(4), frame(5), frame(6)])
    dm.grabber = FakeGrabber(lambda n: next(seq, frame(6)))
    dm.fallback_until = time.time() + 30          # 现在处于回退态
    dm._fallback_xcrc = None
    dm._resume_count = 0
    for _ in range(5):                            # 判据：连续 4 次变化才切回（2 次太容易被滞后骗）
        dm._probe_resume()
    ck('T5a 主通道连续 4 次变化即切回', dm.fallback_until == 0.0,
       f'fallback_until={dm.fallback_until} resume={dm._resume_count}')
    # 只变一次不许切回（滞后本身也会"变一次"）
    dm2 = Y.Daemon(make_args(tempfile.mkdtemp(prefix='yscap-resume2-')))
    dm2.grabber = FakeGrabber(lambda n: frame(1) if n < 3 else frame(2))
    dm2.fallback_until = time.time() + 30
    dm2._fallback_xcrc = None
    dm2._resume_count = 0
    for _ in range(2):
        dm2._probe_resume()
    ck('T5b 只变一两次不切回', dm2.fallback_until > 0, f'resume={dm2._resume_count}')


def case_signature():
    print('T6 签名判据本身')
    a = frame(9)
    same, _ = Y.sig_changed(Y.coarse_sig(a), Y.coarse_sig(a.copy()))
    noise = np.clip(a.astype(np.int16) + 2, 0, 255).astype(np.uint8)
    noisy, _ = Y.sig_changed(Y.coarse_sig(a), Y.coarse_sig(noise))
    diff, frac = Y.sig_changed(Y.coarse_sig(a), Y.coarse_sig(frame(1)))
    ck('T6a 同帧不判变', same is False)
    ck('T6b ±2 噪声不判变', noisy is False)
    ck('T6c 换内容判变', diff is True, f'frac={frac}')


def main():
    print('══ 帧停滞稽核/自愈自测（离线） ══')
    case_signature()
    case_stale_detected()
    case_true_static()
    case_changing_primary()
    case_kwin_unavailable()
    case_resume()
    total = PASS + FAIL
    print(f'CAPTURE-STAGNATION-RESULT pass={PASS} total={total} '
          f'verdict={"PASS" if FAIL == 0 else "FAIL"}')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
