#!/usr/bin/env python3
"""可配置状态包（state pack）—— 判据是数据，不是代码。

为什么有这个东西
----------------
`tools/ys-editor/ys-state` 把「什么画面算哪个状态」硬编码在代码里（`put("GAME_WORLD/A …")`）。
每接一个新任务就要改代码 ⇒ 等于为产品适配，违背「通用 GUI 模块」。本模块把判据搬进
JSON：一个任务一个包，模型可写、可版本化、可不改代码加载。

区域口径（**最容易错的一条**）
------------------------------
所有 region / bbox 一律 **xywh**（x, y, w, h），单位由包的 `coord_space` 声明：
  physical（2560×1440）/ logical（1707×960）。混用会让判据整体偏移且不报错。

用法
----
    python3 state_pack.py validate --pack packs/gn-start-v1.json
    python3 state_pack.py eval --pack packs/gn-start-v1.json --look /tmp/look.json
    python3 state_pack.py eval --pack ... --look ... --frame frame.png   # 需要像素谓词时
    python3 state_pack.py list --dir packs

退出码：0 通过 / 2 包非法或用法错 / 9 期望的 state 不一致（带 --expect-state）
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

SCHEMA = "gui.statepack/v1"
PREDICATE_TYPES = {
    "text_present", "text_absent",
    "object_count", "region_stat", "pixel_at",
}
MATCH_MODES = {"contains", "equals", "regex"}
RULES = {"all", "any", "any2"}


class PackError(Exception):
    pass


# ── 包加载与校验 ────────────────────────────────────────────────────────────

def _req(d, key, where):
    if key not in d:
        raise PackError(f"{where}: 缺字段 {key!r}")
    return d[key]


def _num4(v, where):
    if not (isinstance(v, (list, tuple)) and len(v) == 4 and all(isinstance(x, (int, float)) for x in v)):
        raise PackError(f"{where}: region 必须是 4 个数字 [x,y,w,h]，实际 {v!r}")
    return [int(x) for x in v]


def load_pack(path: str | Path) -> dict:
    p = Path(path)
    if not p.is_file():
        raise PackError(f"包不存在：{p}")
    try:
        pack = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise PackError(f"包不是合法 JSON：{p}：{e}") from e
    validate_pack(pack, source=str(p))
    return pack


def validate_pack(pack: dict, *, source: str = "<pack>") -> None:
    if pack.get("schema") not in (None, SCHEMA):
        raise PackError(f"{source}: schema 应为 {SCHEMA!r}")
    _req(pack, "pack", source)
    cs = _req(pack, "coord_space", source)
    if cs not in ("physical", "logical"):
        raise PackError(f"{source}: coord_space 必须是 physical/logical，实际 {cs!r}")

    states = _req(pack, "states", source)
    if not isinstance(states, list) or not states:
        raise PackError(f"{source}: states 必须是非空数组")
    seen = set()
    for i, st in enumerate(states):
        w = f"{source}.states[{i}]"
        sid = _req(st, "id", w)
        if sid in seen:
            raise PackError(f"{w}: 状态 id 重复 {sid!r}")
        seen.add(sid)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", str(sid)):
            raise PackError(f"{w}: id 必须是大写字母/数字/下划线，实际 {sid!r}")
        rule = st.get("rule", "all")
        if rule not in RULES:
            raise PackError(f"{w}: rule 必须是 {sorted(RULES)}，实际 {rule!r}")
        preds = _req(st, "predicates", w)
        if not isinstance(preds, list) or not preds:
            raise PackError(f"{w}: predicates 必须是非空数组")
        for j, pred in enumerate(preds):
            wp = f"{w}.predicates[{j}]"
            t = _req(pred, "type", wp)
            if t not in PREDICATE_TYPES:
                raise PackError(f"{wp}: type 必须是 {sorted(PREDICATE_TYPES)}，实际 {t!r}")
            if "region" in pred:
                _num4(pred["region"], wp)
            if t.startswith("text_"):
                texts = _req(pred, "texts", wp)
                if not isinstance(texts, list) or not texts:
                    raise PackError(f"{wp}: texts 必须是非空数组")
                m = pred.get("match", "contains")
                if m not in MATCH_MODES:
                    raise PackError(f"{wp}: match 必须是 {sorted(MATCH_MODES)}，实际 {m!r}")
            if t in ("object_count",):
                op = pred.get("op", "ge")
                if op not in ("ge", "le", "eq"):
                    raise PackError(f"{wp}: op 必须是 ge/le/eq")
                _req(pred, "value", wp)
            if t in ("region_stat", "pixel_at"):
                _req(pred, "region", wp)
            if t == "region_stat":
                stat = pred.get("stat", "mean_luma")
                if stat not in ("mean_luma", "mean_rgb", "std_luma", "dark_ratio", "bright_ratio"):
                    raise PackError(f"{wp}: stat 不支持 {stat!r}")
                op = pred.get("op", ">")
                if op not in (">", "<", ">=", "<="):
                    raise PackError(f"{wp}: op 必须是 > < >= <=，实际 {op!r}")
                _req(pred, "value", wp)


# ── 从 look 回执里取证据 ────────────────────────────────────────────────────

def _norm_text(s: str) -> str:
    return re.sub(r"\s+", "", str(s or "")).strip()


def collect_texts(payload: dict) -> list[dict]:
    """取带 bbox 的文字。summary 用 payload['texts']；全量用 objects[].text。"""
    out: list[dict] = []
    for t in payload.get("texts") or []:
        if isinstance(t, dict) and t.get("text"):
            out.append({"text": t["text"], "bbox": list(t.get("bbox") or []),
                        "source": t.get("source") or "texts"})
    # summary 回执里 objects 是**计数**（int），全量回执才是数组——两种都要吃
    objs = payload.get("objects")
    if isinstance(objs, list):
        for o in objs:
            if isinstance(o, dict) and o.get("text"):
                out.append({"text": o["text"], "bbox": list(o.get("bbox") or []),
                            "source": "object", "kind": o.get("kind")})
    return out


def _in_region(bbox, region) -> bool:
    if not bbox or len(bbox) != 4 or not region:
        return True
    bx, by, bw, bh = bbox[:4]
    rx, ry, rw, rh = region
    cx, cy = bx + bw / 2.0, by + bh / 2.0
    return rx <= cx <= rx + rw and ry <= cy <= ry + rh


def _match(text: str, pat: str, mode: str) -> bool:
    a, b = _norm_text(text), _norm_text(pat)
    if not b:
        return False
    if mode == "equals":
        return a == b
    if mode == "regex":
        try:
            return re.search(pat, text) is not None
        except re.error:
            return False
    return b in a


def _eval_text(pred, ctx, want_present: bool):
    region = pred.get("region")
    mode = pred.get("match", "contains")
    hits = []
    for t in ctx["texts"]:
        if not _in_region(t["bbox"], region):
            continue
        for pat in pred["texts"]:
            if _match(t["text"], pat, mode):
                hits.append({"text": t["text"], "pat": pat, "bbox": t["bbox"]})
                break
    need = int(pred.get("min_items", 1))
    passed = (len(hits) >= need) if want_present else (len(hits) == 0)
    return passed, {"type": "text_present" if want_present else "text_absent",
                    "hits": hits[:6], "hits_n": len(hits), "need": need,
                    "region": region, "texts": pred["texts"]}


def _eval_object_count(pred, ctx):
    region = pred.get("region")
    kinds = set(pred.get("kinds") or [])
    n = 0
    for o in ctx["objects"]:
        if kinds and o.get("kind") not in kinds:
            continue
        if not _in_region(o.get("bbox"), region):
            continue
        n += 1
    v = pred["value"]
    op = pred.get("op", "ge")
    passed = {"ge": n >= v, "le": n <= v, "eq": n == v}[op]
    return passed, {"type": "object_count", "count": n, "op": op, "value": v,
                    "kinds": sorted(kinds), "region": region}


def _eval_region_stat(pred, ctx):
    img = ctx.get("image")
    if img is None:
        return False, {"type": "region_stat", "error": "需要 --frame（像素谓词）"}
    x, y, w, h = _num4(pred["region"], "region_stat")
    crop = img.crop((x, y, x + w, y + h)).convert("RGB")
    px = list(crop.getdata())
    n = max(1, len(px))
    luma = [(0.299 * r + 0.587 * g + 0.114 * b) for r, g, b in px]
    stat = pred.get("stat", "mean_luma")
    if stat == "mean_luma":
        val = sum(luma) / n
    elif stat == "mean_rgb":
        val = [sum(c) / n for c in zip(*px)]
    elif stat == "std_luma":
        m = sum(luma) / n
        val = (sum((v - m) ** 2 for v in luma) / n) ** 0.5
    elif stat == "dark_ratio":
        val = sum(1 for v in luma if v < 40) / n
    else:  # bright_ratio
        val = sum(1 for v in luma if v > 200) / n
    op = pred.get("op", ">")
    target = pred["value"]
    if isinstance(val, list):
        passed = False
        # 列表值（mean_rgb）按逐通道比较前先折叠成均值
        val_cmp = sum(val) / len(val)
    else:
        val_cmp = val
    if not isinstance(val, list):
        passed = {">": val_cmp > target, "<": val_cmp < target,
                  ">=": val_cmp >= target, "<=": val_cmp <= target}[op]
    return passed, {"type": "region_stat", "stat": stat, "value": val_cmp,
                    "op": op, "target": target, "region": [x, y, w, h]}


def _eval_pixel_at(pred, ctx):
    img = ctx.get("image")
    if img is None:
        return False, {"type": "pixel_at", "error": "需要 --frame（像素谓词）"}
    pts = pred.get("points") or []
    tol = int(pred.get("tol", 12))
    want = pred.get("expect") or ""
    wr, wg, wb = _hex_rgb(want)
    rgb = img.convert("RGB")
    ok, seen = [], []
    for pt in pts:
        x, y = int(pt[0]), int(pt[1])
        r, g, b = rgb.getpixel((x, y))
        seen.append({"point": [x, y], "rgb": [r, g, b]})
        ok.append(abs(r - wr) <= tol and abs(g - wg) <= tol and abs(b - wb) <= tol)
    passed = bool(ok) and all(ok) if pred.get("all", True) else any(ok)
    return passed, {"type": "pixel_at", "expect": want, "tol": tol, "seen": seen, "passed_n": sum(ok)}


def _hex_rgb(s: str):
    s = s.lstrip("#")
    if len(s) != 6:
        raise PackError(f"像素谓词 expect 必须形如 #rrggbb，实际 {s!r}")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


# ── 求值 ────────────────────────────────────────────────────────────────────

def evaluate(payload: dict, pack: dict, *, frame_path: str | None = None) -> dict:
    t0 = time.perf_counter()
    _objs = payload.get("objects")
    ctx = {"texts": collect_texts(payload),
           "objects": _objs if isinstance(_objs, list) else [],
           "image": None}
    if frame_path:
        try:
            from PIL import Image  # 局部导入：无帧时不该拖慢
            ctx["image"] = Image.open(frame_path)
        except Exception as e:  # noqa: BLE001
            raise PackError(f"帧读不了：{frame_path}：{e}") from e

    accept = float(pack.get("accept_support", 0.6))
    support, evidence, ok_states = {}, [], []
    for st in pack["states"]:
        passed = total = 0
        preds_out = []
        for pred in st["predicates"]:
            t = pred["type"]
            if t == "text_present":
                ok, detail = _eval_text(pred, ctx, True)
            elif t == "text_absent":
                ok, detail = _eval_text(pred, ctx, False)
            elif t == "object_count":
                ok, detail = _eval_object_count(pred, ctx)
            elif t == "region_stat":
                ok, detail = _eval_region_stat(pred, ctx)
            else:
                ok, detail = _eval_pixel_at(pred, ctx)
            total += 1
            passed += 1 if ok else 0
            detail["passed"] = ok
            preds_out.append(detail)
        ratio = passed / total if total else 0.0
        rule = st.get("rule", "all")
        if rule == "all":
            ok = passed == total
        elif rule == "any":
            ok = passed >= 1
        else:  # any2
            ok = passed >= min(2, total)
        ok = bool(ok and ratio >= accept)
        support[st["id"]] = {"passed": passed, "total": total,
                             "ratio": round(ratio, 4), "ok": ok, "rule": rule,
                             "precedence": int(st.get("precedence", 0))}
        evidence.append({"state": st["id"], "predicates": preds_out})
        if ok:
            ok_states.append((int(st.get("precedence", 0)), st["id"]))

    state, ambiguous = None, []
    if ok_states:
        top = max(p for p, _ in ok_states)
        winners = [s for p, s in ok_states if p == top]
        if len(winners) > 1:
            ambiguous = sorted(winners)
        else:
            state = winners[0]

    return {
        "pack": pack.get("pack"),
        "coord_space": pack.get("coord_space"),
        "state": state,
        "ambiguous": ambiguous,
        "confidence": round(max((v["ratio"] for v in support.values()), default=0.0), 4),
        "support": support,
        "evidence": evidence,
        "frame_id": payload.get("frame_id"),
        "eval_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


# ── CLI ─────────────────────────────────────────────────────────────────────

def _cmd_validate(a) -> int:
    pack = load_pack(a.pack)
    print(json.dumps({"ok": True, "pack": pack["pack"], "states": [s["id"] for s in pack["states"]],
                      "coord_space": pack["coord_space"]}, ensure_ascii=False))
    return 0


def _cmd_eval(a) -> int:
    pack = load_pack(a.pack)
    payload = json.loads(Path(a.look).read_text(encoding="utf-8"))
    res = evaluate(payload, pack, frame_path=a.frame)
    print(json.dumps(res, ensure_ascii=False, indent=1))
    if a.expect_state is not None:
        return 0 if res["state"] == a.expect_state else 9
    return 0


def _cmd_list(a) -> int:
    d = Path(a.dir)
    rows = []
    for p in sorted(d.glob("*.json")):
        try:
            pack = load_pack(p)
            rows.append({"file": p.name, "pack": pack["pack"],
                         "states": [s["id"] for s in pack["states"]],
                         "coord_space": pack["coord_space"]})
        except PackError as e:
            rows.append({"file": p.name, "error": str(e)})
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="可配置状态包（判据即数据）")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("validate", help="校验包结构")
    p.add_argument("--pack", required=True)
    p.set_defaults(fn=_cmd_validate)

    p = sub.add_parser("eval", help="用包对一个 look 回执求值")
    p.add_argument("--pack", required=True)
    p.add_argument("--look", required=True, help="look 的 JSON 回执")
    p.add_argument("--frame", help="像素谓词需要的帧（PNG/BMP）")
    p.add_argument("--expect-state", help="期望状态；不一致返回 9")
    p.set_defaults(fn=_cmd_eval)

    p = sub.add_parser("list", help="列出目录里的包")
    p.add_argument("--dir", default=str(Path(__file__).parent / "packs"))
    p.set_defaults(fn=_cmd_list)

    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except PackError as e:
        print(json.dumps({"ok": False, "error": "PACK_INVALID", "detail": str(e)},
                         ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
