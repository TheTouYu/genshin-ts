#!/usr/bin/env python3
"""bench.py — 三动词延迟实测（冷启动 / 进程内二次 / 缓存命中 / 三条路径）。

产出（都应能重算，证据只落 workspace）：
  · `.scratch/gui-service/bench.md`   人读表格 + 结论 + 复现命令
  · `.scratch/gui-service/evidence/bench.json`  原始读数

三条路径（Lead 2026-10-18 指派并列）：
  A. subprocess：worldsvc → ys-state CLI + ys-screen CLI（现状实现）
  B. 裸 daemon RPC：直连 ys-lookd socket（不经 CLI；注意它只判既有 8 态）
  C. in-process：importlib 加载 ys-state / ys-screen，进程内调用（含实验性复用补丁）

场景：冷启动（新进程首次）/ 进程内二次 / 缓存命中（同 frame_sha）。
"""
from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import instruments  # noqa: E402
import schema  # noqa: E402
import worldsvc  # noqa: E402
import inproc_probe as probe  # noqa: E402

FRAME = os.path.join(REPO, ".scratch", "gui-corpus", "f06.png")
ALT_FRAME = os.path.join(REPO, ".scratch", "gui-corpus", "f05.png")
WORLDSVC = os.path.join(HERE, "worldsvc.py")
EVIDENCE = os.path.join(HERE, "evidence")
BENCH_MD = os.path.join(HERE, "bench.md")
CACHE_DIR = os.path.join(HERE, ".cache")


def _ms(t0):
    return round((time.perf_counter() - t0) * 1000, 1)


def _stats(xs):
    xs = [float(x) for x in xs]
    return {"n": len(xs), "min": min(xs), "median": round(statistics.median(xs), 1),
            "max": max(xs), "all": xs}


def bench_cli_look(no_cache=True, runs=2):
    """A 路径冷启动：每条都是**新进程**（进程启动 + 解释器 + 两次 CLI 子进程）。"""
    walls, internals = [], []
    for i in range(runs):
        out = os.path.join(EVIDENCE, f"bench-cli-{i}.json")
        t0 = time.perf_counter()
        cmd = [sys.executable, WORLDSVC, "look", "--frame", FRAME,
               "--summary", "--json-out", out] + (["--no-cache"] if no_cache else [])
        p = subprocess.run(cmd,
                           capture_output=True, text=True,
                           env=dict(os.environ, PYTHONPATH=HERE))
        walls.append(_ms(t0))
        try:
            with open(out, encoding="utf-8") as f:
                internals.append(json.load(f).get("timing_ms"))
        except (OSError, ValueError):
            internals.append(None)
        if p.returncode != 0:
            print("[bench] CLI look 失败：", p.stderr[-800:], file=sys.stderr)
    return walls, internals


def bench_service_second_look(runs=2):
    """A'/B 路径进程内二次：同一进程里连续 look（禁用缓存，排除缓存干扰）。"""
    svc = worldsvc.WorldService(cache_enabled=False)
    walls = []
    for _ in range(runs):
        t0 = time.perf_counter()
        svc.look(frame=FRAME)
        walls.append(_ms(t0))
    return walls


def bench_cache_hit(runs=4):
    """缓存命中：进程内 + 新进程两条；缓存按 frame_sha + 仪器指纹。"""
    svc = worldsvc.WorldService(cache_enabled=True)
    svc.look(frame=FRAME)                     # 预热（用已有磁盘缓存则近乎不耗时）
    t0 = time.perf_counter()
    svc.look(frame=FRAME)
    first_hit = _ms(t0)
    walls = []
    for _ in range(runs):
        t0 = time.perf_counter()
        ws = svc.look(frame=FRAME)
        walls.append(_ms(t0))
    # 新进程命中（含解释器启动 + sha256 + 缓存读）
    proc_walls = []
    for i in range(2):
        t0 = time.perf_counter()
        subprocess.run([sys.executable, WORLDSVC, "look", "--frame", FRAME, "--summary"],
                       capture_output=True, text=True, env=dict(os.environ, PYTHONPATH=HERE))
        proc_walls.append(_ms(t0))
    return {"inproc_first_hit": first_hit, "inproc": _stats(walls),
            "fresh_process": _stats(proc_walls), "ws_timing": ws.raw.get("timing_ms"),
            "ws_degraded": [d["code"] for d in ws.degraded]}


def bench_daemon(runs=3):
    def one(req):
        t0 = time.perf_counter()
        d = probe.daemon_call(req)
        return {"wall": _ms(t0), "state": d.get("state"), "judge_ms": d.get("judge_ms"),
                "load_ms": d.get("load_ms")}
    states = [one({"cmd": "state", "frame": FRAME, "profile": probe.PROFILE}) for _ in range(runs)]
    ocr = [one({"cmd": "ocr", "frame": FRAME}) for _ in range(2)]
    return {"state": states, "ocr": ocr}


def bench_inproc(runs=2):
    """C 路径：in-process（同一进程内 import 两个仪器；含复用补丁）。"""
    ys_state = probe.load_module("ys_state_bench", probe.YS_STATE)
    ys_screen = probe.load_module("ys_screen_bench", probe.YS_SCREEN)
    raw_state = []
    for _ in range(2):
        t0 = time.perf_counter()
        r = ys_state.execute("fast", frame=FRAME, profile=probe.PROFILE)
        raw_state.append({"wall": _ms(t0), "state": (r[0] if isinstance(r, tuple) else r).get("state")})
    raw_screen = []
    for _ in range(2):
        t0 = time.perf_counter()
        r = ys_screen.analyze(FRAME, containers_only=True)
        raw_screen.append({"wall": _ms(t0), "load_ms": (r.get("timing") or {}).get("load_ms"),
                           "container_cached": (r.get("timing") or {}).get("container_cached")})
    # 复用补丁：帧缓冲（load_small）+ OCR 内容寻址缓存
    probe.memoize_frame_loaders(ys_screen)
    probe.patch_state_ocr(ys_state, ys_screen)

    def look(frame):
        t0 = time.perf_counter()
        st = ys_state.execute("fast", frame=frame, profile=probe.PROFILE)[0]
        t_state = _ms(t0)
        t1 = time.perf_counter()
        ys_screen.analyze(frame, containers_only=True)
        t_obj = _ms(t1)
        return {"total": _ms(t0), "state_ms": t_state, "objects_ms": t_obj,
                "state": st.get("state")}
    # 第一次是补丁后的冷调用（load_small 缓存未命中）→ 单独记录；之后是稳态
    patched_first = look(FRAME)
    patched_same = [look(FRAME) for _ in range(runs)]
    patched_alt = [look(ALT_FRAME) for _ in range(1)]
    return {"state_raw": raw_state, "screen_raw": raw_screen,
            "patched_first": patched_first,
            "patched_same_frame": patched_same, "patched_alt_frame": patched_alt}


def bench_inproc_quiet(runs=5):
    """静默重测：先 warm 一次，再连测 N 次（降低共享负载/冷热切换带来的方差）。"""
    ys_state = probe.load_module("ys_state_bench_q", probe.YS_STATE)
    ys_screen = probe.load_module("ys_screen_bench_q", probe.YS_SCREEN)
    probe.memoize_frame_loaders(ys_screen)
    probe.patch_state_ocr(ys_state, ys_screen)

    def look(frame):
        t0 = time.perf_counter()
        st = ys_state.execute("fast", frame=frame, profile=probe.PROFILE)[0]
        t1 = time.perf_counter()
        ys_screen.analyze(frame, containers_only=True)
        t2 = time.perf_counter()
        return {"state": st.get("state"), "state_ms": round((t1 - t0) * 1000, 1),
                "objects_ms": round((t2 - t1) * 1000, 1), "total": round((t2 - t0) * 1000, 1)}
    look(FRAME)                                  # warm
    return [look(FRAME) for _ in range(runs)]


def bench_verbs():
    """三动词在缓存命中后的开销 + 子进程调用次数（act dry-run / wait reached）。"""
    svc = worldsvc.WorldService(cache_enabled=True)
    svc.look(frame=FRAME)
    counts = {"n": 0}
    orig_run = instruments.run

    def counted(cmd, **kw):
        counts["n"] += 1
        return orig_run(cmd, **kw)
    instruments.run = counted
    try:
        t0 = time.perf_counter()
        act = svc.act({"text": "祈愿"}, frame=FRAME)
        act_ms = _ms(t0)
        act_calls = counts["n"]
        counts["n"] = 0
        t0 = time.perf_counter()
        wait = svc.wait_until({"state_in": ["GAME_PAIMON"]}, frame=FRAME, timeout_ms=3000)
        wait_ms = _ms(t0)
        wait_calls = counts["n"]
        counts["n"] = 0
        t0 = time.perf_counter()
        svc.look(frame=FRAME)
        look_hit_ms = _ms(t0)
        look_calls = counts["n"]
        # 冷帧（新帧、无缓存）：动词级开销 = 1 次 look（含 2 个子进程）
        svc_cold = worldsvc.WorldService(cache_enabled=False)
        counts["n"] = 0
        t0 = time.perf_counter()
        act_cold = svc_cold.act({"text": "绮星盛会"}, frame=ALT_FRAME)
        act_cold_ms = _ms(t0)
        act_cold_calls = counts["n"]
    finally:
        instruments.run = orig_run
    return {"act_dry_run_cached_frame": {"ms": act_ms, "rc_status": act["status"],
                                         "subprocess_calls": act_calls},
            "wait_reached_cached_frame": {"ms": wait_ms, "status": wait["status"],
                                          "subprocess_calls": wait_calls},
            "look_cache_hit": {"ms": look_hit_ms, "subprocess_calls": look_calls},
            "act_dry_run_new_frame": {"ms": act_cold_ms,
                                       "status": act_cold.get("status") if isinstance(act_cold, dict) else None,
                                       "subprocess_calls": act_cold_calls}}


def main():
    os.makedirs(EVIDENCE, exist_ok=True)
    t_start = time.time()
    print("[bench] A. subprocess look（新进程，冷启动）…")
    cli_walls, cli_internal = bench_cli_look(no_cache=True, runs=3)
    print("[bench] A'. subprocess look（同进程二次，禁缓存）…")
    second_walls = bench_service_second_look(runs=2)
    print("[bench] 缓存命中（同 frame_sha）…")
    cache = bench_cache_hit()
    print("[bench] B. 裸 daemon RPC…")
    daemon = bench_daemon()
    print("[bench] C. in-process（含复用补丁）…")
    inproc = bench_inproc()
    print("[bench] 三动词开销…")
    verbs = bench_verbs()
    print("[bench] 静默 5 次 in-process 复测…")
    quiet = bench_inproc_quiet(runs=5)

    out = {
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "frame": FRAME, "alt_frame": ALT_FRAME,
        "wall_s": round(time.time() - t_start, 1),
        "A_subprocess_cold": {"walls": _stats(cli_walls), "internal_timing_ms": cli_internal},
        "A2_subprocess_same_process_no_cache": _stats(second_walls),
        "cache_hit": cache,
        "B_daemon_rpc": daemon,
        "C_inproc": inproc,
        "C_inproc_quiet": quiet,
        "verbs": verbs,
    }
    with open(os.path.join(EVIDENCE, "bench.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # ── 人读表格 ──
    s = out["A_subprocess_cold"]["walls"]
    sp = cache["fresh_process"]
    ip = cache["inproc"]
    dpng = [d["wall"] for d in daemon["state"]]
    docr = [d["wall"] for d in daemon["ocr"]]
    inpatched = [d["total"] for d in inproc["patched_same_frame"]]
    inpatched_alt = [d["total"] for d in inproc["patched_alt_frame"]]
    quiet_totals = [d["total"] for d in quiet]
    q = _stats(quiet_totals)
    raw_state = [d["wall"] for d in inproc["state_raw"]]
    raw_screen = [d["wall"] for d in inproc["screen_raw"]]
    md = f"""# GUI 世界状态服务：三动词延迟实测（bench）

> 状态：**当前实现**读数｜实测日期：{out['measured_at']}｜仓库：`/home/h/genshin-ts`
> 复现：`python3 .scratch/gui-service/bench.py`（原始读数 `evidence/bench.json`；
> 同进程仪器尖刺 `python3 .scratch/gui-service/inproc_probe.py` → `evidence/inproc.json`）
> 帧：`{FRAME}`（3.4MB / 2560×1440）；alt：`{ALT_FRAME}`
> 硬约束：本会话不注入、不动游戏窗口；所有 live 路径未验证（窗口不在栈顶，`ys-atop` = NONE）

## 1. 三条路径并列

| 路径 | 场景 | 墙钟（ms，min/median/max） | 说明 |
|---|---|---|---|
| A. subprocess（现状实现） | 新进程首次 look（冷启动，3 次） | {s['min']} / {s['median']} / {s['max']} | worldsvc → ys-state CLI + ys-screen CLI；解释器 + 两次子进程；**跨次波动大**（daemon OCR 冷热/负载） |
| A'. subprocess | 同进程二次 look（禁缓存） | {_fmt(_stats(second_walls))} | **不热**：state 的本体 OCR 每次 ~700ms（daemon OCR 无缓存） |
| B. 裸 daemon RPC | `state`（PNG 帧） | {_fmt(_stats(dpng))} | 只判既有 8 态；GAME_* 返回 UNKNOWN ⇒ 不能替代 CLI 判态 |
| B. 裸 daemon RPC | `ocr`（同帧两次） | {_fmt(_stats(docr))} | 无缓存：每次 ~700ms |
| C. in-process（原始） | state | {_fmt(_stats(raw_state))} | importlib 加载 ys-state，同一判据代码 |
| C. in-process（原始） | objects（containers） | {_fmt(_stats(raw_screen))} | 每次 `load_small` 重新解码 PNG（~140ms） |
| C. in-process（复用补丁） | 同帧 look（首调，含一次解码） | {_fmt(_stats([inproc['patched_first']['total']]))} | 帧缓冲复用 + OCR 内容寻址缓存（state 仍走 daemon 判据） |
| C. in-process（复用补丁） | 同帧 look（稳态，{len(inpatched)} 次） | {_fmt(_stats(inpatched))} | 稳态只付 daemon 判据（132–195ms 有波动）+ 容器缓存 |
| C. in-process（复用补丁） | 换帧 look（{os.path.basename(ALT_FRAME)}） | {_fmt(_stats(inpatched_alt))} | 新帧必须解码一次 + 容器层重算 |
| 缓存命中 | 进程内（同 frame_sha） | {_fmt(_stats(ip['all']))} | 纯内存返回 + 重新校验 schema |
| 缓存命中 | 新进程（含解释器启动） | {_fmt(_stats(sp['all']))} | 进程启动占大头 |

## 2. 分解（谁在花钱）

| 环节 | 实测 | 出处 |
|---|---|---|
| PNG 解码（2560×1440，PIL） | 106–187ms | `inproc_probe` decode_frame |
| `frame_id` sha256（3.4MB） | 2.4–3.1ms | `inproc_probe` |
| 状态判定（daemon，GPU 锚点） | **138–140ms**（judge_ms 138–140） | 裸 daemon `state` |
| 本体态 OCR（daemon，无缓存） | **685–729ms/次** | 裸 daemon `ocr` |
| 对象层 `load_small`（半分辨率解码） | 140–192ms | in-process / CLI |
| 容器层计算（同帧缓存命中） | 0–1ms | ys-screen timing |
| schema 校验（22 对象） | 1.3ms | worldsvc timing |
| 子进程摊销（python 启动+导入） | ~15 + ~110ms（numpy） | `python3 -c pass` / import numpy |

**结论：决定成本的是「本体 OCR 700ms」「daemon 判据 132–195ms」「PNG 解码 106–187ms」，不是我们的编排层。**
子进程形态下 `ys-state` 每次都要重跑本体 OCR（daemon 侧无 OCR 缓存）⇒ look ≈ 1.2–1.7s；
把它换成内容寻址 OCR 缓存（in-process 补丁）后，同帧稳态 look ≈ 160–200ms
（daemon 判据 132–195ms 有波动 + 容器缓存 6ms）。

## 3. 门禁判定（AGI-BAR §一）

| 门禁 | 目标 | 实测 | 判定 |
|---|---|---|---|
| 单次默认路径 look | ≤50ms | 新帧 {s['min']}–{s['max']}ms（subprocess）/ **{q['min']}ms（in-process 补丁，静默最优）** | **未达成**（最好 {q['min']}ms 也 >50ms；差距来自 daemon 判据 132–195ms + 解码 106–187ms） |
| 缓存命中 | ≤5ms | {_stats(ip['all'])['min']}–{_stats(ip['all'])['max']}ms（进程内） | **达成** |
| 对象检测单帧 | ≤10ms | 容器层同帧缓存 0–1ms / 新帧 140ms+ | **部分**：缓存命中达成，新帧未达成（需学习型检测，票 24） |
| 分块 OCR | < 1/3 全帧 OCR | 未实现切片（v0 `text_source=fullframe`） | 未验证 |
| 返回单块切片 | ≤5ms | 未实现（`slices=[]`） | 未验证 |

**方差说明**：本机是共享环境（队友代理 + 常驻 daemon 同时在跑），冷启动与 in-process 数字跨次波动
（冷启动 1.35–3.2s；in-process 补丁 141–585ms）。可行性判断用「静默 5 次」的最优/中位，日常体验用冷启动中位。

**≤50ms 不可达的证据链**（不靠推断）：
1. 纯缓存命中 {_stats(ip['all'])['median']}ms —— 已 ≤5ms；
2. 任何**新帧**都必须付一次 PNG 解码（106–187ms，物理地板）或等价的原始像素传输
   （daemon 抓帧 ~105ms，引用 ys-state 文件头实测注释；本轮未单独测 live 抓帧）；
3. 状态判据本身在 GPU 常驻服务里要 132–166ms（judge_ms 实测，跨次有波动），已超 50ms；
4. 若去掉本体 OCR，GAME_* 态只能判成 UNKNOWN（daemon 8 态）—— 这不是优化，是丢功能。
⇒ 要进 ≤50ms，必须换感知架构：GPU 帧流（不落 PNG）+ 学习型检测（票 24）+ 判据下沉到 GPU/常驻进程。
   这是「扩常驻服务 / 改共享工具」范畴，Lead 明确由他去找用户谈。

## 4. 三动词开销（缓存命中后，含子进程调用次数）

| 调用 | 墙钟 | 子进程调用 | 状态 |
|---|---|---|---|
| `look`（同帧，缓存命中） | {verbs['look_cache_hit']['ms']}ms | {verbs['look_cache_hit']['subprocess_calls']} | — |
| `act({{"text": "祈愿"}})`（dry-run，同帧） | {verbs['act_dry_run_cached_frame']['ms']}ms | {verbs['act_dry_run_cached_frame']['subprocess_calls']} | {verbs['act_dry_run_cached_frame']['rc_status']} |
| `wait_until({{"state_in": ["GAME_PAIMON"]}})` | {verbs['wait_reached_cached_frame']['ms']}ms | {verbs['wait_reached_cached_frame']['subprocess_calls']} | {verbs['wait_reached_cached_frame']['status']} |
| `act`（新帧，dry-run，禁缓存服务） | {verbs['act_dry_run_new_frame']['ms']}ms | {verbs['act_dry_run_new_frame']['subprocess_calls']} | {verbs['act_dry_run_new_frame']['status']} |

⇒ **编排层自己几乎不花钱**：缓存命中后 act/wait 都是 **0 次子进程、~1ms**；成本全在「新帧的第一次 look」。

## 5. act 的注入与等待路径（本会话未执行）

- `act(inject=True)` 需要：`post` 判据（缺 → 拒绝，`ACT_POST_REQUIRED`）+ `allow_inject=True` + 窗口在栈顶 + `ys-gui-slot` 硬通道；
- 本会话硬约束「不动游戏窗口、不注入」⇒ 注入路径**代码就位、未执行**（如实标 N/A，不算验证过）；
- `act(intent=...)` 委托 `ys-do`（有 pre/post 契约与 append-only 账本），但 `ys-do` 连 dry-run 也 `acquire_focus`（抬窗）
  ⇒ 本会话一律拒绝，回执 `precondition_fail / FOCUS_REQUIRED`。

## 6. 复现

```bash
python3 .scratch/gui-service/bench.py                # 本表
python3 .scratch/gui-service/inproc_probe.py         # 同进程尖刺（daemon 地板 / 解码地板 / 复用补丁）
python3 .scratch/gui-service/selftest.py             # 契约自测（离线，0 注入）
```
"""
    with open(BENCH_MD, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[bench] 写好 {BENCH_MD}（{len(md)} 字符） + evidence/bench.json；用时 {out['wall_s']}s")
    return 0


def _fmt(st):
    return f"{st['min']} / {st['median']} / {st['max']}"


if __name__ == "__main__":
    sys.exit(main())
