#!/usr/bin/env python3
"""cross-desktop.selftest.py — 「跨桌面必须自解释」回归（F-20261021-61）。

用户令：失败要给出 **原因 + 当前状态 + 下一步**，不能只回一个错误码。
判据：resolve-window 在**解析不到**某类窗口时，回执必须含
  reason / state{window_desktop,current_desktop}（若能找到该窗）/ next_action[]
不依赖真实跨桌面：用一个不存在的 class，等价于"这张桌面/全局都没有它"。

退出码：0 PASS / 1 FAIL
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LEASE = os.path.join(os.path.dirname(HERE), "ys-lease")
fails = 0


def chk(tag, cond, detail=""):
    global fails
    print("%-4s %-4s %s" % (tag, "PASS" if cond else "FAIL", detail), flush=True)
    if not cond:
        fails += 1


def main():
    env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY") or ":1"}
    p = subprocess.run([LEASE, "resolve-window", "--id", "0x9999999", "--cls", "no-such-class-xyz"],
                       capture_output=True, text=True, timeout=40, env=env)
    try:
        d = json.loads((p.stdout or "").strip().splitlines()[-1])
    except Exception:                                       # noqa: BLE001
        chk("T0", False, "输出不是 JSON：%r" % (p.stdout or p.stderr)[:200])
        return 1
    chk("T1", d.get("ok") is False and d.get("error") == "TARGET_NOT_FOUND",
        "error=%s" % d.get("error"))
    chk("T2", bool(d.get("reason")), "reason=%r" % (d.get("reason") or "")[:60])
    chk("T3", isinstance(d.get("state"), dict) and "found" in (d.get("state") or {}),
        "state keys=%s" % sorted((d.get("state") or {}).keys()))
    na = d.get("next_action")
    chk("T4", isinstance(na, list) and len(na) >= 1 and all("why" in x for x in na),
        "next_action n=%s" % (len(na) if isinstance(na, list) else "None"))
    print("CROSS-DESKTOP-RESULT pass=%d fail=%d verdict=%s" %
          (5 - fails, fails, "PASS" if fails == 0 else "FAIL"))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
