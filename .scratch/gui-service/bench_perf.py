#!/usr/bin/env python3
"""bench_perf.py — GUI 感知层**逐组件**基准（离线帧；不动屏幕、不注入）。

为什么另起一份（与 bench.py 并存）：
  · bench.py 测的是「三条路径端到端」（cli / daemon / in-process），一次一个总数；
  · 本脚本要的是**可归因的分项**：抓帧/解码、判态、容器、检测、整帧 OCR、按对象 OCR、
    组装+序列化、端到端；每项 ≥5 次，报 p50/p95，供优化前后逐项对比。
  · 全部走离线帧（`--frame` 语义），不需要屏幕授权，也不代表可见交互。

冷/热口径（关键）：
  · 「冷」= 该帧内容从未在常驻服务里出现过：用 np.roll 造 1..N px 平移变体（布局/文字
    完全一致，只换内容哈希），这样 frame/containers/OCR 三层缓存同时 miss；
  · 「热」= 同一路径再取（帧缓冲 + 帧级结果缓存命中）；
  · 「TTL 热」= 同帧 cache:false 再取（走 OCR 时间缓存、容器内容缓存，但重算判态/检测）。

产出：
  · evidence/perf-<tag>.json   原始读数（可重算）
  · bench-perf.md              人读表；tag=after 时自动与 perf-before.json 对比

用法：
  python3 .scratch/gui-service/bench_perf.py --tag before
  python3 .scratch/gui-service/bench_perf.py --tag after   # 自动对比 before
  python3 .scratch/gui-service/bench_perf.py --tag quick --runs 3 --no-cli
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import instruments  # noqa: E402
import schema  # noqa: E402

CORPUS = os.path.join(REPO, ".scratch", "gui-corpus")
EVIDENCE = os.path.join(HERE, "evidence")
WORLDSVC = os.path.join(HERE, "worldsvc.py")
MD = os.path.join(HERE, "bench-perf.md")


def ms(t0):
    return round((time.perf_counter() - t0) * 1000.0, 2)


def pct(xs, q):
    if not xs:
        return None
    xs = sorted(float(x) for x in xs)
    k = max(0, min(len(xs) - 1, int(math.ceil(q * len(xs))) - 1))
    return round(xs[k], 2)


def summarize(entries, fields):
    out = {"n": len(entries)}
    for f in fields:
        xs = [e.get(f) for e in entries if isinstance(e.get(f), (int, float))]
        if not xs:
            continue
        out[f] = {"p50": pct(xs, 0.50), "p95": pct(xs, 0.95),
                  "min": round(min(xs), 2), "max": round(max(xs), 2),
                  "all": [round(float(x), 2) for x in xs]}
    return out


class Bench:
    def __init__(self, runs, frames):
        self.runs = runs
        self.frames = frames
        self.m = {}
        self.meta = {}

    def add(self, name, **kv):
        self.m.setdefault(name, []).append(kv)

    def call(self, req, timeout=180):
        t0 = time.perf_counter()
        try:
            resp = instruments.daemon_rpc(req, timeout=timeout)
            return resp, ms(t0), None
        except Exception as e:                                   # noqa: BLE001
            return None, ms(t0), f"{type(e).__name__}: {e}"


def _world_timing(resp):
    """原样保留 daemon 回执的 timing（黑名单式：不手写白名单重建，未知字段不蒸发）。

    G-WHITELIST 守卫的判据：写盘/返回前的 `{k: dst.get(k) for k in (...)}` 会让新增字段
    静默消失；这里改为整份拷贝，需要哪些字段由下面的 fields 表决定。
    """
    return dict((resp or {}).get("timing") or {})


def make_pages(bases, n, outdir, tag, scale=1.0, roll0=1):
    """造 n 个「内容不同、版式相同」的帧：取 n 个不同语料页 → 各平移 roll0+i px。

    为什么这么绕：1px 平移的变体会被 world 的 OCR 时间缓存（页灰度差 <6）当成同一页，
    冷口径就失效了（实测第二发 ocr_ms=1.8ms）。不同语料页 + 不同平移量 ⇒ 内容哈希不同、
    页面内容也不同，三层缓存（帧/容器/OCR）同时 miss。**保持 2560×1440 原尺寸**——
    缩放帧会触发 ys-state 的 geom_ok 失败（判态直接短路，state/judge 读数全变 0）。
    """
    import numpy as np
    from PIL import Image
    paths = []
    for i in range(n):
        src = bases[i % len(bases)]
        im = Image.open(src).convert("RGB")
        w, h = im.size
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        v = np.roll(np.asarray(im), roll0 + i, axis=1)
        p = os.path.join(outdir, f"{tag}_{i}.png")
        Image.fromarray(v).save(p, compress_level=1)
        paths.append(p)
    return paths


def run_world_series(b, req_extra, variants, name, want_ttl=False):
    """对每个变体调一次 world（冷）；可选同路径再调（TTL 热），再连调两次 cache:true（第二次=帧级命中）。"""
    for p in variants:
        req = {"cmd": "world", "frame": p, "profile": os.path.abspath(
            os.path.join(REPO, ".scratch", "gui-profiles", "qianxing.json"))}
        req.update(req_extra)
        resp, wall, err = b.call(req)
        kv = {"wall": wall, "err": err}
        kv.update(_world_timing(resp))
        kv["bytes"] = len(json.dumps(resp, ensure_ascii=False)) if resp else None
        b.add(name, **kv)
        if want_ttl and resp:
            resp2, wall2, err2 = b.call(dict(req, cache=False))
            kv2 = {"wall": wall2, "err": err2}
            kv2.update(_world_timing(resp2))
            b.add(name + "_ttl", **kv2)
            # 帧级缓存：第一次 cache:true 负责写入，第二次才是命中读数
            b.call(dict(req, cache=True))
            resp3, wall3, err3 = b.call(dict(req, cache=True))
            kv3 = {"wall": wall3, "err": err3}
            kv3.update(_world_timing(resp3))
            kv3["cache_hit"] = bool((resp3 or {}).get("timing", {}).get("cache_hit"))
            b.add(name + "_cachehit", **kv3)


def main(argv=None):
    ap = argparse.ArgumentParser(description="GUI 感知层逐组件基准（离线帧）")
    ap.add_argument("--tag", default="before")
    ap.add_argument("--runs", type=int, default=6)
    ap.add_argument("--no-cli", action="store_true")
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--json-out", default=None)
    ap.add_argument("--salt", type=int, default=0,
                    help="内容盐：改变平移量，避免复用上一次 bench 留下的磁盘缓存（对比必须换盐）")
    a = ap.parse_args(argv)
    n = max(5, int(a.runs))

    bases = [os.path.join(CORPUS, "f%02d.png" % i) for i in range(14)]
    for f in bases:
        if not os.path.isfile(f):
            raise SystemExit(f"缺语料帧 {f}")

    outdir = tempfile.mkdtemp(prefix="ysbench-")
    b = Bench(n, None)
    t_start = time.time()
    try:
        # ── 造页（一次性，避免把 PNG 编码时间混进被测项）──────────────
        # 每组用**不同语料页 + 不同平移量**，保证帧/容器/OCR 三层缓存同时 miss。
        salt = int(a.salt) * 37
        V = {
            "full": make_pages(bases[0:6], n, outdir, "full", roll0=1 + salt),
            "fast": make_pages(bases[6:12], n, outdir, "fast", roll0=1 + salt),
            "nos": make_pages(bases[0:6], n, outdir, "nos", roll0=401 + salt),
            "ocr_full": make_pages(bases[0:6], n, outdir, "ofull", roll0=61 + salt),
            "ocr_obj": make_pages(bases[6:12], n, outdir, "obj", roll0=61 + salt),
            "load": make_pages(bases[0:6], n, outdir, "load", roll0=121 + salt),
            "cont": make_pages(bases[6:12], n, outdir, "cont", roll0=121 + salt),
            "det": make_pages(bases[0:6], n, outdir, "det", roll0=181 + salt),
            "e2e": make_pages(bases[12:14], 3, outdir, "e2e", roll0=241 + salt),
            "cli": make_pages(bases[12:14], 3, outdir, "cli", roll0=301 + salt),
        }

        # ── 0) IPC 地板 ────────────────────────────────────────────────
        for _ in range(max(7, n)):
            _resp, wall, err = b.call({"cmd": "warm"})
            b.add("rpc_warm", wall=wall, err=err)

        # ── 1) world 全量（冷 / TTL 热 / 帧级缓存）────────────────────
        run_world_series(b, {"ocr": True, "objects": True, "structure": True,
                             "cache": False}, V["full"], "world_full_cold", want_ttl=True)

        # ── 2) world 快速路径（无 OCR / 无结构）冷 + 热 ────────────────
        run_world_series(b, {"ocr": False, "objects": True, "structure": False,
                             "cache": False}, V["fast"], "world_fast_cold", want_ttl=True)

        # ── 2b) 公开快速路径（OCR 保留、只跳检测+结构）冷 + 热 ─────────
        run_world_series(b, {"ocr": True, "objects": True, "structure": False,
                             "cache": False}, V["nos"], "world_no_struct_cold", want_ttl=True)

        # ── 3) 整帧 OCR（冷）：cmd=ocr ────────────────────────────────
        for p in V["ocr_full"]:
            resp, wall, err = b.call({"cmd": "ocr", "frame": p, "cache": False})
            b.add("ocr_full_cold", wall=wall, err=err,
                  server_ms=(resp or {}).get("ms"), n_boxes=(resp or {}).get("n_total"))

        # ── 4) 按对象 OCR（冷 / 同帧热）────────────────────────────────
        for p in V["ocr_obj"]:
            resp, wall, err = b.call({"cmd": "ocr_objects", "frame": p, "cache": False,
                                      "ocr": True, "max_objects": 300, "reset": True})
            r = resp or {}
            b.add("ocr_objects_cold", wall=wall, err=err,
                  server_ms=r.get("total_ms"), det_ms=r.get("det_ms"), rec_ms=r.get("rec_ms"),
                  n_objects=r.get("n_objects"), n_ocr=r.get("n_ocr"))
        for p in V["ocr_obj"]:
            b.call({"cmd": "ocr_objects", "frame": p, "cache": True})
            resp, wall, err = b.call({"cmd": "ocr_objects", "frame": p, "cache": True})
            r = resp or {}
            b.add("ocr_objects_warm_frame", wall=wall, err=err,
                  server_ms=r.get("total_ms"), frame_cache=r.get("frame_cache"))

        # ── 5) 帧加载（冷：PNG 解码 + uint8→GPU float）＋ 判态（帧已缓冲）──
        run_world_series(b, {"ocr": False, "objects": False, "structure": False,
                             "cache": False}, V["load"], "load_cold")
        for p in V["load"]:
            b.call({"cmd": "world", "frame": p, "ocr": False, "objects": False,
                    "structure": False, "cache": False})
            resp, wall, err = b.call({"cmd": "world", "frame": p, "ocr": False,
                                      "objects": False, "structure": False, "cache": False})
            kv = {"wall": wall, "err": err}
            kv.update(_world_timing(resp))
            b.add("state_warm", **kv)

        # ── 6) 容器层（冷）＋ 同帧容器缓存（热）────────────────────────
        run_world_series(b, {"ocr": False, "objects": True, "structure": False,
                             "cache": False}, V["cont"], "containers_cold")
        for p in V["cont"]:
            b.call({"cmd": "world", "frame": p, "ocr": False, "objects": True,
                    "structure": False, "cache": False})
            resp, wall, err = b.call({"cmd": "world", "frame": p, "ocr": False,
                                      "objects": True, "structure": False, "cache": False})
            kv = {"wall": wall, "err": err}
            kv.update(_world_timing(resp))
            b.add("containers_warm", **kv)

        # ── 7) 检测器 + 结构层（含冷容器；容器冷成本单独看 objects_ms）──
        for p in V["det"]:
            resp, wall, err = b.call({"cmd": "world", "frame": p, "ocr": False,
                                      "objects": True, "structure": True, "cache": False})
            kv = {"wall": wall, "err": err}
            kv.update(_world_timing(resp))
            b.add("detector_structure_cold", **kv)

        # ── 8) 序列化 / 反序列化（客户端侧，取一份全量回执）───────────
        resp, _w, _e = b.call({"cmd": "world", "frame": V["full"][0],
                               "ocr": True, "objects": True, "structure": True,
                               "cache": False})
        if resp:
            payload = json.dumps(resp, ensure_ascii=False)
            t0 = time.perf_counter()
            for _ in range(20):
                json.loads(payload)
            parse_ms = (time.perf_counter() - t0) * 1000 / 20
            t0 = time.perf_counter()
            for _ in range(20):
                json.dumps(resp, ensure_ascii=False)
            dumps_ms = (time.perf_counter() - t0) * 1000 / 20
            b.add("serialization", bytes=len(payload.encode("utf-8")),
                  parse_ms=round(parse_ms, 2), dumps_ms=round(dumps_ms, 2))

        # ── 9) 服务层端到端（in-process，无 CLI 启动）──────────────────
        try:
            import worldsvc
            svc = worldsvc.WorldService(backend="daemon-world", cache_enabled=False,
                                        profile=os.path.join(REPO, ".scratch", "gui-profiles",
                                                             "qianxing.json"))
            for p in V["e2e"]:
                t0 = time.perf_counter()
                try:
                    w = svc.look(frame=p)
                    b.add("worldsvc_look_daemon", wall=ms(t0),
                          total=(w.get("timing_ms") or {}).get("total"), err=None)
                except Exception as e:                            # noqa: BLE001
                    b.add("worldsvc_look_daemon", wall=ms(t0), err=f"{type(e).__name__}: {e}")
                # 公开 --fast：OCR 保留、只跳检测+结构；同帧第二次 = 稳态读数
                try:
                    svc.look(frame=p, fast=True)
                    t0 = time.perf_counter()
                    w2 = svc.look(frame=p, fast=True)
                    b.add("worldsvc_look_fast_warm", wall=ms(t0),
                          total=(w2.get("timing_ms") or {}).get("total"), err=None)
                except Exception as e:                            # noqa: BLE001
                    b.add("worldsvc_look_fast_warm", wall=ms(t0), err=f"{type(e).__name__}: {e}")
            # act 解析（dry-run）+ state expect（都取已 warm 的帧，测"解析段"而不是冷感知）
            p = V["e2e"][0]
            try:
                w = svc.look(frame=p)
                obj = (w.raw.get("objects") or [{}])[0]
                for _ in range(3):
                    t0 = time.perf_counter()
                    r = svc.act({"object_id": obj.get("id")},
                                expect={"type": "pixel_delta", "region": [0, 0, 2560, 1440],
                                        "threshold_pct": 0.1}, frame=p)
                    b.add("act_dry_warm", wall=ms(t0),
                          resolve_ms=r.get("resolve_ms"), err=r.get("status"))
                for _ in range(3):
                    svc.evaluate_expect({"type": "state_in", "states": ["GAME_PAIMON"]}, p, p)
                    t0 = time.perf_counter()
                    ev = svc.evaluate_expect({"type": "state_in", "states": ["GAME_PAIMON"]}, p, p)
                    b.add("expect_state_warm", wall=ms(t0), elapsed=ev.get("elapsed_ms"))
                for _ in range(2):
                    t0 = time.perf_counter()
                    svc.evaluate_expect({"type": "pixel_delta", "region": [0, 0, 2560, 1440],
                                         "threshold_pct": 0.1}, p, p)
                    b.add("expect_pixel", wall=ms(t0))
            except Exception as e:                                # noqa: BLE001
                b.meta["act_probe_err"] = f"{type(e).__name__}: {e}"
        except Exception as e:                                    # noqa: BLE001
            b.meta["worldsvc_import_err"] = f"{type(e).__name__}: {e}"

        # ── 10) CLI 冷启动（用户实际敲的那条；全新页，冷）──────────────
        if not a.no_cli:
            for p in V["cli"]:
                t0 = time.perf_counter()
                pr = subprocess.run([sys.executable, WORLDSVC, "look", "--frame", p,
                                     "--backend", "daemon-world", "--summary", "--no-cache"],
                                    capture_output=True, text=True, timeout=180,
                                    env=dict(os.environ, PYTHONPATH=HERE))
                b.add("cli_look_cold", wall=ms(t0), rc=pr.returncode,
                      err=(pr.stderr or "")[-160:] if pr.returncode else None)
            for _ in range(3):
                t0 = time.perf_counter()
                subprocess.run([sys.executable, "-c",
                                "import sys;sys.path.insert(0,'%s');import instruments,worldsvc" % HERE],
                               capture_output=True, text=True, timeout=60)
                b.add("cli_import", wall=ms(t0))

        # ── 11) 常驻抓帧（只读；窗口不可用时如实记 N/A）────────────────
        cap = os.path.join(REPO, "tools", "ys-editor", "ys-capture")
        if os.path.exists(cap):
            for i in range(3):
                out = os.path.join(outdir, "cap%d.png" % i)
                t0 = time.perf_counter()
                pr = subprocess.run([sys.executable, cap, "latest", "--out", out],
                                    capture_output=True, text=True, timeout=60)
                b.add("capture_latest", wall=ms(t0), rc=pr.returncode,
                      err=(pr.stderr or "")[-120:] if pr.returncode else None,
                      bytes=os.path.getsize(out) if os.path.exists(out) else None)
    finally:
        if not a.keep:
            shutil.rmtree(outdir, ignore_errors=True)

    fields = {
        "rpc_warm": ["wall"],
        "ocr_full_cold": ["wall", "server_ms", "n_boxes"],
        "ocr_objects_cold": ["wall", "server_ms", "det_ms", "rec_ms", "n_objects", "n_ocr"],
        "ocr_objects_warm_frame": ["wall", "server_ms"],
        "load_cold": ["wall", "load_ms", "state_ms", "total_ms", "bytes"],
        "state_warm": ["wall", "load_ms", "state_ms", "judge_ms", "total_ms"],
        "containers_cold": ["wall", "load_ms", "objects_ms", "state_ms", "total_ms"],
        "containers_warm": ["wall", "objects_ms", "total_ms"],
        "detector_structure_cold": ["wall", "detector_ms", "structure", "objects_ms", "total_ms",
                                    "total_full_ms"],
        "world_full_cold": ["wall", "load_ms", "ocr_ms", "state_ms", "judge_ms", "objects_ms",
                            "detector_ms", "structure", "total_ms", "total_full_ms", "bytes"],
        "world_full_cold_ttl": ["wall", "load_ms", "ocr_ms", "state_ms", "objects_ms",
                                "detector_ms", "structure", "total_ms", "total_full_ms"],
        "world_full_cold_cachehit": ["wall", "total_ms"],
        "world_no_struct_cold": ["wall", "load_ms", "ocr_ms", "state_ms", "objects_ms",
                                 "total_ms", "total_full_ms"],
        "world_no_struct_cold_ttl": ["wall", "ocr_ms", "state_ms", "objects_ms", "total_full_ms"],
        "world_no_struct_cold_cachehit": ["wall"],
        "worldsvc_look_fast_warm": ["wall", "total"],
        "act_dry_warm": ["wall", "resolve_ms"],
        "expect_state_warm": ["wall", "elapsed"],
        "expect_pixel": ["wall"],
        "world_fast_cold": ["wall", "load_ms", "state_ms", "objects_ms", "total_ms", "total_full_ms"],
        "world_fast_cold_ttl": ["wall", "load_ms", "state_ms", "objects_ms", "total_ms", "total_full_ms"],
        "world_fast_cold_cachehit": ["wall", "total_ms"],
        "worldsvc_look_daemon": ["wall", "total"],
        "cli_look_cold": ["wall"],
        "cli_import": ["wall"],
        "capture_latest": ["wall", "bytes"],
        "serialization": ["bytes", "parse_ms", "dumps_ms"],
    }
    summary = {k: summarize(v, fields.get(k, ["wall"])) for k, v in b.m.items()}
    doc = {
        "bench": "gui-perception/perf",
        "tag": a.tag,
        "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "runs": n,
        "wall_s": round(time.time() - t_start, 1),
        "daemon_pid": _pid_of("ys_lookd"),
        "git_head": _git_head(),
        "meta": b.meta,
        "metrics": summary,
    }
    out = os.path.abspath(a.json_out or os.path.join(EVIDENCE, "perf-%s.json" % a.tag))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    md = render(doc, a.tag)
    with open(MD, "w", encoding="utf-8") as f:
        f.write(md)
    print("[bench-perf] %s: %s" % (a.tag, out))
    print("[bench-perf] 表格: %s（%ss）" % (MD, doc["wall_s"]))
    return 0


def _pid_of(name):
    try:
        p = subprocess.run(["pgrep", "-f", name], capture_output=True, text=True)
        return [int(x) for x in p.stdout.split()][:3]
    except Exception:                                            # noqa: BLE001
        return None


def _git_head():
    try:
        p = subprocess.run(["git", "-C", REPO, "rev-parse", "--short", "HEAD"],
                           capture_output=True, text=True)
        return p.stdout.strip()
    except Exception:                                            # noqa: BLE001
        return None


# ── 报告渲染 ─────────────────────────────────────────────────────────

ROWS = [
    ("rpc_warm", "socket 往返（warm）", "wall", "IPC 地板"),
    ("ocr_full_cold", "整帧 OCR（冷）", "wall", "server_ms={server_ms} n={n_boxes}"),
    ("ocr_objects_cold", "按对象 OCR（冷）", "wall",
     "server {server_ms} = det {det_ms} + rec {rec_ms}；n_obj {n_objects}/n_ocr {n_ocr}"),
    ("ocr_objects_warm_frame", "按对象 OCR（同帧热）", "wall", "server {server_ms} det {det_ms} rec {rec_ms}"),
    ("load_cold", "帧加载（PNG→GPU float）", "wall", "load {load_ms} state {state_ms}"),
    ("state_warm", "判态（帧已缓冲）", "wall", "judge {judge_ms}"),
    ("containers_cold", "容器层（冷）", "wall", "objects {objects_ms}（load {load_ms} state {state_ms}）"),
    ("containers_warm", "容器层（同帧热）", "wall", "objects {objects_ms}"),
    ("detector_structure_cold", "检测器+结构（冷）", "wall",
     "detector {detector_ms} structure {structure}（另含容器 {objects_ms}）"),
    ("world_full_cold", "world 全量（冷）", "wall",
     "load {load_ms} ocr {ocr_ms} state {state_ms} obj {objects_ms} det {detector_ms} struct {structure}"),
    ("world_full_cold_ttl", "world 全量（TTL 热）", "wall", "ocr {ocr_ms} state {state_ms} obj {objects_ms} det {detector_ms}"),
    ("world_full_cold_cachehit", "world 全量（帧级缓存命中）", "wall", ""),
    ("world_no_struct_cold", "world 快速路径 --fast（留 OCR、跳检测+结构，冷）", "wall",
     "load {load_ms} ocr {ocr_ms} state {state_ms} obj {objects_ms}"),
    ("world_no_struct_cold_ttl", "world 快速路径 --fast（稳态）", "wall",
     "ocr {ocr_ms} state {state_ms} obj {objects_ms}"),
    ("world_fast_cold", "world 无 OCR/无结构（只判态+容器、冷）", "wall",
     "load {load_ms} state {state_ms} obj {objects_ms}"),
    ("world_fast_cold_ttl", "world 快速路径（TTL 热）", "wall", "state {state_ms} obj {objects_ms}"),
    ("world_fast_cold_cachehit", "world 快速路径（帧级缓存命中）", "wall", ""),
    ("worldsvc_look_daemon", "worldsvc look（daemon-world，进程内）", "wall", ""),
    ("worldsvc_look_fast_warm", "worldsvc look --fast（稳态）", "wall", ""),
    ("act_dry_warm", "act dry-run（已 warm 帧：解析+校验）", "wall", "resolve {resolve_ms}"),
    ("expect_state_warm", "expect state_in（同帧热）", "wall", "eval {elapsed}"),
    ("expect_pixel", "expect pixel_delta（ys-watch 子进程）", "wall", ""),
    ("cli_look_cold", "worldsvc look CLI（冷启动）", "wall", "含解释器+导入"),
    ("cli_import", "仅 CLI 导入（instruments+worldsvc）", "wall", ""),
    ("capture_latest", "ys-capture latest（只读抓帧）", "wall", ""),
]


def _fmt_ms(v):
    return "—" if v is None else f"{v:.1f}"


def render(doc, tag):
    prev = None
    prev_path = os.path.join(EVIDENCE, "perf-before.json")
    if tag == "after" and os.path.isfile(prev_path):
        try:
            with open(prev_path, encoding="utf-8") as f:
                prev = json.load(f)
        except ValueError:
            prev = None
    L = [f"# GUI 感知层逐组件基准（{tag}）", "",
         f"- 时间：{doc['at']}　runs={doc['runs']}　用时 {doc['wall_s']}s　daemon pid={doc['daemon_pid']}"
         f"　git={doc['git_head']}",
         "- 口径：**离线帧**（np.roll 造冷变体），全部离线分析，**不是可见交互**；不含屏幕授权动作。",
         "- 复现：`python3 .scratch/gui-service/bench_perf.py --tag %s`" % tag, ""]
    head = "| 组件 | p50 | p95 | n | 分项（p50） |"
    sep = "|---|---|---|---|---|"
    if prev:
        head = "| 组件 | 前 p50 | **后 p50** | 前 p95 | **后 p95** | 变化(p50) | n | 分项（后 p50） |"
        sep = "|---|---|---|---|---|---|---|---|"
    L += [head, sep]
    for key, label, field, detail in ROWS:
        cur = doc["metrics"].get(key)
        if not cur:
            continue
        cf = cur.get(field) or {}
        p50, p95, nn = cf.get("p50"), cf.get("p95"), cur.get("n")
        det = ""
        if detail:
            try:
                det = detail.format(**{k: _fmt_ms(v.get("p50")) if isinstance(v, dict) else "—"
                                       for k, v in cur.items()})
            except (KeyError, IndexError):
                det = ""
        if prev:
            pf = (prev["metrics"].get(key) or {}).get(field) or {}
            b50, b95 = pf.get("p50"), pf.get("p95")
            chg = "—"
            if b50 and p50:
                chg = f"{p50 / b50:.2f}×"
            L.append(f"| {label} | {_fmt_ms(b50)} | **{_fmt_ms(p50)}** | {_fmt_ms(b95)} | "
                     f"**{_fmt_ms(p95)}** | {chg} | {nn} | {det} |")
        else:
            L.append(f"| {label} | {_fmt_ms(p50)} | {_fmt_ms(p95)} | {nn} | {det} |")
    ser = doc["metrics"].get("serialization") or {}
    if ser:
        L += ["", f"- 序列化：world 回执 {ser.get('bytes', {}).get('p50')} B，"
                  f"客户端 json.loads {ser.get('parse_ms', {}).get('p50')} ms/次。"]
    tgt = [("单次默认路径", 50), ("缓存命中", 5), ("对象检测单帧", 10)]
    L += ["", "## 对照 AGI-BAR 目标", "", "| 目标 | 阈值 | 本次读数（p50） | 判定 |", "|---|---|---|---|"]
    for name, th in tgt:
        L.append(f"| {name} | ≤{th}ms | 见上表对应行 | 见交付报告 §结论 |")
    L += ["", "> 注：数据为**后台离线帧**读数；live（可见交互）需另测，且动作路径受焦点租约影响。", ""]
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
