#!/usr/bin/env python3
"""ys_settled — 「画面稳了吗」的唯一判据（`ys-wait --settled` 的实现体）。

为什么需要它（2026-10-22 独立模型实测卡点 #5）：
  它要的是「等画面不再变」这件事本身，而 `ys-wait` 只会等**一条谓词命令**的字符串/退出码，
  于是只能写成 `sleep 2` 这种用时长冒充同步的东西。这里把「连续 N 帧帧差 < 阈值」做成判据。

判据不另写一套：**整帧灰度差直接复用 `ys-ops` 的 `diff_ratio()`**
（全分辨率、|diff|>8/255 才算变化、返回 (变化像素占比, 绝对像素数)；两帧尺寸不同返回 (None,None)）。
本文件只负责「取样 → 比上一帧 → 数连续稳定次数 → 超时报错」。

取帧一律走 `ys-capture latest`（常驻服务的最新帧，**零打扰：不抬窗、不抢焦点**）。
离线自测/复算用 `--frames a.png,b.png,...` 或 `--frame-cmd 'CMD'`（CMD 每轮打印一个帧路径）。

用法:
  ys_settled [--samples N] [--interval-ms M] [--threshold R] [--timeout S] [--label L]
             [--out DIR] [--frames a.png,b.png,...] [--frame-cmd 'CMD'] [--verbose]
  N = **连续**多少次满足「帧差 < R」才算稳定（缺省 3，即 4 帧）
  R = 变化像素占比阈值（缺省 0.002 = 0.2%；静态界面实测 0.0~0.0002，动画界面 0.15~0.49）
退出码: 0 已稳定 / 1 超时未稳定 / 2 用法错 / 3 取帧失败（daemon 不在/帧不可信）
"""
import argparse
import json
import os
import shlex
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ys_env  # noqa: E402

CAPTURE = os.path.join(HERE, 'ys-capture')
OPS = os.path.join(HERE, 'ys-ops')


def load_diff_ratio():
    """复用 ys-ops 的整帧差实现（该文件没有 .py 后缀，按 SourceFileLoader 载入）。"""
    import importlib.util
    from importlib.machinery import SourceFileLoader
    loader = SourceFileLoader('ys_ops_diff', OPS)
    spec = importlib.util.spec_from_loader('ys_ops_diff', loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod.diff_ratio


def grab(out):
    """向常驻服务要最新帧。返回 (rc, seq, err)。rc 见 ys-capture 的 fail-closed 退出码。"""
    try:
        r = subprocess.run([CAPTURE, 'latest', '--out', out, '--format', 'png'],
                           env=ys_env.env(), capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as e:
        return 99, None, '%s: %s' % (type(e).__name__, e)
    seq = None
    if r.returncode == 0:
        try:
            seq = (json.loads(r.stdout) or {}).get('frame', {}).get('seq')
        except ValueError:
            seq = None
    err = (r.stderr or '').strip().splitlines()[-1:] or ['']
    return r.returncode, seq, err[0]


def main(argv):
    ap = argparse.ArgumentParser(prog='ys-wait --settled', add_help=True)
    ap.add_argument('--samples', type=int, default=3, help='连续多少次帧差达标才算稳定')
    ap.add_argument('--interval-ms', type=int, default=400, help='取样间隔（毫秒）')
    ap.add_argument('--threshold', type=float, default=0.002, help='帧差阈值（变化像素占比）')
    ap.add_argument('--timeout', type=float, default=15.0, help='总超时（秒）')
    ap.add_argument('--label', default='settled')
    ap.add_argument('--out', default=None, help='保留样本帧到该目录（缺省临时目录，退出即删）')
    ap.add_argument('--frames', default=None, help='离线样本：逗号分隔的帧路径（按序消耗）')
    ap.add_argument('--frame-cmd', default=None, help='离线样本：每轮执行并打印一个帧路径')
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args(argv)
    if a.samples < 1:
        sys.stderr.write('ys-wait --settled: --samples 必须 ≥1\n')
        return 2

    diff_ratio = load_diff_ratio()
    t0 = time.time()
    tmp = a.out or tempfile.mkdtemp(prefix='ys-settled-')
    os.makedirs(tmp, exist_ok=True)
    frames = [x for x in (a.frames or '').split(',') if x] if a.frames else []
    streak = 0
    diffs = []
    prev = None
    prev_seq = None
    dup_seq = 0
    i = 0
    last = None

    while True:
        if frames:
            if i >= len(frames):
                print('[%s] ✗ 未 settled %s 离线样本用尽（%d 帧）最近帧差=%s 连续稳定=%d/%d'
                      % (a.label, _secs(time.time() - t0), len(frames),
                         _fmt(last), streak, a.samples))
                return 1
            path = frames[i]
        elif a.frame_cmd:
            r = subprocess.run(a.frame_cmd, shell=True, env=ys_env.env(),
                               capture_output=True, text=True)
            out = (r.stdout or '').strip().splitlines()
            if r.returncode != 0 or not out:
                sys.stderr.write('[%s] ✗ --frame-cmd 失败 rc=%s\n' % (a.label, r.returncode))
                return 3
            path = out[-1].strip()
        else:
            path = os.path.join(tmp, 'f-%03d.png' % i)
            rc, seq, err = grab(path)
            if rc != 0:
                print('[%s] ✗ 取帧失败 rc=%s（ys-capture latest：%s）'
                      % (a.label, rc, err or 'daemon 未运行?'))
                return 3
            if seq is not None:
                if prev_seq is not None and seq == prev_seq:
                    dup_seq += 1      # 守护帧号没推进 ⇒ 画面没更新，不计入"稳定"
                    if a.verbose:
                        sys.stderr.write('[%s] sample %d 帧号未推进 seq=%s（不计入）\n'
                                         % (a.label, i, seq))
                    prev_seq = seq
                    i += 1
                    if time.time() - t0 > a.timeout:
                        print('[%s] ✗ 未 settled %s 最近帧差=%s 连续稳定=%d/%d '
                              '（帧号未推进 dup_seq=%d）'
                              % (a.label, _secs(time.time() - t0), _fmt(last),
                                 streak, a.samples, dup_seq))
                        return 1
                    time.sleep(a.interval_ms / 1000.0)
                    continue
                prev_seq = seq
        if not os.path.exists(path) or os.path.getsize(path) < 4096:
            print('[%s] ✗ 帧不存在或过小：%s' % (a.label, path))
            return 3
        if prev is None:
            prev = path
            i += 1
            if time.time() - t0 > a.timeout:
                break
            time.sleep(a.interval_ms / 1000.0)
            continue
        ratio, px = diff_ratio(prev, path)
        if ratio is None:
            # 帧尺寸变了（窗口被 resize/换窗）⇒ 判据不成立，重开稳定计数
            streak = 0
            last = None
            if a.verbose:
                sys.stderr.write('[%s] sample %d 帧尺寸不一致（%s vs %s），重计数\n'
                                 % (a.label, i, prev, path))
        else:
            last = ratio
            diffs.append(ratio)
            if ratio <= a.threshold:
                streak += 1
            else:
                streak = 0
            if a.verbose:
                sys.stderr.write('[%s] sample %d diff=%.6f px=%d streak=%d/%d\n'
                                 % (a.label, i, ratio, px, streak, a.samples))
        prev = path
        i += 1
        if streak >= a.samples:
            print('[%s] ✓ settled %s 取样=%d 帧差=%s 阈值=%.4f'
                  % (a.label, _secs(time.time() - t0), len(diffs),
                     '[' + ','.join('%.6f' % d for d in diffs) + ']', a.threshold))
            if not a.out and not frames and not a.frame_cmd:
                _cleanup(tmp)
            return 0
        if time.time() - t0 > a.timeout:
            print('[%s] ✗ 未 settled %s 最近帧差=%s 连续稳定=%d/%d 取样=%d 阈值=%.4f'
                  % (a.label, _secs(time.time() - t0), _fmt(last), streak, a.samples,
                     len(diffs), a.threshold))
            if not a.out and not frames and not a.frame_cmd:
                _cleanup(tmp)
            return 1
        time.sleep(a.interval_ms / 1000.0)
    print('[%s] ✗ 未 settled %s 最近帧差=%s 连续稳定=%d/%d'
          % (a.label, _secs(time.time() - t0), _fmt(last), streak, a.samples))
    return 1


def _fmt(v):
    return 'n/a' if v is None else '%.6f' % v


def _secs(d):
    return '%.1fs' % d if d >= 1 else '%dms' % int(d * 1000)


def _cleanup(d):
    import shutil
    shutil.rmtree(d, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
