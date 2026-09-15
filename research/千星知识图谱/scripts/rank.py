#!/usr/bin/env python3
"""T01 · 源排序与候选清单

排序判据（多信号，不靠单一指标）：
  1. cross_hit  —— 在多少个不同播种词下命中（相关性最强信号）
  2. play       —— 播放量（质量/影响力代理）
  3. duration   —— 时长（教学深度代理，过短=切片、过长=直播录像）
  4. 标题信号   —— 教程/讲解/思路/框架/避坑/踩坑/邪修/实战/心得/分享

用法: rank.py --search search --out search --top 150
"""
import argparse
import collections
import json
import os
import re
import sys

POS = {"教程": 3, "教学": 3, "保姆级": 3, "从零": 2, "入门": 2, "进阶": 2, "详解": 3,
       "讲解": 3, "解析": 2, "思路": 4, "设计": 3, "框架": 4, "架构": 4, "避坑": 4,
       "踩坑": 4, "踩雷": 4, "邪修": 5, "技巧": 3, "心得": 3, "分享": 2, "干货": 4,
       "实战": 3, "经验": 3, "误区": 4, "优化": 2, "必学": 2, "指南": 3, "通识": 2,
       "冷知识": 4, "隐秘": 4, "干货分享": 4, "锐评": 3, "分析": 2, "复盘": 3}
NEG = {"直播回放": -3, "录播": -1, "宣传片": -3, "预告": -2, "整活": -1}

# 领域门禁：必须是「千星奇域创作」内容，不是原神本体攻略。
# 「奇遇」是创作者对「奇域」的常见写法（同音错字），一并接受。
DOMAIN = ("千星", "奇域", "奇遇", "沙箱", "UGC")
# 原神本体玩法词：命中即判为跑错领域（除非同时有强创作信号）
OFFTOPIC = ("角色培养", "深渊", "圣遗物", "命座", "抽卡", "配队", "深境螺旋",
            "五星角色", "六星真神", "版本前瞻", "兑换码")


def domain_ok(title: str, desc: str) -> bool:
    blob = title + " " + desc[:200]
    if not any(d in blob for d in DOMAIN):
        return False
    hits = sum(1 for w in OFFTOPIC if w in title)
    if hits and not any(k in blob for k in ("节点图", "编辑器", "创作", "搭建", "自制", "地图编辑")):
        return False
    return True


def parse_play(s: str) -> int:
    """'33.0万' → 330000；'1.2亿' → 120000000。"""
    if not s:
        return 0
    m = re.match(r"([\d.]+)\s*(亿|万)?", str(s).replace(",", ""))
    if not m:
        return 0
    v = float(m.group(1))
    return int(v * {"亿": 100000000, "万": 10000, None: 1}[m.group(2)])


def parse_dur(s: str) -> int:
    if not s:
        return 0
    parts = [int(x) for x in re.findall(r"\d+", str(s))]
    sec = 0
    for p in parts:
        sec = sec * 60 + p
    return sec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--search", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--top", type=int, default=150)
    ap.add_argument("--min-cross", type=int, default=1)
    a = ap.parse_args()

    agg, kwsets = {}, collections.defaultdict(set)
    for fn in sorted(os.listdir(a.search)):
        if not re.match(r"round\d+-all\.json$", fn):
            continue
        with open(os.path.join(a.search, fn), encoding="utf-8") as f:
            d = json.load(f)
        for kw, lst in d.items():
            for r in (lst if isinstance(lst, list) else []):
                bv = r.get("bvid")
                if not bv:
                    continue
                kwsets[bv].add(kw)
                cur = agg.get(bv)
                if not cur or parse_play(r.get("stats", [""])[0] if r.get("stats") else "") > \
                        parse_play(cur.get("stats", [""])[0] if cur.get("stats") else ""):
                    agg[bv] = r

    # 详情（若有）补简介
    dp = os.path.join(a.search, "details.json")
    details = {}
    if os.path.exists(dp):
        with open(dp, encoding="utf-8") as f:
            details = json.load(f)

    rows = []
    for bv, r in agg.items():
        t = r.get("title", "")
        det = details.get(bv) or {}
        desc = det.get("desc", "") or ""
        play = parse_play((r.get("stats") or [""])[0])
        # 详情里的真实播放量优先（搜索结果卡片可能被截断）
        if det.get("view"):
            play = max(play, det["view"])
        dur = det.get("duration") or parse_dur(r.get("duration", ""))
        sig = sum(w for k, w in POS.items() if k in t or k in desc[:120])
        sig += sum(w for k, w in NEG.items() if k in t)
        cross = len(kwsets[bv])
        if cross < a.min_cross:
            continue
        if not domain_ok(t, desc):
            continue
        rows.append({
            "bvid": bv, "title": t, "author": r.get("author", ""),
            "duration": dur, "duration_str": r.get("duration", ""),
            "play": play, "cross_hit": cross, "signal": sig,
            "keywords": sorted(kwsets[bv]),
            "desc": desc[:600],
            "score": round(cross * 3 + sig * 2 + (play ** 0.34), 2),
        })

    rows.sort(key=lambda x: -x["score"])
    top = rows[:a.top]
    with open(os.path.join(a.out, "candidates.json"), "w", encoding="utf-8") as f:
        json.dump(top, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.out, "candidates-bvids.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(r["bvid"] for r in top))

    print(f"全量候选 {len(rows)} 个（cross>={a.min_cross}）；取 top {len(top)}")
    print(f"cross 分布: " + ", ".join(
        f"{k}词={v}" for k, v in sorted(collections.Counter(r['cross_hit'] for r in rows).items())[:8]))
    print(f"\n=== TOP 25 ===")
    for r in top[:25]:
        print(f"  s={r['score']:<7} {r['cross_hit']:>2}词 {r['duration']//60:>3}分 "
              f"{r['play']/10000:>6.1f}万 {r['bvid']}  {r['title'][:56]}")
    print(f"\n✓ → {a.out}/candidates.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
