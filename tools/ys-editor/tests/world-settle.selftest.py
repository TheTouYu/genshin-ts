#!/usr/bin/env python3
"""world-settle.selftest.py — 「布局稳不稳」判据回归（F-20261021-UNSETTLED）。

事故：`settled.same_as_prev` 第一版是**逐字相等**（kind/bbox/text 全等），
真机连续 12.5s 都等不到 true，但点击照样落在正确位置 —— 判据是坏的：
OCR 抖一个字符（`●在线` vs `在线`）、bbox 差 1~2px 就让签名永远不相等。
若把这个信号做成 `act` 的强制前置，**会把所有正常动作永久堵死**。

修法：容差判据（数量一致 + 中心位移 ≤ tol_px + 文本相似度 ≥ tol_text），
实现只有一处 `tools/ys-editor/ys_settle.py`。

本测试只用合成签名（不打 OCR、不碰屏幕）：
  T1 完全相同                      → same=True
  T2 OCR 抖动（一个字符差 + 3px 位移）→ same=True   ← 这正是真机上发生的事
  T3 真实漂移（全部 +94px）          → same=False（reason=shift）
  T4 数量变化（多一个对象）          → same=False（reason=count）
  T5 没有上一帧                      → same=False（reason=no_prev）
  T6 对象被换成别的东西（文本全变）    → same=False（reason=unmatched）

退出码：0 全绿 / 1 有失败
"""
import importlib.machinery
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(os.path.dirname(HERE), "ys_settle.py")
results = []


def say(tag, ok, detail):
    results.append((tag, ok, detail))
    print("%-3s %-4s %s" % (tag, "PASS" if ok else "FAIL", detail), flush=True)


def load():
    loader = importlib.machinery.SourceFileLoader("ys_settle_mod", MOD)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    m = importlib.util.module_from_spec(spec)
    loader.exec_module(m)
    return m


def box(y, x=590, w=174, h=156):
    return [x, y, x + w, y + h]


def cont(kind, y, text):
    return {"kind": kind, "bbox": box(y), "text": [text]}


def main():
    S = load()
    base = [cont("tile", y, t) for y, t in
            [(478, "商城"), (478, "好友"), (668, "角色"), (856, "背包")]]
    # 让四个 tile x 不同，避免同坐标
    for i, c in enumerate(base):
        c["bbox"] = [174 + 208 * (i % 2), c["bbox"][1], 348 + 208 * (i % 2), c["bbox"][1] + 156]

    s0 = S.signature(base)
    same, diag = S.compare(s0, S.signature(base))
    say("T1", same is True, "完全相同 → same=%s max_shift=%s" % (same, diag.get("max_shift_px")))

    jitter = [dict(c) for c in base]
    jitter[1] = {"kind": "tile", "bbox": [175 + 208 * 1, 481, 349 + 208 * 1, 637], "text": ["●好友"]}
    same2, diag2 = S.compare(s0, S.signature(jitter))
    say("T2", same2 is True,
        "OCR 抖动（●好友 + 3px）→ same=%s max_shift=%s text_changed=%s"
        % (same2, diag2.get("max_shift_px"), diag2.get("n_text_changed")))

    drifted = [{"kind": c["kind"], "bbox": [c["bbox"][0], c["bbox"][1] + 94,
                                            c["bbox"][2], c["bbox"][3] + 94], "text": c["text"]}
               for c in base]
    same3, diag3 = S.compare(s0, S.signature(drifted))
    say("T3", same3 is False and diag3.get("reason") == "shift",
        "整体漂移 94px → same=%s reason=%s max_shift=%s"
        % (same3, diag3.get("reason"), diag3.get("max_shift_px")))

    more = base + [cont("button", 1200, "关闭")]
    same4, diag4 = S.compare(s0, S.signature(more))
    say("T4", same4 is False and diag4.get("reason") == "count",
        "多一个对象 → same=%s reason=%s" % (same4, diag4.get("reason")))

    same5, diag5 = S.compare(None, s0)
    say("T5", same5 is False and diag5.get("reason") == "no_prev",
        "首帧 → same=%s reason=%s" % (same5, diag5.get("reason")))

    other = [cont("tile", y, t) for y, t in
             [(478, "设置"), (478, "相册"), (668, "拍摄"), (856, "截图")]]
    for i, c in enumerate(other):
        c["bbox"] = [174 + 208 * (i % 2), c["bbox"][1], 348 + 208 * (i % 2), c["bbox"][1] + 156]
    same6, diag6 = S.compare(s0, S.signature(other))
    say("T6", same6 is False and diag6.get("n_unmatched", 0) > 0,
        "另一套界面 → same=%s unmatched=%s" % (same6, diag6.get("n_unmatched")))

    fails = [r for r in results if not r[1]]
    print("WORLD-SETTLE-SELFTEST verdict=%s pass=%d fail=%d" %
          ("PASS" if not fails else "FAIL", len(results) - len(fails), len(fails)), flush=True)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
