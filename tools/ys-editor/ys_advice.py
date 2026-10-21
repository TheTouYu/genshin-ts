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
import os
import math

# 「能不能 seek」优先看**当帧读数**（`seek_cap`，来自 ys_scrollbar.detect：本帧有没有滚动条），
# 没有读数时退回滚轮上限 SEEK_MAX_ROWS（2026-10-21 真机标定：滚轮请求 8 行→实测 6.9 行，
# 16/24/48 只落 4.5–5.6 ⇒ 滚轮 seek 上限 ≈8 行）。**不要新加常量**：滚动条一可用就是"能 seek"。
SEEK_MAX_ROWS = float(os.environ.get('YS_SEEK_MAX_ROWS', '8'))
# 滚轮请求 8 行→61 clicks→实测 6.9 行（1.38 rows/s 最优）；请求 16/24/48 虽分批执行，
# 实测只落 4.5–5.6 行且 rows/s 掉到 0.36 ⇒ 游戏对连续滚轮有速率上限，**滚轮 seek 上限 ≈8 行**。
# （拖动/滚动条 seek 另测，若可行再上调。）

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
    """容器行 vs 检测行：**选更多的那个**。

    2026-10-21 真机空转根因：容器层只给 3–4 行（且常不随滚动变化），而 D2 检测给
    10+ 行；旧逻辑「容器 ≥3 就不再取检测」⇒ 永远 new=0、advice 永远 []。
    """
    c_rows, d_rows = [], []
    for o in (containers or []):
        if str(o.get("kind") or "") != "row":
            continue
        b = o.get("bbox") or []
        if len(b) == 4:                                  # ys-screen 容器 bbox 是 xyxy
            w, h = float(b[2]) - float(b[0]), float(b[3]) - float(b[1])
            if w > 0 and h > 0:
                c_rows.append((w, h, [str(x) for x in (o.get("text") or [])]))
    for o in (detections or []):
        if str(o.get("kind") or "") != "row":
            continue
        b = o.get("bbox") or []
        if len(b) == 4:                                  # 检测器 bbox 是 xywh
            w, h = float(b[2]), float(b[3])
            if w > 0 and h > 0:
                d_rows.append((w, h, [str(x) for x in (o.get("text") or [])]))
    rows = d_rows if len(d_rows) > len(c_rows) else c_rows
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


def _attr_one(row):
    s = " ".join(row[2])
    m = ATTR_RE.search(s)
    if m:
        return int(m.group(1))
    if "今日内" in s:
        return 0
    if "在线" in s:
        return -1
    return None


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
                look_ms=0.0, now_ms=0.0, enabled=True, seek_cap=None):
        """seek_cap: None=无读数（退回滚轮上限）；dict=当帧滚动条读数
        {found, orientation, position_ratio, estimated_pages}（判据唯一源 ys_scrollbar.py）。"""
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
        old_seen = set(st["seen"])
        new = sum(1 for k in keys if k not in old_seen)
        st["seen"].update(keys)
        # 单调性只看**新出现行**：重叠行会把序列拉回去（1..7, 6..12 ⇒ 非单调），
        # 这是 2026-10-21 advice 门禁红的真因。
        vals = [v for row, k in zip(rows, keys) if k not in old_seen
                for v in [_attr_one(row)] if v is not None]
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
        if not attrs_any:                 # 列表识别要求存在可排序属性；没有就不建议
            return []
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
            _need = 0
            if est and est.get("linear_screens_remaining"):
                _need = int(est["linear_screens_remaining"]) // 2
            _sb = seek_cap or {}
            _can_seek = bool(_sb.get("found"))
            # 有当帧读数 ⇒ **只信读数**（没有滚动条就是没有 seek，检测失败同样按 found=false 处理，
            # 宁可报线性也不给一个拖不动的建议）；只有老调用方没传读数时才退回滚轮上限。
            _seek_ok = _can_seek if seek_cap is not None else (_need <= SEEK_MAX_ROWS)
            if _seek_ok:
                if _can_seek:
                    # 有滚动条 ⇒ 一次跳到位，不用二分。**总行数必须来自标题（count）**：
                    # estimated_pages 实测偏小 ~1.45×（好友列表 17.31 vs 真值 24.7），不可用于 seek。
                    _target = min(int(count or 1), seen + max(1, int(round(net_rows))))
                    how = ("一次跳到位：ys-scroll --seek-rows %d --total-rows %s（--total-rows "
                           "取标题 %s；**estimated_pages 不可用于 seek**，实测偏小 ~1.45×）→ look 复核"
                           % (_target, int(count) if count else "<标题里的总数>",
                              header or "x/y"))
                    _mode = "scrollbar_seek"
                else:
                    how = ("用二分：ys-scroll --rows <N> 跳到中部 → look → 按天数单调性折半；"
                           "实现见 tools/ys-editor/ys-scan")
                    _mode = "bisection"
                adv = {"code": "SCANNING_LINEARLY", "severity": "act-now", "why": why,
                       "attribute": attr_name, "order": order, "how": how,
                       "seek_mode": _mode}
                if _can_seek:
                    adv["seek"] = {"orientation": _sb.get("orientation"),
                                   "position_ratio": _sb.get("position_ratio"),
                                   "target_row": _target, "total_rows": count}
                if est:
                    adv["estimate"] = est
                    adv["cost_if_ignored"] = ("多花约 %.0fs（线性 %.0fs vs 二分 %.0fs），"
                                              "且可能撞上 60s 授权上限"
                                              % (est["linear_seconds"] - est["bisection_seconds"],
                                                 est["linear_seconds"], est["bisection_seconds"]))
            else:
                # **诚实的建议**：现在没有 seek 能力（clicks clamp 5..80 ⇒ 一次最多 ~6 行），
                # 二分跳不到中部。就不许建议二分——给出"提高单屏吞吐/减少重叠"的可执行方向。
                adv = {"code": "LINEAR_ONLY_NO_SEEK", "severity": "info",
                       "why": why + ("；本帧**没有滚动条**（whence=当帧读数），"
                                     "且单次滚轮最多 %.0f 行，二分跳不到中部" % SEEK_MAX_ROWS
                                     if seek_cap is not None else
                                     "；但当前**没有 seek 能力**（单次最多 %.0f 行），二分跳不到中部"
                                     % SEEK_MAX_ROWS),
                       "attribute": attr_name, "order": order,
                       "how": "两条可执行路径：①把每屏净推进从 ~5 行提到接近视口 7 行（减少重叠）；"
                              "②补 seek 原语（键盘 PageDown/End 或拖滚动条），再回到二分",
                       "blocked_by": "seek_capability",
                       "estimate": ({k: v for k, v in (est or {}).items()
                                     if k in ("linear_screens_remaining", "linear_seconds",
                                              "net_rows_per_step")} or None)}
                if not adv["estimate"]:
                    adv.pop("estimate")
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
