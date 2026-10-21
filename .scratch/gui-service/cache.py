#!/usr/bin/env python3
"""cache.py — 帧级世界状态缓存：按 frame_id（sha256）+ 仪器指纹复用。

为什么需要：
  · 同一帧重复 look（act 前后、wait_until 轮询、多步编排）不该重算 —— 重算一次
    ≈ 0.33~1.65s（见 bench.md），而缓存命中目标 ≤5ms（AGI-BAR §一）。
  · 帧是**内容寻址**的：`frame_id` 已经唯一标识像素内容 ⇒ 同一 key 的结果可跨进程复用。

仪器指纹（instrument_sig）：
  缓存值不只取决于帧，还取决于**判据实现**。ys-state / ys-screen / profile 任一文件
  变化（mtime+size）都必须让旧缓存失效——否则会拿旧判据的结论当新事实（静默错误）。
  指纹只 stat 三个文件（<1ms），不读内容。

缓存分层：memory（进程内 OrderedDict，LRU 8）→ disk（`.cache/world-*.json`，原子写）。
"""
from __future__ import annotations

import collections
import json
import os
import re
import time

# 服务自身映射逻辑的版本：改 worldsvc/schema 的映射语义时必须 +1，否则旧缓存会被当成新结论。
LOGIC_VERSION = "worldsvc-b6-match-passthrough"   # 2026-10-21：回执契约 v1（schema 1、state.match、
                                                  # 顶层 uncertainty_meta、timing_ms.budget）。旧条目形状不同，
                                                  # 升版本让它们自然失效——不靠"读到缺字段再补默认值"（那会把旧数据洗成新口径）,
                                                  # 更不允许把旧条目直接喂给新校验器（那就是 traceback）。

SIG_FILES_DEFAULT = (
    ("ys-state", "tools/ys-editor/ys-state"),
    ("ys-screen", "tools/ys-screen"),
)
SIG_EXTRA_DEFAULT = ("profile", ".scratch/gui-profiles/qianxing.json")


def _repo_root():
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def instrument_signature(repo_root=None, extra_paths=None):
    """判据实现指纹：文件名 + size + mtime_ns，sha256 前 12 位。"""
    import hashlib
    root = repo_root or _repo_root()
    parts = []
    for name, rel in SIG_FILES_DEFAULT:
        path = os.path.join(root, rel)
        try:
            st = os.stat(path)
            parts.append(f"{name}:{st.st_size}:{st.st_mtime_ns}")
        except OSError:
            parts.append(f"{name}:MISSING")
    for rel in (extra_paths if extra_paths is not None else SIG_EXTRA_DEFAULT):
        path = rel if os.path.isabs(rel) else os.path.join(root, rel)
        try:
            st = os.stat(path)
            parts.append(f"{os.path.basename(path)}:{st.st_size}:{st.st_mtime_ns}")
        except OSError:
            parts.append(f"{os.path.basename(path)}:MISSING")
    parts.append(f"logic:{LOGIC_VERSION}")
    digest = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return digest[:12]


def _ns(namespace):
    """命名空间 → 文件名安全片段（"gui-world-state/1" → "gui-world-state_1"）。"""
    return re.sub(r"[^0-9A-Za-z_.-]+", "_", str(namespace or "")).strip("_")


def frame_key(frame_id, sig, namespace=""):
    """frame_id='sha256:…' + 仪器指纹（+ 可选契约命名空间）→ 缓存 key（文件名安全）。

    `namespace` 用来把**回执契约版本**放进 key：契约一变，旧条目自然读不到，
    而不是"读到了再在调用方崩"（2026-10-21 实测：v0 条目被 v1 校验器拒 → 缓存命中即 traceback，
    而 --no-cache 一切正常。缓存是加速器，**不能成为崩溃源**）。
    """
    m = re.fullmatch(r"sha256:([0-9a-f]{64})", frame_id or "")
    if not m:
        raise ValueError(f"frame_id 非法：{frame_id!r}")
    ns = _ns(namespace)
    return f"world-{m.group(1)[:16]}-{sig}{('-' + ns) if ns else ''}.json"


class FrameCache:
    def __init__(self, cache_dir, *, max_memory=8, enabled=True):
        self.cache_dir = cache_dir
        self.max_memory = max(1, int(max_memory))
        self.enabled = bool(enabled)
        self._mem = collections.OrderedDict()
        self.hits = {"memory": 0, "disk": 0, "miss": 0, "invalid": 0}
        if self.enabled:
            os.makedirs(self.cache_dir, exist_ok=True)

    # ── 查询 ──
    def load(self, frame_id, sig, namespace="", require=None):
        """返回 (raw|None, layer, ms)；layer ∈ memory/disk/miss/invalid。

        `require`：命中后**再校验一次**（如 `{"schema": "gui-world-state/1"}`）。不符就当 miss，
        并把那条陈旧条目删掉——陈旧条目最坏的结局是 traceback，最好的结局是重算一遍。
        """
        if not self.enabled:
            self.hits["miss"] += 1
            return None, "miss", 0.0
        t0 = time.perf_counter()
        key = frame_key(frame_id, sig, namespace)
        mem = self._mem.get(key)
        if mem is not None:
            if self._fits(mem, require):
                self._mem.move_to_end(key)
                self.hits["memory"] += 1
                return json.loads(json.dumps(mem)), "memory", (time.perf_counter() - t0) * 1000
            self._mem.pop(key, None)
        path = os.path.join(self.cache_dir, key)
        try:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
        except (OSError, ValueError):
            self.hits["miss"] += 1
            return None, "miss", (time.perf_counter() - t0) * 1000
        if not self._fits(raw, require):
            self.hits["invalid"] = self.hits.get("invalid", 0) + 1
            try:
                os.remove(path)          # 陈旧条目：删掉，别留给下一次踩
            except OSError:
                pass
            return None, "invalid", (time.perf_counter() - t0) * 1000
        self._remember(key, raw)
        self.hits["disk"] += 1
        return raw, "disk", (time.perf_counter() - t0) * 1000

    @staticmethod
    def _fits(raw, require):
        """命中校验：require 里的每个键都必须**逐字相等**。require=None ⇒ 不校验（旧约定）。"""
        if not require:
            return True
        if not isinstance(raw, dict):
            return False
        return all(raw.get(k) == v for k, v in require.items())

    def store(self, frame_id, sig, raw, namespace=""):
        """写入 memory + disk（原子写）。失败不抛：缓存坏了只能更慢，不能更错。"""
        if not self.enabled:
            return None
        key = frame_key(frame_id, sig, namespace)
        self._remember(key, raw)
        path = os.path.join(self.cache_dir, key)
        try:
            tmp = f"{path}.tmp.{os.getpid()}"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(raw, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, path)
        except OSError:
            return None
        return path

    def _remember(self, key, raw):
        self._mem[key] = raw
        self._mem.move_to_end(key)
        while len(self._mem) > self.max_memory:
            self._mem.popitem(last=False)

    def stats(self):
        return dict(self.hits)

    def invalidate(self):
        """清空本服务缓存（memory + 本目录的 world-*.json）。"""
        self._mem.clear()
        removed = 0
        if self.enabled and os.path.isdir(self.cache_dir):
            for name in os.listdir(self.cache_dir):
                if name.startswith("world-") and name.endswith(".json"):
                    try:
                        os.remove(os.path.join(self.cache_dir, name))
                        removed += 1
                    except OSError:
                        pass
        return removed
