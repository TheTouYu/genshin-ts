#!/usr/bin/env python3
"""bench_check.py — GUI 感知层性能门槛（把 bench 变成可执行的"性能退化"防线）。

为什么需要它：性能没有门槛时，退化是**静默**的——代码功能全绿，读数从 44ms 变 800ms
也不会有人报错。本脚本跑一遍分组件 bench，用 `perf-thresholds.json` 的回归阈值判定，
任何一项超限 → 打印 `PERF-FAIL <metric> p50=... > ...` 并 exit 1。

两类阈值（分开写，不混）：
  · bars：AGI-BAR 的目标（≤50ms 动作/默认路径、≤5ms 缓存命中、≤10ms 检测）——报告用，
    未达标只打印 WARN，不让门槛失败（否则门槛天天红，等于没有）；
  · regression：**回归线** = 本次实测 p50 留 ~1.5–2× 余量。超这条线 = 真退化，必须修。

用法：
  python3 .scratch/gui-service/bench_check.py            # 全量（~40s，ledger slow 档）
  python3 .scratch/gui-service/bench_check.py --runs 3 --quick  # 少跑几次（仍含关键项）
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
THRESH = os.environ.get("YS_PERF_THRESHOLDS") or os.path.join(HERE, "perf-thresholds.json")
BENCH = os.path.join(HERE, "bench_perf.py")
EVIDENCE = os.path.join(HERE, "evidence")


def runtime_condition(cfg=None):
    """判定时的**运行条件**——回归线必须带条件，否则同一份代码在两种机器状态下给两个答案。

    为什么需要（2026-10-22 实测）：`state` 的锚点是 12 个 GPU 模板 NCC。游戏占用 GPU 时
    实测 35→125ms（D421 2026-10-19；重启后复测 35.66 游戏关 vs 103 游戏开，且 855MHz/2100MHz
    的时钟档位下稳定在 103）。照"游戏关"的读数标定的 90ms 线，在"游戏开"时**恒红**——
    这不是退化，是判据漏了前提。同族教训：D421「报性能必须写清什么负载下」。

    `YS_PERF_GAME_RUNNING=0|1` 可显式覆盖（自测用，避免让测试依赖"此刻机器上有没有开游戏"）。
    """
    cfg = cfg or {}
    env = os.environ.get("YS_PERF_GAME_RUNNING")
    if env in ("0", "1"):
        game = env == "1"
    else:
        try:
            game = subprocess.run(["pgrep", "-f", "YuanShen.exe"],
                                  capture_output=True, timeout=5).returncode == 0
        except Exception:                                   # noqa: BLE001 —— 判不出就按"没开"
            game = False
    clk = None
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=clocks.sm,clocks.max.sm",
                            "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, timeout=5)
        if r.returncode == 0 and r.stdout.strip():
            cur, mx = [x.strip() for x in r.stdout.strip().splitlines()[0].split(",")]
            clk = "%s/%sMHz" % (cur, mx)
    except Exception:                                       # noqa: BLE001
        clk = None
    applied = {}
    if game:
        applied = dict(cfg.get("regression_game_running") or {})
        applied.pop("_why", None)
    return {"game_running": game, "gpu_clk_mhz": clk, "reg": applied, "applied": applied}


def _prewarm(timeout=180):
    """让常驻服务先真热起来，再量"冷帧"——否则量到的是冷 daemon（假红）。

    2026-10-22 实测：门禁序列里 perf-bench 排在别的 gate 之后（那些 gate 会重启服务），
    world_cold 被量成 p50=2339ms > 1800 线；单独跑是 1068ms。判据不可重复 = 判据失效。
    返回 (ok, 说明)；服务不在就返回 (None, 原因)，不阻断测量。
    """
    import socket
    sock = os.environ.get("YS_LOOKD_SOCK", "/run/user/%d/ys-lookd.sock" % os.getuid())
    # 服务刚被重启时 socket 可能还没 listen（实测 ConnectionRefused）⇒ 有界重试，别把
    # "还没起来"当成"没有服务"。上界 20s 是为门禁链里"前一个 gate 刚重启过"的场景留的。
    deadline = time.time() + 20
    while time.time() < deadline:
        if os.path.exists(sock):
            try:
                _probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                _probe.settimeout(2)
                _probe.connect(sock)
                _probe.close()
                break
            except Exception:                                # noqa: BLE001
                time.sleep(0.5)
        else:
            time.sleep(0.5)
    else:
        return None, "no-socket-after-20s"
    try:
        t0 = time.time()
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect(sock)
        s.sendall(b'{"cmd":"warm"}\n')
        buf = b""
        while not buf.endswith(b"\n"):
            chunk = s.recv(1 << 20)
            if not chunk:
                break
            buf += chunk
        s.close()
        resp = json.loads(buf.decode() or "{}")
        return bool(resp.get("ok")), "%.1fs %s" % (time.time() - t0,
                                                   json.dumps(resp.get("parts") or {},
                                                              ensure_ascii=False))
    except Exception as e:                                    # noqa: BLE001
        return False, "%s: %s" % (type(e).__name__, e)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--quick", action="store_true", help="保留参数；bench_perf 总是全量")
    ap.add_argument("--tag", default="check")
    ap.add_argument("--from-json", default=None,
                    help="只判定已有的 perf-*.json（不重跑 bench；注入用例/离线复核用）")
    a = ap.parse_args(argv)
    with open(THRESH, encoding="utf-8") as f:
        cfg = json.load(f)
    if a.from_json:
        doc = json.load(open(a.from_json, encoding="utf-8"))
    else:
        # 先预热常驻服务（见 _prewarm 注释：不预热会把"冷 daemon"量成"冷帧"）
        _wok, _wmsg = _prewarm()
        print("PERF-WARM ok=%s %s" % (_wok, _wmsg))
        # 每次换盐：避免上一次 bench 的磁盘缓存把"冷"项测成热（默认按分钟取盐）
        salt = int(os.environ.get("YS_BENCH_SALT") or (int(time.time()) // 60 % 999))
        p = subprocess.run([sys.executable, BENCH, "--tag", a.tag, "--runs", str(a.runs),
                            "--no-cli", "--salt", str(salt)],
                           capture_output=True, text=True, timeout=600)
        if p.returncode != 0:
            print("PERF-FAIL bench 本身失败 rc=%d\n%s\n%s" % (p.returncode, p.stdout[-500:],
                                                              p.stderr[-800:]))
            return 1
        doc = json.load(open(os.path.join(EVIDENCE, "perf-%s.json" % a.tag), encoding="utf-8"))
    m = doc["metrics"]

    def p50(metric, field):
        return (((m.get(metric) or {}).get(field) or {}).get("p50"))

    checks = [
        # key,                 metric,                  field,       label
        ("cache_hit", "world_full_cold_cachehit", "wall", "world 帧级缓存命中"),
        ("steady_full", "world_full_cold_ttl", "wall", "world 全量稳态（复用）"),
        ("steady_fast", "world_no_struct_cold_ttl", "wall", "look --fast 稳态"),
        ("state", "state_warm", "state_ms", "判态（帧已缓冲）"),
        ("containers_cold", "containers_cold", "objects_ms", "容器层冷"),
        ("ocr_objects_cold", "ocr_objects_cold", "server_ms", "按对象 OCR 冷"),
        ("world_cold", "world_full_cold", "wall", "world 全量冷（wall）"),
        ("look_fast_warm", "worldsvc_look_fast_warm", "wall", "worldsvc look --fast 稳态"),
        ("act_dry", "act_dry_warm", "wall", "act dry-run（warm 帧）"),
    ]
    fails, warns = [], []
    cond = runtime_condition(cfg)
    print("PERF-COND game_running=%d gpu_clk=%s reg_overrides=%s"
          % (cond["game_running"], cond["gpu_clk_mhz"] or "?", cond["applied"]))
    for key, metric, field, label in checks:
        val = p50(metric, field)
        if val is None:
            fails.append((key, label, "MISSING", None))
            continue
        bar = cfg["bars"].get(key)
        reg = cond["reg"].get(key, cfg["regression"].get(key))
        status = "OK"
        if reg is not None and val > reg:
            status = "FAIL"
            fails.append((key, label, val, reg))
        elif bar is not None and val > bar:
            status = "WARN"
            warns.append((key, label, val, bar))
        print("PERF-%s %-18s %-26s p50=%8.1fms  bar=%s reg=%s"
              % (status, key, label, val, bar, reg))
    print("PERF-SUMMARY fails=%d warns=%d runs=%d daemon=%s"
          % (len(fails), len(warns), a.runs, doc.get("daemon_pid")))
    if fails:
        for key, label, val, reg in fails:
            print("PERF-FAIL %s (%s) p50=%s > %s" % (key, label, val, reg))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
