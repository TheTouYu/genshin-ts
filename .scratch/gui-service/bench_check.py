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
    for key, metric, field, label in checks:
        val = p50(metric, field)
        if val is None:
            fails.append((key, label, "MISSING", None))
            continue
        bar = cfg["bars"].get(key)
        reg = cfg["regression"].get(key)
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
