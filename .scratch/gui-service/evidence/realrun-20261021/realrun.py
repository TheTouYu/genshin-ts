#!/usr/bin/env python3
"""realrun.py — 真机「世界→派蒙→好友→第一个 ≥30 天未上线」实测驱动（60s 窗口内跑）。

设计约束（用户令 2026-10-21）：
  · 屏幕占用由调用方 `ys-screen-grant` 负责；本脚本**不 grant/revoke**，只在窗口内动作。
  · 每个动作都走仓库工具（ys-gui-slot / ys-pointer-click / ys-scroll / worldsvc look），
    不裸调 import/xdotool（槽内注入由工具自己的 slot 完成）。
  · 55s 硬停：调用方给 `--deadline-s`（缺省 52），到点前 3s 停止发起新动作。
  · 输出结构化 JSON（每个动作 wall ms、scroll moved_px/moved_confirmed、每屏 rows），
    供报告与复算。

用法：
  python3 realrun.py --phase nav  --deadline-s 52
  python3 realrun.py --phase scan --deadline-s 52
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
WIN = os.environ.get("YS_REALRUN_WIN", "0x1600001")
SCROLL_AT = os.environ.get("YS_REALRUN_SCROLL_AT", "1800,900")
DAY_RE = re.compile(r"(\d+)\s*天前")


class Abort(RuntimeError):
    pass


def _state_name(data):
    """全量 look 的 state 是 {name:...}；--summary 的 state 是字符串。两种都要吃。"""
    st = (data or {}).get("state")
    if isinstance(st, dict):
        return st.get("name")
    return st


def find_text_center(data, needle):
    """返回 (xywh 中心, xyxy 中心, bbox)。真机数据实测 bbox 是 xywh：
    「好友」磁贴 [592.1,473.1,175.8,157.8] 的 xywh 中心 (680,552) 与成功点击 (679,551) 吻合；
    xyxy 中心会算成 (384,315)（空处）。两个都打出来，点击用 xywh 中心。"""
    for o in (data or {}).get("objects") or []:
        txt = " ".join(o.get("text") or [])
        if needle in txt and len(o.get("bbox") or []) == 4:
            x, y, w, h = [float(v) for v in o["bbox"]]
            return (int(round(x + w / 2)), int(round(y + h / 2))), \
                   (int(round((x + w) / 2)), int(round((y + h) / 2))), o["bbox"]
    return None, None, None


class Runner:
    def __init__(self, phase, deadline_s):
        self.phase = phase
        self.t0 = time.monotonic()
        self.deadline = float(deadline_s)
        self.actions = []
        self.looks = []
        self.scrolls = []
        self.screens = []
        self.found = None
        os.makedirs(OUT, exist_ok=True)
        self.seen = []
        self.stalled = False
        self.prev_first = None
        self.nav_timings = {}

    # ── 基础 ──────────────────────────────────────────────────────────────
    def left(self):
        return self.deadline - (time.monotonic() - self.t0)

    def run(self, argv, tag, timeout=90, env=None):
        t = time.monotonic()
        try:
            p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                               cwd=REPO, env={**os.environ, **(env or {})})
            rc, out, err = p.returncode, p.stdout or "", p.stderr or ""
        except subprocess.TimeoutExpired:
            rc, out, err = 124, "", "timeout"
        ms = round((time.monotonic() - t) * 1000, 1)
        rec = {"tag": tag, "ts": time.strftime("%H:%M:%S") + ".%03d" % int((time.time() % 1) * 1000),
               "argv": argv[-2:], "rc": rc, "ms": ms,
               "out_tail": out.strip().splitlines()[-1][:300] if out.strip() else "",
               "err_tail": err.strip().splitlines()[-1][:300] if err.strip() else ""}
        self.actions.append(rec)
        print("[realrun] %-22s rc=%-3s %8.1fms  %s" % (tag, rc, ms, rec["out_tail"]), flush=True)
        return rc, out, ms

    def esc(self, tag):
        # §2.6：绝对路径；ys-esc 自己走槽（2026-10-21 已修死窗抓图导致 rc=1 的 bug）
        rc, out, ms = self.run([os.path.join(TOOLS, "ys-esc")], tag, env={"YS_WIN": WIN})
        if rc != 0:
            raise Abort("esc %s rc=%d %s" % (tag, rc, out[-200:]))
        return rc, out, ms

    def raise_win(self):
        return self.run([os.path.join(TOOLS, "ys-gui-slot"), WIN, "6", "true"], "raise")

    def look(self, tag, summary=False, no_cache=True, timeout=90):
        path = os.path.join(OUT, tag + ".json")
        argv = [sys.executable, WORLDSVC, "look", "--live", "--backend", "daemon-world",
                "--json-out", path]
        if summary:
            argv.append("--summary")
        if no_cache:
            argv.append("--no-cache")
        rc, _out, ms = self.run(argv, "look/" + tag, timeout=timeout)
        data = None
        if os.path.isfile(path):
            try:
                data = json.load(open(path, encoding="utf-8"))
            except ValueError:
                data = None
        st = _state_name(data)
        self.looks.append({"tag": tag, "ms": ms, "rc": rc, "state": st,
                           "summary": summary, "no_cache": no_cache, "path": path})
        if rc != 0 and rc in (5, 8) and self.left() > 8:
            # 归属/帧失败：抬窗后重试一次（不重复同一条命令的假设）
            self.raise_win()
            time.sleep(0.4)
            rc2, _o2, ms2 = self.run(argv, "look/" + tag + "/retry", timeout=timeout)
            if os.path.isfile(path):
                try:
                    data = json.load(open(path, encoding="utf-8"))
                except ValueError:
                    data = None
            st = _state_name(data)
            self.looks.append({"tag": tag + "/retry", "ms": ms2, "rc": rc2, "state": st,
                               "summary": summary, "no_cache": no_cache, "path": path})
            rc = rc2
        if rc != 0:
            raise Abort("look %s rc=%d" % (tag, rc))
        return data, st

    def click(self, x, y, tag):
        rc, out, ms = self.run([os.path.join(TOOLS, "ys-pointer-click"), str(x), str(y)], tag)
        if rc != 0:
            raise Abort("click %s (%d,%d) rc=%d %s" % (tag, x, y, rc, out[-200:]))
        return rc, out, ms

    def scroll(self, clicks, tag, delay=30, verify=False, drag=0, direction="down"):
        argv = [os.path.join(TOOLS, "ys-scroll"), "--at", SCROLL_AT, "--dir", direction]
        if drag:
            argv += ["--drag", str(drag)]
        else:
            argv += ["--clicks", str(clicks), "--delay", str(delay)]
        argv.append("--verify" if verify else "--no-verify")
        rc, out, ms = self.run(argv, tag)
        info = {"tag": tag, "ms": ms, "rc": rc, "clicks": clicks, "delay": delay,
                "drag": drag, "dir": direction, "verify": verify}
        try:
            j = json.loads((out.strip().splitlines() or ["{}"])[-1])
            info.update(j)                 # 整份保留（白名单投影会让新字段静默蒸发）
        except ValueError:
            pass
        self.scrolls.append(info)
        return info

    # ── 行解析 ────────────────────────────────────────────────────────────
    @staticmethod
    def rows(data):
        out = []
        for o in (data or {}).get("objects") or []:
            b = o.get("bbox") or []
            if len(b) < 4:
                continue
            x, y, w, h = (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
            txt = [s for s in (o.get("text") or []) if s and s.strip()]
            if w >= 800 and 30 <= h <= 300 and y >= 80 and txt:
                out.append({"y": round(y, 1), "h": round(h, 1), "text": txt})
        out.sort(key=lambda r: r["y"])
        return out

    def scan_step(self, tag, clicks=30, delay=30):
        """滚一次 + look 一次；返回本屏（去重后）的新行 + 是否命中边界。"""
        sc = self.scroll(clicks, "scroll/" + tag, delay=delay, verify=False)
        data, st = self.look("screen/" + tag)
        rows = self.rows(data)
        new = []
        for r in rows:
            key = (r["text"][0] if r["text"] else "", r["y"])
            if key in self.seen:
                continue
            self.seen.append(key)
            new.append(r)
        days = []
        hit = None
        for r in new:
            for s in r["text"]:
                m = DAY_RE.search(s)
                if m:
                    n = int(m.group(1))
                    days.append((n, r["y"], r["text"]))
                    if n >= 30 and hit is None:
                        hit = {"days": n, "y": r["y"], "text": r["text"], "state": st,
                               "screen": tag, "scroll": sc}
        first = rows[0]["text"] if rows else None
        if self.prev_first is not None and first == self.prev_first:
            self.stalled = True
            print("[realrun] STALLED at %s：滚动后首行未变（first=%r moved=%r）" %
                  (tag, first, sc.get("moved_px")), flush=True)
        self.prev_first = first
        self.screens.append({"tag": tag, "scroll_ms": sc.get("ms"),
                             "look_ms": self.looks[-1]["ms"], "state": st,
                             "rows": len(rows), "new": len(new),
                             "moved_px": sc.get("moved_px"),
                             "moved_confirmed": sc.get("moved_confirmed"),
                             "days": days})
        print("[realrun] screen %-2s rows=%d new=%d days=%s moved=%s" %
              (tag, len(rows), len(new), [d[0] for d in days], sc.get("moved_px")), flush=True)
        if hit:
            self.found = hit
            return hit
        return None

    # ── 阶段 ──────────────────────────────────────────────────────────────
    def nav(self):
        if self.left() < 20:
            return
        # 0) 当前态（§2.5：第一条必须是 look；summary 的 state 是字符串）
        data, st = self.look("s0", summary=True, no_cache=True)
        # 1) 归一到 GAME_WORLD（记录每次 ESC+look；最多 4 次）
        for k in range(4):
            if st == "GAME_WORLD" or self.left() < 26:
                break
            self.esc("esc/norm%d" % k)
            data, st = self.look("norm%d" % k)
        self.nav_timings["normalized_state"] = st
        # 2) 从世界到派蒙（只有世界态才发这一条 ESC；测 world→paimon）
        if st == "GAME_WORLD" and self.left() > 22:
            t = time.monotonic()
            self.esc("esc/world_to_paimon")
            for i in range(4):
                data, st = self.look("paimon%d" % i)
                if st == "GAME_PAIMON":
                    break
                time.sleep(0.3)
            self.nav_timings["world_to_paimon_ms"] = round((time.monotonic() - t) * 1000, 1)
        elif self.left() <= 22:
            return
        if st != "GAME_PAIMON":
            print("[realrun] 未到 GAME_PAIMON（state=%s）" % st, flush=True)
            self.nav_timings["stopped_at"] = st
            return
        # 3) 解析「好友」磁贴 → 点击（xywh 中心；同时记 xyxy 对照）
        c_xywh, c_xyxy, bbox = find_text_center(data, "好友")
        self.nav_timings["friend_tile_bbox"] = bbox
        self.nav_timings["friend_tile_center_xywh"] = c_xywh
        self.nav_timings["friend_tile_center_xyxy"] = c_xyxy
        if c_xywh is None:
            c_xywh = (679, 551)                     # 上次真机成功坐标兜底
            self.nav_timings["friend_tile_fallback"] = c_xywh
        t = time.monotonic()
        self.click(c_xywh[0], c_xywh[1], "click/friends")
        st = None
        for i in range(5):
            data, st = self.look("friends%d" % i, summary=False)
            if st == "GAME_FRIENDS":
                break
            time.sleep(0.4)
        self.nav_timings["paimon_to_friends_ms"] = round((time.monotonic() - t) * 1000, 1)
        if st != "GAME_FRIENDS":
            print("[realrun] 未到 GAME_FRIENDS（state=%s）" % st, flush=True)
            self.nav_timings["stopped_at"] = st
            return
        # 4) 首屏：1 次全量（取行）+ 1 次 summary 冷读（Lead：首屏读数只要 1 次）
        top, _ = self.look("friends_top", summary=False)
        self.screens.append({"tag": "top", "rows": len(self.rows(top)), "new": 0,
                             "days": self.day_list(top)})
        self.look("judge/0", summary=True, no_cache=True)
        # 5) 步长对照：小步（复现上次 0.58 行/次）+ 大步（对照），各一次
        if self.left() > 18:
            self.scan_step("small5", clicks=5)
        if self.left() > 15:
            self.scan_step("large40", clicks=40)
        # 6) 余量向下扫：30 格/次 ≈4.5 行，7 行/屏有 2.5 行重叠
        i = 0
        while self.left() > 6 and self.found is None and not self.stalled:
            i += 1
            self.scan_step("s%02d" % i, clicks=30)
        if self.found:
            self.run([os.path.join(TOOLS, "ys-capture"), "latest", "--out",
                      os.path.join(OUT, "boundary.png"), "--encode-if-needed"],
                     "capture/boundary")

    def scan(self):
        self.raise_win()
        if self.left() < 10:
            return
        i = 0
        while self.left() > 6 and self.found is None and not self.stalled:
            i += 1
            self.scan_step("c%02d" % i, clicks=30)
        if self.found:
            self.run([os.path.join(TOOLS, "ys-capture"), "latest", "--out",
                      os.path.join(OUT, "boundary.png"), "--encode-if-needed"],
                     "capture/boundary")

    def day_list(self, data):
        out = []
        for r in self.rows(data):
            for s in r["text"]:
                m = DAY_RE.search(s)
                if m:
                    out.append([int(m.group(1)), r["y"]])
        return out

    def result(self):
        return {"phase": self.phase, "wall_s": round(time.monotonic() - self.t0, 1),
                "found": self.found, "screens": self.screens,
                "nav_timings": self.nav_timings, "stalled": self.stalled,
                "scrolls": self.scrolls, "looks": self.looks, "actions": self.actions}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["nav", "scan"], required=True)
    ap.add_argument("--deadline-s", type=float, default=52)
    a = ap.parse_args(argv)
    r = Runner(a.phase, a.deadline_s)
    err = None
    try:
        (r.nav if a.phase == "nav" else r.scan)()
    except Abort as exc:
        err = "ABORT: %s" % exc
        print("[realrun] " + err, flush=True)
    res = r.result()
    res["error"] = err
    path = os.path.join(OUT, "result_%s.json" % a.phase)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print("REALRUN " + json.dumps(res, ensure_ascii=False), flush=True)
    return 0 if not err else 3


if __name__ == "__main__":
    sys.exit(main())
