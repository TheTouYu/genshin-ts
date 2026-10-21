#!/usr/bin/env python3
"""scan_slot.py — 在**已进入的 ys-gui-slot 租期**内连续扫好友列表。

为什么要这个驱动（2026-10-21 真机读数）：
  · 普通 `ys-scroll` 每次自建 slot，实测 **5.0–5.6s/次**（kwin-state/resolve/raise + 注入 + 0.6s
    settle + coach），60s 窗口只够 8 屏；
  · 本脚本要求外层已经是 `ys-gui-slot`（`YS_SLOT_ACTIVE=1`），`ys-scroll` 会走**直接注入**分支，
    每次降到 ~1–2s，同一窗口可扫 15–20 屏。
  · 仍然只用仓库工具（ys-scroll / worldsvc look / ys-capture），判据不复制。

外层用法：
  ys-gui-slot 0x1600001 50 python3 scan_slot.py --deadline-s 45
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time

REPO = "/home/h/genshin-ts"
TOOLS = os.path.join(REPO, "tools", "ys-editor")
WORLDSVC = os.path.join(REPO, ".scratch", "gui-service", "worldsvc.py")
OUT = os.path.join(REPO, ".scratch", "gui-service", "evidence", "realrun-20261021")
DAY_RE = re.compile(r"(\d+)\s*天前")
AT = "1800,900"


def now_ms():
    return round(time.monotonic() * 1000, 1)


def run(argv, tag, timeout=90):
    t = time.monotonic()
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, cwd=REPO)
    ms = round((time.monotonic() - t) * 1000, 1)
    print("[scan] %-18s rc=%-2d %7.1fms %s" %
          (tag, p.returncode, ms, (p.stdout or "").strip().splitlines()[-1][:160]), flush=True)
    return p.returncode, p.stdout or "", p.stderr or "", ms


def state_of(d):
    st = (d or {}).get("state")
    return st.get("name") if isinstance(st, dict) else st


def look(tag, fast=True):
    path = os.path.join(OUT, tag + ".json")
    argv = [sys.executable, WORLDSVC, "look", "--live", "--backend", "daemon-world",
            "--json-out", path, "--no-cache"]
    if fast:
        argv.append("--fast")
    rc, _o, _e, ms = run(argv, "look/" + tag)
    data = None
    if os.path.isfile(path):
        try:
            data = json.load(open(path, encoding="utf-8"))
        except ValueError:
            data = None
    return rc, data, state_of(data), ms


def rows_of(data):
    out = []
    for o in (data or {}).get("objects") or []:
        b = o.get("bbox") or []
        if len(b) < 4:
            continue
        x, y, w, h = [float(v) for v in b[:4]]
        txt = [s for s in (o.get("text") or []) if s and s.strip()]
        if w >= 800 and 30 <= h <= 300 and y >= 80 and txt:
            out.append({"y": round(y, 1), "h": round(h, 1), "text": txt,
                        "bbox": [x, y, w, h]})
    out.sort(key=lambda r: r["y"])
    return out


def days_of(rows):
    out = []
    for r in rows:
        for s in r["text"]:
            m = DAY_RE.search(s)
            if m:
                out.append({"days": int(m.group(1)), "y": r["y"], "text": r["text"],
                            "bbox": r["bbox"]})
    return out


def scroll(clicks, tag, verify=False, delay=30):
    argv = [os.path.join(TOOLS, "ys-scroll"), "--at", AT, "--clicks", str(clicks),
            "--delay", str(delay), "--dir", "down", "--verify" if verify else "--no-verify"]
    rc, out, err, ms = run(argv, tag)
    info = {"tag": tag, "rc": rc, "ms": ms, "clicks": clicks, "verify": verify}
    try:
        j = json.loads((out.strip().splitlines() or ["{}"])[-1])
        info.update(j)                      # 整份保留（白名单投影会让新字段静默蒸发）
    except ValueError:
        pass
    return rc, info


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--deadline-s", type=float, default=45)
    a = ap.parse_args(argv)
    if os.environ.get("YS_SLOT_ACTIVE") != "1":
        print("SCAN-RESULT error=NOT_IN_SLOT（必须由 ys-gui-slot 启动）", flush=True)
        return 2
    t0 = time.monotonic()
    left = lambda: a.deadline_s - (time.monotonic() - t0)

    rc, data, st, ms = look("s_first", fast=False)
    print("[scan] start state=%s look=%.1fms" % (st, ms), flush=True)
    if st != "GAME_FRIENDS":
        print("SCAN-RESULT error=WRONG_STATE state=%s next=先归一到 GAME_FRIENDS" % st, flush=True)
        return 3

    # 滚动标定：小步 5（复现）+ 大步 40（对照），都带 verify 拿 moved_confirmed
    calib = []
    for clicks, tag in ((5, "calib5"), (40, "calib40")):
        rc, inf = scroll(clicks, tag, verify=True)
        rc2, d2, st2, ms2 = look("calib_" + tag, fast=False)
        calib.append({"scroll": inf, "look_ms": ms2, "rows": len(rows_of(d2)),
                      "first": (rows_of(d2)[0]["text"] if rows_of(d2) else None)})
        if left() < 10:
            break

    screens, found, prev_first, stalled = [], None, None, False
    i = 0
    while left() > 6 and found is None and not stalled:
        i += 1
        rc, inf = scroll(35, "s%02d" % i, verify=False)
        rc2, d2, st2, ms2 = look("screen/s%02d" % i)
        rows = rows_of(d2)
        days = days_of(rows)
        first = rows[0]["text"] if rows else None
        if prev_first is not None and first == prev_first:
            stalled = True
            print("[scan] STALLED at s%02d first=%r" % (i, first), flush=True)
        prev_first = first
        hit = None
        for d in days:
            if d["days"] >= 30:
                hit = d
                break
        screens.append({"tag": "s%02d" % i, "scroll": inf, "look_ms": ms2,
                        "rows": len(rows), "days": days,
                        "first": first, "hit": hit})
        print("[scan] s%02d rows=%d days=%s first=%r" %
              (i, len(rows), [d["days"] for d in days], first), flush=True)
        if hit:
            found = hit
            break

    # 留证：抓帧 + 裁命中行（行 bbox 是 xywh）
    if found:
        cap = os.path.join(OUT, "boundary.png")
        run([os.path.join(TOOLS, "ys-capture"), "latest", "--out", cap,
             "--encode-if-needed"], "capture/boundary")
        try:
            from PIL import Image
            x, y, w, h = found["bbox"]
            im = Image.open(cap).convert("RGB")
            pad = 40
            box = (max(0, int(x) - pad), max(0, int(y) - pad),
                   min(im.width, int(x + w) + pad), min(im.height, int(y + h) + pad))
            crop = im.crop(box)
            crop.save(os.path.join(OUT, "boundary_crop.png"))
            found["crop"] = os.path.join(OUT, "boundary_crop.png")
            found["crop_box"] = box
        except Exception as e:                                  # noqa: BLE001
            found["crop_err"] = "%s: %s" % (type(e).__name__, e)

    res = {"schema": "gui.realrun/scan/1", "wall_s": round(time.monotonic() - t0, 1),
           "start_state": st, "calib": calib, "screens": screens,
           "found": found, "stalled": stalled, "completed": found is not None}
    path = os.path.join(OUT, "result_scan.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print("SCAN-RESULT " + json.dumps(res, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
