#!/usr/bin/env python3
"""ys_win — 窗口 id 解析的**唯一实现**（唯一入口 = 本模块；CLI 名仍是 `ys-win-id`）。

为什么必须单一实现：窗口 id 每次重开游戏/换会话都会变（实测 0x01400001 → 0x1800001 →
0x1200001 → 0x04000008），而同一 class 常同时存在主窗 + 1×1 幽灵窗 + 窄面板。
2026-10-21 连踩三次（ESC 发不出、抓图空、守护空转），根因都是「某个工具自己写了一份解析/兜底」。
现在所有 Python 消费者 `import ys_win`，`ys-win-id`（bash CLI）也只负责 source 环境后 exec 本模块。

口径（与 2026-10-20 版 ys-win-id / ys_look._resolve_win 逐字一致）：
  ① 仅当 prefer_sandbox=True 且环境有 WIN_SANDBOX（ys-env.sh 按标题「千星沙箱」解析）
     且几何可读 → 用它；
  ② 否则按 WM_CLASS 搜（缺省 yuanshen / yuanshen.exe），**取面积最大**的那个（1×1 幽灵窗是常态）。
解析失败返回空字符串（fail-closed）——**绝不回退过期 id**，否则失败会伪装成"能用"。

`resolve_editor()` 是另一类目标（编辑器主窗：标题含「千星」或「资源管理器」），也放这里，
免得各工具再写一份 wmctrl 解析。环境一律走 ys_env（DISPLAY 空串兜底 + 每会话随机 XAUTHORITY）。

用法：`ys-win-id` → 0x1200001；`ys-win-id --dec` → 18874369
"""
from __future__ import annotations

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ys_env  # noqa: E402

DEFAULT_CLASSES = ("yuanshen", "yuanshen.exe")
EDITOR_TITLES = ("千星", "资源管理器")


def _run(args, timeout=5):
    try:
        return subprocess.run(["xdotool", *args], capture_output=True, text=True,
                              timeout=timeout, env=ys_env.env())
    except Exception:                                    # noqa: BLE001
        return None


def geometry(win):
    """(w, h) 或 None。win 可为 0x 十六进制或十进制字符串。"""
    r = _run(["getwindowgeometry", "--shell", str(win)], timeout=3)
    if not r or r.returncode != 0:
        return None
    w = h = 0
    for line in (r.stdout or "").splitlines():
        if line.startswith("WIDTH="):
            w = int(line.split("=")[1] or 0)
        elif line.startswith("HEIGHT="):
            h = int(line.split("=")[1] or 0)
    return (w, h) if w and h else None


def ids_by_class(cls):
    r = _run(["search", "--class", cls], timeout=5)
    return [x for x in ((r.stdout if r else "") or "").split() if x.strip()]


def resolve(prefer_sandbox=True, classes=DEFAULT_CLASSES):
    """返回 '0x...'；解析不到返回 ''（fail-closed）。"""
    if prefer_sandbox:
        seed = (os.environ.get("WIN_SANDBOX") or "").strip()
        if seed and geometry(seed):
            try:
                return hex(int(seed, 0))
            except ValueError:
                pass
    best, best_area = "", -1
    for cls in classes:
        for wid in ids_by_class(cls):
            g = geometry(wid)
            if not g:
                continue
            area = g[0] * g[1]
            if area > best_area:
                best, best_area = wid, area
    if not best:
        return ""
    try:
        return hex(int(best))
    except ValueError:
        return best


def resolve_editor():
    """编辑器主窗（wmctrl 标题含「千星」或「资源管理器」）；解析不到再退回 resolve()。"""
    try:
        r = subprocess.run(["wmctrl", "-l"], capture_output=True, text=True, timeout=10,
                           env=ys_env.env())
    except Exception:                                    # noqa: BLE001
        r = None
    for line in ((r.stdout if r else "") or "").splitlines():
        for name in EDITOR_TITLES:
            if name in line:
                return line.split()[0]
    return resolve(prefer_sandbox=True)


def resolve_class(cls):
    """指定 WM_CLASS 的面积最大窗口（'0x...' 或 ''）。"""
    if not cls:
        return ""
    key = cls.split()[0].lower()
    if key.endswith(".exe"):
        key = key[:-4]
    return resolve(prefer_sandbox=False, classes=(key,)) if key else ""


def as_int(win):
    try:
        return int(str(win), 0)
    except (TypeError, ValueError):
        return 0


def main(argv):
    win = resolve(prefer_sandbox=True)
    if not win:
        print("no sandbox window", file=sys.stderr)
        return 3
    print(str(as_int(win)) if "--dec" in argv else win)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
