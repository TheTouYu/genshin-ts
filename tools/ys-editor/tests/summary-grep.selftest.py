#!/usr/bin/env python3
"""summary-grep.selftest.py — `look --summary --grep` 的判据回归（离线，不碰屏幕）。

为什么需要它（2026-10-21 用户纠偏）：
    用户原话「工具给出信息，模型执行打开角色……然后工具给出布局和大致的框+文字信息，
    模型执行轮询切换，直到满足条件。**所以应该两次就结束了**。」
    实任务里 `--summary` **不带任何文字**，于是"按文字找目标"只能退化成抓整帧读图
    （11MB PNG + 拼图 + 视觉），一次任务烧掉 6 分钟。而常驻 OCR 早就把「冰元素／甘雨」
    读出来了——数据一直在 `objects[].text`，只是摘要没透传。

判据：
    T1 summary 透传 texts / texts_n（对象文本）
    T2 grep 命中对象文本与 free_text（都算命中）
    T3 grep 不命中 → match_count=0 且 matches 为空（"没找到"是判据，不是异常）
    T4 子串回退（甘 → 命中；二级回退允许单字）
    T5 bbox 是整数四元组（调用方要拿它去点）
退出码：0 PASS / 1 FAIL
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / ".scratch" / "gui-service"))
import schema  # noqa: E402

FAILS = 0


def ok(msg):
    print(f"  ✓ {msg}")
    return True          # 必须返回真：下面用的是 `A and ok(...) or bad(...)`


def bad(msg):
    global FAILS
    FAILS += 1
    print(f"  ✗ {msg}")


class Stub:
    """只提供 summary() 需要的字段（不动真实 WorldState 构造）。"""
    frame_id = "sha256:test"
    state_name = "GAME_CHARACTER"
    degraded = []
    raw = {"free_text": ["自由文本块：甘雨"], "settled": None, "uncertainty": [], "timing_ms": {}}
    objects = [
        {"text": ["DXVK v3.0", "冰元素／甘雨", "Q"], "bbox": [0, 0, 1206, 1440],
         "kind": "row", "affordance": {"clickable": "unknown"}},
        {"text": "UID: 110170759", "bbox": [2096, 1397, 416, 36],
         "kind": "row", "affordance": {"clickable": "unknown"}},
    ]


s = schema.WorldState.summary(Stub)
(s.get("texts_n") == 2) and ok("T1 texts_n=2") or bad(f"T1 texts_n={s.get('texts_n')}")
(s.get("state") == "GAME_CHARACTER") and ok("T1 state 给的是状态名") or bad("T1 state 不对")
(s.get("free_text") and s["free_text"]) and ok("T1 free_text 透传") or bad("T1 free_text 丢了")

g = schema.WorldState.summary(Stub, grep="甘雨")
(g.get("match_count") or 0) >= 2 and ok(f"T2 grep 命中对象+free_text（{g.get('match_count')} 处）") \
    or bad(f"T2 match_count={g.get('match_count')}")

n = schema.WorldState.summary(Stub, grep="雷电将军")
(n.get("match_count") == 0 and n.get("matches") == []) and ok("T3 不命中 → match_count=0 / matches=[]") \
    or bad(f"T3 match_count={n.get('match_count')} matches={n.get('matches')}")

p = schema.WorldState.summary(Stub, grep="甘")
(p.get("match_count") or 0) >= 1 and ok("T4 二级回退：单字「甘」也能命中") or bad("T4 单字未命中")

b = g["matches"][0].get("bbox")
(isinstance(b, list) and len(b) == 4 and all(isinstance(v, int) for v in b)) \
    and ok(f"T5 bbox 是整数四元组 {b}") or bad(f"T5 bbox={b!r}")

if FAILS == 0:
    print("SUMMARY-GREP-RESULT pass=7 fail=0 verdict=PASS")
    sys.exit(0)
print(f"SUMMARY-GREP-RESULT pass={7 - FAILS} fail={FAILS} verdict=FAIL")
sys.exit(1)
