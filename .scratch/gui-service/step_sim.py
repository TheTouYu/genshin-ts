#!/usr/bin/env python3
"""step_sim.py — 用 W1 真机 5 屏行名做「clicks→rows」闭环步长模拟（离线，无屏幕）。

输入：`.scratch/gui-service/evidence/realrun-20261021/{friends_top.json,screen/*.json}`
做法：相邻两屏按重叠好友名匹配 y 位移 → rows_moved = shift/行距；拟合 clicks/row；
      模拟目标 5 行/步需要多少 clicks，并检查 7 行视口下是否留 ≥2 行重叠（不跳行）。
输出：`evidence/step-sim.json`。
"""
import json, os, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
E = os.path.join(HERE, "evidence", "realrun-20261021")
SCREENS = [("top", os.path.join(E, "friends_top.json"), 0),
           ("small5", os.path.join(E, "screen", "small5.json"), 5),
           ("large40", os.path.join(E, "screen", "large40.json"), 35),
           ("s01", os.path.join(E, "screen", "s01.json"), 30),
           ("s02", os.path.join(E, "screen", "s02.json"), 30)]

def rows(p):
    d = json.load(open(p, encoding="utf-8"))
    out = []
    for o in d.get("objects") or []:
        b = o.get("bbox") or []
        t = [s for s in (o.get("text") or []) if s and s.strip()]
        if len(b) < 4:
            continue
        x, y, w, h = [float(v) for v in b[:4]]
        if w >= 800 and 30 <= h <= 300 and y >= 80 and t:
            out.append({"y": y, "text": t})
    return sorted(out, key=lambda r: r["y"])

META = {"Lv.60", "在线", "●在线", "离线", "今日内", "● 今日内", "好友／我的好友",
        "min:", "max:", "千星奇域游玩中", "申请加入", "前往其大厅"}

def name_of(t):
    for s in t:
        if s and s.strip() and s not in META and not s.startswith("min:") and not s.startswith("max:"):
            return s.strip()
    return None


def pitch(rs):
    ys = [r["y"] for r in rs]
    ds = [b - a for a, b in zip(ys, ys[1:]) if 80 < b - a < 260]
    return statistics.median(ds) if ds else 170.0

data = []
for name, path, clicks in SCREENS:
    rs = rows(path)
    data.append({"name": name, "clicks": clicks, "rows": rs, "pitch": pitch(rs)})
steps = []
for a, b in zip(data, data[1:]):
    # 按行首文本匹配
    an = [(name_of(r["text"]), r["y"]) for r in a["rows"]]
    bn = [(name_of(r["text"]), r["y"]) for r in b["rows"]]
    ac = {}
    for n, y in an:
        if n: ac.setdefault(n, []).append(y)
    bc = {}
    for n, y in bn:
        if n: bc.setdefault(n, []).append(y)
    shifts = []
    for n, ys in ac.items():
        if len(ys) == 1 and len(bc.get(n, [])) == 1:
            shifts.append(ys[0] - bc[n][0])
    if not shifts:
        steps.append({"from": a["name"], "to": b["name"], "clicks": b["clicks"],
                      "matched": 0, "rows_moved": None, "clicks_per_row": None})
        continue
    shift = statistics.median(shifts)
    p = statistics.median([a["pitch"], b["pitch"]])
    moved = abs(shift) / p
    steps.append({"from": a["name"], "to": b["name"], "clicks": b["clicks"],
                  "matched": len(shifts), "shift_px": round(shift, 1),
                  "pitch_px": round(p, 1), "rows_moved": round(moved, 2),
                  "clicks_per_row": round(b["clicks"] / moved, 2) if moved else None})
# 只保留有唯一名字匹配的步（>=1 匹配）
rel = [s for s in steps if s.get("matched")]
cprs = [s["clicks_per_row"] for s in rel if s.get("clicks_per_row")]
med_cpr = statistics.median(cprs) if cprs else None
# 线性拟合 clicks = m*rows + c
pts = [(s["rows_moved"], s["clicks"]) for s in rel if s.get("rows_moved")]
fit = None
if len(pts) >= 2:
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    mx = sum(xs) / len(xs); my = sum(ys) / len(ys)
    var = sum((x - mx) ** 2 for x in xs)
    m = sum((x - mx) * (y - my) for x, y in pts) / var if var else 0
    c = my - m * mx
    target = 5.0
    clicks5 = int(round(m * target + c)) if m > 0 else None
    fit = {"m": round(m, 2), "c": round(c, 2), "target_rows": target,
           "predicted_clicks": clicks5,
           "median_clicks_per_row": round(med_cpr, 2) if med_cpr else None,
           "recommended_clicks": int(round(med_cpr * target)) if med_cpr else None,
           "viewport_rows": 7, "overlap_rows": round(7 - target, 1),
           "no_skip": (med_cpr is not None and target <= 7 - 1)}
res = {"steps": steps, "fit": fit, "screens": [{"name": d["name"], "rows": len(d["rows"]),
                                                 "pitch": round(d["pitch"], 1)} for d in data]}
out = os.path.join(E, "step-sim.json")
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
print("STEP-SIM no_skip=%s -> %s" % (fit and fit["no_skip"], out))
