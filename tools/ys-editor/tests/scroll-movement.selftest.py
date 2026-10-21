#!/usr/bin/env python3
"""scroll-movement.selftest.py — ys-scroll「到底动没动」回归（F-20261021-SCROLL-FALSE-SUCCESS）。

事故：ys-scroll 在画面逐像素一致时仍然返回 `ok:true, shifted:false, rc=0`。
调用方（我）连吃 3 次空滚，却因为退出码是 0 而以为「滚过了」。
根因不是滚动本身，而是**没有差异量**：`moved_px` 走的是 ±200px 相关，大步翻页时给假读数
（D410），`--no-verify` 时干脆是 null。于是「动了没测出来」与「真的没动」不可区分。

本测试只验两条纯逻辑（不需要 GUI、不注入、不碰游戏窗口）：
  T1 frame_diff：同一张图 → 0；改动一个块 → > 0.001
  T2 exit_code：注入失败→5；动了→0；没动→6；未验证(None)→0（诚实三态，不假装知道）

用法：python3 tools/ys-editor/tests/scroll-movement.selftest.py
退出码：0 全绿 / 1 有失败
"""
import importlib.machinery
import importlib.util
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCROLL = os.path.join(os.path.dirname(HERE), "ys-scroll")
results = []


def say(tag, ok, detail):
    results.append((tag, ok, detail))
    print("%-4s %-4s %s" % (tag, "PASS" if ok else "FAIL", detail), flush=True)


def load():
    loader = importlib.machinery.SourceFileLoader("ys_scroll_mod", SCROLL)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def main():
    mod = load()
    try:
        import numpy as np
        from PIL import Image
    except Exception as exc:                                # noqa: BLE001
        say("T0", False, "缺少 numpy/PIL：%s" % exc)
        return 1

    d = tempfile.mkdtemp(prefix="ys-scroll-test-")
    base = (np.random.RandomState(0).rand(480, 640) * 60 + 120).astype("uint8")
    p_same = os.path.join(d, "same.png")
    p_copy = os.path.join(d, "copy.png")
    p_diff = os.path.join(d, "diff.png")
    Image.fromarray(base).save(p_same)
    Image.fromarray(base.copy()).save(p_copy)
    moved = base.copy()
    moved[100:340, 100:540] = 30                            # 一整块变暗 = 明显位移/滚动
    Image.fromarray(moved).save(p_diff)

    same = mod.frame_diff(p_same, p_copy)
    diff = mod.frame_diff(p_same, p_diff)
    say("T1", same == 0.0 and diff is not None and diff > 0.001,
        "同图 diff=%s（须=0）｜动过 diff=%.4f（须>0.001）" % (same, diff or -1))

    cases = [("注入失败", (False, True, None), 5),
             ("动了", (True, True, True), 0),
             ("没动", (True, True, False), 6),
             ("未验证None", (True, True, None), 0),
             ("归还失败", (True, False, True), 5)]
    bad = []
    for name, args, want in cases:
        got = mod.exit_code(*args)
        if got != want:
            bad.append("%s want=%d got=%d" % (name, want, got))
    say("T2", not bad, "exit_code 5 例%s" % (" 全对" if not bad else " 不符：" + "; ".join(bad)))

    fails = [r for r in results if not r[1]]
    print("SCROLL-MOVE-SELFTEST verdict=%s pass=%d fail=%d" %
          ("PASS" if not fails else "FAIL", len(results) - len(fails), len(fails)), flush=True)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
