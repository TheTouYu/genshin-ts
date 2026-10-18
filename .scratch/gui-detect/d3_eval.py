#!/usr/bin/env python3
"""d3_eval.py — D3 结构层评测（容器归属 / parent 与节奏组 / 分开算）。

四个指标，逐帧 + 按族（编辑器 vs 游戏）汇总：
  container P/R/F1  —— truth `parent`：同一父的对象是否被 D3 判进同一个容器
  group     P/R/F1  —— truth `groups`（4 帧游戏界面有）：同一节奏组的对象是否同组
  kind      acc     —— D3 修正前(输入 kind) / 修正后 vs truth kind（只算 IoU≥0.5 匹配上的）
  pitch     相对误差  —— D3 的 pitch vs truth 参考 pitch
                        （有 groups 的帧取成员最多组的 geom.pitch；否则用 truth 行中位数）

用法：
  python3 .scratch/gui-detect/d3_eval.py \
      --pred-dir .scratch/gui-corpus/truth-v9-pred \
      --truth-dir .scratch/gui-corpus/truth-v9-fixed
  # 多族一起：
  python3 .scratch/gui-detect/d3_eval.py --all
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import d3_structure as D3          # noqa: E402
import d3_structure_v0 as V0       # noqa: E402

CORPUS = ".scratch/gui-corpus"


# ---------------------------------------------------------------- 匹配
def match(preds, truths, iou_thr=0.5):
    """一对一贪心匹配（按 IoU 降序）。返回 [(pred, truth, iou)]。"""
    cand = []
    for p in preds:
        for t in truths:
            v = D3.iou(p["bbox"], t["bbox"])
            if v >= iou_thr:
                cand.append((v, p, t))
    cand.sort(key=lambda c: -c[0])
    used_p, used_t, out = set(), set(), []
    for v, p, t in cand:
        if id(p) in used_p or id(t) in used_t:
            continue
        used_p.add(id(p))
        used_t.add(id(t))
        out.append((p, t, v))
    return out


# ---------------------------------------------------------------- 指标
def pair_scores(pred_gid, truth_gid, ids):
    """给定两个 {oid:gid} 映射，算配对 P/R/F1。"""
    tp = fp = fn = 0
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            ta, tb = truth_gid.get(a), truth_gid.get(b)
            pa, pb = pred_gid.get(a), pred_gid.get(b)
            tsame = ta is not None and ta == tb
            psame = pa is not None and pa == pb
            if tsame and psame:
                tp += 1
            elif psame:
                fp += 1
            elif tsame:
                fn += 1
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return {"p": p, "r": r, "f1": f, "tp": tp, "fp": fp, "fn": fn}


def frame_family(truth, path):
    fam = str((truth.get("_provenance") or {}).get("family") or "")
    if "编辑器" in fam or "editor" in path:
        return "editor"
    return "game"


REF_PITCH = {"r028": 48.0}   # 任务给定（标注员实测编辑器属性面板行距）


def truth_ref_pitch(truth, stem=""):
    """参考 pitch：有 groups 取"成员最多、且有 geom.pitch"的组；
    否则查 REF_PITCH 表（r028=48.0）；都没有 → None（不评）。"""
    groups = truth.get("groups") or []
    best = None
    for g in groups:
        gp = g.get("geom") or {}
        p = gp.get("pitch") or gp.get("row_pitch")
        if p and (best is None or len(g.get("members") or []) > len(best[0].get("members") or [])):
            best = (g, float(p))
    if best:
        return round(best[1], 2), f"group:{best[0].get('id')}"
    for k, v in REF_PITCH.items():
        if stem.startswith(k):
            return v, "task_ref"
    return None, None


def load_dir(d):
    out = {}
    for f in sorted(glob.glob(os.path.join(d, "*.json"))):
        if os.path.basename(f).startswith("_"):
            continue
        j = json.load(open(f, encoding="utf-8"))
        if j.get("objects"):
            out[os.path.splitext(os.path.basename(f))[0]] = j
    return out


def eval_pair(pred_dir, truth_dir):
    """返回逐帧读数列表。"""
    truths = load_dir(truth_dir)
    preds = load_dir(pred_dir)
    rows = []
    for stem, truth in truths.items():
        pred = preds.get(stem)
        if not pred:
            continue
        fam = frame_family(truth, truth_dir)
        res = D3.analyze(pred)
        res0 = V0.analyze(pred)
        m = match(pred["objects"], truth["objects"])
        pmap = {str(p["id"]): p for p in pred["objects"]}
        tmap = {str(t["id"]): t for t in truth["objects"]}
        matched_pred = {str(p["id"]): t for p, t, _ in m}
        matched_truth = {str(t["id"]): p for p, t, _ in m}

        # ---- 容器归属（parent）
        parent_truth = {}
        for t in truth["objects"]:
            if t.get("parent") is not None:
                parent_truth[str(t["id"])] = "p:" + str(t["parent"])
        # 父是容器框，取父对象本身的 kind/bbox 无需；只要分组
        cont_pred = {}
        for pid in matched_pred:
            gid = res["container_of"].get(pid) or res["group_of"].get(pid)
            cont_pred[pid] = gid or "solo:" + pid
        cont_ids = list(cont_pred)
        cont_truth = {tid: parent_truth[tid] for tid in cont_ids if tid in parent_truth}
        cp = pair_scores(cont_pred, cont_truth, cont_ids)

        # ---- 节奏组（truth groups，只有 4 帧游戏界面有）
        gp = {"p": None, "r": None, "f1": None, "tp": 0, "fp": 0, "fn": 0}
        tgroups = truth.get("groups") or []
        if tgroups:
            tg = {}
            for g in tgroups:
                for mid in g.get("members") or []:
                    tg.setdefault(str(mid), set()).add(g["id"])
            truth_g = {}
            for tid in matched_truth:
                gs = tg.get(tid)
                if gs:
                    truth_g[tid] = "|".join(sorted(gs))
            pred_g = {}
            for pid in matched_pred:
                gid = res["group_of"].get(pid) or res["container_of"].get(pid)
                pred_g[pid] = gid or "solo:" + pid
            ids = [i for i in pred_g if i in truth_g]
            gp = pair_scores(pred_g, truth_g, ids)

        # ---- kind
        acc_before = acc_after = 0
        fixmap = {str(f["id"]): f["kind_after"] for f in res["kind_fixes"]}
        nk = 0
        conf = {}
        for pid, t in matched_pred.items():
            pk = pmap[pid].get("kind")
            tk = t.get("kind")
            if not tk:
                continue
            nk += 1
            if pk == tk:
                acc_before += 1
            if fixmap.get(pid, pk) == tk:
                acc_after += 1
            if fixmap.get(pid, pk) != pk or pk != tk:
                conf[(pk, fixmap.get(pid, pk), tk)] = conf.get((pk, fixmap.get(pid, pk), tk), 0) + 1

        # ---- pitch
        ref, ref_src = truth_ref_pitch(truth, stem)
        p1 = res["pitch"]
        p0 = res0["pitch"]
        err = round(abs(p1 - ref) / ref * 100, 1) if (p1 and ref) else None
        err0 = round(abs(p0 - ref) / ref * 100, 1) if (p0 and ref) else None

        # ---- 逐组 pitch（truth groups × D3 chains 按成员重叠配对）
        gpitch = []
        if tgroups:
            tid2pid = {str(t["id"]): str(p["id"]) for p, t, _ in m}
            chain_members = []
            for c in res["chains"]:
                chain_members.append((c, set(c["members"])))
            for g in tgroups:
                # grid 真值给两个轴：col_pitch / row_pitch —— 拿 D3 的链去对**较近的那个轴**
                gmg = g.get("geom") or {}
                gcands = [x for x in (gmg.get("pitch"), gmg.get("row_pitch"),
                                      gmg.get("col_pitch")) if x]
                if not gcands:
                    continue
                pids = {tid2pid[str(mid)] for mid in (g.get("members") or []) if str(mid) in tid2pid}
                if not pids:
                    continue
                bestc, bestov = None, 0
                for c, mem in chain_members:
                    ov = len(pids & mem)
                    if ov > bestov:
                        bestc, bestov = c, ov
                if bestc and bestov >= 0.5 * len(pids) and bestc.get("pitch"):
                    gpitch.append(min(abs(bestc["pitch"] - gt) / gt * 100 for gt in gcands))

        # ---- 槽位：D2 漏检行 vs D3 补槽
        slots = res["missing_slots"]
        if ref:
            miss = missed_rows(truth, matched_truth, ref)
            hit = 0
            used = set()
            for s in slots:
                for k, cy in enumerate(miss):
                    if k in used:
                        continue
                    if abs(s["y"] - cy) <= max(0.4 * ref, 14):
                        hit += 1
                        used.add(k)
                        break
            slot_hit, slot_n, miss_n = hit, len(slots), len(miss)
        else:
            slot_hit, slot_n, miss_n = 0, len(slots), 0

        rows.append({"frame": stem, "family": fam, "n_pred": len(pred["objects"]),
                     "n_truth": len(truth["objects"]), "matched": len(m),
                     "container": cp, "group": gp,
                     "kind_before": round(acc_before / nk, 3) if nk else None,
                     "kind_after": round(acc_after / nk, 3) if nk else None,
                     "n_kind": nk, "conf": conf,
                     "pitch_ref": ref, "pitch_ref_src": ref_src,
                     "pitch": p1, "pitch_v0": p0, "pitch_err": err, "pitch_err_v0": err0,
                     "group_pitch_err": round(D3._med(gpitch), 1) if gpitch else None,
                     "group_pitch_n": len(gpitch),
                     "group_pitch_le5": sum(1 for e in gpitch if e <= 5.0),
                     "slots_hit": slot_hit, "slots_n": slot_n, "miss_rows": miss_n})
    return rows


def missed_rows(truth, matched_truth, pitch):
    """truth 里"有对象但 D2 没匹配到"的行带（按 y 聚类，≥2 成员）。"""
    rows = D3.cluster_rows(truth["objects"], min_members=1)
    miss = []
    for r in rows:
        ids = [str(o["id"]) for o in r]
        if len(ids) < 2:
            continue
        if not any(i in matched_truth for i in ids):
            miss.append(sum(o["bbox"][1] + o["bbox"][3] / 2 for o in r) / len(r))
    return miss


def summarize(rows, key):
    agg = {}
    for r in rows:
        k = r["family"]
        a = agg.setdefault(k, {"n": 0, "cp": [0, 0, 0], "gp": [0, 0, 0], "kb": 0, "ka": 0,
                               "nk": 0, "perr": [], "perr0": [], "slots_hit": 0,
                               "slots_n": 0, "miss": 0, "matched": 0, "n_pred": 0,
                               "gpe": [], "gpe_le5": 0, "gpe_n": 0})
        a["n"] += 1
        a["cp"][0] += r["container"]["tp"]
        a["cp"][1] += r["container"]["fp"]
        a["cp"][2] += r["container"]["fn"]
        if r["group"]["f1"] is not None:
            a["gp"][0] += r["group"]["tp"]
            a["gp"][1] += r["group"]["fp"]
            a["gp"][2] += r["group"]["fn"]
        a["kb"] += (r["kind_before"] or 0) * r["n_kind"]
        a["ka"] += (r["kind_after"] or 0) * r["n_kind"]
        a["nk"] += r["n_kind"]
        if r["pitch_err"] is not None:
            a["perr"].append(r["pitch_err"])
        if r["pitch_err_v0"] is not None:
            a["perr0"].append(r["pitch_err_v0"])
        a["slots_hit"] += r["slots_hit"]
        a["slots_n"] += r["slots_n"]
        a["miss"] += r["miss_rows"]
        a["matched"] += r["matched"]
        a["n_pred"] += r["n_pred"]
        if r.get("group_pitch_err") is not None:
            a["gpe"].append(r["group_pitch_err"])
            a["gpe_le5"] += r["group_pitch_le5"]
            a["gpe_n"] += r["group_pitch_n"]
    out = {}
    for k, a in agg.items():
        tp, fp, fn = a["cp"]
        cp = {"p": tp / (tp + fp) if tp + fp else 0, "r": tp / (tp + fn) if tp + fn else 0,
              "f1": 2 * tp / (2 * tp + fp + fn) if tp else 0}
        tp, fp, fn = a["gp"]
        gp = {"p": tp / (tp + fp) if tp + fp else None,
              "r": tp / (tp + fn) if tp + fn else None,
              "f1": 2 * tp / (2 * tp + fp + fn) if tp else None}
        out[k] = {"frames": a["n"], "matched": a["matched"], "n_pred": a["n_pred"],
                  "container": cp, "group": gp,
                  "kind_before": a["kb"] / a["nk"] if a["nk"] else None,
                  "kind_after": a["ka"] / a["nk"] if a["nk"] else None,
                  "pitch_err_med": D3._med(a["perr"]) if a["perr"] else None,
                  "pitch_err_max": max(a["perr"]) if a["perr"] else None,
                  "pitch_err_med_v0": D3._med(a["perr0"]) if a["perr0"] else None,
                  "slot_hit": a["slots_hit"], "slot_n": a["slots_n"], "miss_rows": a["miss"],
                  "group_pitch_err_med": D3._med(a["gpe"]) if a["gpe"] else None,
                  "group_pitch_le5": a["gpe_le5"], "group_pitch_n": a["gpe_n"]}
    return out


def show(rows, title):
    print(f"\n=== {title} ===")
    hdr = (f"{'frame':<22}{'fam':<7}{'pred':>5}{'hit':>5}{'contP':>7}{'contR':>7}{'contF1':>7}"
           f"{'grpP':>6}{'grpR':>6}{'grpF1':>6}{'kPre':>6}{'kPost':>6}{'pRef':>7}{'pD3':>7}"
           f"{'err%':>7}{'err0%':>7}{'gErr%':>7}{'g<=5':>7}{'slot':>6}")
    print(hdr)
    for r in rows:
        c, g = r["container"], r["group"]
        print(f"{r['frame'][:21]:<22}{r['family']:<7}{r['n_pred']:>5}{r['matched']:>5}"
              f"{c['p']:>7.2f}{c['r']:>7.2f}{c['f1']:>7.2f}"
              f"{('-' if g['p'] is None else f'{g['p']:.2f}'):>6}"
              f"{('-' if g['r'] is None else f'{g['r']:.2f}'):>6}"
              f"{('-' if g['f1'] is None else f'{g['f1']:.2f}'):>6}"
              f"{(r['kind_before'] if r['kind_before'] is not None else 0):>6.2f}"
              f"{(r['kind_after'] if r['kind_after'] is not None else 0):>6.2f}"
              f"{(r['pitch_ref'] or 0):>7.1f}"
              f"{(r['pitch'] or 0):>7.1f}"
              f"{('-' if r['pitch_err'] is None else f'{r['pitch_err']:.1f}'):>7}"
              f"{('-' if r['pitch_err_v0'] is None else f'{r['pitch_err_v0']:.1f}'):>7}"
              f"{('-' if r.get('group_pitch_err') is None else f'{r['group_pitch_err']:.1f}'):>7}"
              f"{(f";{r['group_pitch_le5']}/{r['group_pitch_n']}" if r.get('group_pitch_n') else '-'):>7}"
              f"{r['slots_hit']:>3}/{r['slots_n']:<2}")
    s = summarize(rows, None)
    for fam, a in s.items():
        c, g = a["container"], a["group"]
        print(f"{'-- ' + fam:<22}{'':<7}{a['n_pred']:>5}{a['matched']:>5}"
              f"{c['p']:>7.2f}{c['r']:>7.2f}{c['f1']:>7.2f}"
              f"{('-' if g['p'] is None else f'{g['p']:.2f}'):>6}"
              f"{('-' if g['r'] is None else f'{g['r']:.2f}'):>6}"
              f"{('-' if g['f1'] is None else f'{g['f1']:.2f}'):>6}"
              f"{(a['kind_before'] or 0):>6.2f}{(a['kind_after'] or 0):>6.2f}"
              f"{'':>7}{'':>7}"
              f"{('-' if a['pitch_err_med'] is None else f'{a['pitch_err_med']:.1f}'):>7}"
              f"{('-' if a['pitch_err_med_v0'] is None else f'{a['pitch_err_med_v0']:.1f}'):>7}"
              f"{('-' if a['group_pitch_err_med'] is None else f'{a['group_pitch_err_med']:.1f}'):>7}"
              f"{(f";{a['group_pitch_le5']}/{a['group_pitch_n']}" if a.get('group_pitch_n') else '-'):>7}"
              f"{a['slot_hit']:>3}/{a['slot_n']:<2}")
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred-dir")
    ap.add_argument("--truth-dir")
    ap.add_argument("--all", action="store_true", help="跑三族（v9-fixed / v8-editor / v8-game）")
    ap.add_argument("--json-out", default="")
    a = ap.parse_args()
    jobs = []
    if a.all:
        jobs = [(f"{CORPUS}/truth-v9-pred", f"{CORPUS}/truth-v9-fixed"),
                (f"{CORPUS}/truth-v9-pred", f"{CORPUS}/truth-v8-editor"),
                (f"{CORPUS}/truth-v9-pred", f"{CORPUS}/truth-v8-game")]
        # v8 两族的帧不在 v9-pred 里 → 用 truth 自身对象当输入（干净输入上界）
        jobs = [(f"{CORPUS}/truth-v9-fixed", f"{CORPUS}/truth-v9-fixed"),
                (f"{CORPUS}/truth-v8-editor", f"{CORPUS}/truth-v8-editor"),
                (f"{CORPUS}/truth-v8-game", f"{CORPUS}/truth-v8-game")]
    else:
        jobs = [(a.pred_dir, a.truth_dir)]
    allrows = []
    for pred_dir, truth_dir in jobs:
        rows = eval_pair(pred_dir, truth_dir)
        allrows.extend(rows)
        show(rows, f"{os.path.basename(pred_dir)} → {os.path.basename(truth_dir)}")
    print()
    show(allrows, "ALL")
    if a.json_out:
        json.dump(allrows, open(a.json_out, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1, default=str)
        print("->", a.json_out)


if __name__ == "__main__":
    main()
