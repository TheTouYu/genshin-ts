#!/usr/bin/env python3
"""jump_probe.py — 大跳可行性探针（8/16/24/32/48 行；55s 内）。"""
import argparse
import json
import os
import subprocess
import sys
import time

REPO = "/home/h/genshin-ts"
TOOLS = os.path.join(REPO, "tools", "ys-editor")
WS = os.path.join(REPO, ".scratch", "gui-service", "worldsvc.py")
OUT = os.path.join(REPO, ".scratch", "gui-service", "evidence", "realrun-20261021")
META = {"Lv.60", "在线", "●在线", "离线", "今日内", "● 今日内", "好友／我的好友",
        "我的好友", "min:", "max:", "千星奇域游玩中", "申请加入", "前往其大厅"}


def run(argv, tag, timeout=60):
    t = time.monotonic()
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, cwd=REPO)
    ms = round((time.monotonic() - t) * 1000, 1)
    print("[jump] %-16s rc=%-2d %7.1fms" % (tag, p.returncode, ms), flush=True)
    return p.returncode, p.stdout or "", p.stderr or "", ms


def name(t):
    for x in t:
        x = str(x).strip()
        if (x and x not in META and not x.startswith(("min:", "max:"))
                and len(x) <= 8 and not any(c in x for c in "，。！？；：…、")):
            return x
    return None


def rows(d):
    out = []
    for o in (d or {}).get("objects") or []:
        b = o.get("bbox") or []
        t = o.get("text") or []
        if len(b) >= 4:
            x, y, w, h = [float(v) for v in b[:4]]
            if w >= 800 and 30 <= h <= 300 and y >= 80:
                n = name(t)
                if n:
                    out.append((round(y, 1), n))
    return sorted(out)


def look(tag):
    p = os.path.join(OUT, tag + ".json")
    rc, o, e, ms = run([sys.executable, WS, "look", "--live", "--backend", "daemon-world",
                        "--fast", "--no-cache", "--json-out", p], "look/" + tag)
    try:
        d = json.load(open(p, encoding="utf-8"))
    except Exception:
        d = None
    st = (d or {}).get("state")
    st = st.get("name") if isinstance(st, dict) else st
    return rc, d, st, ms, o


def scroll(n, direction, tag, verify=True):
    argv = [os.path.join(TOOLS, "ys-scroll"), "--at", "1800,900",
            "--rows", str(n), "--dir", direction, "--settle-ms", "200", "--no-hint"]
    if not verify:
        argv.append("--no-verify")
    rc, o, e, ms = run(argv, tag, timeout=60)
    info = {"rc": rc, "ms": ms}
    try:
        info.update(json.loads((o.strip().splitlines() or ["{}"])[-1]))
    except Exception:
        pass
    return info


def find_friend(d):
    for o in (d or {}).get("objects") or []:
        t = " ".join(o.get("text") or [])
        b = o.get("bbox") or []
        if "好友" in t and len(b) == 4:
            x, y, w, h = [float(v) for v in b[:4]]
            return int(round(x + w / 2)), int(round(y + h / 2))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--deadline-s", type=float, default=40)
    a = ap.parse_args()
    try:
        s = json.load(open(os.path.expanduser("~/.ys/session.json"), encoding="utf-8"))
    except Exception:
        s = None
    if not s or s.get("state") != "active" or float(s.get("expires") or 0) <= time.time():
        print("JUMP-RESULT error=NO_SESSION", flush=True)
        return 2
    t0 = time.monotonic()
    left = lambda: a.deadline_s - (time.monotonic() - t0)
    rc, d, st, ms, o = look("s0")
    print("[jump] start state=%s rows=%d" % (st, len(rows(d))), flush=True)
    if not rows(d) and left() > 18:
        run([os.path.join(TOOLS, "ys-esc")], "esc", timeout=30)
        for i in range(3):
            rc, d, st, ms, o = look("nav_p%d" % i)
            if st == "GAME_PAIMON":
                break
            time.sleep(0.3)
        c = find_friend(d)
        if c:
            run([os.path.join(TOOLS, "ys-pointer-click"), str(c[0]), str(c[1])],
                "click/friends", timeout=40)
        for i in range(4):
            rc, d, st, ms, o = look("nav_f%d" % i)
            if rows(d):
                break
            time.sleep(0.3)
        print("[jump] nav state=%s rows=%d" % (st, len(rows(d))), flush=True)
    if not rows(d):
        print("JUMP-RESULT error=NO_ROWS state=%s" % st, flush=True)
        return 3
    probes = []
    for n in (8, 16, 24, 48, 32):
        if left() < 8:
            break
        before = rows(d)
        bf = before[0][1]
        ys = [x[0] for x in before]
        dys = [b - a for a, b in zip(ys, ys[1:]) if 80 < b - a < 300]
        pitch = sorted(dys)[len(dys) // 2] if dys else 160.0
        sc = scroll(n, "down", "d%d" % n)
        rc2, d2, st2, ms2, o2 = look("d%d" % n)
        after = rows(d2)
        af = after[0][1] if after else None
        names = [x[1] for x in before]
        moved = names.index(af) if af in names else None
        mp = sc.get("moved_px")
        moved_est = (abs(float(mp)) / pitch) if mp not in (None, 0) else None
        # 复位只在预算允许时做；本轮大跳探针主目标是"最大稳定跳"，
        # 复位失败不阻断后续探针（记录 reset_ok=None 表示未测）。
        reset_ok = None
        if left() > 60:   # 本轮预算优先测 5 个大跳；复位不阻塞（reset_ok=None）
            up = scroll(n, "up", "u%d" % n, verify=False)
            rc3, d3, st3, ms3, o3 = look("u%d" % n)
            back = rows(d3)
            bk = back[0][1] if back else None
            reset_ok = (bk == bf)
            d = d3 if reset_ok else d2
        else:
            d = d2
        lost = (af is None or af == bf or sc.get("moved_confirmed") is False or not mp)
        probes.append({"request_rows": n, "clicks": sc.get("total_clicks") or sc.get("clicks"),
                       "chunked": sc.get("chunked"), "chunks": sc.get("chunks"),
                       "per_chunk_clicks": sc.get("per_chunk_clicks"),
                       "total_clicks": sc.get("total_clicks"),
                       "moved_px": sc.get("moved_px"),
                       "moved_confirmed": sc.get("moved_confirmed"),
                       "before_first": bf, "after_first": af,
                       "moved_rows_in_view": moved, "pitch_px": round(pitch, 1),
                       "moved_rows_est": round(moved_est, 2) if moved_est is not None else None,
                       "advanced_beyond_viewport": af not in names,
                       "reset_ok": reset_ok,
                       "scroll_ms": sc.get("ms"), "look_ms": ms2,
                       "rows_per_sec": round((moved_est or 0) / max(0.001, (sc.get("ms", 0) + ms2) / 1000.0), 2),
                       "lost": bool(lost)})
        print("[jump] N=%d clicks=%s moved_rows=%s reset_ok=%s LOST=%s"
              % (n, sc.get("clicks"), moved, reset_ok, lost), flush=True)
        if not after:
            break
    res = {"schema": "gui.jump-probe/1", "wall_s": round(time.monotonic() - t0, 1),
           "probes": probes,
           "max_stable_rows": max([p["request_rows"] for p in probes if not p["lost"]],
                                  default=None)}
    json.dump(res, open(os.path.join(OUT, "jump-probe.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("JUMP-RESULT " + json.dumps(res, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
