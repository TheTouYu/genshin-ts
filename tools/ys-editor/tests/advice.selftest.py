#!/usr/bin/env python3
"""advice.selftest.py — 离线回放：第 3 屏必须出 SCANNING_LINEARLY，且 estimate 可重算。

输入（同目录，不写死本机路径）：
  .scratch/gui-service/evidence/realrun-20261021/session_run13.out（10 屏 scroll/look 实测）
  .scratch/gui-service/evidence/realrun-20261021/screen/s00..s09.json
输出机读行：
  ADVICE-RESULT screens=10 first=s02 code=SCANNING_LINEARLY estimate_ok=1 verdict=PASS
"""
import json
import math
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(TOOLS))
sys.path.insert(0, TOOLS)
import ys_advice  # noqa: E402

EV = os.path.join(REPO, ".scratch", "gui-service", "evidence", "realrun-20261021")


def load_run():
    path = os.path.join(EV, "session_run13.out")
    for line in reversed(open(path, encoding="utf-8").read().splitlines()):
        if line.startswith("SCAN-RESULT "):
            return json.loads(line[len("SCAN-RESULT "):])
    raise SystemExit("session_run13.out 里没有 SCAN-RESULT")


def main():
    run = load_run()
    screens = run.get("screens") or []
    tr = ys_advice.ListTracker()
    advs = []
    now = 0.0
    gaps = []
    gaps_at = []
    for s in screens:
        tag = s.get("tag") or ""
        p = os.path.join(EV, "screen", tag + ".json")
        if not os.path.isfile(p):
            print("ADVICE-RESULT error=missing_frame tag=%s path=%s verdict=FAIL" % (tag, p))
            return 1
        d = json.load(open(p, encoding="utf-8"))
        st = (d.get("state") or {}).get("name") if isinstance(d.get("state"), dict) else d.get("state")
        sc_ms = float((s.get("scroll") or {}).get("ms") or 0)
        look_ms = float(s.get("look_ms") or 0)
        now += sc_ms + look_ms
        if len(advs) > 0:
            gaps.append(sc_ms + look_ms)
        a = tr.observe(state_name=st, containers=[], detections=d.get("objects") or [],
                       free_text=d.get("free_text") or [], look_ms=look_ms,
                       now_ms=now, enabled=True)
        advs.append(a)
        gaps_at.append(list(gaps))
    first = next(((i, a) for i, a in enumerate(advs) if a), None)
    if first is None:
        print("ADVICE-RESULT screens=%d first=none verdict=FAIL" % len(advs))
        return 1
    idx, a = first
    code = a[0].get("code")
    est = a[0].get("estimate") or {}
    # estimate 可重算：screens 由 rows/count 推，秒数由实测 gap p50 推
    loop_p50 = statistics.median(gaps_at[idx][-5:]) if gaps_at[idx] else 0.0
    screens_rem = est.get("linear_screens_remaining")
    secs = est.get("linear_seconds")
    probes = est.get("bisection_probes")
    est_ok = (isinstance(screens_rem, int) and screens_rem > 0
              and isinstance(secs, (int, float)) and secs > 0
              and isinstance(probes, int) and probes >= 1
              and abs(float(secs) - round(screens_rem * loop_p50 / 1000.0, 1)) < 0.11
              and probes == int(math.ceil(math.log2(max(2, screens_rem))))
              and abs(float(est.get("net_rows_per_step") or 0) - 4.8) / 4.8 <= 0.2)
    # 负例：没有 row 时不得给建议
    neg = ys_advice.ListTracker().observe(state_name="X", containers=[], detections=[],
                                          free_text=["我的好友 173/200"], enabled=True)
    ok = (code == "SCANNING_LINEARLY" and idx == 2 and est_ok and neg == [])
    print("ADVICE-RESULT screens=%d first=s%02d code=%s estimate_ok=%d neg=%d verdict=%s"
          % (len(advs), idx, code, 1 if est_ok else 0, 1 if neg == [] else 0,
             "PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
