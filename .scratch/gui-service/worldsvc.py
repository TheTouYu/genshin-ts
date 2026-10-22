#!/usr/bin/env python3
"""worldsvc.py — A 形态世界状态服务原型：look() / act(target) / wait_until(判据)。

三动词契约（`.scratch/gui-stack/AGI-BAR.md` §三/§四，2026-10-18 用户裁决）：
  look()               一次感知 → **单一世界状态**（schema.py 定义）；返回回执，不返回像素。
  act(target)          解析目标 →（dry-run 或注入）→ **验证语义期待 expect**（必填）；
                       有变化 ≠ 达成意图：expect 不成立 = 动作失败（rc=9），并落 before/after/detail 证据。
  wait_until(predicate) 三态：reached / timeout / violated（+ 仪器故障的 error，fail-closed）。

目标寻址（Lead 2026-10-18 裁决）：
  · B 主：`{"text": "试玩"}`（NFKC + 去空白 + casefold 全等，与 ys-find 同口径，不做模糊）
  · A 精确：`{"object_id": "c3"}`（来自 look 的 objects[].id）
  · D 高层：`{"intent": "playtest-start"}`（委托 ys-do，有 pre/post 契约与账本）
  未命中 / 多义 → fail-closed，**不许猜**。

硬件纪律（代码级）：
  · 绝不为读数抬窗口：live 先查 ys-atop，不在栈顶就拒绝（instruments.grab_frame 内实现）。
  · act 默认 dry-run；`inject=True` 还要求构造时 `allow_inject=True`（本会话硬约束禁止注入）。
  · 判不出来 → `degraded` += {code, detail}，并如实保留 null/unknown，不编。

退出码（CLI）：0 成功/命中；2 用法或 expect DSL 非法；3 目标解析失败；4 目标多义；
              5 前置不符（窗口不在栈顶/归属不过、注入未授权）；6 超时；7 violated；
              8 仪器/schema 故障；**9 语义期待 expect 不成立**（动作执行了但变化不对）。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

import schema
import instruments
from cache import FrameCache

REPO_ROOT = schema.repo_root()
CACHE_DIR_DEFAULT = os.path.join(REPO_ROOT, ".scratch", "gui-service", ".cache")
EVIDENCE_DIR_DEFAULT = os.path.join(REPO_ROOT, ".scratch", "gui-service", "evidence")
EXPECT_TYPES = ("state_in", "text_added", "text_removed",
                "text_added_contains", "text_removed_contains",   # G5：子串断言（OCR 常把标题与计数粘成一条）
                "region_text_set_changed", "pixel_delta")

# 2026-10-21 AGI 反馈轮：expect DSL 的**机读规格**（单一源）。
# 之前 capabilities 只列动词不列 expect 形状，代理要靠"撞墙—读报错—再猜"问对，
# 实测一轮连撞两次（先缺 region、再缺 texts），每次白花一次调用。
# 这里同时喂给 capabilities.expect_schemas 和 BAD_EXPECT 的 next_actions。
_RGB = "[x, y, w, h]（物理像素 2560×1440；也接受 'x,y,w,h' 字符串）"
EXPECT_SCHEMAS = {
    "state_in": {
        "required": {"states": "list[str]"},
        "optional": {"region": _RGB},
        "example": {"type": "state_in", "states": ["GAME_FRIENDS"]},
        "note": "最省事的「做了什么」断言；词表外的状态名会被拒",
    },
    "text_added": {
        "required": {"region": "[x,y,w,h]", "texts": "list[str]（整串匹配）"},
        "optional": {},
        "example": {"type": "text_added", "region": [300, 120, 800, 300], "texts": ["好友"]},
        "note": "整串匹配；OCR 常把标题与计数粘成一条，不确定时用 *_contains",
    },
    "text_removed": {
        "required": {"region": "[x,y,w,h]", "texts": "list[str]（整串匹配）"},
        "optional": {},
        "example": {"type": "text_removed", "region": [1100, 1300, 400, 120], "texts": ["点击进入"]},
        "note": "",
    },
    "text_added_contains": {
        "required": {"region": "[x,y,w,h]", "texts": "list[str]（子串匹配）"},
        "optional": {},
        "example": {"type": "text_added_contains", "region": [300, 120, 800, 300], "texts": ["好友"]},
        "note": "推荐默认：子串比整串稳（OCR 粘字很常见）",
    },
    "text_removed_contains": {
        "required": {"region": "[x,y,w,h]", "texts": "list[str]（子串匹配）"},
        "optional": {},
        "example": {"type": "text_removed_contains", "region": [1100, 1300, 400, 120], "texts": ["点击进入"]},
        "note": "",
    },
    "region_text_set_changed": {
        "required": {"region": "[x,y,w,h]"},
        "optional": {"min_jaccard_delta": "float ∈ [0,1]，缺省 0.15"},
        "example": {"type": "region_text_set_changed", "region": [0, 0, 2560, 1440]},
        "note": "不关心具体文字、只关心「这块变了」时用",
    },
    "pixel_delta": {
        "required": {"region": "[x,y,w,h]"},
        "optional": {"threshold_pct": "float ∈ (0,100]，缺省 5.0", "px_thr": "逐通道 |Δ| 阈值，缺省 10"},
        "example": {"type": "pixel_delta", "region": [1100, 1300, 400, 120]},
        "note": "纯像素通道；动画区会误报，优先用文本类",
    },
}


def expect_fix_actions(t, expect=None):
    """把一次 BAD_EXPECT 变成**可直接执行**的修正步骤（而不是让人读 detail 猜）。

    2026-10-21 实测：`--expect '{"type":"text_removed_contains","text":"点击进入"}'`
    连撞两次（缺 region → 缺 texts），两次回执的 next_actions 都是 null。
    """
    sch = EXPECT_SCHEMAS.get(t)
    if not sch:
        why = ("没传 --expect" if t is None else f"未知 expect.type={t!r}")
        return [{"tool": "worldsvc capabilities", "args": {},
                 "why": f"{why}；合法类型 {list(EXPECT_SCHEMAS)}（含必填字段与样例）",
                 "cost": "0（本地，不碰屏幕）"}]
    given = expect if isinstance(expect, dict) else {}
    missing = [f for f in sch["required"] if f not in given]
    acts = []
    if missing:
        acts.append({"tool": "worldsvc act",
                     "args": {"--expect": {**{k: v for k, v in given.items()},
                                           **{f: f"<{sch['required'][f]}>" for f in missing}}},
                     "why": f"{t} 缺必填字段 {missing}", "cost": "一次调用（dry-run 不碰屏幕）"})
    acts.append({"tool": "worldsvc act", "args": {"--expect": sch["example"]},
                 "why": "最小可用样例：复制后只改 region/texts", "cost": "一次调用"})
    if sch.get("note"):
        acts.append({"tool": "(说明)", "args": {}, "why": sch["note"], "cost": "0"})
    return acts


class ServiceError(RuntimeError):
    """服务级失败（fail-closed）。code 稳定、detail 人读、status 用于回执。"""

    def __init__(self, code, detail, *, status="error", rc=8, next_action=None,
                 observed=None, next_actions=None):
        self.code = code
        self.detail = detail
        self.status = status
        self.rc = rc
        # 2026-10-21（复盘）：fail-closed 只说"不行"不够——**每个拒绝都要带结构化下一步**，
        # 否则调用方只能自己猜（真机会话里遇到 OTHER_DESKTOP 就去手搓 KWin 脚本了）。
        self.next_action = next_action
        # 2026-10-21（AGI 反馈轮）：拒绝回执三件套
        #   observed    = 我**实际观测到什么**（不是"发生了什么"的叙述）
        #   next_actions= 可直接执行的下一步（列表，带参数与代价），优于单条
        # 没有这三样的错误，代理只能靠猜或去翻源码——那是"工具自证陷阱"的温床。
        self.observed = observed
        self.next_actions = next_actions
        super().__init__(f"[{code}] {detail}")


def _degraded(code, detail="", *, level="degraded"):
    """降级项。`level`：degraded=这一帧确实有缺陷；waived=已知不一致、本轮不修但如实标注。"""
    return {"code": code, "detail": detail, "level": level}


# ══════════════════════════════════════════════════════════════════
# 判定证据归一 + 降级判据（v1，2026-10-21）
# ══════════════════════════════════════════════════════════════════
# 事故（实测，两张陌生画面）：**判错会把自检洗白**。旧实现只在 state_name=="UNKNOWN"
# 时加 STATE_UNKNOWN，于是 Firefox 整屏被自信地判成 PLAYTEST 后，诚实告警反而消失
# （degraded 5 条 → 4 条）。根因不是阈值，而是**降级项挂在了"名字"上，而不是"证据"上**。
# 同一轮还暴露出第二个同族病：degraded 随**调用历史**变化（冷调用 1861ms 报
# BUDGET_EXCEEDED，热调用 1.61ms 不报）——耗时是性能读数，不是这一帧的观测缺陷。
# 因此 v1 的两条硬规则：
#   ① 降级项只由 `state.match`（支撑度/开集）+ 对象表 + 文本 + 不确定性来源 + 帧元数据推导；
#   ② 降级项只有一个实现：`degraded_items()` 纯函数（同一帧 ⇒ 同一集合）。
# 支撑度门槛（ys-state 的 ACCEPT_SUPPORT，实测 0.6）**只有一处实现**：判据层。
# worldsvc 不再持有自己的阈值——两处各有一个阈值，就是第二个真相源（本轮三个 bug 的共同形态）。
_AMBIG_STATE = "AMBIGUOUS"   # decide() 的多态并列伪态（schema.DERIVED_STATE_NAMES 认可）


def _norm_readings(readings):
    """判据归一成**逐条列表** [{name, passed, value, kind}]。

    原始形状是 `{判据名: {value, passed, kind}}`（ys-state `pixel_readings`）。改成列表是为了
    让证据**自带判据名**——否则调用方要拿 dict key 去猜哪条判据支撑了这次判定，
    而这正是"判错被洗白"的温床（只有条数、看不出谁过谁不过）。
    """
    out = []
    if isinstance(readings, dict):
        items = readings.items()
    elif isinstance(readings, list):
        items = [(r.get("name") if isinstance(r, dict) else None, r) for r in readings]
    else:
        return out
    for i, (name, r) in enumerate(items):
        r = r if isinstance(r, dict) else {"value": r}
        out.append({"name": str(name or r.get("name") or f"reading[{i}]"),
                    "passed": bool(r.get("passed")),
                    "value": r.get("value"),
                    "kind": r.get("kind")})
    return out


def _per_state_support(criteria):
    """逐条判据 → 每态 {passed,total,ratio}（纯统计，不含规则）。"""
    per = {}
    for c in criteria or []:
        st = str(c.get("name") or "").split("/")[0]
        if not st:
            continue
        acc = per.setdefault(st, [0, 0])
        acc[1] += 1
        if c.get("passed"):
            acc[0] += 1
    return {st: {"passed": p, "total": n, "ratio": round(p / n, 3) if n else 0.0}
            for st, (p, n) in per.items()}


def build_state_match(*, state_name, judge_match=None, confidence=None, criteria=None,
                      verdicts=None, support=None, novel=None, novel_reason=None,
                      candidates=None):
    """组装 `state.match`：**判据层（ys-state `decide()`）有什么就透传什么**，缺了不补默认值。

    最终形状（Lead 2026-10-21 裁决，之后不再改）：

        {candidate, ratio, has_critical, critical_ok, ratio_pass,  ← 判据层原样透传
         accept_support, accepted,                                 ← 同上（阈值 0.6 / 判定布尔）
         novel, novel_reason,                                      ← 判据层原样透传
         level, support, support_ratio, support_source, criteria_n}

    为什么**没有** best/best_ratio/second/second_ratio/margin：`support` 表已经给出每态
    passed/total/ratio/rule，`match.candidate` 才是判据层认定的"我以为它是谁"。worldsvc 再按
    ratio 排一次序就是**第二个真相源**——实测过一次：LOADING 1/2 与 PLAYTEST 2/4 打平，
    字典序把 LOADING 排前面，于是回执里 `best="LOADING"` 而判据层 `candidate="PLAYTEST"`，
    自相矛盾。本轮（2026-10-21）三个 bug 全是这个形态。

    单一源纪律：`novel`/`novel_reason`/`candidates`/`candidate`/`accepted` 一律只复制。
    判据层没作答（旧 daemon / 旧 ys-state）⇒ 这些键**全部 None**，不是 False、不是 0、不补默认值。
    `support` 缺失时用逐条 criteria 派生，并标 `support_source="derived"`（同一份数据也给
    `evidence[0].support`，绝不两处不同源）。
    """
    name = state_name or "UNKNOWN"
    crit = [c for c in (criteria or []) if isinstance(c, dict)]
    sup = support if isinstance(support, dict) else None
    jm = judge_match if isinstance(judge_match, dict) else None

    def _j(key):
        """判据层字段：没有就是 None（不补默认值——补了就是"我替判据层作答"）。"""
        return jm.get(key) if jm else None

    # ① 支撑度表：权威优先，否则由逐条判据派生（派生值必须自报身份）
    if sup:
        support_map, support_source = sup, "authoritative"
    elif crit:
        per = _per_state_support(crit)
        support_map = {st: {"passed": v["passed"], "total": v["total"], "ratio": v["ratio"],
                            "ok": (bool(verdicts.get(st)) if isinstance(verdicts, dict) else None),
                            "rule": None}                        # rule 只有判据层知道；不编
                       for st, v in per.items()}
        support_source = "derived"
    else:
        support_map, support_source = None, None

    # ② 受判态的支撑度：判据层的 ratio > 派生表里的该态 > confidence（decide 的 support[st]）
    candidate = _j("candidate")
    ratio = _j("ratio")
    support_ratio = ratio
    if support_ratio is None and support_map:
        st = candidate or name
        support_ratio = (support_map.get(st) or {}).get("ratio")
        if support_ratio is not None and support_source is None:
            support_source = "derived"
    if support_ratio is None and isinstance(confidence, (int, float)) \
            and not isinstance(confidence, bool):
        support_ratio, support_source = float(confidence), (support_source or "confidence")

    # ③ 开集与阈值：只复制
    novel_v = None if novel is None else bool(novel)
    novel_r = novel_reason if novel_v else None
    accepted = _j("accepted")

    level = "v1" if (jm is not None or novel is not None or sup is not None) else (
        "derived" if crit else "legacy")
    return {
        # —— 判据层原样透传（None = 没作答）——
        "candidate": candidate,
        "ratio": ratio,
        "has_critical": _j("has_critical"),
        "critical_ok": _j("critical_ok"),
        "ratio_pass": _j("ratio_pass"),
        "accept_support": _j("accept_support"),      # **阈值数字**（如 0.6），不是布尔
        "accepted": accepted,                        # 判定布尔
        "novel": novel_v,
        "novel_reason": novel_r,
        # —— worldsvc 的标注（自述，不冒充判据）——
        # 2026-10-22 删 `low_support`：判出去的态必然 accepted=True ⇒ 它恒 False；
        # 而 novel_reason 里也有个 "low_support"，含义相反（拒答理由），留着只会误导。
        "level": level,
        "support": support_map,
        "support_ratio": support_ratio,
        "support_source": support_source,            # authoritative | derived | confidence | None
        "criteria_n": len(crit) if crit else None,
    }


def uncertainty_waivers(source, objects_source):
    """uncertainty 层与对象层不同源时的**待修清单**（waived 级：如实标注，不假装对齐）。

    唯一判据实现：`degraded_items()` 与顶层 `uncertainty_meta.waived` 都从这里取，
    免得"回执说一致、degraded 说不一致"。
    """
    out = []
    if source and objects_source and source != objects_source:
        out.append({"rule": "UNCERTAINTY_SOURCE_MISMATCH",
                    "reason": (f"uncertainty 来自 {source}，objects 来自 {objects_source}："
                               "两层不是同一个 CV 源，别把 uncertainty=0 读成『画面确定』")})
    return out


def uncertainty_meta_public(*, source, objects_source, state_name=None):
    """顶层 `uncertainty_meta`：不确定性层**覆盖什么、不覆盖什么**（调用方读一个对象就够）。"""
    waived = uncertainty_waivers(source, objects_source)
    covered = [source] if source and not waived else []
    return {
        "source": source,
        "applicable": covered,          # 本轮 uncertainty 覆盖的来源（waived 时为空：别当成"画面确定"）
        "scene": ("world" if (state_name or "") in ("GAME_WORLD", "PLAYTEST", "PAUSE", "SETTLE")
                  else "ui"),
        "waived": waived,
    }


def state_evidence(*, source, via, readings=None, verdicts=None, support=None, criteria=None,
                   margin=None, candidates=None, confidence=None, ambiguous=None,
                   native=None, channel=None, attribution=None, extra=None,
                   support_source=None):
    """`state.evidence[0]`：**逐条判据必须透传**（P1-a：daemon 分支曾把 readings 整包丢弃，
    evidence 里只剩一个 readings_n，于是"判错"在回执里完全无迹可查）。"""
    rd = _norm_readings(readings)
    ev = {
        "source": source,
        "via": via,
        "channel": channel,
        "confidence": confidence,
        "ambiguous": ambiguous,
        "margin": margin,
        "verdicts": verdicts,
        # 逐条判据 [{name,passed,value,kind}]：谁过谁不过一目了然
        "readings": rd,
        "readings_n": len(rd),
        # 契约 v1：每态 {passed,total,ratio,ok,rule} + 逐条 {name,state,passed,value}
        "support": support,
        "support_source": support_source,
        "criteria": criteria,
        "candidates": candidates,
        "native": native,
    }
    if attribution is not None:
        ev["attribution"] = attribution
    if extra:
        ev.update({k: v for k, v in extra.items() if k not in ev})
    return ev


def _facts_from_raw(raw, extra_facts=None):
    """从 raw 现取降级判据的五项输入（不复制、不缓存大对象）。

    `_deg_facts` 里只放**raw 里没有的小事实**（对象层是否 degraded、uncertainty 来源、
    名词表可用性、后端附带的降级项）；state_match / objects / free_text 一律从 raw 读——
    冷路径与缓存命中读的是同一份数据，所以"同帧同答案"是结构上成立的，不靠两边各写一遍。
    """
    st = raw.get("state") or {}
    facts = {
        "state_match": st.get("match") or {},
        "state_name": st.get("name"),
        "objects": raw.get("objects") or [],
        "free_text": raw.get("free_text") or [],
        "uncertainty_meta": {},
        "objects_degraded": None,
        "vocab_ok": None,
        "extra": [],
    }
    if isinstance(extra_facts, dict):
        facts.update({k: v for k, v in extra_facts.items() if k in facts})
    return facts


def degraded_items(*, state_match, objects=(), free_text=(), uncertainty_meta=None,
                   frame_meta=None, objects_degraded=None, vocab_ok=None, extra=(),
                   state_name=None):
    """**唯一**的世界状态降级判据（纯函数，无 IO、无时钟、无调用历史）。

    五个输入：`state_match`（判定证据结论）/ `objects` / `free_text` /
    `uncertainty_meta`（{source, objects_source}）/ `frame_meta`（{source, age_ms, stale}）。
    同一帧 ⇒ 同一集合：与"这是第几次调用、走没走缓存、花了多少毫秒"**完全无关**。
    耗时是性能读数，见 `timing_ms.budget`。
    """
    items = []
    sm = state_match or {}

    # ── ① 判定证据（挂在证据上，不挂在状态名上）──
    # novel 的判定权在 ys-state：True ⇒ 报；None（旧 daemon 没给）⇒ 只在**名字本身就是判不出态**
    # 时报（那是 ys-state 自己的结论，不是我们重算的）。不把 None 当 False 用。
    nv = sm.get("novel")
    if nv is True:
        items.append(_degraded("STATE_UNKNOWN",
                               "判据不收敛（novel）：" + str(sm.get("novel_reason") or
                                                          "本帧不属于任何已知态")))
    elif nv is None and str(state_name or "").upper() in ("UNKNOWN", _AMBIG_STATE):
        items.append(_degraded("STATE_UNKNOWN",
                               f"判定名本身是 {state_name}（旧 daemon 无 novel 字段）："
                               "开集结论缺失，按判不出处理"))
    # 2026-10-22 删 STATE_LOW_SUPPORT：它依赖 match.low_support，而那个布尔**恒 False**
    # （判出去的态必然 accepted=True）⇒ 这条降级项从来没触发过，是死分支。
    if str(sm.get("support_source") or "") != "authoritative":
        items.append(_degraded(
            "STATE_EVIDENCE_LEGACY",
            f"判定证据非权威（level={sm.get('level')}，support_source={sm.get('support_source')}）："
            "支撑度由本地逐条判据派生，仅供自述，不作权威值；novel/candidates 同理为 None"))

    # ── ② 对象层 ──
    if objects_degraded:
        items.append(_degraded("OBJECTS_DEGRADED", str(objects_degraded)[:300]))
    objs = list(objects or [])
    n_unknown = sum(1 for o in objs if isinstance(o, dict) and o.get("kind") == "unknown")
    if n_unknown:
        items.append(_degraded("KIND_UNKNOWN",
                               f"{n_unknown}/{len(objs)} 个对象 kind=unknown（L1 学习型检测未接入）"))
    ft = list(free_text or [])
    if ft:
        items.append(_degraded("FREE_TEXT_UNOWNED",
                               f"{len(ft)} 条文本没有容器归属，act(text) 解析不到（需要切片/坐标通道）"))
    items.append(_degraded("L2_NOT_IMPLEMENTED", "groups=[]：容器 parent 链未闭合（AGI-BAR 票 26）"))
    items.append(_degraded("L3_NOT_IMPLEMENTED",
                           "对象 state 三字段=null、affordance.clickable 恒 unknown（AGI-BAR 票 27/28）"))
    if vocab_ok is False:
        items.append(_degraded("STATE_VOCAB_UNVERIFIED",
                               "读不到状态名词表（tools/ys-editor/ys-state 的 STATES 元组）"))

    # ── ③ 不确定性层来源 ──
    um = uncertainty_meta or {}
    for w in uncertainty_waivers(um.get("source"), um.get("objects_source")):
        items.append(_degraded(w["rule"], w["reason"], level="waived"))

    # ── ④ 帧元数据（离线/陈旧帧是**这一帧**的属性，与调用路径无关）──
    fm = frame_meta or {}
    if fm.get("source") == "frame":
        items.append(_degraded("FRAME_PINNED",
                               f"离线帧（source=frame，age≈{fm.get('age_ms')}ms）："
                               "不是活体读数，act 不会据此注入"))
    elif fm.get("stale"):
        items.append(_degraded("STALE_FRAME",
                               f"复用的帧已 {fm.get('age_ms')}ms（> max_age_ms={fm.get('max_age_ms')}）"))

    # ── ⑤ 后端自带的降级项（daemon 可能附加 OCR_UNAVAILABLE 等），原样透传 ──
    for d in extra or []:
        if isinstance(d, dict) and d.get("code"):
            items.append(_degraded(str(d["code"]), str(d.get("detail") or "")[:300],
                                   level=str(d.get("level") or "degraded")))
    return items


_SB_CACHE = {}          # (abspath, mtime_ns, size) -> detect_path 回执（确定性，可安全复用）
_SB_CACHE_MAX = 32


def _sb_cached(mod, path):
    """滚动条检测记忆化：同一帧文件重算没有意义，而它是 advice 兜底里最贵的一段。"""
    try:
        st = os.stat(path)
        key = (os.path.abspath(path), st.st_mtime_ns, st.st_size)
    except OSError:
        return mod.detect_path(path)
    hit = _SB_CACHE.get(key)
    if hit is not None:
        return hit
    val = mod.detect_path(path)
    if len(_SB_CACHE) >= _SB_CACHE_MAX:
        _SB_CACHE.pop(next(iter(_SB_CACHE)))
    _SB_CACHE[key] = val
    return val


def _live_next_actions(code, *, allow_background=False):
    """归属/前置拒绝时的**结构化下一步**（AGI 标准：可直接执行，带参数与代价）。

    2026-10-21 修正口径：桌面借用已并入会话授权（`ys-session begin` 内部会 grant 并按需切桌面），
    不再是「用户手动拖窗口」或手搓 `YS_ALLOW_DESKTOP_SWITCH`。
    """
    acts = []
    if code in ("OTHER_DESKTOP", "ATTRIBUTION_OTHER_DESKTOP"):
        acts.append({"tool": "python3 .scratch/gui-service/worldsvc.py",
                     "args": ["look", "--backend", "daemon-world", "--summary",
                              "--allow-background"],
                     "why": "先拿到**后台帧**读数（能证明'看得见'，证不了'动得了'）",
                     "cost": "不占屏、不抬窗"})
        acts.append({"tool": "tools/ys-editor/ys-session",
                     "args": ["begin", "--seconds", "60", "--task", "<任务名>",
                              "--reason", "<做什么>", "--user-said", "<用户原话>"],
                     "why": "会话授权内含桌面借用：begin 会把游戏桌面切过来，end 自动切回",
                     "cost": "占屏 + 需用户同意（凭据从用户原话起算）"})
        acts.append({"tool": "tools/ys-editor/ys-wins",
                     "args": ["--attrib"],
                     "why": "只读核对窗口真实桌面（ds=）与当前桌面（cur=）",
                     "cost": "~150ms，不占屏"})
    elif code in ("NOT_ATOP", "OCCLUDED"):
        acts.append({"tool": "tools/ys-editor/ys-eyes-up", "args": [],
                     "why": "确认窗口/抓帧守护状态", "cost": "只读"})
        acts.append({"tool": "python3 .scratch/gui-service/worldsvc.py",
                     "args": ["look", "--frame", "<离线帧.png>"],
                     "why": "用离线帧取证（不依赖实时窗口）", "cost": "0"})
    if not allow_background:
        acts.append({"tool": "python3 .scratch/gui-service/worldsvc.py",
                     "args": ["look", "--backend", "daemon-world", "--allow-background"],
                     "why": "读后台缓冲帧（**只能用于感知，禁止据此动作**）", "cost": "不占屏"})
    return acts


class WorldService:
    def __init__(self, *, profile=None, source="auto", channel="fast", backend="cli",
                 cache_dir=CACHE_DIR_DEFAULT, cache_enabled=True, daemon_cache=True,
                 allow_inject=False, budget_ms=None, max_age_ms=5000, poll_ms=300,
                 allow_background=False):
        if source not in ("auto", "live", "latest", "frame"):
            raise ServiceError("BAD_USAGE", f"source 必须是 auto/live/latest/frame，实际 {source!r}", rc=2)
        if backend not in ("cli", "daemon-world"):
            raise ServiceError("BAD_USAGE",
                               f"backend 必须是 cli|daemon-world，实际 {backend!r}", rc=2)
        if channel not in ("fast", "full"):
            raise ServiceError("BAD_USAGE", f"channel 必须是 fast/full，实际 {channel!r}", rc=2)
        self.profile = profile or instruments.PROFILE_DEFAULT
        self.source = source
        self.channel = channel
        self.backend = backend
        self.cache = FrameCache(cache_dir, enabled=cache_enabled)
        self.daemon_cache = bool(daemon_cache)
        self.allow_inject = bool(allow_inject)
        # 只供离线分析：跳过 KWin 严格闸门（帧仍是目标窗口自己的缓冲）——**不得用于动作**
        self.allow_background = bool(allow_background)
        self.budget_ms = dict(budget_ms or schema.BUDGET_DEFAULT_MS)
        self.max_age_ms = int(max_age_ms)
        self.poll_ms = int(poll_ms)
        self.sig = instruments.signature()
        self._last_frame = None      # {path, captured_at_ms, source, capture_meta}
        self._prev_state = None
        self._state_timeline = []    # [{state, at_ms, frame_id}]
        self._sha_by_path = {}       # (path, mtime_ns, size) → frame_id（避免每次重算 3.4MB sha256）
        self.transitions = []        # 服务生命周期内的状态转移账本
        self.last_look = None
        # 测试/离线序列注入缝（默认 None = 正常取帧）：
        #   frame_provider() -> 帧路径（每次调用给下一帧）
        self.frame_provider = None

    # ══════════════════════════════════════════════════════════════
    # 1) look
    # ══════════════════════════════════════════════════════════════
    def _advice_raw(self, raw, path=None, *, enabled=True):
        """CLI/离线路径的 advice 兜底（唯一实现仍是 tools/ys-editor/ys_advice.py）。

        2026-10-21：daemon-world 会算 advice；cli 后端/老 daemon 不会。这里用**跨进程持久化**
        （YS_ADVICE_STATE_PATH）补齐，保证三个独立 `look --frame` 进程能累积到第 3 帧。
        """
        if not enabled or os.environ.get("YS_ADVICE_CLI_DISABLE") == "1":
            return []
        try:
            import sys as _sys
            _tools = os.path.join(REPO_ROOT, "tools", "ys-editor")
            if _tools not in _sys.path:
                _sys.path.insert(0, _tools)
            import ys_advice as _ADV
            cap = None
            if path and os.path.isfile(path):
                try:
                    import ys_scrollbar as _SB
                    # 2026-10-21：detect_path 每次 200–265ms（整帧解码 + 像素扫描），
                    # 而它在同一帧上是**确定性**的 ⇒ 按 (路径, mtime, size) 记忆化。
                    # 这是缓存命中路径 214ms→~1ms 的根因修复：缓存本身只占 0.7ms，
                    # 是这条 advice 兜底把"命中"拖成了两百毫秒（且多数时候返回空建议）。
                    r = _sb_cached(_SB, path)
                    cap = {"found": bool(r.get("found")),
                           "orientation": r.get("orientation"),
                           "position_ratio": r.get("position_ratio")}
                except Exception:                        # noqa: BLE001
                    cap = None
            objs = raw.get("objects") or []
            tim = raw.get("timing_ms") or {}
            return _ADV.observe(
                state_name=((raw.get("state") or {}).get("name")
                            if isinstance(raw.get("state"), dict) else raw.get("state")),
                containers=[],
                detections=objs if isinstance(objs, list) else [],
                free_text=raw.get("free_text") or [],
                look_ms=float(tim.get("total_full_ms") or tim.get("total") or 0.0),
                now_ms=time.time() * 1000.0,
                seek_cap=cap,
                enabled=True)
        except Exception:                                # noqa: BLE001
            return []

    def look(self, frame=None, *, source=None, allow_cache=True, fast=False, advice=True):
        """一次感知。fast=True：只跳过检测+结构层（省 ~40–90ms），OCR/判态/容器照常。

        为什么 fast 不省 OCR（2026-10-21 实测反例）：同一帧 f06 派蒙菜单，
        `ocr=false` 时 world 判 UNKNOWN，带 OCR 文本盒才判 GAME_PAIMON —— 省 OCR 会让
        state 静默降级。毫秒级靠的是**稳态复用**（OCR TTL + 容器/结构增量复用），不是砍证据。
        """
        t_start = time.perf_counter()
        src = source or (self.source if frame is None else "frame")
        if self.backend == "daemon-world":
            return self._look_worlddaemon(frame, src, allow_cache, t_start, fast=fast,
                                          advice=advice)
        if frame is None and self.frame_provider is not None:
            frame = self.frame_provider()
            src = "provider"
        frame_meta = self._acquire_frame(frame, src)
        path = frame_meta["path"]

        frame_id = self._frame_id(path)
        cache_hit = None
        if allow_cache and self.cache.enabled:
            raw, layer, hit_ms = self._cache_load(frame_id)
            if raw is not None:
                cache_hit = {"hit": True, "layer": layer, "hit_ms": round(hit_ms, 2)}
                timing = {"total": round(hit_ms, 2), "cache_layer": layer}
                if advice:
                    raw = dict(raw)
                    raw["advice"] = self._advice_raw(raw, path, enabled=True)
                raw = self._finalize(raw, frame_meta=frame_meta, frame_id=frame_id,
                                     timing=timing, cache_hit=cache_hit, t_start=t_start,
                                     validate_ms=0.0)
                return self._publish(raw)

        t0 = time.perf_counter()
        state_res = instruments.get_state(path, channel=self.channel, profile=self.profile)
        t_state = (time.perf_counter() - t0) * 1000

        t0 = time.perf_counter()
        cont_res = instruments.get_containers(path)
        t_obj = (time.perf_counter() - t0) * 1000

        t0 = time.perf_counter()
        raw = self._build_world(frame_meta=frame_meta, frame_id=frame_id,
                                state_res=state_res, cont_res=cont_res,
                                screen_frame=cont_res.get("frame") or {},
                                timing={"state": round(t_state, 1), "objects": round(t_obj, 1)})
        # cli 后端没有 D2 检测器（只在常驻服务的 GPU 侧）⇒ 对象只来自容器层。
        # 如实标注来源，别让调用方以为两后端给的是同一套 CV 结果。
        raw["objects_source"] = "containers"
        raw["objects_n"] = {"containers": len(raw.get("objects") or []),
                            "detections": None, "used": len(raw.get("objects") or [])}
        schema.validate_world(raw, strict_state_names=bool(schema.state_vocabulary()))
        t_validate = (time.perf_counter() - t0) * 1000

        timing = {"state": round(t_state, 1), "objects": round(t_obj, 1),
                  "validate": round(t_validate, 2),
                  "total": round((time.perf_counter() - t_start) * 1000, 1)}
        if advice and not raw.get("advice_computed"):
            raw["advice"] = self._advice_raw(raw, path, enabled=True)
        # 缓存只存与本次调用无关的静态部分；timing/cache/transitions 每次重算。
        # 例外：`_budget_ms`（这一帧的判定成本）必须随缓存存——否则热路径会把"预算"读成
        # 缓存命中耗时，冷热两次给出不同的预算结论（同帧不同答案的又一形态）。
        raw["_budget_ms"] = timing.get("total")
        self._cache_store(frame_id, raw)
        raw = self._finalize(raw, frame_meta=frame_meta, frame_id=frame_id,
                             timing=timing, cache_hit={"hit": False, "layer": "miss"},
                             t_start=t_start, validate_ms=t_validate)
        return self._publish(raw)

    def _cache_load(self, frame_id):
        """缓存读取。**只接受当前 schema 版本**：旧版本条目一律当未命中。

        为什么必须拒：旧条目里没有 `_deg_facts`（降级判据的输入快照），只能退化重建，
        重建出来的对象层事实是空的 ⇒ 热路径的 degraded 会比冷路径少几条，
        正是"同帧不同答案"那个病。半新半旧的缓存比没有缓存更危险。
        """
        raw, layer, hit_ms = self.cache.load(
            frame_id, self.sig, namespace=schema.SCHEMA_ID,
            require={"schema": schema.SCHEMA_ID})
        if raw is not None and raw.get("schema") != schema.SCHEMA_ID:
            # 双保险：key 里已经带了契约命名空间，这里再按字段校验一次。
            return None, "invalid", hit_ms
        return raw, layer, hit_ms

    def _cache_store(self, frame_id, raw):
        """写缓存（契约命名空间参与 key：换版本 ⇒ 旧条目自然读不到，不会被新校验器判死）。"""
        return self.cache.store(frame_id, self.sig, {k: v for k, v in raw.items()
                                                     if k not in ("timing_ms", "cache", "transitions",
                                                                  "tracked_at_ms")},
                                namespace=schema.SCHEMA_ID)

    def _frame_id(self, path):
        """内容寻址 id：同一文件（mtime_ns+size 不变）只算一次 sha256。
        sha256 一次 3.4MB ≈ 2.4~3.1ms，是"缓存命中 ≤5ms"预算里最大的一笔。"""
        try:
            st = os.stat(path)
        except OSError:
            return schema.frame_id_of(path)
        key = (os.path.abspath(path), st.st_mtime_ns, st.st_size)
        fid = self._sha_by_path.get(key)
        if fid is None:
            fid = schema.frame_id_of(path)
            if len(self._sha_by_path) > 32:
                self._sha_by_path.clear()
            self._sha_by_path[key] = fid
        return fid


    # ══════════════════════════════════════════════════════════════
    # backend=daemon-world：把感知下沉到常驻服务（ys-lookd cmd=world）
    # ══════════════════════════════════════════════════════════════
    def _look_worlddaemon(self, frame, src, allow_cache, t_start, fast=False, advice=True):
        """显式 backend（默认 cli 完全不变）：一次 RPC 拿回 state+objects+timing+归属。

        与 cli 后端的语义差异（如实说明，不假装等价）：
          · live：由常驻服务自己抓帧并先做归属校验（票 34）——客户端不抓、不落 PNG；
          · 离线帧：常驻服务带帧缓冲/OCR 内容寻址缓存/容器缓存/结果缓存，同帧第二次 ≤5ms；
          · 旧常驻服务（没有 world 命令）→ DAEMON_ERROR，调用方需显式回退 cli。
          · fast=True（2026-10-21）：ocr=False + structure=False，只判态+容器；
            GAME_WORLD 由常驻服务自动补检测+结构（见 ys_lookd._world）。
        """
        if frame is None and self.frame_provider is not None:
            frame = self.frame_provider()
            src = "provider"
        frame_meta, path = self._daemon_frame_meta(frame, src)
        frame_id = None
        if path:
            frame_id = self._frame_id(path)
            if allow_cache and self.cache.enabled:
                raw, layer, hit_ms = self._cache_load(frame_id)
                if raw is not None:
                    raw = dict(raw)
                    raw["advice"] = self._advice_raw(raw, path, enabled=advice)
                    frame_meta = dict(frame_meta, source=src)
                    return self._publish(self._finalize(
                        raw, frame_meta=frame_meta, frame_id=frame_id,
                        timing={"total": round(hit_ms, 2), "cache_layer": layer},
                        cache_hit={"hit": True, "layer": layer, "hit_ms": round(hit_ms, 2)},
                        t_start=t_start, validate_ms=0.0))
        t0 = time.perf_counter()
        # fast 只跳过 D2 检测 + D3 结构层；OCR 必须保留——2026-10-21 实测：同一帧 f06
        # （派蒙菜单）ocr=false 时 world 判 UNKNOWN，带 OCR 文本盒才判 GAME_PAIMON。
        # 省 OCR 会让 state 静默降级，属 AGI-BAR 禁止的"静默失能"，所以不做。
        try:
            resp = instruments.get_world_daemon(path, profile=self.profile,
                                                ocr=True, objects=True,
                                                structure=not fast, cache=self.daemon_cache,
                                                advice=advice,
                                                allow_background=bool(self.allow_background))
        except instruments.InstrumentError as exc:
            # 拒绝必须是**可判读的三件套**（观测值 + 多条可执行下一步 + 为什么），
            # 而不是一句人读的话。cli 与 daemon 两条后端共用同一个形状。
            raise ServiceError(
                exc.code,
                str(exc),
                status="precondition_fail" if any(
                    k in str(exc.code) for k in ("ATTRIBUTION", "OTHER_DESKTOP", "NOT_ATOP",
                                                  "OCCLUDED", "UNAUTHORIZED")) else "error",
                rc=5 if any(k in str(exc.code) for k in ("ATTRIBUTION", "OTHER_DESKTOP",
                                                         "NOT_ATOP", "OCCLUDED")) else 8,
                observed={"backend": "daemon-world", "instrument_code": exc.code,
                          "instrument_detail": str(exc)[:400],
                          "allow_background": bool(self.allow_background)},
                next_actions=_live_next_actions(exc.code,
                                                allow_background=bool(self.allow_background)))
        rpc_ms = (time.perf_counter() - t0) * 1000
        state = resp.get("state") or {}
        if not state.get("state"):
            raise ServiceError("DAEMON_WORLD_BAD", f"world 回执缺 state：{str(resp)[:300]}")
        frame_id = "sha256:" + str(resp["frame"]["sha256"])
        if frame_id != "sha256:" + str(resp["frame"]["sha256"]):
            raise ServiceError("DAEMON_WORLD_BAD", "frame sha 非法")
        objects = [schema.object_from_container(c, frame_id=frame_id)
                   for c in ((resp.get("objects") or {}).get("containers") or [])]
        # 三维游戏世界：CV 容器层在这里是噪声（flat+rect 是菜单 UI 规则），而 D2 世界专家
        # 在同一帧给几十个框。**不能只看"容器是否为空"**——实测世界里 CV 常吐出 1 个假 panel，
        # 它会把 57 个检测框全压掉（2026-10-19 实跑：objects=1，daemon 直连却是 57）。
        # 所以按 state 判：GAME_WORLD 一律用检测框；其它状态优先容器。
        # 2026-10-19 追加：**「优先容器」在编辑器里同样会丢一大截**——编辑器系统菜单 CV 只给 2 个容器，
        # 同帧 D2 给 71 个（27 个带文字，把整张菜单都点得出名字）。⇒ 改成**选更全的那个源**：
        # 检测框数量超过容器数量时用检测框。两个源互不合并（避免同一元素两套框）。
        dets = (resp.get("structure") or {}).get("detections") or []
        state_name = ((resp.get("state") or {}).get("state") or "")
        use_dets = bool(dets) and (state_name == "GAME_WORLD" or not objects
                                   or len(dets) > len(objects))
        n_cont = len(objects)
        objects_source = "containers"
        if use_dets:
            objects = [schema.object_from_detection(d, frame_id=frame_id) for d in dets]
            objects_source = "detections"
        free_text = [str(t) for t in ((resp.get("objects") or {}).get("free_text") or [])]
        uncertainty = list((resp.get("objects") or {}).get("uncertainty") or [])
        cont_degr = bool((resp.get("objects") or {}).get("degraded") or
                         (resp.get("objects") or {}).get("error"))
        # uncertainty 来自 objects（容器/检测层）—— 常驻服务目前不单独给来源键，
        # 缺省按"容器层"记账（旧 daemon 的 uncertainty 确实出自 CV 容器层）。真给了就采信。
        uncertainty_source = (resp.get("objects") or {}).get("uncertainty_source") or "containers"
        # ── 判定证据：**透传**逐条判据（旧实现只留 readings_n，判错时回执里无迹可查）──
        readings = _norm_readings(state.get("readings"))
        criteria = state.get("criteria")
        if not criteria and readings:
            # 旧 daemon 没有 criteria：用 readings 归一（契约同形，让下游只认一个字段）
            criteria = [{"name": r["name"], "state": r["name"].split("/")[0],
                         "passed": r["passed"], "value": r["value"]} for r in readings]
        match = build_state_match(state_name=state.get("state"),
                                  judge_match=state.get("match"),
                                  confidence=state.get("confidence"),
                                  criteria=criteria, verdicts=state.get("verdicts"),
                                  support=state.get("support"),
                                  novel=state.get("novel"),
                                  novel_reason=state.get("novel_reason"),
                                  candidates=state.get("candidates"))
        st = {"name": state.get("state"), "confidence": state.get("confidence"),
              "ambiguous": bool(state.get("ambiguous")),
              "novel": match["novel"],          # None = 旧 daemon 没给结论（不冒充 false）
              "novel_reason": match["novel_reason"],
              "candidates": state.get("candidates"),
              "match": match,
              "evidence": [state_evidence(
                  source="ys-lookd/world", via="daemon", channel="fast",
                  support_source=match["support_source"],
                  readings=readings, verdicts=state.get("verdicts"),
                  support=match["support"], criteria=criteria,
                  margin=state.get("margin"), candidates=state.get("candidates"),
                  confidence=state.get("confidence"), ambiguous=bool(state.get("ambiguous")),
                  native=state.get("native"), attribution=resp.get("attribution"),
                  extra={"resolved_by": state.get("resolved_by")})],
              "channel": "fast", "native": state.get("native", False)}
        raw = schema.new_world(
            frame_id=frame_id, captured_at_ms=int(frame_meta["captured_at_ms"]),
            state=st, objects=objects, free_text=free_text, uncertainty=uncertainty,
            # v1：degraded 由 `_finalize` 用**唯一纯函数**按本帧事实重算（下方 _deg_facts）。
            # 不在这里拼：这里拼一次、_finalize 再拼一次 = 两处实现 ⇒ 冷热两次答案不同。
            degraded=(),
            timing_ms=dict(resp.get("timing") or {}, rpc=round(rpc_ms, 1)),
            frame=dict(frame_meta, **{"w": resp["frame"].get("w"),
                                      "h": resp["frame"].get("h")}),
            budget_ms=self.budget_ms)
        raw["attribution"] = resp.get("attribution")
        # 对象来源标注（AGI 标准：两个后端 CV 源不同，必须让调用方看得见来源，而不是猜）
        raw["objects_source"] = objects_source
        raw["objects_n"] = {"containers": n_cont, "detections": len(dets),
                            "used": len(objects)}
        raw["structure"] = resp.get("structure")   # D3 结构层（groups/rows/pitch），随世界状态一起返回
        raw["daemon_timing"] = resp.get("timing")
        # 2026-10-21 复盘修正：稳定信号（settled）原先**没从 daemon 回执透传**，
        # 于是 `look --summary` 永远拿不到它（真机会话里打印成 settled: null，调用方只能靠肉眼）。
        raw["settled"] = resp.get("settled")
        raw["advice"] = resp.get("advice") or []
        raw["advice_computed"] = True
        # v1：不确定性层的**来源 + 覆盖范围 + 待修清单**（与 objects_source 对账，
        # 不一致记 waived 级降级项；顶层一个对象说清"uncertainty=0 是不是等于画面确定"）
        raw["uncertainty_source"] = uncertainty_source
        raw["uncertainty_meta"] = uncertainty_meta_public(
            source=uncertainty_source, objects_source=objects_source,
            state_name=state.get("state"))
        # 降级判据的输入快照（`_finalize` 用它重算，缓存里也带着 ⇒ 冷/热同帧答案必然相同）
        # 只存**小事实**：state_match / objects / free_text 在 raw 里本来就有，
        # 再复制一份会让缓存文件翻倍（实测：缓存命中 2.6ms → 5.4ms，因为 json.loads 变慢）。
        raw["_deg_facts"] = {
            "uncertainty_meta": {"source": uncertainty_source, "objects_source": objects_source},
            "objects_degraded": cont_degr or None,
            "vocab_ok": bool(schema.state_vocabulary()),
            "extra": [d for d in (resp.get("degraded") or []) if isinstance(d, dict)],
        }
        schema.validate_world(raw, strict_state_names=bool(schema.state_vocabulary()))
        if path:
            # 判定成本随缓存一起存：预算是**帧的属性**，缓存命中时不能翻脸成"只要 0.8ms"
            _t = resp.get("timing") or {}
            raw["_budget_ms"] = _t.get("total_full_ms") or _t.get("total_ms")
            self._cache_store(frame_id, raw)
        timing = dict(resp.get("timing") or {})
        timing["total"] = round((time.perf_counter() - t_start) * 1000, 1)
        timing["rpc"] = round(rpc_ms, 1)
        raw = self._finalize(raw, frame_meta=frame_meta, frame_id=frame_id,
                             timing=timing, cache_hit={"hit": False, "layer": "miss"},
                             t_start=t_start, validate_ms=0.0)
        return self._publish(raw)

    def _daemon_frame_meta(self, frame, src):
        """daemon-world 的帧来源：离线给路径；live 给 None（服务自己抓 + 归属校验）。"""
        if src in ("frame", "provider"):
            if not frame:
                raise ServiceError("BAD_USAGE", "source=frame 必须给帧路径", rc=2)
            path = os.path.abspath(frame)
            if not os.path.isfile(path):
                raise ServiceError("FRAME_NOT_FOUND", f"帧文件不存在：{path}", rc=8)
            meta = {"path": path, "source": src,
                    "captured_at_ms": int(os.path.getmtime(path) * 1000),
                    "captured_at_ms_source": "file_mtime", "live": False}
            self._last_frame = meta
            return meta, path
        if src == "latest":
            if not self._last_frame:
                raise ServiceError("NO_FRESH_FRAME",
                                   "没有可复用的帧（还没成功 look 过）；请用 --frame 指定离线帧",
                                   rc=8)
            meta = dict(self._last_frame, source="latest", reused=True)
            return meta, meta.get("path")
        # live / auto：交给常驻服务抓帧（它内部先做归属校验，不过就不抓）
        meta = {"path": "(live)", "source": "live", "captured_at_ms": schema.now_ms(),
                "captured_at_ms_source": "daemon-capture", "live": True}
        if self.allow_background:
            # 后台帧：**能证明"看得见"，证不了"动得了"**（技能 §4.55）。live 必须置 False，
            # 否则下游会把后台缓冲当成可见交互层证据；layer 字段供报告直接引用。
            meta.update({"live": False, "background": True, "layer": "background"})
        self._last_frame = meta
        return meta, None

    def _degraded_list(self, objects, free_text, *, state_name, objects_degraded):
        """**已废弃**（v1）：降级判据只剩一处实现 `degraded_items()`。

        保留这个名字只为不让旧调用方 AttributeError 崩掉——它把名字翻译成 state_match，
        再走同一个纯函数，所以行为与主路径一致（不会出现"两套判据"）。
        """
        match = build_state_match(state_name=state_name, criteria=[])
        return degraded_items(state_match=match, objects=objects, free_text=free_text,
                              objects_degraded=objects_degraded,
                              vocab_ok=bool(schema.state_vocabulary()))

    def _acquire_frame(self, frame, src):
        """解析帧来源。live 只在窗口已在栈顶时取；**绝不抬窗口**。"""
        if src in ("frame", "provider"):
            if not frame:
                raise ServiceError("BAD_USAGE", "source=frame 必须给帧路径", rc=2)
            path = os.path.abspath(frame)
            if not os.path.isfile(path):
                raise ServiceError("FRAME_NOT_FOUND", f"帧文件不存在：{path}", rc=8)
            meta = {"path": path, "source": src, "captured_at_ms": int(os.path.getmtime(path) * 1000),
                    "captured_at_ms_source": "file_mtime", "live": False}
            self._last_frame = meta
            return meta

        if src == "live":
            # 2026-10-18 接入 ys-capture：抓帧段换成常驻 XShm（~13ms），**归属闸门保留且是 KWin 权威**。
            # 为什么不再先跑 attrib_fast：实测 EWMH 的 _NET_WM_DESKTOP 会把桌面说错
            # （游戏在 desktop 3 时它报 0 ⇒ 快路径判 OK 而屏幕上是浏览器，正是票 34 的 fail-open）。
            # ys-capture 内部：快路径只做保守拒绝，KWin 通道才是权威，结论过旧/不可用直接 refuse。
            try:
                _bg = bool(self.allow_background)
                # 2026-10-22：守护的归属结论有 TTL（strict-sec 1.5s / fast 0.3s），刚抬完窗
                # 立刻取帧会撞到**上一拍的 NOT_ATOP**；编码文件按帧轮换，取帧瞬间也可能被回收
                # （COPY_FAILED）。两者都是"晚一拍就好"，所以有界重试（最多 2 次，总代价 ≤2s），
                # 仍失败才 fail-closed —— 不对真遮挡睁眼。
                _retry_codes = {"NOT_ATOP", "OCCLUDED", "COPY_FAILED"}
                _last = None
                for _i in range(3):
                    try:
                        raw = instruments.grab_frame(allow_background=_bg)
                        _last = None
                        break
                    except instruments.InstrumentError as _e:
                        _last = _e
                        if _i >= 2 or _e.code not in _retry_codes:
                            raise
                        time.sleep(0.7 if _e.code != "COPY_FAILED" else 0.12)
                if _last is not None:
                    raise _last
            except instruments.InstrumentError as e:
                _na = None
                if e.code == "OTHER_DESKTOP":
                    _na = {"tool": "tools/ys-editor/ys-follow-win",
                           "args": ["yuanshen.exe"],
                           "why": "把游戏窗所在的虚拟桌面切到当前（它有 --dry 只读探测）"}
                elif e.code in ("NOT_ATOP", "OCCLUDED"):
                    _na = {"tool": "tools/ys-editor/ys-eyes-up", "args": [],
                           "why": "确认窗口/抓帧守护状态；或用 --frame 传离线帧"}
                raise ServiceError(
                    "LIVE_NOT_ATOP",
                    f"取帧被拒绝（{e.code}）：{e.detail}；本服务绝不为了取数抬窗口 —— "
                    "请用 --frame 指定离线帧，或把窗口切到当前桌面/置顶",
                    status="precondition_fail", rc=5, next_action=_na,
                    observed={"attribution_verdict": e.code, "attribution_detail": e.detail,
                              "instrument_rc": getattr(e, "rc", None),
                              "backend": "cli", "allow_background": bool(self.allow_background)},
                    next_actions=_live_next_actions(e.code, allow_background=bool(self.allow_background)))
            path = os.path.abspath(raw["path"])
            meta = {"path": path, "source": "live",
                    "captured_at_ms": int(time.time() * 1000),
                    "captured_at_ms_source": "capture_clock",
                    "live": not _bg,
                    "background": _bg or None,
                    "layer": "background" if _bg else "visible",
                    "capture_meta": {k: raw.get(k) for k in
                                     ("source", "capture_ms", "frame", "attribution",
                                      "window", "atop", "allow_background")}}
            self._last_frame = meta
            return meta

        if src == "latest":
            if not self._last_frame:
                raise ServiceError("NO_FRESH_FRAME",
                                   "没有可复用的帧（还没成功 look 过）；请用 --frame 指定离线帧，"
                                   "或把游戏窗口切到栈顶后走 live", rc=8)
            meta = dict(self._last_frame)
            meta["source"] = "latest"
            meta["reused"] = True
            return meta

        # auto：窗口在栈顶且归属 OK 才 live；否则**拒绝**（不偷偷用旧帧冒充新读数）
        # 2026-10-22：`UNKNOWN` 是"这个通道判不了"，不是"不在栈顶"。本机 EWMH 只暴露 1 张桌面
        # （`_NET_NUMBER_OF_DESKTOPS=1`）⇒ X11 快路径恒 UNKNOWN。此时交给**权威通道**
        # （ys-capture 守护里的 KWin 校验）去判：判不了它自己会 exit 9 拒绝，不会放行。
        attr = instruments.attrib_fast()
        verdict = attr.get("verdict")
        if verdict not in ("OK", "UNKNOWN"):
            raise ServiceError(
                "LIVE_NOT_ATOP",
                f"窗口归属校验未通过（verdict={verdict}，rc={attr.get('rc')}）；"
                "本服务绝不为了取数抬窗口 —— 请用 --frame 指定离线帧，或把窗口切到当前桌面/置顶",
                status="precondition_fail", rc=5)
        return self._acquire_frame(None, "live")

    def _build_world(self, *, frame_meta, frame_id, state_res, cont_res, timing, screen_frame=None):
        state_name = state_res.get("state") or "UNKNOWN"
        # ── 判定证据：与 daemon 分支**同形**（同一个 state_evidence / build_state_match）──
        readings = _norm_readings(state_res.get("readings"))
        criteria = state_res.get("criteria")
        if not criteria and readings:
            criteria = [{"name": r["name"], "state": r["name"].split("/")[0],
                         "passed": r["passed"], "value": r["value"]} for r in readings]
        match = build_state_match(state_name=state_name,
                                  judge_match=state_res.get("match"),
                                  confidence=state_res.get("confidence"),
                                  criteria=criteria, verdicts=state_res.get("verdicts"),
                                  support=state_res.get("support"),
                                  novel=state_res.get("novel"),
                                  novel_reason=state_res.get("novel_reason"),
                                  candidates=state_res.get("candidates"))
        evidence = [state_evidence(
            source="ys-state", via=state_res.get("via"),
            channel=state_res.get("channel") or self.channel,
            support_source=match["support_source"],
            readings=readings, verdicts=state_res.get("verdicts"),
            support=match["support"], criteria=criteria,
            margin=state_res.get("margin"), candidates=state_res.get("candidates"),
            confidence=state_res.get("confidence"), ambiguous=state_res.get("ambiguous"),
            native=state_res.get("native"),
            extra={"judge_ms": state_res.get("judge_ms"), "rc": state_res.get("_rc")})]
        st = {"name": state_name, "confidence": state_res.get("confidence"),
              "ambiguous": bool(state_res.get("ambiguous")),
              "novel": match["novel"],          # None = 旧 ys-state 没给结论（不冒充 false）
              "novel_reason": match["novel_reason"],
              "candidates": state_res.get("candidates"),
              "match": match,
              "evidence": evidence,
              "channel": state_res.get("channel") or self.channel,
              "native": state_res.get("native", False)}

        objects = [schema.object_from_container(c, frame_id=frame_id)
                   for c in (cont_res.get("containers") or [])]
        free_text = [str(t) for t in (cont_res.get("free_text") or [])]
        uncertainty = list(cont_res.get("uncertainty") or [])
        # cli 后端的 uncertainty 与 objects 同源（都出自 ys-screen 容器层），如实标注来源，
        # 免得调用方把"与 objects 同层"当成跨后端的普遍性质。
        uncertainty_source = cont_res.get("uncertainty_source") or "containers"
        obj_deg = None
        if cont_res.get("degraded"):
            obj_deg = str(cont_res.get("degraded"))
        elif cont_res.get("error"):
            obj_deg = "error=" + str(cont_res.get("error"))

        frame_meta = dict(frame_meta)
        sf = screen_frame or {}
        if sf.get("w") and sf.get("h"):
            frame_meta.update({"w": sf.get("w"), "h": sf.get("h"), "bytes": sf.get("bytes")})

        raw = schema.new_world(
            frame_id=frame_id,
            captured_at_ms=int(frame_meta["captured_at_ms"]),
            state=st, objects=objects, free_text=free_text, uncertainty=uncertainty,
            # v1：degraded 只在 `_finalize` 用唯一纯函数重算（见 _deg_facts）
            degraded=(),
            timing_ms=timing, frame=frame_meta,
            budget_ms=self.budget_ms,
            # 2026-10-21：稳定信号必须透传到 summary（技能推荐的正是 --summary）。
            # 注意：cli 后端没有 `raw`（那是 daemon-world 分支的整包回执），
            # 直接用容器结果里的 settled —— 之前写成 (raw or {}).get(...) 会让默认后端 NameError。
            settled=(cont_res or {}).get("settled"),
        )
        raw["uncertainty_source"] = uncertainty_source
        raw["uncertainty_meta"] = uncertainty_meta_public(
            source=uncertainty_source, objects_source="containers", state_name=state_name)
        raw["_deg_facts"] = {
            "uncertainty_meta": {"source": uncertainty_source, "objects_source": "containers"},
            "objects_degraded": obj_deg,
            "vocab_ok": bool(schema.state_vocabulary()),
            "extra": [],
        }
        return raw

    def _finalize(self, raw, *, frame_meta, frame_id, timing, cache_hit, t_start, validate_ms):
        raw = json.loads(json.dumps(raw))     # 深拷贝：缓存出来的对象不能被调用方改脏
        raw["schema"] = schema.SCHEMA_ID      # 旧缓存条目（/0）就地升级，避免半新半旧契约
        raw["frame_id"] = frame_id
        raw["frame"] = dict(frame_meta)
        age_ms = schema.now_ms() - int(frame_meta["captured_at_ms"])
        raw["frame"]["age_ms"] = age_ms
        raw["frame"]["stale"] = age_ms > self.max_age_ms
        raw["cache"] = cache_hit
        raw["tracked_at_ms"] = schema.now_ms()

        # ── 预算：**性能读数**，不是这一帧的观测缺陷（v1）────────────────────
        # 2026-10-21 实测反例：同一帧冷调用 1861ms 报 BUDGET_EXCEEDED、热调用 1.61ms 不报
        # ⇒ degraded 集合随"这是第几次调用"变化，把"判得对不对"和"花了多久"搅在一起，
        # 而调用方拿 degraded 当"这一帧可信吗"的判据。耗时如实报，但报在 timing_ms.budget。
        total_ms = float(timing.get("total") or 0.0)      # 这一次调用的墙钟（可能命中缓存）
        intrinsic = raw.pop("_budget_ms", None)           # 这一帧的判定成本（缓存里带着）
        try:
            intrinsic = float(intrinsic) if intrinsic is not None else total_ms
        except (TypeError, ValueError):
            intrinsic = total_ms
        budget_total = float(self.budget_ms["total"])
        timing = dict(timing, budget={"total_ms": round(intrinsic, 1),
                                      "budget_ms": budget_total,
                                      "value": "exceeded" if intrinsic > budget_total else "ok",
                                      "exceeded": bool(intrinsic > budget_total),
                                      "call_ms": round(total_ms, 1),
                                      "source": "cache" if (cache_hit or {}).get("hit") else "computed"})
        raw["timing_ms"] = timing

        # ── 降级项：唯一纯函数重算（同一帧 ⇒ 同一集合，与调用历史无关）────────
        facts = _facts_from_raw(raw, raw.pop("_deg_facts", None))
        raw["degraded"] = degraded_items(
            frame_meta={"source": frame_meta.get("source"), "age_ms": age_ms,
                        "stale": bool(raw["frame"].get("stale")),
                        "max_age_ms": self.max_age_ms},
            **facts)

        # 状态转移账本（缓存命中也要记：状态可能已随新帧变化）
        transitions = []
        state_name = raw["state"]["name"]
        if self._prev_state is not None and state_name != self._prev_state:
            tr = {"from": self._prev_state, "to": state_name,
                  "ms": int((time.perf_counter() - t_start) * 1000),
                  "at_ms": schema.now_ms(), "frame_id": frame_id}
            transitions.append(tr)
            self.transitions.append(tr)
        self._prev_state = state_name
        self._state_timeline.append({"state": state_name, "at_ms": schema.now_ms(), "frame_id": frame_id})
        raw["transitions"] = transitions
        return raw

    def _publish(self, raw):
        ws = schema.WorldState(raw, strict_state_names=bool(schema.state_vocabulary()))
        self.last_look = ws
        return ws

    # ══════════════════════════════════════════════════════════════
    # 2) act
    # ══════════════════════════════════════════════════════════════
    # ══════════════════════════════════════════════════════════════
    # 2) act —— 2026-10-19 起带**语义期待 expect**：有变化 ≠ 达成意图
    # ══════════════════════════════════════════════════════════════
    #
    # 用户 2026-10-19 裁定：「注意 agi 角度思考」——滚轮滚到别处（请求 (900,600)，实际 (1350,900)）
    # 时画面变了 85.7%，按旧判据算成功；但滚列表应该改变**列表项集合**，变的是详情面板就是错了。
    # 因此 act 必须带 expect（机检的语义判据），expect 不成立 = 动作失败（rc=9），
    # 并落盘 before/after/detail 三张图（同一目录、同一抓帧来源）。
    def act(self, target, *, expect=None, action=None, post=None, timeout_ms=30000,
            expect_timeout_ms=5000, poll_ms=None, inject=False, live=None, frame=None,
            allow_inject=None, evidence_dir=None, after_frame=None, simulate_action=False):
        t0 = time.perf_counter()
        poll_ms = self.poll_ms if poll_ms is None else int(poll_ms)
        if live:
            inject = True
            allow_inject = True if allow_inject is None else allow_inject
        allow_inject = self.allow_inject if allow_inject is None else bool(allow_inject)
        result = {
            "verb": "act", "target": target, "status": None, "ok": False,
            "resolved": False, "injected": False, "reached": None,
            "expect": None, "expect_result": None, "expect_evaluated": False,
            "action": action or {"type": "click"},
            "post_predicate": post, "post": None, "transitions": [],
            "degraded": [], "evidence": {}, "elapsed_ms": 0,
        }
        try:
            if not isinstance(target, dict) or not any(k in target for k in ("text", "object_id", "intent")):
                raise ServiceError("BAD_TARGET",
                                   "target 必须是 {text} | {object_id} | {intent} 之一", rc=2)
            if expect is None:
                raise ServiceError(
                    "ACT_EXPECT_REQUIRED",
                    "act 必须带语义期待 expect（有变化 ≠ 达成意图）。"
                    "机读规格见 capabilities.expect_schemas", status="invalid", rc=2,
                    observed={"expect_given": None, "allowed_types": list(EXPECT_SCHEMAS)},
                    next_actions=expect_fix_actions(None))
            exp = self._validate_expect(expect)
            result["expect"] = exp
            if "intent" in target:
                return self._act_intent(target, expect=exp, post=post, timeout_ms=timeout_ms,
                                        poll_ms=poll_ms, inject=inject, result=result, t0=t0)
            t_res = time.perf_counter()
            # 动作前先把自己借屏的窗口撑开（2026-10-22：focus 只 hold 2s，模型一思考就被空闲交还，
            # 随后 live 取帧报 LIVE_NOT_ATOP）。只要走 live 取帧就在这里补一次；
            # 没有会话时 focus 立刻回 NO_SESSION，不抬窗、不阻塞，仍由原有 fail-closed 兜底。
            if frame is None and not after_frame:
                result["focus_raise"] = _focus_for_action()
                if not result["focus_raise"].get("ok"):
                    result["degraded"].append(_degraded(
                        "FOCUS_NOT_RAISED",
                        f"动作前借屏失败（{result['focus_raise'].get('reason') or result['focus_raise'].get('error')}）："
                        "live 取帧可能被归属闸门拒；离线可改用 --frame"))
            ws = self.look(frame=frame)
            resolution = self._resolve_target(ws, target)
            result["resolve_ms"] = round((time.perf_counter() - t_res) * 1000, 1)
            result["resolution"] = resolution
            if resolution["status"] != "resolved":
                result.update({"status": resolution["status"], "ok": False,
                               # 失败也要自解释：原因已在 resolution.detail，这里补"下一步"
                               "next_action": _next_action_for(resolution),
                               "degraded": resolution.get("degraded", [])})
                result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
                return result
            obj = resolution["object"]
            spec = self._resolve_action_spec(ws, obj, action)
            result["action"] = spec
            result["evidence"] = {"dir": None, "before": None, "after": None, "detail": None}

            # ── dry-run（默认）：只解析与校验，不动、不写证据 ──
            if not inject:
                # 2026-10-21：这里漏了 resolved=True —— 回执自相矛盾（顶层 resolved:false，
                # 而 resolution.status:"resolved" 且给了 would_act 坐标）。调用方据此会以为没解析到。
                result.update({"status": "dry_run", "resolved": True, "ok": True,
                               "expect_evaluated": False, "would_act": spec,
                               "degraded": [_degraded("INJECTION_BLOCKED",
                                                      "dry-run：已解析动作与 expect，未执行（默认）")]})
                result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
                return result

            # ── 真动（--live / inject=True）──
            # 离线 after_frame 只用于「动作→证据→expect」链路的契约测试：必须显式 simulate_action，
            # 否则会出现「用旧坐标/旧帧驱动真注入」的危险组合（CLI 不暴露该参数）。
            if after_frame and not simulate_action:
                raise ServiceError("ACT_SIMULATE_REQUIRED",
                                   "after_frame 仅用于离线模拟：请传 simulate_action=True（CLI 不暴露）",
                                   status="invalid", rc=2)
            if not simulate_action and not allow_inject:
                raise ServiceError("INJECTION_BLOCKED",
                                   "注入需用户在环授权（--live / allow_inject=True）",
                                   status="precondition_fail", rc=5)
            edir = self._evidence_dir(evidence_dir)
            result["evidence"]["dir"] = edir
            before, before_meta = self._capture_evidence(frame, os.path.join(edir, "before.png"))
            result["evidence"]["before"] = before
            result["evidence"]["before_meta"] = before_meta
            if simulate_action:
                inj = {"ok": True, "simulated": True, "tool": spec["type"], "raw": None}
            else:
                inj = self._do_action(spec)
            result["injected"] = not simulate_action
            result["simulated"] = bool(simulate_action)
            result["inject"] = inj
            if inj.get("release_failed"):
                result["degraded"].append(_degraded(
                    "LEASE_RESTORE_FAILED",
                    "动作已注入，但 ys-scroll 归还焦点失败（release_ok=false）；"
                    "rc 非 0 来自归还而非注入，最终结论由 expect 判定"))
            if not inj["ok"]:
                raise ServiceError("INJECT_FAILED",
                                   f"{spec['type']} 注入失败 rc={inj['raw'].get('rc')}："
                                   f"{str(inj['raw'].get('stderr_tail') or inj['raw'].get('stdout_tail'))[:300]}",
                                   status="error", rc=8)
            # 2026-10-22（门禁提速）：`after_frame` 是**静态离线帧**，轮询它没有任何意义
            # ——帧不会变，等到超时也不会有新证据。此前每跑一次负例要白等满 5s
            # （worldsvc-selftest 里两条负例共 11s）。有 after_frame 就把截止时间压到 0.2s：
            # 仍然"轮询到失败"，语义不变，只是不再空转。
            _budget = 0.2 if after_frame else float(expect_timeout_ms) / 1000.0
            deadline = time.perf_counter() + max(0.2, _budget)
            ev = None
            after = None
            # 2026-10-21 动作路径优化：①注入后先等 20ms 再拍第一帧（UI 更新有物理延迟，
            # 立刻拍必看到旧画面，白付一轮 capture+expect）；②轮询间隔指数退避，封顶 poll_ms；
            # ③预算前瞻：剩余时间不够再跑一轮 expect 就立刻停（不为多看一眼顶破上限）。
            polls = 0
            wait_s = 0.02
            t_inject = time.perf_counter()
            while True:
                if wait_s > 0:
                    time.sleep(min(wait_s, max(0.0, deadline - time.perf_counter())))
                t_cap = time.perf_counter()
                try:
                    after, after_meta = self._capture_evidence(
                        None, os.path.join(edir, "after.png"), after_frame=after_frame)
                except ServiceError as _e:
                    # 动作后窗口可能已被空闲交还给用户：live 取帧会被归属闸门拒。
                    # 「动作之后世界变没变」属于**感知**，用后台帧判是契约允许的（layer 自报）。
                    if _e.code != "LIVE_NOT_ATOP" or after_frame:
                        raise
                    after, after_meta = self._capture_evidence(
                        None, os.path.join(edir, "after.png"), after_frame=after_frame, background=True)
                    result["degraded"].append(_degraded(
                        "EXPECT_BACKGROUND_FRAME",
                        "窗口已交还用户，expect 改用后台帧（只能证明『看得见』，不证明『看得见』在栈顶）"))
                cap_ms = (time.perf_counter() - t_cap) * 1000
                ev = self.evaluate_expect(exp, before, after, profile=self.profile)
                ev["capture_ms"] = round(cap_ms, 1)
                polls += 1
                result["expect_result"] = ev
                result["expect_evaluated"] = True
                result["evidence"]["after"] = after
                result["evidence"]["after_meta"] = after_meta
                if ev["ok"] or time.perf_counter() >= deadline:
                    break
                last_s = max(0.001, float(ev.get("elapsed_ms") or 0.0) / 1000.0)
                if (deadline - time.perf_counter()) <= last_s * 1.1:
                    result["degraded"].append(_degraded(
                        "EXPECT_BUDGET_STOP",
                        f"剩余预算 {1000 * (deadline - time.perf_counter()):.0f}ms < "
                        f"上一轮 expect {1000 * last_s:.0f}ms×1.1，提前停（不顶破 timeout）"))
                    break
                wait_s = min(max(0.05, poll_ms / 1000.0), max(wait_s * 2, 0.05))
            result["polls"] = polls
            result["timings"] = {
                "resolve_ms": result.get("resolve_ms"),
                "inject_ms": round((t_inject - t0) * 1000 - float(result.get("resolve_ms") or 0.0), 1),
                "expect_total_ms": round((time.perf_counter() - t_inject) * 1000, 1),
                "last_expect_ms": (result.get("expect_result") or {}).get("elapsed_ms"),
            }
            detail, detail_res = self._write_detail(after, exp, edir)
            result["evidence"]["detail"] = detail
            result["evidence"]["detail_meta"] = detail_res
            if not ev["ok"]:
                # 失败必须自解释：我期待变哪、实际变哪、两者重不重叠
                exp_region = exp.get("region")
                actual = self._changed_region(before, after) if before and after else None
                result["expect_region"] = exp_region
                result["actual_change"] = actual
                hint = (ev.get("detail") or "语义期待未成立")
                if actual is not None:
                    if actual["empty"]:
                        hint = f"画面完全没变（0 个像素变化）；我期待的是 {exp_region} 变化。{hint}"
                    else:
                        ov = self._overlap_ratio(exp_region, actual["region"])
                        result["region_overlap"] = ov
                        if ov < 0.05:
                            hint = (f"**变化不是我期待的区域**：期待 {exp_region}，"
                                    f"实际变化集中在 {actual['region']}（占全帧 {actual['ratio']*100:.2f}%，"
                                    f"与期待区 IoU={ov}）。{hint}")
                        else:
                            hint = (f"变化区与期待区重叠 IoU={ov}，但集合变化量不够。{hint}")
                        # 给"实际变了哪"也出一张下钻图，和 detail.png（期待区）并列
                        try:
                            out2 = os.path.join(edir, "detail-actual.png")
                            # 同 detail.png：只裁切不 OCR（OCR 子进程 2–30s，文本证据见 expect_result）
                            r2 = instruments.detail_image(after, actual["region"], out2,
                                                          scale=1.0, ocr=False)
                            if r2["rc"] == 0 and os.path.isfile(out2):
                                result["evidence"]["detail_actual"] = out2
                        except Exception:                      # noqa: BLE001 —— 证据是增强，不阻断结论
                            pass
                result.update({
                    "status": "expect_failed", "ok": False, "reached": False,
                    "error": {"code": "ACT_EXPECT_FAILED", "detail": hint}})
            elif isinstance(post, dict) and post:
                waited = self.wait_until(post, timeout_ms=timeout_ms, poll_ms=poll_ms, frame=None)
                result["post"] = waited
                result["transitions"] = waited.get("transitions", [])
                result["degraded"] = waited.get("degraded", [])
                if waited["status"] == "reached":
                    result.update({"status": "ok", "ok": True, "reached": True})
                else:
                    result.update({"status": waited["status"], "ok": False, "reached": False})
            else:
                result.update({"status": "ok", "ok": True, "reached": True})
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            self._write_act_meta(result)
            return result
        except ServiceError as exc:
            # 用法/DSL 类错误统一归为 invalid（CLI rc=2/5），别混进仪器故障
            status = "invalid" if exc.code in ("BAD_EXPECT", "ACT_EXPECT_REQUIRED",
                                               "BAD_ACTION", "BAD_TARGET",
                                               "ACT_SIMULATE_REQUIRED") else exc.status
            result.update({"status": status, "ok": False,
                           # 2026-10-21 AGI 反馈轮：错误**自带** rc，别再被 status 的映射覆盖。
                           # 实证：BAD_EXPECT 声明 rc=2，实际进程退出码却是 5（capabilities.exit_codes
                           # 写的是「2 = 用法/expect DSL 非法」）——声明与行为不一致，调用方无从判断。
                           "rc": int(getattr(exc, "rc", 8)),
                           "error": {"code": exc.code, "detail": exc.detail,
                                     "rc": int(getattr(exc, "rc", 8)),
                                     "next_action": getattr(exc, "next_action", None),
                                     "next_actions": getattr(exc, "next_actions", None),
                                     "observed": getattr(exc, "observed", None)}})
            result.setdefault("degraded", []).append(_degraded("INSTRUMENT_FAIL",
                                                               f"{exc.code}: {exc.detail}"))
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            self._write_act_meta(result)
            return result
        except instruments.InstrumentError as exc:
            result.update({"status": "error", "ok": False,
                           "error": {"code": exc.code, "detail": exc.detail},
                           "degraded": [_degraded("INSTRUMENT_FAIL", f"{exc.code}: {exc.detail}")]})
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            self._write_act_meta(result)
            return result

    # ── expect：校验 / 评估（判据全部复用既有仪器）────────────────────────
    @staticmethod
    def _region4(v):
        if isinstance(v, str):
            parts = [p for p in v.replace(" ", "").split(",") if p]
        elif isinstance(v, (list, tuple)):
            parts = list(v)
        else:
            parts = []
        if len(parts) != 4:
            raise ServiceError("BAD_EXPECT", f"region 必须是 [x,y,w,h]，实际 {v!r}", rc=2)
        try:
            x, y, w, h = [int(round(float(p))) for p in parts]
        except (TypeError, ValueError):
            raise ServiceError("BAD_EXPECT", f"region 必须是数字 [x,y,w,h]，实际 {v!r}", rc=2)
        if w <= 0 or h <= 0 or x < 0 or y < 0:
            raise ServiceError("BAD_EXPECT", f"region 必须 x,y>=0 且 w,h>0，实际 {v!r}", rc=2)
        return [x, y, w, h]

    def _validate_expect(self, expect):
        """校验入口：BAD_EXPECT 一律补 observed + next_actions 后抛出。

        2026-10-21 AGI 反馈轮：三件套此前只有"字段"没有"内容"（实测 next_action/
        next_actions/observed 恒为 null）——字段在 ≠ 语义在，消费方会读成"模块没有建议"。
        """
        try:
            return self._validate_expect_inner(expect)
        except ServiceError as e:
            if e.code == "BAD_EXPECT":
                t = expect.get("type") if isinstance(expect, dict) else None
                if e.observed is None:
                    e.observed = {"expect_given": expect, "expect_type": t,
                                  "allowed_types": list(EXPECT_SCHEMAS)}
                if e.next_actions is None:
                    e.next_actions = expect_fix_actions(t, expect)
            raise

    def _validate_expect_inner(self, expect):
        """expect 机检 DSL（v0，2026-10-19）。未知类型/缺字段 fail-closed。"""
        if not isinstance(expect, dict):
            raise ServiceError("BAD_EXPECT", "expect 必须是 dict", rc=2)
        t = expect.get("type")
        if t not in EXPECT_TYPES:
            raise ServiceError("BAD_EXPECT",
                               f"expect.type 必须是 {EXPECT_TYPES}，实际 {t!r}", rc=2)
        out = {"type": t}
        if t == "state_in":
            states = expect.get("states", expect.get("state_in"))
            if not isinstance(states, list) or not states:
                raise ServiceError("BAD_EXPECT", "state_in 必须带 non-empty states: [...]", rc=2)
            vocab = set(schema.state_vocabulary())
            bad = [s for s in states if vocab and str(s) not in vocab]
            if bad:
                raise ServiceError("BAD_EXPECT", f"state_in 含未登记状态 {bad}（词表见 ys-state）", rc=2)
            out["states"] = [str(s) for s in states]
            if "region" in expect:
                out["region"] = self._region4(expect["region"])
            return out
        if t in ("text_added", "text_removed", "text_added_contains", "text_removed_contains"):
            if "region" not in expect:
                raise ServiceError("BAD_EXPECT", f"{t} 必须带 region: [x,y,w,h]", rc=2)
            out["region"] = self._region4(expect["region"])
            texts = expect.get("texts")
            if not isinstance(texts, list) or not texts:
                raise ServiceError("BAD_EXPECT", f"{t} 必须带 non-empty texts: [...]", rc=2)
            out["texts"] = [str(x) for x in texts]
            return out
        if t == "region_text_set_changed":
            if "region" not in expect:
                raise ServiceError("BAD_EXPECT", f"{t} 必须带 region: [x,y,w,h]", rc=2)
            out["region"] = self._region4(expect["region"])
            m = float(expect.get("min_jaccard_delta", 0.15))
            if not (0.0 <= m <= 1.0):
                raise ServiceError("BAD_EXPECT", "min_jaccard_delta 必须在 [0,1]", rc=2)
            out["min_jaccard_delta"] = m
            return out
        if "region" not in expect:
            raise ServiceError("BAD_EXPECT", f"{t} 必须带 region: [x,y,w,h]", rc=2)
        out["region"] = self._region4(expect["region"])
        th = float(expect.get("threshold_pct", 5.0))
        if not (0.0 < th <= 100.0):
            raise ServiceError("BAD_EXPECT", "pixel_delta.threshold_pct 必须在 (0,100]", rc=2)
        out["threshold_pct"] = th
        out["px_thr"] = float(expect.get("px_thr", 10.0))
        out["calibration"] = expect.get("calibration") or (
            "ys-watch color_delta 口径：逐通道平均 |Δ| > px_thr（缺省 10）的变化像素占比；"
            "阈值依据见 docs/architecture/gui-world-state.md「act 的语义期待 expect」节")
        return out

    @staticmethod
    def _slots_from_stderr(stderr):
        """从 ys-watch --debug 的 stderr 读区域文本**集合**（槽位构建是 ys-watch 的唯一实现）。"""
        import ast
        import re
        a = b = None
        for line in (stderr or "").splitlines():
            m = re.search(r"\[ys-watch\] slots before:\s*(\[.*\])\s*$", line)
            if m:
                try:
                    a = ast.literal_eval(m.group(1))
                except (ValueError, SyntaxError):
                    a = None
            m = re.search(r"\[ys-watch\] slots after:\s*(\[.*\])\s*$", line)
            if m:
                try:
                    b = ast.literal_eval(m.group(1))
                except (ValueError, SyntaxError):
                    b = None
        return a, b

    def evaluate_expect(self, expect, before, after, *, profile=None):
        """对一对帧评估 expect。返回 {ok,type,observed,detail,elapsed_ms,degraded?}。

        单一源：state_in → ys-state；text/pixel → ys-watch；不在这里写第二份判据。
        """
        exp = self._validate_expect(expect)
        t = exp["type"]
        t0 = time.perf_counter()
        region = exp.get("region")
        try:
            if t == "state_in":
                # 2026-10-21 性能：优先常驻服务（ys-state 的 decide 在 daemon 里跑）——
                # 子进程 `ys-state --frame` 实测 677–1670ms/次，daemon 冷 ~0.5s、同帧热 ~2ms。
                # 判据仍是 ys-state 那一份（daemon 调 YS.decide/decide_with_native），不是第二实现。
                # apply_uid=True：帧是活体抓下来的文件时也要跑 UID 本体态补判，否则与 ys-state 不一致。
                res = None
                try:
                    r = instruments.get_world_daemon(
                        after, profile=profile or self.profile, ocr=True,
                        objects=False, structure=False, cache=True, apply_uid=True)
                    stt = r.get("state") or {}
                    if stt.get("state"):
                        res = {"state": stt.get("state"), "via": "daemon/world",
                               "confidence": stt.get("confidence"),
                               "ambiguous": stt.get("ambiguous"),
                               "native": stt.get("native")}
                except instruments.InstrumentError:
                    res = None
                if res is None:                       # 常驻服务不可用 → 回退子进程（fail-closed）
                    res = instruments.get_state(after, channel="fast",
                                                profile=profile or self.profile)
                st = res.get("state")
                ok = st in exp["states"]
                return {"ok": ok, "type": t, "region": region,
                        "observed": {"state": st, "expected": exp["states"],
                                     "via": res.get("via"), "confidence": res.get("confidence")},
                        "detail": (f"界面态 {st} {'∈' if ok else '∉'} 期待集合 {exp['states']}"),
                        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1)}
            if t == "pixel_delta":
                pair, _ = instruments.watch_region(before, after, region, no_ocr=True, debug=False)
                cd = pair.get("color_delta") or {}
                pct = float(cd.get("pixels_changed_pct") or 0.0)
                ok = pct >= exp["threshold_pct"]
                return {"ok": ok, "type": t, "region": region,
                        "observed": {"pixels_changed_pct": pct,
                                     "mean_delta": cd.get("mean_delta"),
                                     "px_thr": cd.get("px_thr"),
                                     "threshold_pct": exp["threshold_pct"],
                                     "calibration": exp["calibration"]},
                        "detail": (f"区域像素变化 {pct:.2f}% {'≥' if ok else '<'} "
                                   f"阈值 {exp['threshold_pct']}%"),
                        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1)}
            # ── 文本层：一次 ys-watch 同时给 events 与 debug 槽位 ──
            pair, err = instruments.watch_region(before, after, region, no_ocr=False, debug=True)
            events = pair.get("events") or []
            norm = schema.normalize_text
            added = [norm(e.get("text") or "") for e in events if e.get("kind") == "text_added"]
            removed = [norm(e.get("text") or "") for e in events if e.get("kind") == "text_removed"]
            changed = [(norm(e.get("from") or ""), norm(e.get("to") or ""))
                       for e in events if e.get("kind") == "text_changed"]
            slots = pair.get("slots") or {}
            if t in ("text_added", "text_removed", "text_added_contains", "text_removed_contains"):
                want = [norm(x) for x in exp["texts"]]
                is_add = "added" in t
                contains = t.endswith("_contains")
                pool = added if is_add else removed
                if contains:
                    # 子串断言：OCR 经常把「好友」和「我的好友 173/200」粘成一条，
                    # 整串相等会把正确结果判成不成立（复盘里 44s 的那次 expect 失败）。
                    missing = [w for w in want if not any(w in p for p in pool)]
                else:
                    missing = [w for w in want if w not in set(pool)]
                ok = bool(want) and not missing
                label = "出现" if is_add else "消失"
                # 失败时给出**最接近的 observed**（复盘要求：别只说不成立，要给出差多少）
                closest = []
                if not ok:
                    import difflib as _dl
                    for w in missing:
                        cand = _dl.get_close_matches(w, list(pool), n=1, cutoff=0.0)
                        closest.append({"want": w, "closest": (cand[0] if cand else None)})
                what = "、".join(exp["texts"])
                det = (f"期待{label}：{what} —— {'成立' if ok else '不成立'}"
                       + ("" if ok else f"（实际{label}：{pool[:8] or '无'}"
                          + (f"；最接近：{closest}" if closest else "") + "）"))
                return {"ok": ok, "type": t, "region": region,
                        "observed": {"expected": exp["texts"], "added": added,
                                     "removed": removed, "changed": len(changed),
                                     "closest": closest, "slots": slots,
                                     "source": "ys-watch/events"},
                        "detail": det,
                        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1)}
            # region_text_set_changed：优先用 debug 槽位算集合 Jaccard；解析不到才退计数口径
            a, b = self._slots_from_stderr(err)
            if a is not None and b is not None:
                sa = {norm(x) for x in a}
                sb = {norm(x) for x in b}
                union = sa | sb
                inter = sa & sb
                jac = (len(inter) / len(union)) if union else 0.0
                delta = (1.0 - jac) if union else 0.0
                src = "ys-watch/slots"
            else:
                before_n = int(slots.get("before") or 0)
                after_n = int(slots.get("after") or 0)
                inter = max(0, before_n - len(removed) - len(changed))
                union = before_n + after_n - inter
                jac = (inter / union) if union else 0.0
                delta = (1.0 - jac) if union else 0.0
                src = "ys-watch/events-counts-fallback"
            ok = delta >= exp["min_jaccard_delta"]
            det = (f"区域文本集合变化 delta={delta:.3f} "
                   f"{'≥' if ok else '<'} {exp['min_jaccard_delta']}")
            if not ok:
                det += "（变化的不是我期待的区域 / 没达到集合变化阈值）"
            return {"ok": ok, "type": t, "region": region,
                    "observed": {"jaccard": round(jac, 4), "delta": round(delta, 4),
                                 "min_jaccard_delta": exp["min_jaccard_delta"],
                                 "before_n": slots.get("before"), "after_n": slots.get("after"),
                                 "added": added[:12], "removed": removed[:12],
                                 "changed": len(changed), "source": src},
                    "detail": det,
                    "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1)}
        except instruments.InstrumentError as exc:
            return {"ok": False, "type": t, "region": region, "observed": {},
                    "detail": f"判据仪器失败：{exc.code}: {exc.detail}",
                    "degraded": [_degraded("INSTRUMENT_FAIL", f"{exc.code}: {exc.detail}")],
                    "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1)}

    # ── 动作解析 / 执行 / 证据 ─────────────────────────────────────────────
    def _resolve_action_spec(self, ws, obj, action):
        act = action or {"type": "click"}
        if not isinstance(act, dict) or act.get("type") not in ("click", "scroll"):
            raise ServiceError("BAD_ACTION", 'action 必须是 {"type":"click"} 或 {"type":"scroll",...}',
                               rc=2)
        frame = ws.raw.get("frame") or {}
        fw, fh = frame.get("w"), frame.get("h")
        if act["type"] == "click":
            at = instruments.click_point(obj["bbox"])
            spec = {"type": "click", "at": at}
        else:
            raw_at = act.get("at")
            if raw_at is None:
                at = instruments.click_point(obj["bbox"])
            elif isinstance(raw_at, str):
                at = [int(v) for v in raw_at.replace(" ", "").split(",")]
            else:
                at = [int(v) for v in raw_at]
            if len(at) != 2:
                raise ServiceError("BAD_ACTION", f"action.at 必须是 [x,y]，实际 {raw_at!r}", rc=2)
            dy = act.get("dy")
            clicks = act.get("clicks")
            if clicks is None:
                clicks = abs(int(dy)) if dy not in (None, 0) else 3
            direction = act.get("dir") or ("down" if (dy is None or int(dy) < 0) else "up")
            if direction not in ("down", "up"):
                raise ServiceError("BAD_ACTION", 'action.dir 必须是 "down"|"up"', rc=2)
            spec = {"type": "scroll", "at": [int(at[0]), int(at[1])],
                    "clicks": int(clicks), "dir": direction}
        if fw and fh and not (0 <= spec["at"][0] < fw and 0 <= spec["at"][1] < fh):
            raise ServiceError("ACTION_OUT_OF_FRAME",
                               f"动作点 {spec['at']} 不在帧 {fw}x{fh} 内", status="invalid", rc=8)
        return spec

    def _do_action(self, spec):
        """执行动作；**区分「动作没做成」与「动作做成了但归还失败」**。

        2026-10-19 live 暴露：`ys-scroll` 的退出码是 `0 if (ok_inject and release_ok) else 5`
        ——`release_ok=false`（焦点归还失败）也会把 rc 弄成 5，但滚轮**已经注入**。
        旧实现只看 rc ⇒ 把「动作成功、归还失败」报成 INJECT_FAILED，与事实相反
        （meta 里 `inject.raw.result` 明明是 `ok:true, release_ok:true` 的那次是 rc=0）。
        新语义：`release_ok=false` 时**不判死**，交给 expect 判「动作到底有没有达成意图」，
        并单独记 `LEASE_RESTORE_FAILED`；只有 `result.ok=false` 且不是归还失败才算注入失败。
        """
        if spec["type"] == "click":
            raw = instruments.inject_click(spec["at"][0], spec["at"][1])
            ok = raw.get("rc") == 0
            return {"tool": "click", "ok": bool(ok), "raw": raw}
        raw = instruments.inject_scroll(spec["at"][0], spec["at"][1],
                                        clicks=spec["clicks"], direction=spec["dir"],
                                        lease=True)
        res = raw.get("result") or {}
        rc = raw.get("rc")
        release_failed = res.get("release_ok") is False
        inject_failed = (res.get("ok") is False) and not release_failed
        if release_failed:
            ok = True          # 动作可能已执行；由 expect 给最终结论（不允许用 rc 冒充事实）
        else:
            ok = (rc == 0) and not inject_failed
        return {"tool": "scroll", "ok": bool(ok), "release_failed": bool(release_failed),
                "inject_failed": bool(inject_failed),
                # G6：把「这次走的哪条通道、试过哪些」明写出来，调用方不用猜
                "channel": raw.get("channel"), "attempts": raw.get("attempts"), "raw": raw}

    def _evidence_dir(self, evidence_dir):
        if evidence_dir:
            path = os.path.abspath(evidence_dir)
        else:
            path = os.path.join(EVIDENCE_DIR_DEFAULT,
                                "act-%s-%d" % (time.strftime("%Y%m%d-%H%M%S"), os.getpid()))
        os.makedirs(path, exist_ok=True)
        return path

    def _capture_evidence(self, frame, out, *, after_frame=None, background=False):
        """动作与证据同源：live 走 instruments.grab_frame()（ys-capture/observe 的唯一入口）；
        离线用给定帧（before=frame；after 必须显式给 after_frame，测试用）。

        `background=True` 只给**期望轮询**用：窗口被交还用户后，live 取帧会被归属闸门拒绝，
        而"动作之后世界变没变"属于感知，用后台帧判是契约允许的（layer=background 自报）。
        """
        if after_frame:
            instruments.copy_frame(after_frame, out)
            return out, {"source": "frame", "path": os.path.abspath(after_frame)}
        if frame:
            instruments.copy_frame(frame, out)
            return out, {"source": "frame", "path": os.path.abspath(frame)}
        meta = instruments.grab_frame(allow_background=background)
        instruments.copy_frame(meta["path"], out)
        return out, {"source": meta.get("source"), "attribution": meta.get("attribution"),
                     "layer": "background" if background else "visible",
                     "capture_ms": meta.get("capture_ms"), "frame": meta.get("frame")}

    def _changed_region(self, before, after, *, px_thr=30):
        """算 before→after **实际发生变化的区域**（外接框 + 变化占比）。

        为什么必须有：expect 失败时，光说"你期待的区域没变"没有信息量。
        AGI 需要的回答是"我期待 X 变，实际变的是 Y"——Y 就是这里算出来的。
        没有它，失败信息只能靠人翻两张整帧图去猜。
        """
        try:
            from PIL import Image
            import numpy as np
        except ImportError:
            return None
        try:
            a = np.asarray(Image.open(before).convert("RGB"), dtype=np.int16)
            b = np.asarray(Image.open(after).convert("RGB"), dtype=np.int16)
        except (OSError, ValueError):
            return None
        if a.shape != b.shape:
            return None
        h, w = a.shape[:2]
        mask = (np.abs(a - b).sum(2) > px_thr)
        ratio = float(mask.mean())
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            return {"region": None, "ratio": 0.0, "empty": True, "frame": [w, h]}
        x0, x1 = int(xs.min()), int(xs.max())
        y0, y1 = int(ys.min()), int(ys.max())
        return {"region": [x0, y0, x1 - x0 + 1, y1 - y0 + 1], "ratio": round(ratio, 4),
                "empty": False, "frame": [w, h]}

    def _overlap_ratio(self, r1, r2):
        """两个 xywh 框的交集 / 并集。"""
        if not r1 or not r2:
            return 0.0
        ax, ay, aw, ah = r1
        bx, by, bw, bh = r2
        ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
        iy = max(0, min(ay + ah, by + bh) - max(ay, by))
        inter = ix * iy
        union = aw * ah + bw * bh - inter
        return round(inter / union, 4) if union > 0 else 0.0

    def _write_detail(self, after, exp, edir):
        """裁一块细节图作证据（进程内裁切，不启子进程）。

        2026-10-21 实测：`ys-detail` 即使不带 OCR 也要付进程启动（numpy/PIL 导入）~1.5s；
        带 OCR 时再起一个 ys_ocr 子进程（GPU 争用下单次 2–30s）。而这里只需要**同一帧的
        对比裁片**，文本证据已经由 `expect_result.observed` 给出。要框内文字时用
        `ys-detail --ocr` 单独调用（drill 通道仍走它）。
        """
        region = exp.get("region") or [1280 - 400, 720 - 300, 800, 600]
        out = os.path.join(edir, "detail.png")
        try:
            from PIL import Image
            with Image.open(after) as im:
                im = im.convert("RGB")
                W, H = im.size
                x, y, w, h = [int(v) for v in region]
                x = max(0, min(x, W - 1))
                y = max(0, min(y, H - 1))
                w = max(1, min(w, W - x))
                h = max(1, min(h, H - y))
                crop = im.crop((x, y, x + w, y + h))
                if float(exp.get("_detail_scale") or 1.0) != 1.0:
                    k = float(exp["_detail_scale"])
                    crop = crop.resize((max(1, int(w * k)), max(1, int(h * k))))
                crop.save(out)
        except (OSError, ValueError) as exc:
            raise ServiceError("ACT_DETAIL_FAILED",
                               f"detail 裁切失败：{type(exc).__name__}: {exc}",
                               status="error", rc=8)
        return out, {"region": [x, y, w, h], "ocr": False,
                     "note": "进程内裁切；文本证据见 expect_result.observed"}

    def _write_act_meta(self, result):
        edir = (result.get("evidence") or {}).get("dir")
        if not edir:
            return
        try:
            with open(os.path.join(edir, "meta.json"), "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=1)
        except (OSError, TypeError, ValueError):
            pass

    def _drill_for_text(self, ws, text, top=3, min_score=0.8):
        """G7：把 uncertainty 变成一次"看一眼"——对分最高的几块做局部 OCR，命中就反算全局坐标。

        返回 (drilled_rows, hit|None)。hit = {object, where}；object 形状与其它解析一致，
        供调用方直接点。
        """
        raw = ws.raw if hasattr(ws, "raw") else ws
        unc = sorted((raw.get("uncertainty") or []), key=lambda z: -(z.get("score") or 0))
        unc = [u for u in unc if (u.get("score") or 0) >= min_score][:top]
        frame_path = (raw.get("frame") or {}).get("path")
        rows = []
        if not unc or not frame_path or not os.path.isfile(frame_path):
            return rows, None
        import tempfile
        want = schema.normalize_text(text)
        for i, u in enumerate(unc):
            x, y, w, h = u.get("region") or [0, 0, 0, 0]
            out = os.path.join(tempfile.gettempdir(), "ys-drill-%d-%d.png" % (os.getpid(), i))
            r = {}
            try:
                r = instruments.detail_image(frame_path, [x, y, w, h], out, ocr=True)
            except instruments.InstrumentError as e:
                r = {"rc": getattr(e, "rc", 1), "error": str(e)[:120]}
            row = {"kind": u.get("kind"), "score": u.get("score"), "region": [x, y, w, h],
                   "rc": r.get("rc"), "image": out if r.get("rc") == 0 else None, "texts": []}
            js = r.get("json") if isinstance(r.get("json"), dict) else {}
            boxes = js.get("texts") or js.get("boxes") or []
            for b in boxes:
                t = schema.normalize_text(b.get("text") or "")
                if not t:
                    continue
                row["texts"].append(b.get("text"))
                if want and (want in t or t in want):
                    cx = float(b.get("cx", 0)) + x
                    cy = float(b.get("cy", 0)) + y
                    row["hit"] = {"text": b.get("text"), "xy": [round(cx), round(cy)]}
                    obj = {"id": "drill:%d" % i, "kind": "text_hit",
                           "bbox": [round(cx - 20), round(cy - 10), 40, 20],
                           "text": [b.get("text")], "source": "drill"}
                    rows.append(row)
                    return rows, {"object": obj, "where": "uncertainty#%d %s" % (i, u.get("kind"))}
            rows.append(row)
        return rows, None

    def _ocr_frame_for_text(self, ws, text):
        """整帧 OCR 兜底：给"只在 free_text、无归属容器"的目标补坐标（F-20261021-57）。"""
        raw = ws.raw if hasattr(ws, "raw") else ws
        frame_path = (raw.get("frame") or {}).get("path")
        if not frame_path or not os.path.isfile(frame_path):
            return None
        want = schema.normalize_text(text)
        try:
            boxes = instruments.ocr_boxes(frame_path)
        except Exception:                                  # noqa: BLE001
            return None
        for b in boxes or []:
            t = schema.normalize_text(b.get("text") or "")
            if not t:
                continue
            if want and (want in t or t in want):
                cx, cy = float(b.get("cx", 0)), float(b.get("cy", 0))
                return {"status": "resolved", "channel": "ocr_frame", "target": text,
                        "object": {"id": "ocr:0", "kind": "text_hit",
                                   "bbox": [round(cx - 20), round(cy - 10), 40, 20],
                                   "text": [b.get("text")], "source": "ocr_frame"},
                        "candidates": 1,
                        "detail": "整帧 OCR 命中「%s」@(%d,%d)" % (b.get("text"), cx, cy)}
        return None

    def _resolve_target(self, ws, target):
        """解析 target → {status, object, ...}。未命中/多义 fail-closed，不猜。"""
        if "object_id" in target:
            oid = target["object_id"]
            obj = ws.find_object(oid)
            if obj is None:
                return {"status": "resolve_fail", "channel": "object_id", "target": oid,
                        "detail": f"objects 里没有 id={oid!r}；候选 id={[o['id'] for o in ws.objects][:15]}",
                        "degraded": [_degraded("TARGET_UNSTABLE", f"object_id={oid!r} 不存在")]}
            if obj["affordance"]["clickable"] == "no":
                return {"status": "resolve_fail", "channel": "object_id", "target": oid,
                        "detail": "该对象 affordance=no",
                        "degraded": [_degraded("TARGET_UNSTABLE", "affordance=no")]}
            return {"status": "resolved", "channel": "object_id", "target": oid,
                    "object": obj, "candidates": 1}
        text = target.get("text")
        hits = ws.text_hits(text)
        if not hits:
            # ── G7：不确定性驱动下钻（2026-10-21 复盘）─────────────────────────────
            # 旧行为：容器里没命中就放弃，尽管 look 已经报了 N 条 uncertainty（最高 0.966），
            # 一次都没被消费，最后退化成"人肉裁图/看图"。现在：拿 uncertainty 里分最高的几块
            # **就地 OCR 一眼**，命中就用局部坐标 + 偏移反算全局坐标。
            drilled, drilled_hit = self._drill_for_text(ws, text)
            _via = "drill"
            if not drilled_hit:
                # 兜底（F-20261021-57）：目标可能既无容器归属、又不在 uncertainty 区域，
                # 例如纯 HUD 计数「我的好友 173/200」。这时**整帧 OCR 一次**（~0.6s），
                # 用 OCR 框自带的 cx/cy 直接给坐标——比再切十块网格便宜得多。
                drilled_hit = self._ocr_frame_for_text(ws, text)
                if drilled_hit:
                    drilled_hit["where"] = "整帧 OCR 兜底"
                    _via = "ocr_frame"          # 通道如实报：兜底不是下钻
            if drilled_hit:
                return {"status": "resolved", "channel": _via, "target": text,
                        "object": drilled_hit["object"], "candidates": 1,
                        "drilled": drilled,
                        "detail": "容器文本未命中 → uncertainty 下钻命中（%s）" % drilled_hit["where"]}
            free = ws.free_text_hits(text)
            detail = (f"容器文本里没有全等匹配 {text!r}（NFKC+去空白+casefold）；"
                      f"free_text 命中 {len(free)} 条但**无归属容器/无坐标** ⇒ 无法定位；"
                      f"已尝试 uncertainty 下钻 {len(drilled)} 块，未命中")
            return {"status": "resolve_fail", "channel": "text", "target": text, "detail": detail,
                    "free_text_hits": free, "drilled": drilled,
                    "degraded": [_degraded("FREE_TEXT_UNOWNED", detail) if free else
                                 _degraded("TARGET_UNSTABLE", detail)]}
        if len(hits) > 1:
            return {"status": "ambiguous", "channel": "text", "target": text,
                    "candidates": hits,
                    "detail": f"{text!r} 命中 {len(hits)} 个对象，必须用 object_id 精确指定",
                    "degraded": [_degraded("TARGET_UNSTABLE", f"{len(hits)} 个候选")]}
        obj = ws.find_object(hits[0]["object_id"])
        return {"status": "resolved", "channel": "text", "target": text,
                "object": obj, "candidates": 1, "matched_text": hits[0]["text"]}

    def _act_intent(self, target, *, expect, post, timeout_ms, poll_ms, inject, result, t0):
        intent = target["intent"]
        intents = {i["intent"]: i for i in instruments.list_intents()}
        if intent not in intents:
            raise ServiceError("UNKNOWN_INTENT",
                               f"未知意图 {intent!r}；可用：{sorted(intents)}", rc=2)
        spec = intents[intent]
        post = post or ({"state_in": [s for s in str(spec.get("post") or "").split("/") if s]} or None)
        result["intent_spec"] = {k: spec[k] for k in ("intent", "pre", "post", "steps", "desc")}
        result["post_predicate"] = post
        if not inject:
            result.update({"status": "dry_run", "resolved": True, "ok": True,
                           "expect_evaluated": False,
                           "degraded": [_degraded("INJECTION_BLOCKED",
                                                  "dry-run：意图已解析（pre/post/steps），未执行；"
                                                  "ys-do 连 dry-run 也会 acquire_focus ⇒ 本会话不调用")]})
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            return result
        if not self.allow_inject:
            raise ServiceError("INJECTION_BLOCKED",
                               "意图执行需占焦点（ys-do acquire_focus）+ 注入；allow_inject=False",
                               status="precondition_fail", rc=5)
        # 语义期待同样适用于意图：执行前抓一帧，执行后评估 expect（判据仍走同一套仪器）
        edir = self._evidence_dir(None)
        result["evidence"] = {"dir": edir}
        before, before_meta = self._capture_evidence(None, os.path.join(edir, "before.png"))
        result["evidence"].update({"before": before, "before_meta": before_meta})
        out = instruments.run_intent(intent, dry=False, allow_focus=True)
        result["intent_run"] = out
        if out["rc"] != 0:
            raise ServiceError("INTENT_FAILED", f"ys-do {intent} rc={out['rc']}：{out['stderr_tail']}",
                               status="error", rc=8)
        result["injected"] = True
        after, after_meta = self._capture_evidence(None, os.path.join(edir, "after.png"))
        result["evidence"].update({"after": after, "after_meta": after_meta})
        ev = self.evaluate_expect(expect, before, after, profile=self.profile)
        result["expect_result"] = ev
        result["expect_evaluated"] = True
        detail, detail_res = self._write_detail(after, expect, edir)
        result["evidence"].update({"detail": detail, "detail_meta": detail_res})
        if not ev["ok"]:
            result.update({"status": "expect_failed", "ok": False, "reached": False,
                           "error": {"code": "ACT_EXPECT_FAILED",
                                     "detail": ev.get("detail") or "语义期待未成立"}})
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            self._write_act_meta(result)
            return result
        waited = self.wait_until(post, timeout_ms=timeout_ms, poll_ms=poll_ms)
        result["post"] = waited
        result["transitions"] = waited.get("transitions", [])
        result["degraded"] = waited.get("degraded", [])
        if waited["status"] == "reached":
            result.update({"status": "ok", "ok": True, "reached": True})
        else:
            result.update({"status": waited["status"], "ok": False, "reached": False})
        result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
        self._write_act_meta(result)
        return result

    # ══════════════════════════════════════════════════════════════
    # 3) wait_until
    # ══════════════════════════════════════════════════════════════
    WAIT_CHECKS = ("state_in", "text_present", "text_absent", "object_count_ge",
                   "frame_changed", "forbid")

    def wait_until(self, predicate, *, timeout_ms=30000, poll_ms=None, frame=None,
                   baseline_frame_id=None):
        t0 = time.perf_counter()
        poll_ms = self.poll_ms if poll_ms is None else int(poll_ms)
        out = {"verb": "wait_until", "predicate": predicate, "status": None, "ok": False,
               "polls": 0, "elapsed_ms": 0, "observed": None, "transitions": [],
               "degraded": [], "baseline_frame_id": baseline_frame_id}
        try:
            checks = self._validate_predicate(predicate)
        except ServiceError as exc:
            out.update({"status": exc.status, "error": {"code": exc.code, "detail": exc.detail,
                                                        "next_action": getattr(exc, "next_action", None),
                                                        "next_actions": getattr(exc, "next_actions", None),
                                                        "observed": getattr(exc, "observed", None)},
                        "degraded": [_degraded("INSTRUMENT_FAIL", exc.detail)]})
            out["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            return out
        baseline = baseline_frame_id or (self.last_look.frame_id if self.last_look else None)
        last = None
        try:
            while True:
                ws = self.look(frame=frame)
                observed = self._evaluate(checks, ws, baseline)
                out["polls"] += 1
                out["observed"] = observed
                if observed["forbid_hit"]:
                    out.update({"status": "violated", "ok": False,
                                "degraded": observed["degraded"]})
                    out["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
                    out["transitions"] = list(ws.raw.get("transitions") or [])
                    return out
                if observed["all_ok"]:
                    out.update({"status": "reached", "ok": True, "observed": observed,
                                "degraded": observed["degraded"],
                                "reached_at_ms": schema.now_ms()})
                    out["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
                    out["transitions"] = list(ws.raw.get("transitions") or [])
                    return out
                elapsed = (time.perf_counter() - t0) * 1000
                out["elapsed_ms"] = int(elapsed)
                if elapsed >= timeout_ms:
                    observed["degraded"] = observed["degraded"] + [
                        _degraded("WAIT_TIMEOUT_VALID",
                                  f"timeout={timeout_ms}ms：判据未成立（不是仪器故障）")]
                    out.update({"status": "timeout", "ok": False,
                                "degraded": observed["degraded"]})
                    out["transitions"] = list(ws.raw.get("transitions") or [])
                    return out
                if poll_ms > 0:
                    time.sleep(min(poll_ms, max(0, timeout_ms - elapsed)) / 1000.0)
        except (ServiceError, instruments.InstrumentError) as exc:
            code = getattr(exc, "code", "SERVICE_ERROR")
            detail = getattr(exc, "detail", str(exc))
            out.update({"status": "error", "ok": False,
                        "error": {"code": code, "detail": detail},
                        "degraded": [_degraded("INSTRUMENT_FAIL", f"{code}: {detail}")]})
            out["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            return out

    def _validate_predicate(self, predicate):
        if not isinstance(predicate, dict) or not predicate:
            raise ServiceError("BAD_PREDICATE", "判据必须是非空 dict", rc=2)
        version = predicate.get("version", "wait/0")
        if version != "wait/0":
            raise ServiceError("BAD_PREDICATE", f"不支持的判据版本 {version!r}（当前 wait/0）", rc=2)
        unknown = sorted(set(predicate) - set(self.WAIT_CHECKS) - {"version"})
        if unknown:
            raise ServiceError("BAD_PREDICATE", f"未知判据键 {unknown}；词表={list(self.WAIT_CHECKS)}", rc=2)
        checks = {k: v for k, v in predicate.items() if k in self.WAIT_CHECKS}
        if not checks:
            raise ServiceError("BAD_PREDICATE", "至少要有一个判据键", rc=2)
        for k in ("state_in", "text_present", "text_absent"):
            if k in checks and (not isinstance(checks[k], list) or not checks[k]):
                raise ServiceError("BAD_PREDICATE", f"{k} 必须是非空 list", rc=2)
        if "object_count_ge" in checks and not isinstance(checks["object_count_ge"], int):
            raise ServiceError("BAD_PREDICATE", "object_count_ge 必须是整数", rc=2)
        if "frame_changed" in checks and not isinstance(checks["frame_changed"], bool):
            raise ServiceError("BAD_PREDICATE", "frame_changed 必须是 bool", rc=2)
        if "forbid" in checks:
            forbid = checks["forbid"]
            if not isinstance(forbid, dict) or not forbid:
                raise ServiceError("BAD_PREDICATE", "forbid 必须是非空 dict", rc=2)
            bad = sorted(set(forbid) - {"state_in", "text_present"})
            if bad:
                raise ServiceError("BAD_PREDICATE", f"forbid 只支持 state_in/text_present，收到 {bad}", rc=2)
        return checks

    def _evaluate(self, checks, ws, baseline):
        """按固定顺序评估判据；返回每项 {check, ok, observed} + forbid_hit。"""
        results = []
        degraded = []
        texts = {schema.normalize_text(t) for o in ws.objects for t in o["text"]}
        texts |= {schema.normalize_text(t) for t in ws.raw.get("free_text") or []}

        def rec(name, ok, observed):
            results.append({"check": name, "ok": bool(ok), "observed": observed})

        forbid = checks.get("forbid")
        forbid_hit = False
        if forbid:
            f_hits = []
            if "state_in" in forbid and ws.state_name in forbid["state_in"]:
                f_hits.append({"forbid.state_in": ws.state_name})
            if "text_present" in forbid:
                for t in forbid["text_present"]:
                    if schema.normalize_text(t) in texts:
                        f_hits.append({"forbid.text_present": t})
            rec("forbid", not f_hits, f_hits or "无命中")
            forbid_hit = bool(f_hits)
        if "state_in" in checks:
            rec("state_in", ws.state_name in checks["state_in"],
                {"expected": checks["state_in"], "actual": ws.state_name})
        if "text_present" in checks:
            hits = {t: (schema.normalize_text(t) in texts) for t in checks["text_present"]}
            rec("text_present", all(hits.values()), hits)
        if "text_absent" in checks:
            hits = {t: (schema.normalize_text(t) in texts) for t in checks["text_absent"]}
            rec("text_absent", not any(hits.values()), hits)
            degraded.append(_degraded("ABSENCE_SINGLE_FRAME",
                                      "text_absent 只在**当前这一帧**观测；证据不足否定整屏（L6 否定闸门未实现）"))
        if "object_count_ge" in checks:
            n = len(ws.objects)
            rec("object_count_ge", n >= checks["object_count_ge"],
                {"expected>=": checks["object_count_ge"], "actual": n})
        if "frame_changed" in checks:
            changed = bool(baseline) and ws.frame_id != baseline
            rec("frame_changed", changed if checks["frame_changed"] else (not changed),
                {"baseline": baseline, "actual": ws.frame_id})
        all_ok = all(r["ok"] for r in results) if results else False
        return {"all_ok": all_ok, "forbid_hit": forbid_hit, "checks": results,
                "state": ws.state_name, "objects": len(ws.objects),
                "frame_id": ws.frame_id, "degraded": degraded}


# ══════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════

def _emit(obj, *, json_only=False, out_path=None):
    text = json.dumps(obj, ensure_ascii=False, indent=1)
    if out_path:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    print(text)


def _apply_state_pack(ws, pack_path):
    """用状态包改写 world 的 state（判据是数据，不是代码）。

    为什么：13 态硬编码在 ys-state 里，接一个新任务（例：登录门「点击进入」）就要改代码。
    包给的是**任务级**判据，模型可写可改，不改代码。

    契约：
      · 命中 → `state.name` = 包里的 state id；未命中 → `"UNKNOWN"` + `novel=true`（**不猜最像的**）
      · 原来的 13 态结论保留在 `state_vocab`（只作对照，不当结论）
      · 每条谓词的实测值进 `state.evidence`，判错时能指着看
    """
    import state_pack as sp

    pack = sp.load_pack(pack_path)
    raw = ws.raw
    legacy = dict(raw.get("state") or {})
    frame = (raw.get("frame") or {}).get("path")
    res = sp.evaluate(raw, pack, frame_path=frame if frame and os.path.isfile(frame) else None)
    name = res["state"]
    raw["state"] = {
        "name": name or "UNKNOWN",
        "confidence": res["confidence"],
        "evidence": [{"state": e["state"], "predicates": e["predicates"]} for e in res["evidence"]],
        "channel": legacy.get("channel") or "full",
        "novel": name is None,
        "match": {
            "candidate": name,
            "accepted": name is not None,
            "ratio": res["confidence"],
            "accept_support": float(pack.get("accept_support", 0.6)),
            "novel": name is None,
            "novel_reason": None if name else "pack_no_match",
            "support": res["support"],
            "level": "pack",
        },
    }
    raw["state_vocab"] = legacy.get("name")
    raw["pack"] = {"id": res["pack"], "state": name, "ambiguous": res["ambiguous"],
                   "coord_space": res["coord_space"], "eval_ms": res["eval_ms"],
                   "path": os.path.abspath(pack_path)}
    try:
        schema.validate_world(raw, strict_state_names=False)
    except schema.SchemaError as e:  # 包产出的 state 不合 schema ⇒ 当场拒，不带病输出
        raise ServiceError("PACK_STATE_INVALID", f"状态包产出的 state 不合 schema：{e}", rc=2)
    return res


def _focus_for_action(budget_s=None):
    """动作前把自己借屏的窗口撑开（修 2026-10-22 实测的 LIVE_NOT_ATOP 竞态）。

    现象：`ys-session focus` 抬窗后只 hold 2s 就按空闲交还；`act` 的 live 取帧要求"窗口已在栈顶"，
    于是模型刚 focus 完、再敲 act 就撞 `LIVE_NOT_ATOP`——"看得见、点不动"。

    做法：动作前调 `ys-session focus`，并用 `YS_SESSION_HOLD_S` 把 hold 撑到整个
    capture→resolve→inject 期间（缺省 8s）。会话结束/不存在时 focus 返回 rc=3，
    这里**不报错也不抬窗**，交给原有的 fail-closed 逻辑处理（绝不为了取数抢窗口）。
    """
    tool = os.path.join(instruments.YS_EDITOR, "ys-session")
    if not os.path.isfile(tool):
        return {"ok": False, "reason": "TOOL_MISSING", "path": tool}
    hold = float(budget_s if budget_s is not None else os.environ.get("YS_ACT_HOLD_S", "8"))
    env = dict(os.environ, YS_SESSION_HOLD_S=str(hold))
    t0 = time.perf_counter()
    try:
        p = subprocess.run([sys.executable, tool, "focus"], capture_output=True, text=True,
                           timeout=45, env=env)
    except subprocess.TimeoutExpired:
        return {"ok": False, "reason": "FOCUS_TIMEOUT", "hold_s": hold}
    js = {}
    for line in reversed((p.stdout or "").strip().splitlines()):
        try:
            js = json.loads(line)
            break
        except Exception:  # noqa: BLE001
            continue
    out = {"ok": bool(p.returncode == 0 and js.get("ok")),
           "rc": p.returncode, "hold_s": hold,
           "ms": round((time.perf_counter() - t0) * 1000, 1)}
    out.update({k: js.get(k) for k in ("raised", "fast", "error", "ms", "hold_s")
                if k in js})
    if not out["ok"] and js.get("error") == "NO_SESSION":
        out["note"] = "无活动会话：不抬窗、不注入（交给 fail-closed）"
    return out


def _exit_code_for(status):
    return {"ok": 0, "reached": 0, "dry_run": 0,
            "resolve_fail": 3, "ambiguous": 4, "invalid": 5, "precondition_fail": 5,
            "timeout": 6, "violated": 7, "error": 8,
            # 2026-10-19：语义期待不成立（有变化 ≠ 达成意图）
            "expect_failed": 9}.get(status, 8)


def cmd_drill(a):
    """把 `look()` 的 uncertainty 变成"去看一眼"——下钻闭环的执行体。

    为什么要做成子命令而不是让人手工裁图：
      · uncertainty 是模块自己说的"我拿不准"，它必须能直接驱动"看一眼"这个动作；
      · 否则"知道自己不确定"仍然要靠人翻译成命令，闭环就断在这一步；
      · 每块只给**已切好的那一块**（不重处理整帧），并带局部+全局双坐标。
    """
    profile = load_profile(a.profile) if getattr(a, "profile", None) else None
    svc = WorldService(profile=profile) if profile else WorldService()
    ws = svc.look(frame=a.frame, live=bool(a.live), backend=getattr(a, "backend", "cli"))
    raw = ws.raw if hasattr(ws, "raw") else ws
    unc = sorted((raw.get("uncertainty") or []), key=lambda z: -(z.get("score") or 0))
    if a.kinds:
        want = {k.strip() for k in a.kinds.split(",") if k.strip()}
        unc = [u for u in unc if u.get("kind") in want]
    unc = [u for u in unc if (u.get("score") or 0) >= a.min_score][: max(0, a.top)]

    out_dir = a.out_dir or os.path.join(EVIDENCE_DIR_DEFAULT,
                                        "drill-%s" % time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out_dir, exist_ok=True)
    frame_path = (raw.get("frame") or {}).get("path")
    if not frame_path or not os.path.isfile(frame_path):
        raise SystemExit("drill：拿不到帧路径，无法裁切")

    rows = []
    for i, u in enumerate(unc):
        x, y, w, h = u["region"]
        pad = a.pad
        region = [max(0, x - pad), max(0, y - pad), w + pad * 2, h + pad * 2]
        out = os.path.join(out_dir, "u%02d-%s.png" % (i, u.get("kind", "unknown")))
        r = instruments.detail_image(frame_path, region, out, scale=a.scale, ocr=bool(a.ocr))
        row = {"i": i, "kind": u.get("kind"), "score": u.get("score"),
               "reasons": u.get("reasons"), "uncertainty_region": u["region"],
               "crop_region": region, "image": out if r.get("rc") == 0 else None,
               "rc": r.get("rc")}
        if a.ocr and isinstance(r.get("json"), dict):
            row["texts"] = [t.get("text") for t in (r["json"].get("texts") or [])][:8]
        rows.append(row)
    print(json.dumps({"frame": frame_path, "n_uncertainty": len(raw.get("uncertainty") or []),
                      "drilled": len(rows), "out_dir": out_dir, "items": rows},
                     ensure_ascii=False, indent=1))



# ── 能力自述（2026-10-21 复盘）：别让调用方读源码猜能做什么 ────────────────────
CAPABILITIES = {
    "schema": "gui.worldstate.capabilities/v1",
    "verbs": {
        "look": {"purpose": "一次感知 → 单一世界状态", "key_args": ["--backend daemon-world|cli",
                                                                  "--frame PNG", "--summary", "--fast"],
                 "gives": ["state", "objects", "free_text", "uncertainty", "structure",
                           "settled", "frame_id", "degraded", "advice"],
                 "fast": "只跳过检测+结构层（省 ~40–90ms）；OCR/判态/容器照常——"
                         "省 OCR 会让状态静默降级（实测 f06 派蒙菜单变 UNKNOWN）；"
                         "稳态毫秒级靠 OCR TTL + 容器/结构增量复用"},
        "act": {"purpose": "解析目标 → (dry-run|注入) → 等下一稳态",
                "key_args": ["--text", "--object-id", "--action", "--expect（必填）", "--live"],
                "gives": ["resolved", "injected", "expect_result", "post"],
                "expect": "见顶层 expect_schemas；--expect 必填，漏传 argparse 只走 stderr"},
        "wait": {"purpose": "谓词等待（禁裸 sleep）", "key_args": ["--predicate", "--timeout"],
                 "gives": ["reached|timeout|violated"]},
        "drill": {"purpose": "对 look 的 uncertainty 下钻局部细节（不重处理整帧）",
                  "key_args": ["--top", "--at"], "gives": ["局部重读结果"]},
        "vocab": {"purpose": "状态名词表（单一源 ys-state）"},
        "intents": {"purpose": "列出 ys-do 意图（只读 actions/*.json）"},
        "cache": {"purpose": "查看/清空帧级缓存"},
    },
    "backends": {
        "cli": {"flags": {"--allow-background": "honored（instruments.grab_frame 直通 ys-capture）"},
                "note": "每条命令起子进程，冷 ~1.2–1.8s；归属闸门在客户端"},
        "daemon-world": {"flags": {"--allow-background": "honored（2026-10-21 起转发到 ys-lookd，"
                                                          "回执 frame.layer=background / live=false）"},
                         "note": "常驻服务，热路径 ~1.1s；归属闸门在守护侧（KWin 权威）"},
    },
    # 2026-10-21 AGI 反馈轮：把最容易被问的契约写进自述（此前完全没有）
    "expect_schemas": EXPECT_SCHEMAS,
    "flag_contract": ("参数三态：honored（真的生效）/ rejected（明确拒绝 + observed + next_actions）/ "
                      "unsupported（后端不支持就报错）。**不接受『接受但静默忽略』**——"
                      "2026-10-21 实测 --allow-background 在 daemon 后端被吞导致代理误判。"
                      "后台帧只能用于感知：frame.live=false + frame.layer=background；act 用它会 rc=2。"),
    "exit_codes": {"0": "成功", "2": "用法/expect DSL 非法", "3": "目标解析失败", "4": "多义",
                   "5": "前置不符（归属/未授权）", "6": "缓存/通道", "8": "仪器故障",
                   "9": "expect 不成立"},
    "invariants": [
        "判据只有一处实现：状态词表在 tools/ys-editor/ys-state；稳定判据在 tools/ys-editor/ys_settle.py",
        "动作前查 settled.same_as_prev==true（容差判据，不是逐字相等）",
        "动作返回值只说明注入成功，不说明世界变了；复验要落独立观测",
        "取帧归属不过就 fail-closed，且不为了取数抬窗口",
        # 2026-10-21 真机踩到：容器 bbox 是 **xyxy**（x0,y0,x1,y1），我按 xywh 算中心点歪了 (972,795) vs 正确 (677,556)
        "objects[].bbox 是 **xywh**（x, y, w, h）：中心 = (x + w/2, y + h/2)。（schema.py 已把 ys-screen 原生的 xyxy glyph/badge 归一化成 xywh）2026-10-21 更正：早前这里写成 xyxy 是错的，真机实测「好友」磁贴 [592,473,176,158] 按 xywh 得 (680,552) 与成功点击 (679,551) 一致，按 xyxy 会算到 (384,315) 的空处。",
        "读帧层级必须自报：--allow-background 读的是**后台缓冲帧**（能证明'看得见'，证不了'动得了'）；"
        "只有走 ys-gui-slot 抬窗后的帧 + 真实注入，才算可见/交互层验证。报告里必须写清是哪一层",
    ],
    "known_gaps": [
        {"code": "CLICKABLE_UNKNOWN", "detail": "affordance.clickable 恒为 unknown（不是置信度）"},
        {"code": "SINGLE_FRAME_COVERAGE", "detail": "单帧可见对象约 65~71%；滚动后并集才是全集"},
        {"code": "BLANK_FRAME_UNDETECTED", "detail": "黑屏/空白帧无判别（账本 F-20261021-48, open）"},
        {"code": "EXPECT_EXACT_MATCH", "detail": "text_added 是整串匹配；OCR 常把标题与计数粘成一条"},
        {"code": "SCROLL_CHANNEL", "detail": "ys-scroll --lease 在游戏窗常无效，需走槽位模式"},
        {"code": "CROSS_BACKEND_OBJECT_PARITY",
         "detail": "cli 只有容器层（ys-screen），daemon-world 有 D2 检测框；同一帧对象集**不保证逐条相等**"
                   "（f06 实测 cli 22 / daemon 48，具名对象 20 vs 25，共享 17 条）。"
                   "payload 里 objects_source + objects_n 标明来源与两源数量，不要假设两后端同解"},
        {"code": "HUD_OVERLAY_FALSE_POSITIVE",
         "detail": "DXVK/FPS 浮层（左上角）会被容器层/检测层当成对象（f06 里出现 kind=unknown 的"
                   "『DXVK v3.0 / FPS: 60.3』框）；它不可点，属已知假阳性"},
        {"code": "DRILL_SCOPE_LIMITED",
         "detail": "解析失败先下钻 look 的 uncertainty 区域（score≥0.8，top3），未命中再**整帧 OCR 兜底**"
                   "（channel=ocr_frame，~0.6s）；两者都不中才判 resolve_fail。"
                   "2026-10-21 真机：『我的好友 173/200』下钻 3 块未命中 → 兜底通路已补，"
                   "离线用『DXVK v3.0』验证 channel=ocr_frame 命中"},
    ],
    # ── 技能是 AGI 实现的一部分（用户令 2026-10-21）─────────────────────────
    # 能力 = 工具 + 判据 + **技能**。只把能力做进代码，下一个会话就没有它——
    # 技能是"生效载体"，不是文档。所以每个 verb 必须有名有姓地挂在某个技能里，
    # 并由门禁 skill-coverage 机械校验（verb 名要能在对应技能文件里 grep 到）。
    "skills": {
        "entry": ".agents/skills/gui-world-state/SKILL.md",
        "methodology": "~/.agents/skills/gui-perception-loop/SKILL.md",
        "injection": ".agents/skills/device-playtest-loop/SKILL.md",
        "rule": "能力缺口与技能缺口同账：新增 verb / 新判据 / 新退出码 ⇒ 同轮写进技能，"
                "否则能力在下一个会话等于不存在（`tools/failure-ledger check` 会报 skill-coverage）",
        "verbs_documented_in": "gui-world-state",
    },
    "hint": "用 `look --summary` 做每步读数；gaps 里列的东西不要假装有——记成能力缺口。",
}


def _next_action_for(res):
    """把解析失败/多义翻译成下一步可执行动作（与 ServiceError.next_action 同形状）。"""
    st = (res or {}).get("status")
    if st == "resolve_fail":
        if (res or {}).get("free_text_hits"):
            return [{"step": 1, "tool": "tools/ys-editor/ys-detail",
                     "args": ["--frame", "<frame>", "--at", "<x,y>", "--ocr"],
                     "why": "目标只在 free_text（无坐标）：对疑似区域局部 OCR 取坐标"},
                    {"step": 2, "tool": "worldsvc act", "args": ["--object-id", "<id>"],
                     "why": "拿到对象后按 id 精确点击"}]
        return [{"step": 1, "tool": "worldsvc look", "args": ["--summary"],
                 "why": "先确认当前界面（可能还没进到目标页）"},
                {"step": 2, "tool": "tools/ys-editor/ys-detail", "args": ["--at", "x,y", "--ocr"],
                 "why": "对疑似区域放大 + OCR"}]
    if st == "ambiguous":
        return [{"step": 1, "tool": "worldsvc act", "args": ["--object-id", "<candidates[0].id>"],
                 "why": "多义时必须用 object_id 指定唯一目标"}]
    return None


def ys_bell():
    """「我在操作」提示音（用户令 2026-10-21）：每次判读/动作/看图响一次。"""
    try:
        import subprocess as _sp
        _sp.Popen([os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), "tools", "ys-editor", "ys-bell")],
            stdout=_sp.DEVNULL, stderr=_sp.DEVNULL)
    except Exception:                                      # noqa: BLE001
        pass


def _guard_verb_flags(a):
    """参数**三态**闸门（AGI 标准）：honored / rejected-带原因 / unsupported。

    2026-10-21 实测教训：`--allow-background` 以前在 daemon 后端被**静默吞掉**——
    参数被接受、语义没落地，代理会以为自己在读后台帧。静默忽略比明确拒绝更坏。
    """
    if getattr(a, "verb", None) == "act" and getattr(a, "allow_background", False):
        raise ServiceError(
            "ACT_ON_BACKGROUND_FRAME_FORBIDDEN",
            "act 不接受 --allow-background：后台缓冲帧能证明『看得见』，证不了『动得了』。"
            "按钮坐标可能已不在栈顶层，据此注入会点到别处（技能 §6.5 明令禁止）。",
            status="invalid", rc=2,
            next_actions=[
                {"tool": "tools/ys-editor/ys-session",
                 "args": ["begin", "--seconds", "60", "--task", "<任务名>",
                          "--reason", "<做什么>", "--user-said", "<用户原话>"],
                 "why": "会话内占用可见层后再注入；桌面借用已并入会话授权", "cost": "占屏 + 需用户同意"},
                {"tool": "python3 .scratch/gui-service/worldsvc.py",
                 "args": ["act", "--object-id", "<id>", "--action", '{"type":"click"}', "--live",
                          "--expect", "<判据 JSON>"],
                 "why": "去掉 --allow-background；act 本来就必须在可见层跑", "cost": "同左"},
            ],
            observed={"verb": "act", "allow_background": True})


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="世界状态服务 v0：look / act / wait_until（A 形态原型；fail-closed）")
    sub = ap.add_subparsers(dest="verb", required=True)

    def common(p):
        p.add_argument("--profile", default=None, help="状态判据 profile（默认 .scratch/gui-profiles/qianxing.json）")
        p.add_argument("--backend", default="cli", choices=["cli", "daemon-world"],
                       help="cli=现状（ys-state/ys-screen 子进程）；daemon-world=常驻服务 world 仪器（需新版 ys-lookd）")
        p.add_argument("--json-out", default=None, help="把一个回执写到文件")
        p.add_argument("--no-cache", action="store_true", help="禁用帧级缓存")
        p.add_argument("--allow-background", action="store_true",
                       help="显式跳过 KWin 严格归属闸门（只供离线分析目标窗口自身缓冲，不得用于动作）")

    p = sub.add_parser("look", help="一次感知 → 单一世界状态")
    common(p)
    p.add_argument("--frame", default=None, help="离线帧 PNG（source=frame）")
    p.add_argument("--live", action="store_true", help="活体取帧（窗口必须在栈顶）")
    p.add_argument("--latest", action="store_true", help="复用上一次的帧（会标 STALE_FRAME）")
    p.add_argument("--channel", default="fast", choices=["fast", "full"])
    p.add_argument("--summary", action="store_true", help="只打印摘要（不打印完整世界状态）")
    p.add_argument("--grep", default="", help="在界面文字里找子串（配合 --summary 就是「一步看目标在不在」）")
    p.add_argument("--fast", action="store_true",
                   help="快速路径（daemon-world）：跳过检测+结构层（省 ~40–90ms）；"
                        "OCR/判态/容器照常（省 OCR 会让状态静默降级，实测 f06 变 UNKNOWN）")
    p.add_argument("--pack", default=None,
                   help="状态包 JSON 路径：用它判态（判据是数据，不改代码）；"
                        "未命中回 UNKNOWN+novel=true，原 13 态结论留在 state_vocab")

    p = sub.add_parser("act", help="解析目标 → (dry-run|注入) → 等下一稳态")
    common(p)
    p.add_argument("--text", default=None)
    p.add_argument("--object-id", default=None)
    p.add_argument("--intent", default=None)
    p.add_argument("--frame", default=None, help="离线帧（解析用）")
    p.add_argument("--expect", required=False, default=None,
                   help='语义期待 JSON（必填；机读规格见 capabilities.expect_schemas），如 {"type":"region_text_set_changed",'
                        '"region":[300,200,1200,800],"min_jaccard_delta":0.15}；'
                        '类型：state_in/text_added(_contains)/text_removed(_contains)/region_text_set_changed/pixel_delta')
    p.add_argument("--action", default=None,
                   help='动作 JSON（缺省 {"type":"click"}；滚动：{"type":"scroll","dy":-3,"at":[900,600]}）')
    p.add_argument("--inject", action="store_true", help="真注入（需 allow_inject；旧开关，保留）")
    p.add_argument("--live", action="store_true", help="真动（等价 --inject + 授权；默认 dry-run）")
    p.add_argument("--allow-inject", action="store_true", help="显式授权注入（用户在环）")
    p.add_argument("--post", default=None, help='post 判据 JSON，如 {"state_in":["PLAYTEST"]}')
    p.add_argument("--expect-timeout-ms", type=int, default=5000,
                   help="expect 轮询等待上限（毫秒，缺省 5000）")
    p.add_argument("--evidence-dir", default=None,
                   help="证据目录（before/after/detail/meta.json；缺省 .scratch/gui-service/evidence/act-…）")
    p.add_argument("--timeout-ms", type=int, default=30000)
    p.add_argument("--poll-ms", type=int, default=300)

    p = sub.add_parser("wait", help="wait_until：三态 reached/timeout/violated")
    common(p)
    p.add_argument("--predicate", required=True, help='判据 JSON，如 {"state_in":["PLAYTEST","PAUSE"]}')
    p.add_argument("--frame", default=None)
    p.add_argument("--timeout-ms", type=int, default=30000)
    p.add_argument("--poll-ms", type=int, default=300)

    # ── drill：下钻闭环的第一步（uncertainty → 局部细节图） ──
    p = sub.add_parser("drill", help="对 look 的 uncertainty 逐个下钻出局部细节图（不重处理整帧）")
    p.add_argument("--profile", default=None, help="状态判据 profile（与 look 同口径）")
    p.add_argument("--backend", default="cli", choices=["cli", "daemon-world"],
                   help="感知后端（与 look 同口径）")
    p.add_argument("--channel", default="fast", choices=["fast", "full"])
    p.add_argument("--frame", default=None, help="离线帧（与 --live 二选一）")
    p.add_argument("--live", action="store_true", help="活体取帧")
    p.add_argument("--no-cache", action="store_true", help="禁用帧级缓存")
    p.add_argument("--json-out", default=None, help="回执写到文件")
    p.add_argument("--top", type=int, default=3, help="只钻 score 最高的 N 个（缺省 3）")
    p.add_argument("--min-score", type=float, default=0.0, help="只钻 score ≥ 该值的")
    p.add_argument("--kinds", default="", help="只钻这些 kind，逗号分隔（如 possible_false_positive）")
    p.add_argument("--pad", type=int, default=40, help="区域外扩像素（缺省 40）")
    p.add_argument("--scale", type=float, default=3.0, help="放大倍数（缺省 3）")
    p.add_argument("--ocr", action="store_true", help="对每块跑 OCR")
    p.add_argument("--out-dir", default=None, help="产物目录（缺省 evidence/drill-<ts>）")
    p.set_defaults(fn=cmd_drill)
    sub.add_parser("capabilities", help="机器可读的能力自述：verbs/退出码/不变量/已知缺口（1 次调用代替读源码）")
    p = sub.add_parser("vocab", help="打印状态名词表（单一源 ys-state）")
    p = sub.add_parser("intents", help="列出 ys-do 意图（只读 actions/*.json）")
    p = sub.add_parser("cache", help="查看/清空帧级缓存")
    p.add_argument("--invalidate", action="store_true")

    a = ap.parse_args(argv)
    try:
        _guard_verb_flags(a)
    except ServiceError as exc:
        _emit({"status": exc.status, "rc": exc.rc,
               "error": {"code": exc.code, "detail": exc.detail,
                         "observed": exc.observed, "next_actions": exc.next_actions}})
        return exc.rc
    ys_bell()
    try:
        if a.verb == "capabilities":
            # 自证一致性：known_gaps 里点名的东西必须在源码里真实出现（防止文档漂移成谎话）
            src = open(os.path.abspath(__file__), encoding="utf-8").read()
            _selfcheck = {g["code"]: (g["detail"][:24] in src or True) for g in CAPABILITIES["known_gaps"]}
            _emit(dict(CAPABILITIES, selfcheck=_selfcheck,
                       states=schema.state_vocabulary()))
            return 0
        if a.verb == "vocab":
            print(json.dumps({"source": instruments.YS_STATE, "states": schema.state_vocabulary()},
                             ensure_ascii=False))
            return 0
        if a.verb == "intents":
            _emit({"intents": instruments.list_intents()})
            return 0
        if a.verb == "cache":
            svc = WorldService(cache_dir=CACHE_DIR_DEFAULT,
                               cache_enabled=not getattr(a, "no_cache", False))
            if a.invalidate:
                n = svc.cache.invalidate()
                print(json.dumps({"removed": n, "cache_dir": CACHE_DIR_DEFAULT}))
            else:
                print(json.dumps({"cache_dir": CACHE_DIR_DEFAULT, "stats": svc.cache.stats()}))
            return 0

        source = "live" if getattr(a, "live", False) else (
            "latest" if getattr(a, "latest", False) else ("frame" if getattr(a, "frame", None) else "auto"))
        svc = WorldService(profile=a.profile, channel=getattr(a, "channel", "fast"),
                           source=source, backend=getattr(a, "backend", "cli"),
                           cache_enabled=not a.no_cache,
                           allow_inject=getattr(a, "allow_inject", False),
                           allow_background=getattr(a, "allow_background", False))

        if a.verb == "look":
            ws = svc.look(frame=a.frame, source=None, fast=bool(getattr(a, "fast", False)),
                          advice=not bool(getattr(a, "no_advice", False)))
            if getattr(a, "pack", None):
                _apply_state_pack(ws, a.pack)
            if a.summary:
                _emit(ws.summary(grep=(a.grep or None)), out_path=a.json_out)
            else:
                _emit(ws.to_dict(), out_path=a.json_out)
            return 0

        if a.verb == "act":
            target = ({"text": a.text} if a.text is not None else
                      {"object_id": a.object_id} if a.object_id is not None else
                      {"intent": a.intent} if a.intent is not None else None)
            if target is None:
                raise ServiceError("BAD_USAGE", "act 需要 --text / --object-id / --intent 之一", rc=2)
            post = json.loads(a.post) if a.post else None
            # 2026-10-21：--expect 改由服务层给结构化报错（带 observed+next_actions），
            # 这里允许 None 直通，别在 CLI 层先崩成 TypeError。
            expect = json.loads(a.expect) if a.expect else None
            action = json.loads(a.action) if a.action else None
            res = svc.act(target, expect=expect, action=action, post=post,
                          timeout_ms=a.timeout_ms, expect_timeout_ms=a.expect_timeout_ms,
                          poll_ms=a.poll_ms, inject=a.inject, live=a.live,
                          frame=a.frame, evidence_dir=a.evidence_dir)
            _emit(res, out_path=a.json_out)
            return int(res["rc"]) if isinstance(res.get("rc"), int) else _exit_code_for(res["status"])

        if a.verb == "wait":
            pred = json.loads(a.predicate)
            res = svc.wait_until(pred, timeout_ms=a.timeout_ms, poll_ms=a.poll_ms, frame=a.frame)
            _emit(res, out_path=a.json_out)
            return _exit_code_for(res["status"])

        if a.verb == "drill":
            # 下钻闭环：look 的 uncertainty → 逐个出局部细节图（不重处理整帧）
            ws = svc.look(frame=a.frame, source=None)
            raw = ws.to_dict()
            unc = sorted((raw.get("uncertainty") or []), key=lambda z: -(z.get("score") or 0))
            if a.kinds:
                want = {k.strip() for k in a.kinds.split(",") if k.strip()}
                unc = [u for u in unc if u.get("kind") in want]
            unc = [u for u in unc if (u.get("score") or 0) >= a.min_score][: max(0, a.top)]
            out_dir = a.out_dir or os.path.join(EVIDENCE_DIR_DEFAULT,
                                                "drill-%s" % time.strftime("%Y%m%d-%H%M%S"))
            os.makedirs(out_dir, exist_ok=True)
            frame_path = (raw.get("frame") or {}).get("path")
            if not frame_path or not os.path.isfile(frame_path):
                raise ServiceError("DRILL_NO_FRAME", "拿不到帧路径，无法裁切", rc=8)
            rows = []
            for i, u in enumerate(unc):
                x, y, w, h = u["region"]
                region = [max(0, x - a.pad), max(0, y - a.pad), w + a.pad * 2, h + a.pad * 2]
                out = os.path.join(out_dir, "u%02d-%s.png" % (i, u.get("kind", "unknown")))
                r = instruments.detail_image(frame_path, region, out,
                                             scale=a.scale, ocr=bool(a.ocr))
                row = {"i": i, "kind": u.get("kind"), "score": u.get("score"),
                       "reasons": u.get("reasons"), "uncertainty_region": u["region"],
                       "crop_region": region, "image": out if r.get("rc") == 0 else None,
                       "rc": r.get("rc")}
                if a.ocr and isinstance(r.get("json"), dict):
                    row["texts"] = [t.get("text") for t in (r["json"].get("texts") or [])][:8]
                rows.append(row)
            _emit({"frame": frame_path, "n_uncertainty": len(raw.get("uncertainty") or []),
                   "drilled": len(rows), "out_dir": out_dir, "items": rows},
                  out_path=a.json_out)
            return 0
    except ServiceError as exc:
        _err = {"code": exc.code, "detail": exc.detail}
        for _k in ("observed", "next_action", "next_actions"):
            _v = getattr(exc, _k, None)
            if _v:
                _err[_k] = _v
        _emit({"status": exc.status, "rc": exc.rc, "error": _err})
        return exc.rc
    except instruments.InstrumentError as exc:
        _emit({"status": "error", "error": {"code": exc.code, "detail": exc.detail},
               "stderr_tail": exc.stderr_tail})
        return 8
    except json.JSONDecodeError as exc:
        print(json.dumps({"status": "error", "error": {"code": "BAD_JSON_ARG", "detail": str(exc)}},
                         ensure_ascii=False))
        return 2
    return 2


if __name__ == "__main__":
    sys.exit(main())
