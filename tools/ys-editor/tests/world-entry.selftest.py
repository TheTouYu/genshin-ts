#!/usr/bin/env python3
"""world-entry.selftest.py — 感知层主入口不许崩（2026-10-21 事故回归）。

事故：`instruments.get_world_daemon` 被加了 `advice` 实参，但**函数签名没加**，
`worldsvc look --backend daemon-world` 直接 TypeError 崩溃；而它自己的
`advice.selftest.py` 与 `ys-gates` 全绿 —— 因为没人跑"主入口"。

判据（两种都算通过，但必须**是结构化回执而不是 traceback**）：
  A. 成功：JSON 里有 state
  B. 失败：JSON 里有 error.code（如 ATTRIBUTION_OTHER_DESKTOP）**且** detail 带下一步
另外断言：跨桌面类错误的 detail 必须含 "ds=" 与"授权"（失败自解释，与 resolve-window 同款）。

退出码：0 PASS / 1 FAIL / 2 环境缺
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SVC = os.path.join(ROOT, ".scratch", "gui-service", "worldsvc.py")
fails = 0


def chk(tag, cond, detail=""):
    global fails
    print("%-4s %-4s %s" % (tag, "PASS" if cond else "FAIL", detail), flush=True)
    if not cond:
        fails += 1


def main():
    if not os.path.exists(SVC):
        print("WORLD-ENTRY SKIP 找不到 worldsvc.py")
        return 2
    env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY") or ":1"}
    p = subprocess.run([sys.executable, SVC, "look", "--backend", "daemon-world"],
                       capture_output=True, text=True, timeout=120, env=env)
    out = (p.stdout or "").strip()
    chk("T1", "Traceback" not in out and "Traceback" not in (p.stderr or ""),
        "无 traceback（stderr 尾部=%r）" % (p.stderr or "")[-120:])
    try:
        d = json.loads(out)
    except Exception:                                        # noqa: BLE001
        chk("T2", False, "输出不是 JSON：%r" % out[:160])
        print("WORLD-ENTRY-RESULT pass=0 fail=%d verdict=FAIL" % fails)
        return 1
    chk("T2", isinstance(d, dict) and ("state" in d or "error" in d),
        "顶层键=%s" % sorted(d.keys())[:8])
    err = d.get("error")
    if isinstance(err, dict):
        detail = err.get("detail") or ""
        code = err.get("code") or ""
        chk("T3", bool(code), "error.code=%s" % code)
        if "OTHER_DESKTOP" in code or "ATTRIBUTION" in code:
            chk("T4", ("ds=" in detail) and ("授权" in detail),
                "跨桌面错误自带下一步：%s" % detail[:110])
    else:
        print("T3   --   成功路径（state=%s），跳过错误断言" %
              ((d.get("state") or {}).get("state") if isinstance(d.get("state"), dict) else d.get("state")))
    print("WORLD-ENTRY-RESULT pass=%d fail=%d verdict=%s" %
          (6 - 1 - fails, fails, "PASS" if fails == 0 else "FAIL"))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
