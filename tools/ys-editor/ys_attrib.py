#!/usr/bin/env python3
"""ys_attrib.py — 窗口归属校验的**快速路径**（X11/EWMH；票 34）。

背景（2026-10-18）：`ys-observe frame` 曾报 atop:true window=0x01400001 却抓到浏览器
（原神在别的虚拟桌面/被完全遮挡时，spectacle 全屏裁剪会把别的窗口当目标）。
KWin 脚本路线（`ys-wins --attrib` + `ys-atop --json --verify`）判得全，但一次往返 ~1s，
1s/张的真机连拍会被它拖死。本文件把**默认路径**换成 X11/EWMH 属性查询（~50ms 量级）：

  · 当前桌面      `xprop -root _NET_CURRENT_DESKTOP`（0 基）
  · 目标身份      **窗口 id 优先**（ys-observe 已有 `YS_WIN`）；`WM_CLASS`/标题只作兜底/提示
  · 目标桌面      `xprop -id <id> _NET_WM_DESKTOP`（4294967295 = 所有桌面）
  · 最小化        `_NET_WM_STATE` 含 `_NET_WM_STATE_HIDDEN`
  · 遮挡          `_NET_CLIENT_LIST_STACKING`（底→顶）+ 上方窗口几何求并集面积
  · 几何          `xdotool getwindowgeometry --shell`（物理像素，与 spectacle 全屏帧同坐标）

判据（与 ys-atop --json 的 KWin 路线一致）：
  OTHER_DESKTOP = 目标桌面 != 当前桌面；OCCLUDED = 最小化 或 上方窗口并集覆盖 ≥99.5%；
  NOT_FOUND = 找不到目标窗（id 不在栈里且类/标题都不匹配）；NOT_ATOP = 目标不是最上层大窗。
退出码：0 OK / 1 NOT_ATOP / 2 NOT_FOUND / 6 OTHER_DESKTOP / 7 OCCLUDED / 9 检查不可用。

用法：
  python3 tools/ys-editor/ys_attrib.py [标题] [--win 0x01400001] [--class yuanshen.exe]
  （ys-atop --json 默认调它；`--verify` 才走 KWin 慢路径）
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

WIN_DEFAULT = os.environ.get("YS_WIN") or ""     # 动态解析；禁止写死已过期的窗 id
TITLE_DEFAULT = os.environ.get("YS_WIN_TITLE", "原神")
CLASS_DEFAULT = os.environ.get("YS_WIN_CLASS", "yuanshen.exe")
ALL_DESKTOPS = 4294967295


def _run(cmd, timeout=4):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout or "", p.stderr or ""
    except Exception as e:                                  # noqa: BLE001
        return 1, "", f"{type(e).__name__}: {e}"


def _cu(v):
    return tuple(int(x) for x in v)


def _xprop_root(name):
    rc, out, _ = _run(["xprop", "-root", name])
    m = re.search(r"=\s*(\d+)", out)
    return int(m.group(1)) if (rc == 0 and m) else None


def _xprop_win(wid):
    rc, out, _ = _run(["xprop", "-id", wid, "WM_CLASS", "_NET_WM_DESKTOP",
                       "_NET_WM_STATE", "_NET_WM_NAME", "WM_NAME"])
    if rc != 0 or not out.strip():
        return None
    d = {}
    for line in out.splitlines():
        m = re.match(r"([A-Za-z0-9_]+)\([^)]*\)\s*=\s*(.*)$", line.strip())
        if m:
            d[m.group(1)] = m.group(2).strip()
    cls = re.findall(r'"([^"]*)"', d.get("WM_CLASS", ""))
    name = d.get("_NET_WM_NAME") or d.get("WM_NAME") or ""
    name = name.strip().strip('"')
    desk = d.get("_NET_WM_DESKTOP", "")
    try:
        desk = int(re.search(r"\d+", desk).group(0))
    except (AttributeError, ValueError):
        desk = None
    state = d.get("_NET_WM_STATE", "")
    return {"id": wid.lower(), "caption": name,
            "class": cls[0] if cls else "",
            "desktop": desk,
            "minimized": "_NET_WM_STATE_HIDDEN" in state,
            "state": state}


def _stacking():
    rc, out, _ = _run(["xprop", "-root", "_NET_CLIENT_LIST_STACKING"])
    if rc != 0:
        return None
    ids = re.findall(r"0x[0-9a-fA-F]+", out.split(":", 1)[-1] if ":" in out else out)
    return [i.lower() for i in ids]


def _geometry(wid):
    rc, out, _ = _run(["xdotool", "getwindowgeometry", "--shell", wid])
    if rc != 0:
        return None
    g = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            try:
                g[k.strip()] = int(v.strip())
            except ValueError:
                pass
    if not all(k in g for k in ("X", "Y", "WIDTH", "HEIGHT")):
        return None
    return [g["X"], g["Y"], g["WIDTH"], g["HEIGHT"]]


def _inter(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    return None if (x1 <= x0 or y1 <= y0) else [x0, y0, x1 - x0, y1 - y0]


def _union_ratio(rects, area):
    if not rects or area <= 0:
        return 0.0
    xs = sorted({r[0] for r in rects} | {r[0] + r[2] for r in rects})
    covered = 0
    for x0, x1 in zip(xs, xs[1:]):
        ivs = sorted((r[1], r[1] + r[3]) for r in rects if r[0] <= x0 and x1 <= r[0] + r[2])
        merged = []
        for s, e in ivs:
            if merged and s <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], e))
            else:
                merged.append((s, e))
        covered += sum(max(0, e - s) for s, e in merged) * (x1 - x0)
    return covered / float(area)


def attrib(want_id=None, want_title=None, want_class=None):
    t0 = time.time()
    want_id = (want_id or WIN_DEFAULT).lower()
    want_title = TITLE_DEFAULT if want_title is None else want_title
    want_class = CLASS_DEFAULT if want_class is None else want_class
    cur = _xprop_root("_NET_CURRENT_DESKTOP")
    stacking = _stacking()
    out = {"checked": False, "src": "x11", "want_title": want_title,
           "want_class": want_class, "want_id": want_id,
           "current_desktop": cur, "verdict": "UNKNOWN"}
    if cur is None or stacking is None:
        out.update({"error": "X11/EWMH 属性不可用（xprop 读不到桌面/堆叠序）",
                    "elapsed_ms": round((time.time() - t0) * 1000, 1)})
        return out, 9
    # 目标：窗口 id 优先（最稳），其次 WM_CLASS，最后标题
    target = None
    if want_id in stacking:
        target = _xprop_win(want_id)
    if target is None:
        # 给了 WM_CLASS 就**只认 class**（标题会把「原神编辑器」当成游戏）；标题只在无 class 时用
        want_class = (want_class or "").lower()
        for wid in reversed(stacking):
            w = _xprop_win(wid)
            if not w:
                continue
            ok = (want_class in (w["class"] or "").lower()) if want_class else \
                 (want_title and want_title in (w["caption"] or ""))
            if ok:
                target = w
                break
    if target is None or target.get("desktop") is None:
        out.update({"verdict": "NOT_FOUND", "atop": False, "stacking_top": None,
                    "detail": "找不到目标窗口（id/class/标题都不匹配）",
                    "elapsed_ms": round((time.time() - t0) * 1000, 1)})
        out["checked"] = True
        return out, 2
    idx = stacking.index(target["id"]) if target["id"] in stacking else len(stacking)
    geo = _geometry(target["id"])
    target.update({"bbox": geo or [0, 0, 0, 0], "idx": idx})
    # 最上层大窗（旧 atop 语义）：只扫到第一个（从顶向下），够报告用，别为它付 N 次 xdotool
    stacking_top = None
    for wid in reversed(stacking):
        g = _geometry(wid)
        if g and g[3] >= 200 and g[2] >= 800:
            stacking_top = {"id": wid, "bbox": g}
            break
    stacking_top_ok = bool(stacking_top and stacking_top["id"] == target["id"])
    occluders, rects = [], []
    if target["desktop"] not in (cur, ALL_DESKTOPS):
        verdict = "OTHER_DESKTOP"
    elif target["minimized"]:
        verdict = "OCCLUDED"
    else:
        for wid in stacking[idx + 1:]:
            w = _xprop_win(wid)
            if not w or w["minimized"]:
                continue
            if w["desktop"] not in (cur, ALL_DESKTOPS):
                continue                      # 别的桌面上的窗口不参与遮挡
            g = _geometry(wid)
            if not g:
                continue
            r = _inter(target["bbox"], g)
            if r:
                rects.append(r)
                occluders.append({"id": wid, "caption": w["caption"], "class": w["class"],
                                  "bbox": g, "desktop": w["desktop"],
                                  "intersect_px": r[2] * r[3]})
        area = target["bbox"][2] * target["bbox"][3]
        ratio = round(_union_ratio(rects, area), 4) if area else 0.0
        if ratio >= 0.995:
            verdict = "OCCLUDED"
        elif not stacking_top_ok:
            verdict = "NOT_ATOP"
        else:
            verdict = "OK"
    out.update({
        "checked": True, "verdict": verdict, "atop": verdict == "OK",
        "stacking_top": stacking_top_ok,
        "window": {"id": target["id"], "caption": target["caption"], "class": target["class"],
                   "bbox": target["bbox"], "desktop": target["desktop"],
                   "minimized": target["minimized"], "idx": target["idx"]},
        "occluders": occluders[:8],
        "covered_ratio": round(_union_ratio(rects, target["bbox"][2] * target["bbox"][3]), 4)
        if rects and target["bbox"][2] * target["bbox"][3] else 0.0,
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
    })
    return out, {"OK": 0, "NOT_ATOP": 1, "NOT_FOUND": 2,
                 "OTHER_DESKTOP": 6, "OCCLUDED": 7}.get(verdict, 9)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    win = os.environ.get("YS_WIN", WIN_DEFAULT)
    title, klass = None, None
    rest = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--win" and i + 1 < len(argv):
            win = argv[i + 1]; i += 2; continue
        if a == "--class" and i + 1 < len(argv):
            klass = argv[i + 1]; i += 2; continue
        if a.startswith("--"):
            i += 1; continue
        title = a
        i += 1
    out, rc = attrib(want_id=win, want_title=title, want_class=klass)
    print(json.dumps(out, ensure_ascii=False))
    return rc


if __name__ == "__main__":
    sys.exit(main())
