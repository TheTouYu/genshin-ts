#!/usr/bin/env python3
"""schema.py — GUI 世界状态 schema v0（对齐 `.scratch/gui-stack/AGI-BAR.md` §四）。

设计约束（AGI-BAR §三/§四，2026-10-18 用户裁决「A 形态」）：
  1. **一个 schema**：look / act / wait_until 三个动词共用本模块定义的世界状态，
     不再有"每个工具一套 JSON"。
  2. **结构不猜语义**：`kind` 只描述形状/角色（tile/card/button/row/panel/chip/icon/avatar/unknown）；
     判不出来的字段填 null / "unknown"，并列进 `degraded`，不编。
  3. **每对象必带 evidence**：没有 evidence 的对象视为 schema 违规（拒绝出关，fail-closed）。
  4. 状态名词表**单一源** = `tools/ys-editor/ys-state` 的 `STATES`（本模块只读取，不复制判据）。

与 AGI-BAR v0 的已知差异（v0 实现；文档 `docs/architecture/gui-world-state.md` 有对照表）：
  - `objects[].id` 沿用 ys-screen 的字符串 id（"c3"），不重编号 —— 保证 evidence 可回溯；
  - `badges[].type` 目前是**形状角色** `alert`（ys-screen 的语义），不是 AGI-BAR 列举的语义态
    （red/scroll/crown/claimed/lastopen）—— L3 未实现前不假装；
  - `groups[]` / `slices[]` 在 v0 恒为空数组（L2 / 切片未实现，如实留空而不是编造）；
  - bbox **统一 xywh**；ys-screen 的 glyph/badge bbox 是 xyxy，本模块负责归一化；
  - `state.selected/focused/disabled` 在 L3 未实现前为 null（未知），并由调用方写 degraded。

用法：
    from schema import WorldState, validate_world, state_vocabulary
    raw = {...}                      # 由 worldsvc 组装
    ws = WorldState(raw)             # 构造即校验；不合法抛 SchemaError
    ws.raw / ws.objects / ws.frame_id / ws.find_object("c3")
"""
from __future__ import annotations

import hashlib
import json
import os
import re

SCHEMA_ID = "gui-world-state/0"

# 预算门禁（AGI-BAR §一）：单次默认路径 ≤50ms、对象检测 ≤10ms、分块 OCR 总耗时预算。
# 这是**契约里声明的预算**，实际耗时另见 timing_ms；超预算 ⇒ degraded BUDGET_EXCEEDED。
BUDGET_DEFAULT_MS = {"total": 50, "detect": 10, "ocr": 0}

KINDS = ("tile", "card", "button", "row", "panel", "chip", "icon", "avatar", "unknown")
GROUP_ROLES = ("section", "row", "grid", "tabs")
BADGE_TYPES = ("alert", "scroll", "crown", "claimed", "lastopen")
AFFORDANCE_VALUES = ("yes", "no", "unknown")
CLIP_EDGES = ("left", "top", "right", "bottom")
STATE_CHANNELS = ("fast", "full")
TEXT_SOURCES = ("slice-ocr", "fullframe")
DEGRADED_CODES = (
    "BUDGET_EXCEEDED", "OBJECTS_DEGRADED", "STATE_UNKNOWN", "STALE_FRAME",
    "LIVE_NOT_ATOP", "STATE_VOCAB_UNVERIFIED", "FREE_TEXT_UNOWNED", "PARENT_DANGLING",
    "KIND_UNKNOWN", "L3_NOT_IMPLEMENTED", "L2_NOT_IMPLEMENTED", "ABSENCE_SINGLE_FRAME",
    "CACHE_MISS", "INSTRUMENT_FAIL", "SCHEMA_EXTRA_KEY", "ACT_POST_REQUIRED",
    "FOCUS_REQUIRED", "INJECTION_BLOCKED", "AFFORDANCE_UNKNOWN", "TARGET_UNSTABLE",
    "FRAME_PINNED", "NO_FRESH_FRAME", "WAIT_TIMEOUT_VALID",
)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
YS_STATE_PATH = os.path.join(_REPO_ROOT, "tools", "ys-editor", "ys-state")

_STATE_VOCAB_CACHE = None


class SchemaError(ValueError):
    """世界状态不合法（fail-closed：调用方必须停下来，不许把坏状态喂给 act/wait）。"""

    def __init__(self, problems):
        self.problems = list(problems)
        super().__init__("world-state schema 违规：\n  - " + "\n  - ".join(self.problems))


def repo_root():
    return _REPO_ROOT


def now_ms():
    import time
    return int(time.time() * 1000)


def frame_id_of(path):
    """内容寻址：sha256:… —— 同一帧只算一次，缓存/切片/证据共用。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def normalize_text(s):
    """文本比对口径（与 tools/ys-find 一致）：NFKC → 去所有空白 → casefold，不做模糊。"""
    import unicodedata
    return "".join(unicodedata.normalize("NFKC", str(s)).split()).casefold()


def state_vocabulary(state_path=None):
    """状态名词表：**只读** ys-state 的 STATES 元组（单一源）。读不到返回 ()。"""
    global _STATE_VOCAB_CACHE
    if _STATE_VOCAB_CACHE is not None and state_path is None:
        return _STATE_VOCAB_CACHE
    path = state_path or YS_STATE_PATH
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        names = ()
    else:
        m = re.search(r"^STATES\s*=\s*\((.*?)\)", text, re.S | re.M)
        names = tuple(re.findall(r'"([A-Z][A-Z0-9_]*)"', m.group(1))) if m else ()
    if state_path is None:
        _STATE_VOCAB_CACHE = names
    return names


# ── bbox 归一化 ────────────────────────────────────────────────────────────

def _ints4(v):
    return [int(round(float(x))) for x in v]


def xyxy_to_xywh(bb):
    """ys-screen 的 glyph/badge bbox 是 [x0,y0,x1,y1] → schema 的 [x,y,w,h]。"""
    x0, y0, x1, y1 = _ints4(bb)
    return [x0, y0, max(0, x1 - x0), max(0, y1 - y0)]


def glyph_from_instrument(g):
    return {
        "bbox": xyxy_to_xywh(g.get("bbox") or [0, 0, 0, 0]),
        "role": g.get("role") or "unknown",
        "fill": g.get("fill"),
        "contrast": g.get("contrast"),
    }


def badge_from_instrument(b):
    return {
        "type": b.get("kind") or b.get("type") or "unknown",   # ys-screen 目前只产 "alert"（形状角色）
        "color": b.get("color"),
        "bbox": xyxy_to_xywh(b.get("bbox") or [0, 0, 0, 0]),
        "corner": b.get("corner"),
    }


def object_from_container(c, *, frame_id, text_source="fullframe"):
    """ys-screen container → schema object。**只搬运 + 归一化，不新增语义**。"""
    aff = c.get("affordance") or {}
    ev = c.get("evidence")
    if isinstance(ev, dict):
        evidence = dict(ev)
    elif ev is None:
        evidence = {}
    else:
        evidence = {"raw": ev}
    evidence.setdefault("source", "ys-screen/containers")
    evidence.setdefault("frame_id", frame_id)
    clipped = c.get("clipped") or {}
    return {
        "id": str(c.get("id")),
        "parent": None if c.get("parent") is None else str(c.get("parent")),
        # ⚠️ ys-screen 的容器/glyph/badge bbox 都是 [x0,y0,x1,y1]（cv2 stats 的 x,y,x+w,y+h）。
        # 2026-10-18 实测踩过：把容器 bbox 当 xywh 直接算中心，点击点落到 y=1647（帧高 1440）——
        # 由 act 的"点击点必须在帧内"断言抓出来。所有 bbox 一律在 schema 入口归一化成 xywh。
        "bbox": xyxy_to_xywh(c.get("bbox") or [0, 0, 0, 0]),
        "kind": c.get("kind") if c.get("kind") in KINDS else "unknown",
        "text": [str(t) for t in (c.get("text") or [])],
        "text_source": text_source if text_source in TEXT_SOURCES else "fullframe",
        "glyphs": [glyph_from_instrument(g) for g in (c.get("glyphs") or [])],
        "badges": [badge_from_instrument(b) for b in (c.get("badges") or [])],
        "state": {"selected": None, "focused": None, "disabled": None},
        "affordance": {
            "clickable": aff.get("clickable") if aff.get("clickable") in AFFORDANCE_VALUES else "unknown",
            "evidence": [str(e) for e in (aff.get("evidence") or [])],
        },
        "clipped": {
            "edges": [e for e in (clipped.get("edges") or []) if e in CLIP_EDGES],
            "cut_by": clipped.get("cut_by"),
            "px": int(clipped.get("px") or 0),
        },
        "confidence": round(float(c.get("confidence") or 0.0), 4),
        "evidence": evidence,
    }


# ── 组装与校验 ─────────────────────────────────────────────────────────────

def object_from_detection(d, *, frame_id):
    """D2 学习型检测框 → schema object。**与容器不同源，不新增语义**。

    为什么需要它（2026-10-19 实测）：在**三维游戏世界**里，CV 的 `flat+rect` 容器规则一个都命中不了
    （圆形小地图/头像/技能键都不是平坦矩形皮肤）⇒ `containers=0`，而 D2 在同一帧给 29 个框。
    不接这层，`look()` 在世界里就是"什么都看不见"。

    与 `object_from_container` 的差异（必须显式记住）：
      · **bbox 已是 xywh**（gui_det 输出即 xywh），不做 xyxy 转换——两套口径混用会让框整体错位；
      · 没有文本、没有皮肤/角标/裁切判据 ⇒ 全部给空，`evidence.source="gui_det"` 标明来源；
      · 可点性一律 `unknown`（fail-closed，不拿"检测到了"冒充"能点"）；
      · `confidence` 是模型分数，不是容器层的几何置信度，两者不可直接比大小。
    """
    b = [float(v) for v in (d.get("bbox") or [0, 0, 0, 0])[:4]]
    while len(b) < 4:
        b.append(0.0)
    return {
        "id": "det:%s" % d.get("id"),
        "parent": None,
        "bbox": [b[0], b[1], b[2], b[3]],
        "kind": d.get("kind") if d.get("kind") in KINDS else "unknown",
        "text": [],
        "text_source": "fullframe",
        "glyphs": [],
        "badges": [],
        "state": {"selected": None, "focused": None, "disabled": None},
        "affordance": {"clickable": "unknown", "evidence": []},
        "clipped": {"edges": [], "cut_by": None, "px": 0},
        "confidence": round(float(d.get("score") or 0.0), 4),
        "evidence": {"source": "gui_det", "frame_id": frame_id},
    }


def new_world(*, frame_id, captured_at_ms, state, objects=(), groups=(), slices=(),
              transitions=(), budget_ms=None, degraded=(), timing_ms=None, frame=None,
              free_text=(), uncertainty=()):
    """组装 world-state dict。字段名严格用 AGI-BAR §四 的名字（扩展字段另行标注）。"""
    return {
        "schema": SCHEMA_ID,
        "frame_id": frame_id,
        "captured_at_ms": int(captured_at_ms),
        "tracked_at_ms": now_ms(),
        "state": state,
        "objects": list(objects),
        "groups": list(groups),
        "slices": list(slices),
        "transitions": list(transitions),
        "budget_ms": dict(budget_ms or BUDGET_DEFAULT_MS),
        "degraded": [d if isinstance(d, dict) else {"code": str(d), "detail": ""}
                     for d in degraded],
        # ── 以下为 v0 扩展字段（AGI-BAR 未列，但 act/wait/bench 需要）──
        "timing_ms": timing_ms or {},
        "frame": frame or {},
        "free_text": list(free_text),
        # v0 扩展：感知层自报"我拿不准"的区域（ys-screen uncertainty[]，2026-10-19）
        "uncertainty": list(uncertainty),
    }


_TOP_REQUIRED = ("schema", "frame_id", "captured_at_ms", "state", "objects", "groups",
                 "slices", "transitions", "budget_ms", "degraded")
_TOP_ALLOWED = set(_TOP_REQUIRED) | {"tracked_at_ms", "timing_ms", "frame", "free_text",
                                    "attribution", "uncertainty"}
_OBJ_REQUIRED = ("id", "parent", "bbox", "kind", "text", "text_source", "glyphs", "badges",
                 "state", "affordance", "clipped", "confidence", "evidence")


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_world(raw, *, strict_state_names=False):
    """结构校验。任何违规抛 SchemaError（一次性列出全部问题）。返回 {warnings, objects_by_id}。"""
    problems = []
    warnings = []

    if not isinstance(raw, dict):
        raise SchemaError([f"world 必须是 dict，实际 {type(raw).__name__}"])
    missing = [k for k in _TOP_REQUIRED if k not in raw]
    if missing:
        raise SchemaError([f"缺字段 {k}" for k in missing])

    if raw.get("schema") != SCHEMA_ID:
        problems.append(f"schema 应为 {SCHEMA_ID!r}，实际 {raw.get('schema')!r}")
    fid = raw.get("frame_id")
    if not isinstance(fid, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", fid):
        problems.append(f"frame_id 必须是 'sha256:<64 hex>'，实际 {fid!r}")
    if not isinstance(raw.get("captured_at_ms"), int) or raw["captured_at_ms"] <= 0:
        problems.append(f"captured_at_ms 必须是正整数，实际 {raw.get('captured_at_ms')!r}")

    extra = sorted(set(raw) - _TOP_ALLOWED)
    if extra:
        warnings.append("顶层扩展字段：" + ", ".join(extra))

    # ── state ──
    st = raw.get("state")
    if not isinstance(st, dict):
        problems.append("state 必须是 dict{name,evidence,channel}")
    else:
        if not isinstance(st.get("name"), str) or not st.get("name"):
            problems.append("state.name 必须是非空字符串")
        elif strict_state_names:
            vocab = state_vocabulary()
            if vocab and st["name"] not in vocab:
                problems.append(f"state.name={st['name']!r} 不在 ys-state 状态名词表 {vocab}")
        if not isinstance(st.get("evidence"), list) or not st.get("evidence"):
            problems.append("state.evidence 必须是非空 list（不许无证据断言状态）")
        if st.get("channel") not in STATE_CHANNELS:
            problems.append(f"state.channel 必须是 {STATE_CHANNELS}，实际 {st.get('channel')!r}")

    # ── budget ──
    bud = raw.get("budget_ms")
    if not isinstance(bud, dict) or any(k not in bud for k in ("total", "detect", "ocr")):
        problems.append("budget_ms 必须含 total/detect/ocr")
    else:
        for k in ("total", "detect", "ocr"):
            if not _is_num(bud[k]) or bud[k] < 0:
                problems.append(f"budget_ms.{k} 必须是非负数，实际 {bud[k]!r}")

    # ── degraded ──
    deg = raw.get("degraded")
    if not isinstance(deg, list):
        problems.append("degraded 必须是 list")
        deg = []
    for i, d in enumerate(deg):
        if not isinstance(d, dict) or not isinstance(d.get("code"), str) or not d["code"]:
            problems.append(f"degraded[{i}] 必须是 {{code, detail}}")
        elif d["code"] not in DEGRADED_CODES:
            warnings.append(f"degraded[{i}].code={d['code']!r} 未登记（允许但应补登记）")

    # ── objects ──
    objs = raw.get("objects")
    if not isinstance(objs, list):
        problems.append("objects 必须是 list")
        objs = []
    by_id = {}
    for i, o in enumerate(objs):
        where = f"objects[{i}]"
        if not isinstance(o, dict):
            problems.append(f"{where} 必须是 dict")
            continue
        oid = o.get("id")
        if not isinstance(oid, (str, int)) or isinstance(oid, bool) or str(oid) == "":
            problems.append(f"{where}.id 必须是非空 str/int")
            continue
        oid = str(oid)
        if oid in by_id:
            problems.append(f"{where}.id={oid!r} 重复")
        by_id[oid] = o
        for k in _OBJ_REQUIRED:
            if k not in o:
                problems.append(f"{where}({oid}) 缺字段 {k}")
        bb = o.get("bbox")
        if not isinstance(bb, list) or len(bb) != 4 or not all(_is_num(v) for v in bb):
            problems.append(f"{where}({oid}).bbox 必须是 4 个数字 [x,y,w,h]")
        elif bb[2] <= 0 or bb[3] <= 0:
            problems.append(f"{where}({oid}).bbox 宽高必须 > 0，实际 {bb}")
        if o.get("kind") not in KINDS:
            problems.append(f"{where}({oid}).kind={o.get('kind')!r} 不在 {KINDS}")
        if not isinstance(o.get("text"), list) or not all(isinstance(t, str) for t in o["text"]):
            problems.append(f"{where}({oid}).text 必须是 str list")
        if o.get("text_source") not in TEXT_SOURCES:
            problems.append(f"{where}({oid}).text_source 必须是 {TEXT_SOURCES}")
        for k in ("glyphs", "badges"):
            if not isinstance(o.get(k), list):
                problems.append(f"{where}({oid}).{k} 必须是 list")
        ostate = o.get("state")
        if not isinstance(ostate, dict):
            problems.append(f"{where}({oid}).state 必须是 dict")
        else:
            for k in ("selected", "focused", "disabled"):
                if ostate.get(k) not in (True, False, None):
                    problems.append(f"{where}({oid}).state.{k} 必须是 bool|null（未知就 null）")
        aff = o.get("affordance")
        if not isinstance(aff, dict) or aff.get("clickable") not in AFFORDANCE_VALUES:
            problems.append(f"{where}({oid}).affordance.clickable 必须是 {AFFORDANCE_VALUES}")
        elif not isinstance(aff.get("evidence"), list):
            problems.append(f"{where}({oid}).affordance.evidence 必须是 list")
        clip = o.get("clipped")
        if not isinstance(clip, dict) or not isinstance(clip.get("edges"), list):
            problems.append(f"{where}({oid}).clipped 必须是 {{edges,cut_by,px}}")
        else:
            bad_edges = [e for e in clip["edges"] if e not in CLIP_EDGES]
            if bad_edges:
                problems.append(f"{where}({oid}).clipped.edges 含非法值 {bad_edges}")
        conf = o.get("confidence")
        if not _is_num(conf) or not (0.0 <= float(conf) <= 1.0):
            problems.append(f"{where}({oid}).confidence 必须是 0..1，实际 {conf!r}")
        if not isinstance(o.get("evidence"), dict) or not o["evidence"]:
            problems.append(f"{where}({oid}).evidence 必须是非空 dict（每对象必带证据）")

    # 引用完整性（父对象必须存在；坏了算 warning + 由调用方降级说明）
    for oid, o in by_id.items():
        p = o.get("parent")
        if p is not None and str(p) not in by_id:
            warnings.append(f"objects[{oid}].parent={p!r} 不存在（悬空引用）")

    # ── groups ──
    groups = raw.get("groups")
    if not isinstance(groups, list):
        problems.append("groups 必须是 list")
        groups = []
    for i, g in enumerate(groups):
        where = f"groups[{i}]"
        if not isinstance(g, dict):
            problems.append(f"{where} 必须是 dict")
            continue
        if not isinstance(g.get("id"), (str, int)) or isinstance(g.get("id"), bool):
            problems.append(f"{where}.id 必须存在")
        if g.get("role") not in GROUP_ROLES:
            problems.append(f"{where}.role 必须是 {GROUP_ROLES}")
        members = g.get("members")
        if not isinstance(members, list):
            problems.append(f"{where}.members 必须是 list")
        else:
            for m in members:
                if str(m) not in by_id:
                    warnings.append(f"{where}.members 引用未知对象 {m!r}")

    # ── slices ──
    slices = raw.get("slices")
    if not isinstance(slices, list):
        problems.append("slices 必须是 list")
        slices = []
    for i, s in enumerate(slices):
        where = f"slices[{i}]"
        if not isinstance(s, dict):
            problems.append(f"{where} 必须是 dict")
            continue
        if str(s.get("object_id")) not in by_id:
            warnings.append(f"{where}.object_id={s.get('object_id')!r} 未知")
        if not isinstance(s.get("path"), str) or not s.get("path"):
            problems.append(f"{where}.path 必须是非空字符串")
        bb = s.get("local_bbox")
        if not isinstance(bb, list) or len(bb) != 4 or not all(_is_num(v) for v in bb):
            problems.append(f"{where}.local_bbox 必须是 4 个数字")

    # ── transitions ──
    trs = raw.get("transitions")
    if not isinstance(trs, list):
        problems.append("transitions 必须是 list")
        trs = []
    for i, t in enumerate(trs):
        where = f"transitions[{i}]"
        if not isinstance(t, dict):
            problems.append(f"{where} 必须是 dict")
            continue
        if not isinstance(t.get("from"), str) or not isinstance(t.get("to"), str):
            problems.append(f"{where}.from/.to 必须是字符串")
        if not _is_num(t.get("ms")):
            problems.append(f"{where}.ms 必须是数字")

    if problems:
        raise SchemaError(problems)
    return {"warnings": warnings, "objects_by_id": by_id}


class WorldState:
    """世界状态句柄：构造即校验；提供 act/wait 需要的只读查询。"""

    def __init__(self, raw, *, strict_state_names=False):
        self.raw = raw
        self.warnings = validate_world(raw, strict_state_names=strict_state_names)["warnings"]

    # ── 基本读取 ──
    @property
    def frame_id(self):
        return self.raw["frame_id"]

    @property
    def state_name(self):
        return self.raw["state"]["name"]

    @property
    def objects(self):
        return self.raw["objects"]

    @property
    def degraded(self):
        return self.raw["degraded"]

    def find_object(self, oid):
        for o in self.objects:
            if str(o["id"]) == str(oid):
                return o
        return None

    def text_hits(self, text):
        """全等文本匹配（NFKC + 去空白 + casefold，与 ys-find 同口径，不做模糊）。"""
        key = normalize_text(text)
        hits = []
        for o in self.objects:
            for t in o["text"]:
                if normalize_text(t) == key:
                    hits.append({"object_id": o["id"], "text": t, "bbox": o["bbox"],
                                 "channel": "container"})
                    break
        return hits

    def free_text_hits(self, text):
        key = normalize_text(text)
        return [t for t in self.raw.get("free_text") or [] if normalize_text(t) == key]

    def to_dict(self):
        return self.raw

    def summary(self):
        return {
            "frame_id": self.frame_id,
            "state": self.state_name,
            "objects": len(self.objects),
            "clickable_yes": sum(1 for o in self.objects if o["affordance"]["clickable"] == "yes"),
            "clickable_unknown": sum(1 for o in self.objects if o["affordance"]["clickable"] == "unknown"),
            "degraded": [d["code"] for d in self.degraded],
            "timing_ms": self.raw.get("timing_ms", {}),
        }

    def __repr__(self):
        return f"WorldState(state={self.state_name!r}, objects={len(self.objects)}, frame={self.frame_id[:19]}…)"
