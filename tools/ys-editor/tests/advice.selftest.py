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
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import ys_advice  # noqa: E402

SCREENS, ROWS, STEP = 10, 7, 5
FIX = os.path.join(HERE, "fixtures", "advice", "screens.json")
REAL = [os.path.join(HERE, "fixtures", "advice", "real", "s%d.json" % i) for i in (1, 2, 3)]
CLI_FRAMES = [os.path.join(HERE, "fixtures", "advice", "real", "cli", n)
              for n in ("f1.png", "f2.png", "f3.jpg")]
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
WORLDSVC = os.path.join(REPO, ".scratch", "gui-service", "worldsvc.py")
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
    tr = ys_advice.ListTracker(path="") if hasattr(ys_advice, "ListTracker") else None
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
    tr2 = ys_advice.ListTracker(path="") if tr is not None else None
    for i in range(3):
        tiny = {"containers": screens[0]["containers"][:2],
                "free_text": screens[0]["free_text"]}
        neg += ((tr2.observe(state_name="GAME_FRIENDS", containers=tiny["containers"],
                             free_text=tiny["free_text"], look_ms=2100, now_ms=i * 2100)
                 if tr2 is not None else []) or [])

    # 真机 3 帧回放（2026-10-21 空转复现）：必须第 3 帧出建议
    if not all(os.path.isfile(p) for p in REAL):
        print("ADVICE-RESULT error=REAL_FIXTURE_MISSING paths=%s verdict=FAIL" % REAL)
        return 2
    tr3 = ys_advice.ListTracker(path="")
    real_out = []
    now3 = 0.0
    for p in REAL:
        d = json.load(open(p, encoding="utf-8"))
        st = d.get("state")
        st = st.get("name") if isinstance(st, dict) else st
        now3 += 2.1
        real_out.append(tr3.observe(state_name=st, containers=[],
                                    detections=d.get("objects") or [],
                                    free_text=d.get("free_text") or [],
                                    look_ms=800, now_ms=now3 * 1000))
    real_code = real_out[2][0].get("code") if real_out[2] else None
    # 三次**独立进程** CLI 回放（跨进程持久化）；第 3 次必须有 advice
    cli_code = None
    try:
        if not all(os.path.isfile(p) for p in CLI_FRAMES):
            print("ADVICE-RESULT error=CLI_FIXTURE_MISSING paths=%s verdict=FAIL" % CLI_FRAMES)
            return 2
        td = tempfile.mkdtemp(prefix="adv-cli-")
        env = dict(os.environ, YS_ADVICE_STATE_PATH=os.path.join(td, "state.json"))
        for i, p in enumerate(CLI_FRAMES):
            out = os.path.join(td, "look%d.json" % (i + 1))
            r = subprocess.run([sys.executable, WORLDSVC, "look", "--frame", p,
                                "--json-out", out, "--no-cache"],
                               env=env, capture_output=True, text=True, timeout=40)
            if r.returncode != 0:
                print("ADVICE-RESULT error=CLI_LOOK_FAIL rc=%d frame=%s verdict=FAIL"
                      % (r.returncode, os.path.basename(p)))
                return 2
            if i == 2:
                cli_code = (json.load(open(out, encoding="utf-8")).get("advice") or [{}])[0].get("code")
    except Exception as e:                               # noqa: BLE001
        print("ADVICE-RESULT error=CLI_REPLAY_%s verdict=FAIL" % type(e).__name__)
        return 2
    ok_pos = (first == 2) and bool(real_code) and bool(cli_code)
    if seek >= 100:
        est = (advs[first][0].get("estimate") or {}) if first is not None else {}
        ok_code = (code == "SCANNING_LINEARLY" and bool(est.get("bisection_probes")))
    else:
        ok_code = (code == "LINEAR_ONLY_NO_SEEK"
                   and (advs[first][0].get("blocked_by") == "seek_capability"))
    ok = ok_pos and ok_code and not neg
    print("ADVICE-RESULT screens=%d first=%s code=%s seek=%g neg=%d real=s03/%s cli=s03/%s verdict=%s"
          % (len(screens), ("s%02d" % first) if first is not None else "none",
             code, seek, len(neg), real_code, cli_code, "PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
