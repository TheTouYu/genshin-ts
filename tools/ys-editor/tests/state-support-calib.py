#!/usr/bin/env python3
"""state-support-calib.py — 开集判据标定表：逐帧给出**每态 support（passed/total/ratio/ok/rule）**。

为什么有这张表（2026-10-21 用户实测）：同一台仪器、同一 profile 跑两张陌生画面——
游戏启动界面判 `UNKNOWN conf 0.25`（诚实），Firefox 整屏判 `PLAYTEST conf 0.5`（**自信地判错**）。
根因是封闭词表只交出「最像者」：没有强度分布，也没有「都不像」的坐标，陌生画面只要偶然
满足某个 `any2` 态的两条判据就被判出去。`decide()` 现在额外返回 support/criteria/novel
（接口契约 v1），本脚本就是**定 ACCEPT_SUPPORT 之前必须先看的那张表**。

判读纪律（写进报告的判据，不是建议）：
  · 真 PLAYTEST 帧的 ratio 与误判帧的 ratio **能分开** ⇒ 阈值可用，取两者之间；
  · **分不开**（例如真 PLAYTEST 也只有 0.5）⇒ **不许硬定阈值**——立刻把表交 Lead 并换判据
    （例如要求锚点 margin 本身达标、或 any2 的 2 条必须含**唯一性**判据），
    不要为了让陌生画面变绿而破坏老画面。
  · ACCEPT_SUPPORT 只影响 `state`/`novel`，**不改** support/criteria 的读数。

用法：
  python3 tools/ys-editor/tests/state-support-calib.py                # 默认语料（见 DEFAULT_DIRS）
  python3 tools/ys-editor/tests/state-support-calib.py DIR|PNG ...    # 指定目录/帧（可混用）
  python3 tools/ys-editor/tests/state-support-calib.py ... --expect NAME=STATE ...  # 标定口径
  python3 tools/ys-editor/tests/state-support-calib.py ... --json /tmp/calib.json   # 全量落盘
  python3 tools/ys-editor/tests/state-support-calib.py ... --dump-readings R.json   # 存原始 readings
  python3 tools/ys-editor/tests/state-support-calib.py --readings R.json            # 从 readings 复算
      （复算不读帧、不跑模板匹配 ⇒ 用来验证「新字段是 readings 的纯函数」）

目录里若有 `manifest.tsv`（`文件名\t期望态\t说明`）以它为准（含期望态）；否则按文件名排序。
本脚本不碰屏幕、不抬窗、不注入，只读离线帧。退出码：0 跑完 / 2 语料为空。
"""
import importlib.machinery
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
YS_EDITOR = os.path.dirname(HERE)
STATE = os.path.join(YS_EDITOR, "ys-state")
FIXTURES = os.path.join(HERE, "fixtures")
DEFAULT_DIRS = [os.path.join(FIXTURES, "screen"), os.path.join(FIXTURES, "perception")]
# 门槛扫描：看哪一档能拦住陌生画面又不误伤真帧（列 = 候选 ACCEPT_SUPPORT）
THRESHOLDS = [0.5, 2 / 3, 0.75, 0.8, 0.9, 1.0]
EPS = 1e-9


def load_state():
    loader = importlib.machinery.SourceFileLoader("ys_state_calib", STATE)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def option(args, name):
    if name not in args:
        return None
    i = args.index(name)
    return args[i + 1] if len(args) > i + 1 else None


def collect(paths, expect_map):
    """展开成 [(路径, 期望态)]；manifest.tsv 优先（含期望态）。"""
    out = []
    for a in paths:
        if os.path.isdir(a):
            man = os.path.join(a, "manifest.tsv")
            if os.path.exists(man):
                with open(man, encoding="utf-8") as f:
                    for line in f:
                        if not line.strip() or line.startswith("#"):
                            continue
                        p = line.split("\t")
                        fp = os.path.join(a, p[0].strip())
                        if os.path.exists(fp):
                            out.append((fp, p[1].strip() if len(p) > 1 else None))
                continue
            for fn in sorted(os.listdir(a)):
                if fn.lower().endswith(".png"):
                    out.append((os.path.join(a, fn), None))
        elif os.path.isfile(a):
            out.append((a, None))
        else:
            sys.stderr.write(f"[calib] 跳过（不存在）: {a}\n")
    return [(fp, expect_map.get(os.path.basename(fp), e)) for fp, e in out]


def anchor_readings(M, frame):
    """GPU 锚点读数（与 daemon-world 通道同一份判据/阈值）：**只发帧路径给常驻服务算分**，
    不抓屏、不抬窗。daemon 不可用时返回空 dict（表里就只剩 pixel+template 那套判据）。"""
    try:
        prof = M.load_profile(M.DEFAULT_PROFILE if hasattr(M, "DEFAULT_PROFILE")
                              else M.PROFILE_DEFAULT)
        return M.anchor_readings(prof, frame_path=frame)
    except Exception as e:                                   # noqa: BLE001
        sys.stderr.write(f"[calib] 锚点通道不可用（{type(e).__name__}: {e}）——本帧无 anchor 判据\n")
        return {}


def readings_for(M, frame, anchors=True):
    """取数：full 通道（pixel+template）+ 可选 GPU 锚点；**不打 OCR**（本体态判据不在本表）。"""
    t0 = time.time()
    try:
        pix = M.ArrayPixels(M.decode_frame(frame), source=frame)
    except Exception as e:                                   # noqa: BLE001 — 标定表要能报出坏帧
        return {}, f"解码失败 {type(e).__name__}: {e}", 0
    if not M.geom_ok(pix.w, pix.h):
        # 与 run_full 同一句：缩放帧/半截帧的像素坐标不可信，整体拒判（不是"没判据"）
        r = {"GEOM/frame 尺寸 2560x1440": {
            "value": f"实际 {pix.w}x{pix.h}（缩放帧/抓帧失败态）", "passed": False, "kind": "pixel"}}
        return r, None, int((time.time() - t0) * 1000)
    r = {}
    r.update(M.pixel_readings(pix))
    r.update(M.template_readings(pix))
    if anchors:
        r.update(anchor_readings(M, frame))
    return r, None, int((time.time() - t0) * 1000)


def best_of(support):
    """最高 support 的态（并列按 STATES 顺序，稳定）。"""
    if not support:
        return None, 0.0
    st = max(support, key=lambda s: (support[s]["ratio"], support[s]["passed"]))
    return st, support[st]["ratio"]


def cell(v):
    return "%d/%d=%.2f%s" % (v["passed"], v["total"], v["ratio"], "*" if v["ok"] else " ")


def main(argv):
    expect_map = {}
    args = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--expect":
            for kv in (argv[i + 1].split(",") if i + 1 < len(argv) else []):
                if "=" in kv:
                    k, v = kv.rsplit("=", 1)
                    expect_map[k.strip()] = v.strip()
            i += 2
            continue
        if a in ("--json", "--dump-readings", "--readings"):
            args.append(a)
            args.append(argv[i + 1] if i + 1 < len(argv) else "")
            i += 2
            continue
        args.append(a)
        i += 1

    json_out = option(args, "--json")
    dump = option(args, "--dump-readings")
    cache_in = option(args, "--readings")
    use_anchor = "--no-anchors" not in args
    paths = [a for a in args if not a.startswith("--")
             and a not in (json_out, dump, cache_in) and a]
    if "--regress" in args:                       # 回归语料：含真 PLAYTEST/PAUSE/SETTLE 帧
        paths.append(os.path.join(YS_EDITOR, "calib", "regress"))
    if not paths and not cache_in:
        paths = [d for d in DEFAULT_DIRS if os.path.isdir(d)]
    sys.stderr.write("[calib] 语料: %s%s\n" % (", ".join(paths) if paths else "(readings 缓存)",
                                              "（含 GPU 锚点）" if use_anchor else "（无锚点）"))

    M = load_state()
    rows = []
    t_all = time.time()

    if cache_in:
        cache = json.load(open(cache_in, encoding="utf-8"))
        for name, item in cache.items():
            rows.append({"frame": item.get("path") or name, "name": name,
                         "expect": expect_map.get(name, item.get("expect")),
                         "readings": item["readings"], "ms": item.get("ms", 0),
                         "decide": M.decide(item["readings"]), "err": item.get("err")})
    else:
        frames = collect(paths, expect_map)
        if not frames:
            sys.stderr.write("[calib] 没有可读的帧 —— 用目录/文件参数指定语料\n")
            return 2
        for fp, expect in frames:
            readings, err, ms = readings_for(M, fp, anchors=use_anchor)
            name = os.path.basename(fp)
            rows.append({"frame": fp, "name": name, "expect": expect, "readings": readings,
                         "ms": ms, "decide": M.decide(readings), "err": err})
            d = rows[-1]["decide"]
            sys.stderr.write("[calib] %-36s %-9s %-5s %.3f (%dms)%s\n" % (
                name[:36], d["state"], "novel" if d["novel"] else "", d["confidence"], ms,
                "  ⚠ " + err if err else ""))

    # ── 表 1：逐帧决策（旧键） + 最高支持态 ─────────────────────────
    print("\n## 1. 决策（旧键；P0 不改行为）与最高支持态")
    print("%-36s %-8s %-8s %6s %7s %-6s %-12s %s" % (
        "帧", "期望", "判为", "conf", "margin", "novel", "novel_reason", "最高支持态 / 门禁中间量"))
    for r in rows:
        d = r["decide"]
        bst, br = best_of(d["support"])
        m = d.get("match") or {}
        gate = "" if not m.get("candidate") else "  门[%s ratio=%.2f crit=%s ratio_pass=%s accepted=%s]" % (
            m["candidate"], m["ratio"], m["critical_ok"], m["ratio_pass"], m["accepted"])
        print("%-36s %-8s %-8s %6.3f %7.3f %-6s %-20s %s%s" % (
            r["name"][:36], r["expect"] or "-", d["state"], d["confidence"], d["margin"],
            "Y" if d["novel"] else "-", d["novel_reason"] or "-",
            ("%s %.3f" % (bst, br)) if bst else "(无判据)", gate))

    # ── 表 2：support 矩阵（每态 p/n=ratio，*=该态成立）──────────────
    states = [s for s in M.STATES if any(s in r["decide"]["support"] for r in rows)]
    print("\n## 2. support 矩阵（passed/total=ratio，`*`=ok；rule 见末行）")
    head = "%-36s " % "帧" + " ".join("%-10s" % s[:10] for s in states)
    print(head)
    for r in rows:
        sup = r["decide"]["support"]
        print("%-36s " % r["name"][:36] + " ".join(
            "%-10s" % cell(sup[s]) if s in sup else "%-10s" % "·" for s in states))
    print("%-36s " % "rule" + " ".join(
        "%-10s" % M.RULE.get(s, "all") for s in states))
    print("%-36s " % "MIN_CRITERIA" + "%-10d" % M.MIN_CRITERIA)

    # ── 表 3：多数票态（any2）的逐条判据明细（A/B/C 同 ys-state 文档）──
    any2 = [s for s in states if M.RULE.get(s) == "any2"]
    for st in any2:
        print("\n## 3.%s %s 逐条判据（any2：任意 2 条中即成立，不要求全中）" % (any2.index(st) + 1, st))
        print("%-36s %s" % ("帧", " ".join("ABCDEFGH"[:12])))
        for r in rows:
            crit = [c for c in r["decide"]["criteria"] if c["state"] == st]
            if not crit:
                print("%-36s %s" % (r["name"][:36], "(该帧无此态判据)"))
                continue
            marks = " ".join("✓" if c["passed"] else "✗" for c in crit)
            v = r["decide"]["support"].get(st)
            print("%-36s %s   %s" % (r["name"][:36], marks,
                                     ("%d/%d" % (v["passed"], v["total"])) if v else ""))

    # ── 表 3.9：锚点余量（score vs profile 挖掘时的 margin；误判常见「刚好过线」）──
    prof_margin = {}
    try:
        _prof = M.load_profile(getattr(M, "PROFILE_DEFAULT", ""))
        for a in _prof["anchors"]:
            prof_margin[a["name"]] = a.get("margin")
    except Exception as e:                                   # noqa: BLE001
        sys.stderr.write(f"[calib] profile 读不到（{e}）——锚点 margin 列留空\n")

    def anchor_str(c):
        nm = c["name"].split("/", 1)[-1]
        anc = nm[len("anchor "):] if nm.startswith("anchor ") else nm
        try:
            sc = float(c["value"].split("=")[-1])
        except ValueError:
            sc = float("nan")
        m = prof_margin.get(anc)
        return "%s=%.3f(margin %s)%s" % (anc[:16], sc, ("%.4f" % m) if m is not None else "?",
                                         "" if c["passed"] else "✗")

    print("\n## 3.9 锚点判据（ANCHOR_THRESHOLD=%.2f；只列 any2 态与判定态）" % M.ANCHOR_THRESHOLD)
    seen_anchor = False
    for r in rows:
        per_state = {}
        for c in r["decide"]["criteria"]:
            if c["name"].split("/", 1)[-1].startswith("anchor "):
                per_state.setdefault(c["state"], []).append(c)
        parts = ["%s: %s" % (st, " ".join(anchor_str(c) for c in lst))
                 for st, lst in per_state.items()
                 if st in any2 or st == r["decide"]["state"]]
        if not parts:
            continue
        seen_anchor = True
        print("%-34s %s" % (r["name"][:34], " | ".join(parts)))
    if not seen_anchor:
        print("(本批无锚点判据 —— daemon 不可用，或用了 --no-anchors)")

    # ── 表 4：ACCEPT_SUPPORT 扫描（这一列决定陌生画面能否被拦住）────
    print("\n## 4. ACCEPT_SUPPORT 扫描：当前判出去的帧里，ratio < T 的会被判成 novel/low_support")
    print("%-8s %-10s %s" % ("T", "会被拒答", "明细（帧=判为 ratio ↑期望）"))
    for T in THRESHOLDS:
        hit = []
        for r in rows:
            d = r["decide"]
            if d["state"] in ("UNKNOWN", "AMBIGUOUS"):
                continue
            ratio = d["support"][d["state"]]["ratio"]
            if ratio < T - EPS:
                hit.append("%s=%s %.2f↑%s" % (r["name"][:24], d["state"], ratio, r["expect"] or "-"))
        print("%-8.3f %-10d %s" % (T, len(hit), "; ".join(hit) if hit else "-"))

    # ── 表 5：判据台账自检（criteria 必须能复算出 support）───────────
    bad = 0
    for r in rows:
        sup, crit = r["decide"]["support"], r["decide"]["criteria"]
        for st, v in sup.items():
            got = [c for c in crit if c["state"] == st]
            if len(got) != v["total"] or sum(1 for c in got if c["passed"]) != v["passed"]:
                bad += 1
                sys.stderr.write("[calib] ✗ 复算不一致: %s %s 台账=%d 条 support=%d/%d\n" % (
                    r["name"], st, len(got), v["passed"], v["total"]))
    print("\n## 5. 判据台账可复算: %s（criteria 按 state 分组 == support）" % (
        "PASS" if bad == 0 else "FAIL %d 处" % bad))

    # ── 表 6：分离性（真阳性 vs 误判成同一态的假阳性之间，有没有一条线）──
    print("\n## 6. 分离性检查（需要 --expect 标注真值；`可分` = 真阳性最差仍高于假阳性最好）")

    def metrics(r, st):
        sup = r["decide"]["support"].get(st, {})
        anc = [c for c in r["decide"]["criteria"]
               if c["state"] == st and c["name"].split("/", 1)[-1].startswith("anchor ")]
        sc = []
        for c in anc:
            try:
                sc.append(float(c["value"].split("=")[-1]))
            except ValueError:
                pass
        return sup.get("ratio", 0.0), (max(sc) if sc else None)

    for st in [s for s in M.STATES if s not in ("UNKNOWN", "AMBIGUOUS")]:
        tp = [r for r in rows if (r["expect"] or "") == st]
        fp = [r for r in rows if r["decide"]["state"] == st and (r["expect"] or "") != st]
        if not tp or not fp:
            continue
        tr = [metrics(r, st)[0] for r in tp]
        fr = [metrics(r, st)[0] for r in fp]
        ta = [metrics(r, st)[1] for r in tp]
        fa = [metrics(r, st)[1] for r in fp]
        ok_r = min(tr) > max(fr) + EPS
        ok_a = (all(x is not None for x in ta + fa)
                and min(ta) > max(fa) + EPS)
        print("%-9s ratio:  真 %s | 假 %s ⇒ %s" % (
            st, ["%.2f" % x for x in tr], ["%.2f" % x for x in fr], "可分" if ok_r else "**重叠**"))
        print("%-9s 锚点分: 真 %s | 假 %s ⇒ %s" % (
            "", ["-" if x is None else "%.3f" % x for x in ta],
            ["-" if x is None else "%.3f" % x for x in fa], "可分" if ok_a else "**重叠**"))

    elapsed = round(time.time() - t_all, 1)
    print("\nCALIB-RESULT frames=%d decided=%d unknown=%d novel=%d elapsed=%.1fs" % (
        len(rows), sum(1 for r in rows if r["decide"]["state"] not in ("UNKNOWN", "AMBIGUOUS")),
        sum(1 for r in rows if r["decide"]["state"] == "UNKNOWN"),
        sum(1 for r in rows if r["decide"]["novel"]), elapsed))

    if dump:
        with open(dump, "w", encoding="utf-8") as f:
            json.dump({r["name"]: {"path": r["frame"], "expect": r["expect"],
                                   "readings": r["readings"], "ms": r["ms"], "err": r["err"]}
                       for r in rows}, f, ensure_ascii=False, indent=1, sort_keys=True)
        print("[calib] readings 落盘 → %s" % dump)
    if json_out:
        with open(json_out, "w", encoding="utf-8") as f:
            json.dump({"generated": int(time.time()), "accept_support": M.ACCEPT_SUPPORT,
                       "min_criteria": M.MIN_CRITERIA, "rule": M.RULE,
                       "frames": {r["name"]: {"path": r["frame"], "expect": r["expect"],
                                              "ms": r["ms"], "err": r["err"],
                                              "decide": r["decide"],
                                              "readings": r["readings"]} for r in rows}},
                      f, ensure_ascii=False, indent=1, sort_keys=True)
        print("[calib] 全量落盘 → %s" % json_out)
    return 0 if bad == 0 else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
