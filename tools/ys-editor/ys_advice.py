#!/usr/bin/env python3
"""ys_advice — 把「笨办法」变成模块主动给出的策略建议（world.advice[]）。

用户口径（2026-10-21）：
  「在 AGI 的角度，或者在人操作的角度，都不会傻傻的一行一行的看。但是，我们做的是
    GUI 模块的 AGI，我们的模块要主动发现这一点，引导模型。」

检测（**通用，不写死任何游戏/列表名**）：
  ① 有序列表：同一帧 ≥3 个 kind=row 且高度相近（±20%）；标题/文本里有 `\\d+/\\d+`；
     行文本里存在可排序属性（`N天前/小时前/分钟前`；`今日内` 记为 0，`在线` 记为 -1）。
  ② 线性扫：daemon 内存里按 list_sig 保留轻量会话状态；连续 ≥3 次 look，列表 top 行在变、
     但每次新增行数 < 视口行数（一步一挪），且 count >> 已见行数 ⇒ SCANNING_LINEARLY。
  ③ 单调性：属性序列非递减才建议二分；否则降级 SUGGEST_JUMP_ONLY。
  ④ estimate 只用实测：rows_per_screen、look 间隔 p50（含客户端滚动）、count、seen；缺数就不给。

advice 只建议：不阻断、不改行为、不回错。状态可清：换界面/换列表/advice=false。
"""
from __future__ import annotations

import hashlib
import math
import re
import statistics

COUNT_RE = re.compile(r"(\d+)\s*/\s*(\d+)")
ATTR_RE = re.compile(r"(\d+)\s*(天前|小时前|分钟前)")
META = {"Lv.60", "在线", "●在线", "离线", "今日内", "● 今日内", "好友／我的好友",
        "我的好友", "min:", "max:", "千星奇域游玩中", "申请加入", "前往其大厅"}


def _name(t):
    for x in t:
        x = str(x).strip()
        if x and x not in META and not x.startswith(("min:", "max:")):
            return x
    return t[0] if t else ""


def _rows(containers, detections):
    rows = []
    for o in (containers or []):
        if str(o.get("kind") or "") != "row":
            continue
        b = o.get("bbox") or []
        if len(b) == 4:                                  # ys-screen 容器 bbox 是 xyxy
            w, h = float(b[2]) - float(b[0]), float(b[3]) - float(b[1])
            if w > 0 and h > 0:
                rows.append((w, h, [str(x) for x in (o.get("text") or [])]))
    if len(rows) < 3:
        for o in (detections or []):
            if str(o.get("kind") or "") != "row":
                continue
            b = o.get("bbox") or []
            if len(b) == 4:                              # 检测器 bbox 是 xywh
                rows.append((float(b[2]), float(b[3]), [str(x) for x in (o.get("text") or [])]))
    if len(rows) < 3:
        return []
    hs = [h for _, h, _ in rows]
    med = statistics.median(hs)
    if med <= 0:
        return []
    rows = [r for r in rows if abs(r[1] - med) <= 0.2 * med]
    return rows if len(rows) >= 3 else []


def _count(texts):
    for t in texts:
        m = COUNT_RE.search(str(t))
        if m:
            return int(m.group(1))
    return None


def _attr_values(rows):
    vals = []
    for _, _, t in rows:
        s = " ".join(t)
        m = ATTR_RE.search(s)
        if m:
            vals.append(int(m.group(1)))
        elif "今日内" in s:
            vals.append(0)
        elif "在线" in s:
            vals.append(-1)
    return vals


def _sig(state_name, header, count, rows):
    h = 0.0
    hs = [r[1] for r in rows]
    if hs:
        h = round(statistics.median(hs) / 10.0) * 10
    # 2026-10-21 回放实测：把「行高中位」放进 sig 会把同一列表按 OCR 抖动切成多个 sig
    # （每屏高度略变 ⇒ 永远凑不满 3 次）。sig 只用 状态+标题+计数；标题缺失时才用首行兜底。
    key = "|".join([state_name or "", header or "", str(count or "")])
    if not header:
        key += "|" + "|".join(_name(r[2]) for r in rows[:2]) + "|" + str(h)
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


class ListTracker:
    def __init__(self, max_lists=16):
        self.max_lists = max_lists
        self._t = {}
        self._state = None

    def clear(self):
        self._t.clear()
        self._state = None

    def observe(self, *, state_name, containers=(), detections=(), free_text=(),
                look_ms=0.0, now_ms=0.0, enabled=True):
        if not enabled:
            self.clear()
            return []
        if state_name != self._state:
            self._t.clear()
            self._state = state_name
        rows = _rows(containers, detections)
        if len(rows) < 3:
            return []
        texts = [str(x) for x in (free_text or [])] + [s for _, _, t in rows for s in t]
        count = _count(texts)
        header = ""
        for t in (free_text or []):
            if COUNT_RE.search(str(t)) or "／" in str(t):
                header = str(t)
                break
        sig = _sig(state_name, header, count, rows)
        st = self._t.get(sig)
        if st is None:
            st = {"obs": [], "seen": set(), "gaps": [], "looks": [], "attrs": []}
            self._t[sig] = st
            while len(self._t) > self.max_lists:
                self._t.pop(next(iter(self._t)))
        prev_ts = st["obs"][-1]["ts"] if st["obs"] else None
        if prev_ts is not None and now_ms > prev_ts:
            st["gaps"].append(now_ms - prev_ts)
        viewport = max([len(o["rows"]) for o in st["obs"]] + [len(rows)])
        keys = ["|".join(t) for _, _, t in rows]
        new = sum(1 for k in keys if k not in st["seen"])
        st["seen"].update(keys)
        vals = _attr_values(rows)
        st["attrs"].append(vals)
        st["looks"].append(float(look_ms or 0))
        st["obs"].append({"rows": rows, "new": new, "first": _name(rows[0][2]),
                          "last": _name(rows[-1][2]), "ts": now_ms, "count": count,
                          "vals": vals, "viewport": viewport})
        obs = st["obs"]
        if len(obs) < 3:
            return []
        last3 = obs[-3:]
        # 「每次只下移 ≤ 视口行数，且确实在动」：new=视口 是整屏翻页（仍算线性，比二分慢）；
        # new=0 是同屏重复读（另一反模式 LOOKING_REPEATEDLY，不给本建议）。
        partial = all(0 < o["new"] <= max(2, int(o["viewport"])) for o in last3)
        moved = sum(1 for a, b in zip(last3, last3[1:]) if b["first"] != a["first"])
        if not (partial and moved >= 2 and count and len(st["seen"]) < count * 0.6):
            return []
        # 属性序列非递减（含全相等）；没有可排序属性 ⇒ 不二分
        flat = [v for o in obs for v in o["vals"]]
        attrs_any = bool(flat)
        monotonic = attrs_any and all(a <= b for a, b in zip(flat, flat[1:]))
        # 2026-10-21 修正：估算必须用**实测净推进**（每次新增行数中位），不是视口行数。
        net_rows = max(1.0, statistics.median(o["new"] for o in obs))
        seen = len(st["seen"])
        remaining = max(0, count - seen) if count else 0
        screens = int(math.ceil(remaining / net_rows)) if count else None
        gaps = st["gaps"][-5:]
        loop_p50 = statistics.median(gaps) if gaps else None
        est = {}
        if count and screens is not None and screens > 0:
            est["net_rows_per_step"] = round(net_rows, 2)
            est["linear_screens_remaining"] = screens
        if est.get("linear_screens_remaining") and loop_p50 and loop_p50 > 0:
            est["linear_seconds"] = round(screens * loop_p50 / 1000.0, 1)
            est = {"linear_screens_remaining": screens,
                   "linear_seconds": round(screens * loop_p50 / 1000.0, 1),
                   "net_rows_per_step": round(net_rows, 2),
                   "bisection_probes": int(math.ceil(math.log2(max(2, screens)))),
                   "bisection_seconds": round(int(math.ceil(math.log2(max(2, screens))))
                                              * loop_p50 / 1000.0, 1)}
        elif not loop_p50:
            est.pop("linear_screens_remaining", None)
        why = ("这是一个**有序**列表（%s），你在逐屏线性扫；已读 %d 行 / %d 屏，还差 %d 屏"
               % (header or "带计数标题", seen, len(obs), screens if screens is not None else 0))
        attr_name = "N天前" if any("天前" in " ".join(r[2]) for r in rows) else (
            "今日内" if any("今日内" in " ".join(r[2]) for r in rows) else None)
        order = None
        if attrs_any and flat[-1] > flat[0]:
            order = "asc"
        elif attrs_any and flat[-1] < flat[0]:
            order = "desc"
        if monotonic:
            adv = {"code": "SCANNING_LINEARLY", "severity": "act-now", "why": why,
                   "attribute": attr_name, "order": order,
                   "how": "用二分：ys-scroll --rows <N> 跳到中部 → look → 按天数单调性折半；"
                          "实现见 tools/ys-editor/ys-scan"}
            if est:
                adv["estimate"] = est
                adv["cost_if_ignored"] = ("多花约 %.0fs（线性 %.0fs vs 二分 %.0fs），"
                                          "且可能撞上 60s 授权上限"
                                          % (est["linear_seconds"] - est["bisection_seconds"],
                                             est["linear_seconds"], est["bisection_seconds"]))
        else:
            adv = {"code": "SUGGEST_JUMP_ONLY", "severity": "act-now",
                   "why": why + "；但属性序列不单调，先大跳再小步复核",
                   "how": "用 ys-scroll --rows <N> 大跳一屏以上，再 look 定位；不要直接二分"}
            if est:
                est2 = {k: v for k, v in est.items()
                        if k in ("linear_screens_remaining", "linear_seconds", "net_rows_per_step")}
                if est2:
                    adv["estimate"] = est2
        return [adv]


_DEFAULT = ListTracker()


def observe(**kw):
    return _DEFAULT.observe(**kw)
