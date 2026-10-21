#!/usr/bin/env python3
"""advice.selftest.py — 离线回放：线性扫 → 第 3 屏必须给建议。

2026-10-21 教训：原版依赖 `.scratch/gui-service/evidence/**/screen/s0*.json`（真机产物），
被后续真机跑覆盖后**夹具消失、门禁变红**——测试依赖易变输入。现在改为**自造确定性夹具**：
10 屏 × 7 行、每屏净推进 5 行、属性单调（N天前），全部可手算。

断言：
  1. s00/s01 不出建议，s02（第 3 次 observe）出建议；
  2. 有 seek（YS_SEEK_MAX_ROWS 大）⇒ SCANNING_LINEARLY 且 estimate 可重算；
     无 seek（默认 8）⇒ LINEAR_ONLY_NO_SEEK 且 blocked_by=seek_capability；
  3. 负例：行数 <3 的界面不出建议。

退出码：0 PASS / 1 FAIL
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import ys_advice  # noqa: E402

SCREENS, ROWS, STEP = 10, 7, 5
FIX = os.path.join(HERE, "fixtures", "advice", "screens.json")
def _name(i):
    """真实好友列表名字唯一——夹具也必须唯一，否则同一名字出现不同天数，
    会被单调性判据判成"不单调"（2026-10-21 自测踩到）。"""
    return "好友%03d" % i


def make_screen(i):
    """第 i 屏：7 行，自上而下第 (i*STEP + k) 个好友；天数为 1..N 单调。"""
    rows = []
    for k in range(ROWS):
        idx = i * STEP + k
        day = 1 + idx                           # **严格**递增（缝隙内也单调，避免判据歧义）
        rows.append({"kind": "row", "bbox": [200, 100 + k * 80, 1600, 150 + k * 80],
                     "text": [_name(idx),
                              "Lv.60", "%d天前最后登录" % day]})
    return {"containers": rows,
            "free_text": ["我的好友 173/200"] + [t for r in rows for t in r["text"]]}


def main():
    # 2026-10-21：夹具必须放仓库内稳定路径；缺失要显式报错，不许静默 FAIL。
    if not os.path.isfile(FIX):
        print("ADVICE-RESULT error=FIXTURE_MISSING path=%s verdict=FAIL" % FIX)
        return 2
    fx = json.load(open(FIX, encoding="utf-8"))
    screens = fx["screens"]
    tr = ys_advice.ListTracker() if hasattr(ys_advice, "ListTracker") else None
    advs = []
    now = 0.0
    for i in range(len(screens)):
        now += 2.1                              # 每屏 loop ≈ 2.1s（真机实测）
        sc = screens[i]
        if tr is not None:
            out = tr.observe(state_name="GAME_FRIENDS", containers=sc["containers"],
                             free_text=sc["free_text"], look_ms=2100, now_ms=now * 1000)
        else:                                   # 兜底：函数式接口
            out = ys_advice.observe(state_name="GAME_FRIENDS", containers=sc["containers"],
                                    free_text=sc["free_text"], look_ms=2100, now_ms=now * 1000)
        advs.append(out or [])

    first = next((i for i, a in enumerate(advs) if a), None)
    code = (advs[first][0].get("code") if first is not None else None)
    seek = float(os.environ.get("YS_SEEK_MAX_ROWS", str(getattr(ys_advice, "SEEK_MAX_ROWS", 8))))

    # 负例：只有 2 行
    neg = []
    tr2 = ys_advice.ListTracker() if tr is not None else None
    for i in range(3):
        tiny = {"containers": screens[0]["containers"][:2],
                "free_text": screens[0]["free_text"]}
        neg += ((tr2.observe(state_name="GAME_FRIENDS", containers=tiny["containers"],
                             free_text=tiny["free_text"], look_ms=2100, now_ms=i * 2100)
                 if tr2 is not None else []) or [])

    ok_pos = (first == 2)
    if seek >= 100:
        est = (advs[first][0].get("estimate") or {}) if first is not None else {}
        ok_code = (code == "SCANNING_LINEARLY" and bool(est.get("bisection_probes")))
    else:
        ok_code = (code == "LINEAR_ONLY_NO_SEEK"
                   and (advs[first][0].get("blocked_by") == "seek_capability"))
    ok = ok_pos and ok_code and not neg
    print("ADVICE-RESULT screens=%d first=%s code=%s seek=%g neg=%d verdict=%s"
          % (len(screens), ("s%02d" % first) if first is not None else "none",
             code, seek, len(neg), "PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
