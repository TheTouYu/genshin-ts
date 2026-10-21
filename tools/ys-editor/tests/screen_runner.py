#!/usr/bin/env python3
"""screen_runner.py — 在**一个进程内**把 ys-screen 跑 N 帧 × cold/warm/warm2。

## 为什么要有它（2026-10-21 性能复盘）

`screen-digest.selftest.sh` 原来每帧起一个 `tools/ys-screen` 子进程，跑 4 帧 × 3 次 = 12 次。
单次 CLI 实测 **4.29s**，而同进程内 `analyze()` 只要 **1.57s**（OCR 0.62 + 控件 0.64 + 其余）：
差额全是**进程启动 + 首次调用初始化**（numpy/图像库/首次连接守护）。
⇒ 测试测到的不是模块成本，是进程成本。

本 runner 用 `SourceFileLoader` 加载 `tools/ys-screen`（与 `ys_lookd._ys_screen()` 同一姿势），
然后**复用它的 `main(argv)`** 逐次调用——所以语义与 CLI 完全一致（同一套 argparse 与输出），
只是不再每帧重付启动成本。

产物与原来 `run_frame` 逐字节同构：
    <out>/<name>.<tag>.json     每次调用的 --json-out
    <out>/<name>.<tag>.ms       本次调用墙钟毫秒
    <out>/<name>.<tag>.err      stderr
    <out>/<name>.json           最后一次（warm2）的输出，供断言直接 load
    <out>/rc.tsv                name<TAB>tag<TAB>rc
"""
import argparse
import contextlib
import importlib.machinery
import importlib.util
import io
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))  # tests → ys-editor → tools → 仓库根


def load_ys_screen():
    path = os.path.join(ROOT, "tools", "ys-screen")
    loader = importlib.machinery.SourceFileLoader("ys_screen_runner", path)
    spec = importlib.util.spec_from_loader("ys_screen_runner", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def run_once(mod, frame, out_json, extra):
    """跑一次 ys-screen（走它自己的 main），返回 (rc, stderr文本)。"""
    argv = [frame, "--json", "--json-out", out_json] + list(extra)
    err = io.StringIO()
    rc = 0
    t0 = time.perf_counter()
    try:
        with contextlib.redirect_stderr(err):
            r = mod.main(argv)
            rc = int(r) if isinstance(r, int) else 0
    except SystemExit as e:                       # argparse/main 里可能 sys.exit
        rc = int(getattr(e, "code", 0) or 0)
    finally:
        ms = int((time.perf_counter() - t0) * 1000)
    return rc, err.getvalue(), ms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", nargs="+", required=True)
    ap.add_argument("--tags", nargs="+", default=["cold", "warm", "warm2"])
    a = ap.parse_args()

    mod = load_ys_screen()                        # 一次加载
    rc_path = os.path.join(a.out, "rc.tsv")
    with open(rc_path, "w", encoding="utf-8") as rcf:
        for name in a.frames:
            frame = os.path.join(a.fixture_dir, name + ".png")
            for tag in a.tags:
                out_json = os.path.join(a.out, "%s.%s.json" % (name, tag))
                rc, serr, ms = run_once(mod, frame, out_json, [])
                with open(os.path.join(a.out, "%s.%s.ms" % (name, tag)), "w") as f:
                    f.write(str(ms))
                with open(os.path.join(a.out, "%s.%s.err" % (name, tag)), "w") as f:
                    f.write(serr or "")
                rcf.write("%s\t%s\t%d\n" % (name, tag, rc))
                rcf.flush()
            # 断言读的是「最后一次」的输出，与原 run_frame 的落点保持一致
            last = os.path.join(a.out, "%s.%s.json" % (name, a.tags[-1]))
            if os.path.exists(last):
                shutil.copyfile(last, os.path.join(a.out, "%s.json" % name))
    return 0


if __name__ == "__main__":
    sys.exit(main())
