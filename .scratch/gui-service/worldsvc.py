#!/usr/bin/env python3
"""worldsvc.py — A 形态世界状态服务原型：look() / act(target) / wait_until(判据)。

三动词契约（`.scratch/gui-stack/AGI-BAR.md` §三/§四，2026-10-18 用户裁决）：
  look()               一次感知 → **单一世界状态**（schema.py 定义）；返回回执，不返回像素。
  act(target)          解析目标 →（dry-run 或注入）→ 等下一稳态；注入动作**必须有 post 判据**。
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

退出码（CLI）：0 成功/命中；2 用法或判据非法；3 目标解析失败；4 目标多义；
              5 前置不符（窗口不在栈顶、缺 post 等）；6 超时；7 violated；8 仪器/schema 故障。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import schema
import instruments
from cache import FrameCache

REPO_ROOT = schema.repo_root()
CACHE_DIR_DEFAULT = os.path.join(REPO_ROOT, ".scratch", "gui-service", ".cache")


class ServiceError(RuntimeError):
    """服务级失败（fail-closed）。code 稳定、detail 人读、status 用于回执。"""

    def __init__(self, code, detail, *, status="error", rc=8):
        self.code = code
        self.detail = detail
        self.status = status
        self.rc = rc
        super().__init__(f"[{code}] {detail}")


def _degraded(code, detail=""):
    return {"code": code, "detail": detail}


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
    def look(self, frame=None, *, source=None, allow_cache=True):
        t_start = time.perf_counter()
        src = source or (self.source if frame is None else "frame")
        if self.backend == "daemon-world":
            return self._look_worlddaemon(frame, src, allow_cache, t_start)
        if frame is None and self.frame_provider is not None:
            frame = self.frame_provider()
            src = "provider"
        frame_meta = self._acquire_frame(frame, src)
        path = frame_meta["path"]

        frame_id = self._frame_id(path)
        cache_hit = None
        if allow_cache and self.cache.enabled:
            raw, layer, hit_ms = self.cache.load(frame_id, self.sig)
            if raw is not None:
                cache_hit = {"hit": True, "layer": layer, "hit_ms": round(hit_ms, 2)}
                timing = {"total": round(hit_ms, 2), "cache_layer": layer}
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
        schema.validate_world(raw, strict_state_names=bool(schema.state_vocabulary()))
        t_validate = (time.perf_counter() - t0) * 1000

        timing = {"state": round(t_state, 1), "objects": round(t_obj, 1),
                  "validate": round(t_validate, 2),
                  "total": round((time.perf_counter() - t_start) * 1000, 1)}
        # 缓存只存与本次调用无关的静态部分；timing/cache/transitions 每次重算
        self.cache.store(frame_id, self.sig, {k: v for k, v in raw.items()
                                             if k not in ("timing_ms", "cache", "transitions",
                                                          "tracked_at_ms")})
        raw = self._finalize(raw, frame_meta=frame_meta, frame_id=frame_id,
                             timing=timing, cache_hit={"hit": False, "layer": "miss"},
                             t_start=t_start, validate_ms=t_validate)
        return self._publish(raw)

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
    def _look_worlddaemon(self, frame, src, allow_cache, t_start):
        """显式 backend（默认 cli 完全不变）：一次 RPC 拿回 state+objects+timing+归属。

        与 cli 后端的语义差异（如实说明，不假装等价）：
          · live：由常驻服务自己抓帧并先做归属校验（票 34）——客户端不抓、不落 PNG；
          · 离线帧：常驻服务带帧缓冲/OCR 内容寻址缓存/容器缓存/结果缓存，同帧第二次 ≤5ms；
          · 旧常驻服务（没有 world 命令）→ DAEMON_ERROR，调用方需显式回退 cli。
        """
        if frame is None and self.frame_provider is not None:
            frame = self.frame_provider()
            src = "provider"
        frame_meta, path = self._daemon_frame_meta(frame, src)
        frame_id = None
        if path:
            frame_id = self._frame_id(path)
            if allow_cache and self.cache.enabled:
                raw, layer, hit_ms = self.cache.load(frame_id, self.sig)
                if raw is not None:
                    frame_meta = dict(frame_meta, source=src)
                    return self._publish(self._finalize(
                        raw, frame_meta=frame_meta, frame_id=frame_id,
                        timing={"total": round(hit_ms, 2), "cache_layer": layer},
                        cache_hit={"hit": True, "layer": layer, "hit_ms": round(hit_ms, 2)},
                        t_start=t_start, validate_ms=0.0))
        t0 = time.perf_counter()
        resp = instruments.get_world_daemon(path, profile=self.profile,
                                            ocr=True, objects=True, cache=self.daemon_cache)
        rpc_ms = (time.perf_counter() - t0) * 1000
        state = resp.get("state") or {}
        if not state.get("state"):
            raise ServiceError("DAEMON_WORLD_BAD", f"world 回执缺 state：{str(resp)[:300]}")
        frame_id = "sha256:" + str(resp["frame"]["sha256"])
        if frame_id != "sha256:" + str(resp["frame"]["sha256"]):
            raise ServiceError("DAEMON_WORLD_BAD", "frame sha 非法")
        objects = [schema.object_from_container(c, frame_id=frame_id)
                   for c in ((resp.get("objects") or {}).get("containers") or [])]
        free_text = [str(t) for t in ((resp.get("objects") or {}).get("free_text") or [])]
        cont_degr = bool((resp.get("objects") or {}).get("degraded") or
                         (resp.get("objects") or {}).get("error"))
        degraded = self._degraded_list(objects, free_text,
                                       state_name=state.get("state"),
                                       objects_degraded=cont_degr)
        for d in resp.get("degraded") or []:
            if isinstance(d, dict) and d.get("code"):
                degraded.append(d)
        st = {"name": state.get("state"), "confidence": state.get("confidence"),
              "ambiguous": bool(state.get("ambiguous")),
              "evidence": [{"source": "ys-lookd/world", "via": "daemon",
                            "readings_n": len(state.get("readings") or {}),
                            "native": state.get("native"),
                            "attribution": resp.get("attribution")}],
              "channel": "fast", "native": state.get("native", False)}
        raw = schema.new_world(
            frame_id=frame_id, captured_at_ms=int(frame_meta["captured_at_ms"]),
            state=st, objects=objects, free_text=free_text, degraded=degraded,
            timing_ms=dict(resp.get("timing") or {}, rpc=round(rpc_ms, 1)),
            frame=dict(frame_meta, **{"w": resp["frame"].get("w"),
                                      "h": resp["frame"].get("h")}),
            budget_ms=self.budget_ms)
        raw["attribution"] = resp.get("attribution")
        raw["structure"] = resp.get("structure")   # D3 结构层（groups/rows/pitch），随世界状态一起返回
        raw["daemon_timing"] = resp.get("timing")
        schema.validate_world(raw, strict_state_names=bool(schema.state_vocabulary()))
        if path:
            self.cache.store(frame_id, self.sig,
                             {k: v for k, v in raw.items()
                              if k not in ("timing_ms", "cache", "transitions", "tracked_at_ms")})
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
        self._last_frame = meta
        return meta, None

    def _degraded_list(self, objects, free_text, *, state_name, objects_degraded):
        degraded = []
        if state_name == "UNKNOWN":
            degraded.append(_degraded("STATE_UNKNOWN", "常驻服务判不出状态；证据见 state.evidence"))
        if objects_degraded:
            degraded.append(_degraded("OBJECTS_DEGRADED", "容器层 degraded/error，见 daemon 回执"))
        n_unknown = sum(1 for o in objects if o["kind"] == "unknown")
        if n_unknown:
            degraded.append(_degraded("KIND_UNKNOWN",
                                      f"{n_unknown}/{len(objects)} 个对象 kind=unknown（L1 学习型检测未接入）"))
        if free_text:
            degraded.append(_degraded("FREE_TEXT_UNOWNED",
                                      f"{len(free_text)} 条文本没有容器归属，act(text) 解析不到"))
        degraded.append(_degraded("L2_NOT_IMPLEMENTED", "groups=[]：容器 parent 链未闭合（票 26）"))
        degraded.append(_degraded("L3_NOT_IMPLEMENTED", "对象 state 三字段=null、clickable 恒 unknown（票 27/28）"))
        if not schema.state_vocabulary():
            degraded.append(_degraded("STATE_VOCAB_UNVERIFIED", "读不到 ys-state 的 STATES 元组"))
        return degraded

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
                raw = instruments.grab_frame(allow_background=self.allow_background)
            except instruments.InstrumentError as e:
                raise ServiceError(
                    "LIVE_NOT_ATOP",
                    f"取帧被拒绝（{e.code}）：{e.detail}；本服务绝不为了取数抬窗口 —— "
                    "请用 --frame 指定离线帧，或把窗口切到当前桌面/置顶",
                    status="precondition_fail", rc=5)
            path = os.path.abspath(raw["path"])
            meta = {"path": path, "source": "live",
                    "captured_at_ms": int(time.time() * 1000),
                    "captured_at_ms_source": "capture_clock",
                    "live": True,
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
        attr = instruments.attrib_fast()
        if attr.get("verdict") != "OK":
            raise ServiceError(
                "LIVE_NOT_ATOP",
                f"窗口归属校验未通过（verdict={attr.get('verdict')}，rc={attr.get('rc')}）；"
                "本服务绝不为了取数抬窗口 —— 请用 --frame 指定离线帧，或把窗口切到当前桌面/置顶",
                status="precondition_fail", rc=5)
        return self._acquire_frame(None, "live")

    def _build_world(self, *, frame_meta, frame_id, state_res, cont_res, timing, screen_frame=None):
        state_name = state_res.get("state") or "UNKNOWN"
        evidence = [{
            "source": "ys-state",
            "channel": state_res.get("channel") or self.channel,
            "via": state_res.get("via"),
            "confidence": state_res.get("confidence"),
            "ambiguous": state_res.get("ambiguous"),
            "margin": state_res.get("margin"),
            "verdicts": state_res.get("verdicts"),
            "readings": state_res.get("readings"),
            "native": state_res.get("native"),
            "judge_ms": state_res.get("judge_ms"),
            "rc": state_res.get("_rc"),
        }]
        st = {"name": state_name, "confidence": state_res.get("confidence"),
              "ambiguous": bool(state_res.get("ambiguous")),
              "evidence": evidence,
              "channel": state_res.get("channel") or self.channel,
              "native": state_res.get("native", False)}

        objects = [schema.object_from_container(c, frame_id=frame_id)
                   for c in (cont_res.get("containers") or [])]
        free_text = [str(t) for t in (cont_res.get("free_text") or [])]

        degraded = []
        if state_name == "UNKNOWN":
            degraded.append(_degraded("STATE_UNKNOWN",
                                      f"ys-state rc={state_res.get('_rc')} 判不出状态；证据见 state.evidence"))
        if cont_res.get("degraded"):
            degraded.append(_degraded("OBJECTS_DEGRADED", str(cont_res.get("degraded"))[:300]))
        if cont_res.get("error"):
            degraded.append(_degraded("OBJECTS_DEGRADED", "error=" + str(cont_res.get("error"))[:300]))
        n_unknown_kind = sum(1 for o in objects if o["kind"] == "unknown")
        if n_unknown_kind:
            degraded.append(_degraded("KIND_UNKNOWN",
                                      f"{n_unknown_kind}/{len(objects)} 个对象 kind=unknown（L1 学习型检测未接入）"))
        if free_text:
            degraded.append(_degraded("FREE_TEXT_UNOWNED",
                                      f"{len(free_text)} 条文本没有容器归属，act(text) 解析不到（需要切片/坐标通道）"))
        degraded.append(_degraded("L2_NOT_IMPLEMENTED", "groups=[]：容器 parent 链未闭合（AGI-BAR 票 26）"))
        degraded.append(_degraded("L3_NOT_IMPLEMENTED",
                                  "对象 state 三字段=null、affordance.clickable 恒 unknown（AGI-BAR 票 27/28）"))
        if not schema.state_vocabulary():
            degraded.append(_degraded("STATE_VOCAB_UNVERIFIED", "读不到 tools/ys-editor/ys-state 的 STATES 元组"))

        frame_meta = dict(frame_meta)
        sf = screen_frame or {}
        if sf.get("w") and sf.get("h"):
            frame_meta.update({"w": sf.get("w"), "h": sf.get("h"), "bytes": sf.get("bytes")})

        return schema.new_world(
            frame_id=frame_id,
            captured_at_ms=int(frame_meta["captured_at_ms"]),
            state=st, objects=objects, free_text=free_text,
            degraded=degraded, timing_ms=timing, frame=frame_meta,
            budget_ms=self.budget_ms,
        )

    def _finalize(self, raw, *, frame_meta, frame_id, timing, cache_hit, t_start, validate_ms):
        raw = json.loads(json.dumps(raw))     # 深拷贝：缓存出来的对象不能被调用方改脏
        raw["frame_id"] = frame_id
        raw["timing_ms"] = timing
        raw["frame"] = dict(frame_meta)
        age_ms = schema.now_ms() - int(frame_meta["captured_at_ms"])
        raw["frame"]["age_ms"] = age_ms
        raw["frame"]["stale"] = age_ms > self.max_age_ms
        raw["cache"] = cache_hit
        raw["tracked_at_ms"] = schema.now_ms()
        # 预算门禁：超预算要**说出来**（AGI-BAR §一「静默失能已犯 6 次」）
        total = float(timing.get("total") or 0.0)
        degraded = [d for d in raw["degraded"]
                    if d.get("code") not in ("BUDGET_EXCEEDED", "FRAME_PINNED", "STALE_FRAME")]
        if raw["frame"]["source"] == "frame":
            degraded.append(_degraded("FRAME_PINNED",
                                      f"离线帧（source=frame，age≈{age_ms}ms）：不是活体读数，act 不会据此注入"))
        elif raw["frame"].get("stale"):
            degraded.append(_degraded("STALE_FRAME",
                                      f"复用的帧已 {age_ms}ms（> max_age_ms={self.max_age_ms}）"))
        if total > float(self.budget_ms["total"]):
            degraded.append(_degraded("BUDGET_EXCEEDED",
                                      f"total={total:.1f}ms > budget.total={self.budget_ms['total']}ms"
                                      f"（state={timing.get('state')}ms objects={timing.get('objects')}ms）"))
        raw["degraded"] = degraded
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
    def act(self, target, *, post=None, timeout_ms=30000, poll_ms=None, inject=False,
            frame=None, allow_inject=None):
        t0 = time.perf_counter()
        poll_ms = self.poll_ms if poll_ms is None else int(poll_ms)
        allow_inject = self.allow_inject if allow_inject is None else bool(allow_inject)
        result = {
            "verb": "act", "target": target, "status": None, "ok": False,
            "resolved": False, "injected": False, "reached": None,
            "post_predicate": post, "post": None, "transitions": [],
            "degraded": [], "evidence": {}, "elapsed_ms": 0,
        }
        try:
            if not isinstance(target, dict) or not any(k in target for k in ("text", "object_id", "intent")):
                raise ServiceError("BAD_TARGET",
                                   "target 必须是 {text} | {object_id} | {intent} 之一", rc=2)
            if "intent" in target:
                return self._act_intent(target, post=post, timeout_ms=timeout_ms, poll_ms=poll_ms,
                                        inject=inject, result=result, t0=t0)
            ws = self.look(frame=frame)
            resolution = self._resolve_target(ws, target)
            result["resolution"] = resolution
            if resolution["status"] != "resolved":
                result.update({"status": resolution["status"], "ok": False,
                               "degraded": resolution.get("degraded", [])})
                result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
                return result
            obj = resolution["object"]
            point = instruments.click_point(obj["bbox"])
            # 防御断言：点击点必须落在帧内（2026-10-18 实测：bbox 格式错会让点落到 y=1647）
            fw = (ws.raw.get("frame") or {}).get("w")
            fh = (ws.raw.get("frame") or {}).get("h")
            if fw and fh and not (0 <= point[0] < fw and 0 <= point[1] < fh):
                raise ServiceError("CLICK_OUT_OF_FRAME",
                                   f"点击点 {point} 不在帧 {fw}x{fh} 内；bbox={obj['bbox']}（单位/格式错误？）",
                                   status="invalid", rc=8)
            result.update({"resolved": True, "click_point": point,
                           "evidence": {"frame_id": ws.frame_id, "object_id": obj["id"],
                                        "text": obj["text"], "bbox": obj["bbox"],
                                        "confidence": obj["confidence"],
                                        "affordance": obj["affordance"]}})
            if not inject:
                result.update({"status": "dry_run", "ok": True,
                               "degraded": [_degraded("INJECTION_BLOCKED",
                                                      "dry-run：已解析目标与点击点，未注入（本会话硬约束）")],
                               "would_inject": point})
                result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
                return result

            # ── 注入路径：没有 post 判据一律拒绝（AGI-BAR §五 / ys-do 契约）──
            if not isinstance(post, dict) or not post:
                raise ServiceError("ACT_POST_REQUIRED",
                                   "注入动作必须带 post 判据（不存在没有 post 的动作）；"
                                   "先给 {\"state_in\": [...]} 之类的判据", status="invalid", rc=5)
            if not allow_inject:
                raise ServiceError("INJECTION_BLOCKED",
                                   "本服务 allow_inject=False：注入需用户在环授权 + 窗口可占焦点",
                                   status="precondition_fail", rc=5)
            st = instruments.atop_status()
            if not st["atop"]:
                raise ServiceError("LIVE_NOT_ATOP",
                                   f"注入前窗口不在栈顶（rc={st['rc']}）：{st['line']!r}",
                                   status="precondition_fail", rc=5)
            res = instruments.inject_click(point[0], point[1])
            result["injected"] = True
            result["inject"] = res
            if res["rc"] != 0:
                raise ServiceError("INJECT_FAILED",
                                   f"ys-gui-slot/ys-pointer-click rc={res['rc']}：{res['stderr_tail']}",
                                   status="error", rc=8)
            waited = self.wait_until(post, timeout_ms=timeout_ms, poll_ms=poll_ms, frame=None)
            result["post"] = waited
            result["transitions"] = waited.get("transitions", [])
            result["degraded"] = waited.get("degraded", [])
            if waited["status"] == "reached":
                result.update({"status": "ok", "ok": True, "reached": True})
            else:
                result.update({"status": waited["status"], "ok": False, "reached": False})
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            return result
        except ServiceError as exc:
            result.update({"status": exc.status, "ok": False, "error": {"code": exc.code,
                                                                      "detail": exc.detail}})
            result.setdefault("degraded", []).append(_degraded("INSTRUMENT_FAIL",
                                                                f"{exc.code}: {exc.detail}"))
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            return result
        except instruments.InstrumentError as exc:
            result.update({"status": "error", "ok": False,
                           "error": {"code": exc.code, "detail": exc.detail},
                           "degraded": [_degraded("INSTRUMENT_FAIL", f"{exc.code}: {exc.detail}")]})
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            return result

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
            free = ws.free_text_hits(text)
            detail = (f"容器文本里没有全等匹配 {text!r}（NFKC+去空白+casefold）；"
                      f"free_text 命中 {len(free)} 条但**无归属容器/无坐标** ⇒ 无法定位")
            return {"status": "resolve_fail", "channel": "text", "target": text, "detail": detail,
                    "free_text_hits": free,
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

    def _act_intent(self, target, *, post, timeout_ms, poll_ms, inject, result, t0):
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
                           "degraded": [_degraded("INJECTION_BLOCKED",
                                                  "dry-run：意图已解析（pre/post/steps），未执行；"
                                                  "ys-do 连 dry-run 也会 acquire_focus ⇒ 本会话不调用")]})
            result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
            return result
        if not self.allow_inject:
            raise ServiceError("INJECTION_BLOCKED",
                               "意图执行需占焦点（ys-do acquire_focus）+ 注入；allow_inject=False",
                               status="precondition_fail", rc=5)
        out = instruments.run_intent(intent, dry=False, allow_focus=True)
        result["intent_run"] = out
        if out["rc"] != 0:
            raise ServiceError("INTENT_FAILED", f"ys-do {intent} rc={out['rc']}：{out['stderr_tail']}",
                               status="error", rc=8)
        waited = self.wait_until(post, timeout_ms=timeout_ms, poll_ms=poll_ms)
        result["post"] = waited
        result["transitions"] = waited.get("transitions", [])
        result["degraded"] = waited.get("degraded", [])
        if waited["status"] == "reached":
            result.update({"status": "ok", "ok": True, "injected": True, "reached": True})
        else:
            result.update({"status": waited["status"], "ok": False, "injected": True, "reached": False})
        result["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
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
            out.update({"status": exc.status, "error": {"code": exc.code, "detail": exc.detail},
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


def _exit_code_for(status):
    return {"ok": 0, "reached": 0, "dry_run": 0,
            "resolve_fail": 3, "ambiguous": 4, "invalid": 5, "precondition_fail": 5,
            "timeout": 6, "violated": 7, "error": 8}.get(status, 8)


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

    p = sub.add_parser("act", help="解析目标 → (dry-run|注入) → 等下一稳态")
    common(p)
    p.add_argument("--text", default=None)
    p.add_argument("--object-id", default=None)
    p.add_argument("--intent", default=None)
    p.add_argument("--frame", default=None, help="离线帧（解析用）")
    p.add_argument("--inject", action="store_true", help="真注入（需 allow_inject + post 判据）")
    p.add_argument("--allow-inject", action="store_true", help="显式授权注入（用户在环）")
    p.add_argument("--post", default=None, help='post 判据 JSON，如 {"state_in":["PLAYTEST"]}')
    p.add_argument("--timeout-ms", type=int, default=30000)
    p.add_argument("--poll-ms", type=int, default=300)

    p = sub.add_parser("wait", help="wait_until：三态 reached/timeout/violated")
    common(p)
    p.add_argument("--predicate", required=True, help='判据 JSON，如 {"state_in":["PLAYTEST","PAUSE"]}')
    p.add_argument("--frame", default=None)
    p.add_argument("--timeout-ms", type=int, default=30000)
    p.add_argument("--poll-ms", type=int, default=300)

    p = sub.add_parser("vocab", help="打印状态名词表（单一源 ys-state）")
    p = sub.add_parser("intents", help="列出 ys-do 意图（只读 actions/*.json）")
    p = sub.add_parser("cache", help="查看/清空帧级缓存")
    p.add_argument("--invalidate", action="store_true")

    a = ap.parse_args(argv)
    try:
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
            ws = svc.look(frame=a.frame, source=None)
            if a.summary:
                _emit(ws.summary(), out_path=a.json_out)
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
            res = svc.act(target, post=post, timeout_ms=a.timeout_ms, poll_ms=a.poll_ms,
                          inject=a.inject, frame=a.frame)
            _emit(res, out_path=a.json_out)
            return _exit_code_for(res["status"])

        if a.verb == "wait":
            pred = json.loads(a.predicate)
            res = svc.wait_until(pred, timeout_ms=a.timeout_ms, poll_ms=a.poll_ms, frame=a.frame)
            _emit(res, out_path=a.json_out)
            return _exit_code_for(res["status"])
    except ServiceError as exc:
        _emit({"status": exc.status, "error": {"code": exc.code, "detail": exc.detail}})
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
