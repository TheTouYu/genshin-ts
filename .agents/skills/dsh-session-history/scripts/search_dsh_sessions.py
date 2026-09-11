#!/usr/bin/env python3
"""DSH 会话记录（聊天历史）检索工具 v3 —— 安全版（2026-09-10 加防卡死护栏）。

v3 事故复盘（必须读）：v2 的 search 默认 --jobs 8 且**默认扫全库**。在 505 会话/1.2GB
压缩语料下等于同时开 8 个 zstd 全量解压 —— 实测把一台 7.9GB 的 WSL 直接推到 OOM 边缘、
整机卡死。根因不是机器弱，是**没加过滤条件就全库扫描**。
v3 铁律（写进默认值，不靠使用者自觉）：
  1. **默认只扫最新 10 个会话**（--all 才全量 / --newest N / --since-min M 调整），
     并在输出里明确打印作用域——"没命中"必须能区分是"真没有"还是"没扫到"。
  2. **--budget-mb 硬预算**（默认 150MB 压缩量）：按 mtime 新→旧累加，超预算就停。
  3. **--jobs 默认 2**（v2 是 8）；每个 zstd 都套 `nice -n 19 ionice -c3`（idle IO 类），
     即使扫描很重也把交互优先权让出去。
  4. **--max-size 跳过怪物会话**（单文件压缩体积上限）。
  5. `recent` 子命令是"查最新的大模型活动"的**首选入口**（不是 search 全库）：
     取最新几个会话，直接给出「模型当时在跑什么命令」的活动时间线。
  6. 关键词要搜**活动**（命令/工具名/路径/报错串），不要搜**症状**（"卡/OOM/内存"）——
     历史记录的是模型做了什么，症状词几乎不出现，搜症状必然空手而归。

v2 优化（顺序即收益排序）：
  1. 前缀过滤：只对 {"type":"user/message"|"assistant/message"|"tool/call"|"tool/result"|
     "turn/end"|"session/title"|"session"|"session/end-seed"|"agent/inbox/spliced"} 开头的行
     json.loads——流式 chunk 行（占大头的中间态）纯字节跳过。
  2. 并行：索引构建 ProcessPoolExecutor（CPU 密集），search/errors ThreadPoolExecutor
     （每文件独立 zstd 子进程管道）。
  3. 增量索引缓存 ~/.cache/dsh-session-history/index.json：按 (mtime_ns,size) 失效，
     未变会话直接用缓存——scan/todos 首次建库后毫秒级。
  4. search 只 json.loads 命中行（正则先在原始行上跑，C 速度）；errors 用
     '"isError":true' 字面前置过滤。
  5. 最新优先：scan/search 默认按时间倒序（找"昨天的会话"），--oldest-first 可反转；
     scan 默认 --limit 30，--all 看全量。
  6. 单文件硬超时：按压缩体量自适应（10s + 1s/MB，上限 60s），怪物会话不阻塞全局。

用法（v3；带 [scope] 的选项对所有扫描型命令都生效）：
  search_dsh_sessions.py dirs [<cwd>]                    列出会话目录（毫秒级）
  search_dsh_sessions.py recent [<root>] [--since-min M] [--newest N] [--grep PAT] [--full]
                                                         【首选】最新大模型活动时间线
                                                         （U 真人/A 助手/C 工具调用含命令/R 结果/E 报错 + 统计）
  search_dsh_sessions.py search <pattern> [<root|dir>] [scope 选项] [--context N] [--max-hits N] [--jobs N]
                                                         关键词搜索（正则）——**默认只扫最新 10 个会话**
  search_dsh_sessions.py scan [<root|dir>] [--limit N] [--all] [--oldest-first] [--rebuild]
                                                         会话全景：标题+时间+user摘要（走索引）
  search_dsh_sessions.py index [<root|dir>] [--rebuild] [--jobs N]   建增量索引
  search_dsh_sessions.py show <session-dir> [<start>] [<count>] [--tail N] [--max-len N]
                                                         按消息序号浏览（单会话，无风险）
  search_dsh_sessions.py errors [<dir|root>] [scope 选项] [--jobs N] 列出 isError=true 的工具结果
  search_dsh_sessions.py todos [<session-root>]          未完成任务检测（走索引）

scope 选项（安全护栏，可组合）：
  --all             真·全量扫描（危险：505 会话/1.2GB，只在确知要考古时用）
  --newest N        只看 mtime 最新的 N 个会话
  --since-min M     只看最近 M 分钟内被写过的会话
  --max-size MB     跳过压缩体积 > MB 的"怪物会话"（单文件上限）
  --budget-mb MB    本次运行解压总量预算（默认 150；按新→旧累加，超了停）
  --jobs N          并行度（默认 2；**不要调高**，每路都是一个 zstd 解压）

环境：DSH_HOME（默认 ~/.dsh）；DSH_SESSION_JSONL/DSH_SESSION_ID 标识当前会话（自动排除）。
依赖：zstd CLI（建议同时有 nice/ionice，会自动降优先级）。缓存：~/.cache/dsh-session-history/index.json。
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

DEFAULT_ROOT = Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser() / "sessions"
CURRENT_JSONL = os.environ.get("DSH_SESSION_JSONL", "")
CURRENT_SESSION_ID = os.environ.get("DSH_SESSION_ID", "")

# v3 安全护栏默认值（改这里就等于改全局默认；不要在调用点硬编码高值）
DEFAULT_NEWEST = 10        # search/errors 默认只看最新 N 个会话
DEFAULT_BUDGET_MB = 150    # 单次运行解压总量上限（压缩字节）
DEFAULT_JOBS = 2           # 并行度上限——每一路都是一个 zstd 全量解压
SCAN_MAX_SIZE_MB = 0       # search 默认不按体积过滤（recent 另有更保守默认）

# v3：所有 zstd 子进程降级（nice 19 + ionice idle），扫描再重也不抢交互
_NICE = ["nice", "-n", "19"] if shutil.which("nice") else []
_IONICE = ["ionice", "-c3"] if shutil.which("ionice") else []
ZSTD_PREFIX = _NICE + _IONICE + ["zstd", "-d", "-c"]


def _resolve_cache_dir() -> Path:
    """按序探测可写缓存目录：~/.cache → $DSH_HOME/.cache → /tmp（只读环境不崩）。"""
    dsh_home = Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser()
    for base in (Path("~/.cache").expanduser(), dsh_home, Path("/tmp")):
        cand = base / "dsh-session-history"
        try:
            cand.mkdir(parents=True, exist_ok=True)
            probe = cand / ".probe"
            probe.write_text("")
            probe.unlink()
            return cand
        except OSError:
            continue
    return Path("/tmp/dsh-session-history")


CACHE_DIR = _resolve_cache_dir()
CACHE_PATH = CACHE_DIR / "index.json"

# 需要结构化解析的事件类型前缀（其余 chunk/噪声行纯字节跳过——v2 核心加速点）
_INTERESTING = (
    b'{"type":"user/message"',
    b'{"type":"assistant/message"',
    b'{"type":"tool/call"',
    b'{"type":"tool/result"',
    b'{"type":"turn/end"',
    b'{"type":"session/title"',
    b'{"type":"session"',
    b'{"type":"session/end-seed"',
    b'{"type":"agent/inbox/spliced"',
)


def dir_for(cwd: str) -> str:
    """/home/h/genshin-ts -> --home-h-genshin-ts--"""
    name = cwd.strip("/").replace("/", "-").replace(".", "-")
    return "--" + name + "--"


def file_timeout_sec(zstd_path: Path) -> float:
    """按压缩体量给单文件解压解析预算：10s + 1s/MB，封顶 60s。"""
    try:
        mb = zstd_path.stat().st_size / 1e6
    except OSError:
        mb = 1
    return min(60.0, 10.0 + mb)


def stream_lines(zstd_path: Path):
    """流式解压 yield 原始行（bytes）；超时/缺失安静终止。
    v3：zstd 套 nice19+ionice-idle，避免扫描把整机拖卡。"""
    if not zstd_path.exists():
        return
    p = subprocess.Popen(
        ZSTD_PREFIX + [str(zstd_path)],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + file_timeout_sec(zstd_path)
    try:
        for line in p.stdout:
            if time.monotonic() > deadline:
                p.kill()
                return
            yield line
    finally:
        try:
            p.stdout.close()
        except Exception:
            pass
        try:
            p.terminate()
        except Exception:
            pass


def parse_content(content):
    """content 列表 -> (kind, text[, is_err]) 序列。kind: text|thinking|toolcall|toolresult"""
    out = []
    if isinstance(content, str):
        if content.strip():
            out.append(("text", content))
        return out
    if not isinstance(content, list):
        return out
    for part in content:
        if not isinstance(part, dict):
            continue
        t = part.get("type")
        if t == "text" and part.get("text"):
            out.append(("text", part["text"]))
        elif t == "reasoning" and part.get("text"):
            out.append(("thinking", part["text"]))
        elif t in ("tool-call", "toolCall"):
            name = part.get("name", "?")
            args = part.get("arguments") or ""
            if not isinstance(args, str):
                try:
                    args = json.dumps(args, ensure_ascii=False)
                except Exception:
                    args = str(args)
            out.append(("toolcall", "[toolCall " + name + "] " + args[:200]))
        elif t == "tool-result":
            inner = part.get("content") or []
            texts = "".join(
                x.get("text", "") for x in inner
                if isinstance(x, dict) and x.get("type") == "text"
            )
            out.append(("toolresult", texts, bool(part.get("isError"))))
    return out


def iter_events(zstd_path: Path, max_events=0):
    """流式产出 (seq, type, data)。v2：前缀过滤，噪声行不解码。max_events=0 不限。"""
    n = 0
    for raw in stream_lines(zstd_path):
        if not raw.startswith(_INTERESTING):
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        n += 1
        if max_events and n > max_events:
            return
        t = obj.get("type")
        data = obj.get("data") or {}
        if t == "session":
            data = dict(data)
            for k in ("createdAt", "cwd", "id"):
                if k in obj:
                    data[k] = obj[k]
        elif "time" in obj and "time" not in data:
            data = dict(data)
            data["time"] = obj["time"]
        yield obj.get("seq"), t, data


def _collect_user_texts(data, seen_ids, users):
    """user/message 与 agent/inbox/spliced 共用：只收 source.kind=user 的真人原话。"""
    src = data.get("source") or {}
    if src.get("kind") != "user":
        return
    mid = data.get("id") or ""
    if mid:
        if mid in seen_ids:
            return
        seen_ids.add(mid)
    txt = "".join(x[1] for x in parse_content(data.get("content")) if x[0] == "text")
    if txt.strip():
        users.append(txt.strip()[:400])


def index_one(args):
    """worker：结构化索引单个会话。返回可 pickle 的 dict（未变化时返回 None 占位由主进程处理）。"""
    abs_dir, max_lines = args
    d = Path(abs_dir)
    z = d / "session.jsonl.zstd"
    meta = {
        "dir": abs_dir, "mtime_ns": 0, "size": 0, "created": None, "cwd": None,
        "title": None, "users": [], "n_users": 0, "end_seed": False,
        "bad_turns": [], "last_kind": "", "last_text_tail": "", "timed_out": False,
    }
    try:
        st = z.stat()
        meta["mtime_ns"], meta["size"] = st.st_mtime_ns, st.st_size
    except OSError:
        return meta
    seen_ids = set()
    users, bad_turns, last_texts = [], [], [""]
    last_kind = [""]

    def on_event(t, data):
        if t == "session":
            meta["created"] = data.get("createdAt")
            meta["cwd"] = data.get("cwd")
        elif t == "session/title" and not meta["title"]:
            meta["title"] = data.get("title")
        elif t == "user/message":
            _collect_user_texts(data, seen_ids, users)
        elif t == "agent/inbox/spliced":
            for m in data.get("inserted") or []:
                _collect_user_texts(m, seen_ids, users)
        elif t == "assistant/message":
            msg = data.get("message") or {}
            txt = "".join(x[1] for x in parse_content(msg.get("content")) if x[0] == "text")
            if txt.strip():
                last_texts[0] = txt.strip()
            last_kind[0] = "assistant/message"
        elif t in ("tool/call", "tool/result"):
            last_kind[0] = t
        elif t == "turn/end":
            reason = str(data.get("reason"))
            if "completed" not in reason:
                bad_turns.append(reason[:80])
        elif t == "session/end-seed":
            meta["end_seed"] = True

    n = 0
    deadline = time.monotonic() + file_timeout_sec(z)
    for raw in stream_lines(z):
        if not raw.startswith(_INTERESTING):
            continue
        n += 1
        if n > max_lines:
            meta["timed_out"] = True
            break
        if time.monotonic() > deadline:
            meta["timed_out"] = True
            break
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        t = obj.get("type")
        data = obj.get("data") or {}
        if t == "session":
            data = dict(data)
            for k in ("createdAt", "cwd", "id"):
                if k in obj:
                    data[k] = obj[k]
        on_event(t, data)

    meta["users"] = users[:8]
    meta["n_users"] = len(users)
    meta["bad_turns"] = bad_turns[:10]
    meta["last_kind"] = last_kind[0]
    meta["last_text_tail"] = last_texts[0][-200:]
    return meta


def load_cache():
    try:
        return json.loads(CACHE_PATH.read_text())
    except Exception:
        return {"version": 2, "sessions": {}}


def save_cache(cache):
    """落缓存；只读环境软失败（warn 不崩——大不了下次重建索引）。"""
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = CACHE_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(cache, ensure_ascii=False))
        tmp.replace(CACHE_PATH)
    except OSError as e:
        print("[warn] 缓存不可写(%s)，索引不持久化: %s" % (e, CACHE_PATH), file=sys.stderr)


def is_current(session_dir_name: str) -> bool:
    if CURRENT_SESSION_ID and session_dir_name == CURRENT_SESSION_ID:
        return True
    if CURRENT_JSONL and session_dir_name in CURRENT_JSONL:
        return True
    return False


def collect_session_dirs(path: Path):
    """输入：会话根/项目目录/单会话目录 -> 会话目录列表（mtime 新→旧）。"""
    if path.name.startswith("session-") and (path / "session.jsonl.zstd").exists():
        return [path]
    out = [d for d in path.glob("session-*") if (d / "session.jsonl.zstd").exists()]
    if not out:
        for sub in sorted(path.iterdir()):
            if sub.is_dir() and not sub.name.startswith("session-"):
                out.extend(collect_session_dirs(sub))
    return sorted(out, key=lambda d: (d / "session.jsonl.zstd").stat().st_mtime, reverse=True)


def _zsize(d: Path) -> int:
    try:
        return (d / "session.jsonl.zstd").stat().st_size
    except OSError:
        return 0


def _zmtime(d: Path) -> float:
    try:
        return (d / "session.jsonl.zstd").stat().st_mtime
    except OSError:
        return 0.0


def select_dirs(root: Path, since_min=0, newest=0, all_flag=False,
                max_size_mb=0, budget_mb=DEFAULT_BUDGET_MB,
                default_newest=DEFAULT_NEWEST):
    """v3 安全选盘：**默认只取最新 N 个会话**，绝不静默全库扫描。

    优先级：--since-min > （--all 全量 / --newest N / 默认最新 default_newest）。
    再叠加 --max-size（单文件体积上限）与 --budget-mb（总量预算，按新→旧累加）。
    返回 (dirs, notes)——notes 必须打印，让"没命中"能区分真没有 vs 没扫到。
    """
    dirs = [d for d in collect_session_dirs(root) if not is_current(d.name)]
    notes = []
    total_all = len(dirs)

    if since_min > 0:
        cutoff = time.time() - since_min * 60
        dirs = [d for d in dirs if _zmtime(d) >= cutoff]
        notes.append("--since-min %d（命中 %d/%d 会话）" % (since_min, len(dirs), total_all))
    elif all_flag:
        notes.append("--all 全量 %d 会话（危险模式）" % len(dirs))
    else:
        n = newest or default_newest
        if len(dirs) > n:
            notes.append("默认只扫最新 %d/%d 个会话（全量用 --all；窗口用 --since-min M）"
                         % (n, total_all))
            dirs = dirs[:n]
        else:
            notes.append("扫描 %d 个会话（全库共 %d 个）" % (len(dirs), total_all))

    if max_size_mb > 0:
        kept = [d for d in dirs if _zsize(d) <= max_size_mb * 1e6]
        if len(kept) != len(dirs):
            notes.append("跳过 %d 个大文件(>%dMB)" % (len(dirs) - len(kept), max_size_mb))
        dirs = kept

    if budget_mb > 0:
        kept, used = [], 0
        for d in dirs:
            sz = _zsize(d)
            if kept and used + sz > budget_mb * 1e6:
                notes.append("预算封顶 %dMB：舍弃更旧的 %d 个会话" % (budget_mb, len(dirs) - len(kept)))
                break
            kept.append(d)
            used += sz
        dirs = kept

    return dirs, notes


def print_scope(notes, n_dirs, cmd):
    """作用域必须显式可见——静默截断会把"没扫到"伪装成"不存在"。"""
    print("[scope:%s] 实际扫描 %d 个会话 | %s" % (cmd, n_dirs, " ; ".join(notes) if notes else "-"))


def build_index(roots, rebuild=False, jobs=None, max_lines=20000):
    """增量构建索引；返回 {abs_dir: meta}（只含本次 roots 覆盖的会话也无妨——全量字典）。"""
    cache = {"version": 2, "sessions": {}} if rebuild else load_cache()
    sessions = cache["sessions"]
    tasks = []
    for root in roots:
        for d in collect_session_dirs(root):
            abs_dir = str(d)
            try:
                st = (d / "session.jsonl.zstd").stat()
                cur = sessions.get(abs_dir)
                if cur and cur.get("mtime_ns") == st.st_mtime_ns and cur.get("size") == st.st_size:
                    continue  # 缓存命中
            except OSError:
                continue
            tasks.append((abs_dir, max_lines))
    if tasks:
        # v3：并行度默认 2（v2 是 max(4, cpu_count)——首次全库建索引等于开满核解压）
        jobs = jobs or min(len(tasks), DEFAULT_JOBS)
        with ProcessPoolExecutor(max_workers=jobs) as ex:
            for meta in ex.map(index_one, tasks):
                sessions[meta["dir"]] = meta
        save_cache(cache)
    return sessions


def fmt_ms(ms) -> str:
    try:
        ms = int(ms)
        if ms < 1e12:
            ms *= 1000
        return datetime.fromtimestamp(ms / 1000).strftime("%m-%d %H:%M")
    except Exception:
        return "?"


def print_scan_entry(meta: dict):
    created = fmt_ms(meta.get("created")) if meta.get("created") else "?"
    title = meta.get("title") or "(无标题)"
    print("=== " + Path(meta["dir"]).name + "  [" + created + "] " + title)
    if meta.get("cwd"):
        print("    cwd: " + str(meta["cwd"]))
    for u in (meta.get("users") or [])[:6]:
        print("    U: " + u[:160])
    n_users = meta.get("n_users") or len(meta.get("users") or [])
    if n_users > 6:
        print("    ... 共 %d 条 user 消息" % n_users)
    flags = []
    if meta.get("timed_out"):
        flags.append("解析超限截断")
    if not meta.get("end_seed"):
        flags.append("无结束标记(可能未完成/中断)")
    if meta.get("bad_turns"):
        flags.append("turn中断x%d" % len(meta["bad_turns"]))
    if flags:
        print("    [!] " + "; ".join(flags))
    print()


def cmd_dirs(cwd):
    if not DEFAULT_ROOT.exists():
        print("[error] 会话根不存在: " + str(DEFAULT_ROOT))
        return 1
    if cwd:
        d = DEFAULT_ROOT / dir_for(cwd)
        n = len(list(d.glob("session-*"))) if d.exists() else 0
        print(str(d) + "  " + ("存在 (%d 会话)" % n if d.exists() else "不存在"))
        return 0
    for d in sorted(DEFAULT_ROOT.iterdir()):
        if d.is_dir():
            n = len(list(d.glob("session-*")))
            print(d.name + "  (" + str(n) + " 会话)")
    return 0


def _resolve_path(path_str) -> Path:
    p = Path(path_str).expanduser() if path_str else DEFAULT_ROOT
    return p if p.exists() else DEFAULT_ROOT


def cmd_index(path_str, rebuild, jobs):
    root = _resolve_path(path_str)
    t0 = time.time()
    sessions = build_index([root], rebuild=rebuild, jobs=jobs)
    n_root = len(collect_session_dirs(root))
    print("索引完成：%s 共 %d 会话（缓存总 %d），耗时 %.1fs，缓存 %s" % (
        root, n_root, len(sessions), time.time() - t0, CACHE_PATH))
    return 0


def cmd_scan(path_str, limit, oldest_first, rebuild=False, jobs=None):
    root = _resolve_path(path_str)
    sessions = build_index([root], rebuild=rebuild, jobs=jobs)
    metas = [m for d, m in sessions.items()
             if d.startswith(str(root)) and not is_current(Path(d).name)]
    if not metas:
        print("[warn] 索引为空: " + str(root))
        return 1
    metas.sort(key=lambda m: m.get("created") or 0, reverse=not oldest_first)
    shown = metas if limit <= 0 else metas[:limit]
    for m in shown:
        print_scan_entry(m)
    if limit > 0 and len(metas) > limit:
        print("(共 %d 会话，已显示最新 %d；--all 看全量)" % (len(metas), limit))
    return 0


def _search_one(args):
    """worker：单文件正则搜索。字节正则做行级预筛（快），命中行才 json.loads，
    结构化字段再用字符串正则精确定位。返回 [(label, seq, text)]。
    v2 修复：原始行是 bytes——str 正则直接 search(bytes) 会 TypeError 静默吞成零命中。"""
    abs_dir, pattern_str, per_file_cap = args
    z = Path(abs_dir) / "session.jsonl.zstd"
    try:
        pb = re.compile(pattern_str.encode("utf-8"), re.IGNORECASE)  # bytes 预筛
        ps = re.compile(pattern_str, re.IGNORECASE)                   # str 精筛
    except re.error:
        return []
    hits = []
    for raw in stream_lines(z):
        if len(hits) >= per_file_cap:
            break
        if not pb.search(raw):
            continue
        if not raw.startswith(_INTERESTING):
            hits.append(("R", None, raw[:300].decode("utf-8", "replace")))
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            hits.append(("R", None, raw[:300].decode("utf-8", "replace")))
            continue
        t = obj.get("type")
        seq = obj.get("seq")
        data = obj.get("data") or {}
        label, text = "R", ""
        if t == "user/message":
            src = data.get("source") or {}
            if src.get("kind") == "user":
                label = "U"
                text = "".join(x[1] for x in parse_content(data.get("content")) if x[0] == "text")
        elif t == "assistant/message":
            msg = data.get("message") or {}
            parts = parse_content(msg.get("content"))
            texts = "".join(x[1] for x in parts if x[0] == "text")
            thinks = [x[1] for x in parts if x[0] == "thinking" and ps.search(x[1])]
            calls = [x[1] for x in parts if x[0] == "toolcall" and ps.search(x[1])]
            if ps.search(texts):
                label, text = "A", texts
            elif thinks:
                label, text = "T", thinks[0]
            elif calls:
                label, text = "C", " ".join(calls)
            elif texts.strip():
                # 命中在本行其它字段（如被截断的参数）——正文兜底展示
                label, text = "A", texts
        elif t == "tool/call":
            label = "C"
            text = "[toolCall " + str(data.get("name", "")) + "] " + str(data.get("arguments", ""))[:300]
        elif t == "tool/result":
            msg = data.get("message") or {}
            for kind, *rest in parse_content(msg.get("content")):
                if kind == "toolresult":
                    label = "E" if rest[1] else "R"
                    text = rest[0]
                    break
        elif t in ("session/title", "session", "turn/end", "session/end-seed",
                   "agent/inbox/spliced"):
            label, text = "M", raw[:300].decode("utf-8", "replace")
        if text:
            hits.append((label, seq, text))
    return hits


def cmd_search(pattern_str, path_str, context, max_hits, jobs,
               since_min=0, newest=0, all_flag=False, max_size=0,
               budget_mb=DEFAULT_BUDGET_MB):
    try:
        re.compile(pattern_str)
    except re.error as e:
        print("[error] 正则无效: " + str(e))
        return 1
    root = _resolve_path(path_str)
    dirs, notes = select_dirs(root, since_min=since_min, newest=newest, all_flag=all_flag,
                              max_size_mb=max_size, budget_mb=budget_mb)
    print_scope(notes, len(dirs), "search")
    if not dirs:
        print("[warn] 作用域内无会话: " + str(root))
        print("       提示：放宽窗口 --since-min 1440 / --all，或指定具体会话目录")
        return 1
    # 索引只为输出标题/时间上下文；没有也不阻塞
    try:
        sessions = load_cache()["sessions"]
    except Exception:
        sessions = {}
    per_file = max(3, max_hits)
    tasks = [(str(d), pattern_str, per_file) for d in dirs]
    total, t0 = 0, time.time()
    with ThreadPoolExecutor(max_workers=jobs or DEFAULT_JOBS) as ex:
        for abs_dir, hits in zip([t[0] for t in tasks],
                                 ex.map(_search_one, tasks)):
            if not hits:
                continue
            meta = sessions.get(abs_dir) or {}
            hdr = " ".join(x for x in [
                "[" + fmt_ms(meta.get("created")) + "]" if meta.get("created") else "",
                str(meta.get("title") or "")] if x)
            print("== " + Path(abs_dir).name + ("  " + hdr if hdr else ""))
            for label, seq, txt in hits:
                piece = (txt[:context] if context else txt[:200]).replace("\n", " ")
                print("  (" + label + (":" + str(seq) if seq is not None else "") + ") " + piece)
                total += 1
            if total >= max_hits:
                break
    print("共 %d 处命中（扫 %d 会话，%.1fs）" % (total, len(dirs), time.time() - t0))
    return 0


# ---------------------------------------------------------------- recent（v3 首选入口）

def _type_of(raw: bytes) -> bytes:
    """不解析 JSON，只抠 type 名——用于统计事件构成（成本 O(1) per line）。"""
    i = raw.find(b'"type":"')
    if i < 0:
        return b"?"
    j = raw.find(b'"', i + 8)
    return raw[i + 8:j] if j > 0 else b"?"


def _tool_cmd(name: str, args: str) -> str:
    """工具调用摘要：bash/exec 类抠出真实命令——"模型当时在跑什么"的关键证据。"""
    s = args or ""
    if name in ("bash", "pwsh", "shell", "exec", "run"):
        try:
            obj = json.loads(s)
            for k in ("command", "cmd", "script"):
                if isinstance(obj.get(k), str):
                    s = obj[k]
                    break
        except Exception:
            pass
    return " ".join(s.split())[:240]


def cmd_recent(path_str, since_min, newest, grep, full, max_lines, budget_mb, all_flag=False,
               max_size=0):
    """【首选】最新的大模型活动时间线：模型跑了什么命令、改了什么、报了什么错。
    只解压作用域内的少数会话（默认最新 3 个），并用 nice/ionice 降级。"""
    root = _resolve_path(path_str)
    dirs, notes = select_dirs(root, since_min=since_min, newest=newest, all_flag=all_flag,
                              max_size_mb=max_size, budget_mb=budget_mb, default_newest=3)
    print_scope(notes, len(dirs), "recent")
    if not dirs:
        print("[warn] 作用域内无会话: " + str(root))
        return 1
    pat = None
    if grep:
        try:
            pat = re.compile(grep, re.IGNORECASE)
        except re.error as e:
            print("[error] --grep 正则无效: " + str(e))
            return 1

    for d in dirs:
        z = d / "session.jsonl.zstd"
        kinds, events, timeline = {}, [], []
        for raw in stream_lines(z):
            t = _type_of(raw)
            k = kinds.setdefault(t, [0, 0])
            k[0] += 1
            k[1] += len(raw)
            if not raw.startswith(_INTERESTING):
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            tp, data = obj.get("type"), (obj.get("data") or {})
            tm = obj.get("time")
            if tp == "session":
                timeline.append(("meta", tm, "cwd=%s created=%s" % (data.get("cwd"), fmt_ms(data.get("createdAt")))))
            elif tp == "session/title":
                timeline.append(("meta", tm, "title: " + str(data.get("title"))))
            elif tp == "user/message":
                if (data.get("source") or {}).get("kind") != "user":
                    continue
                txt = "".join(x[1] for x in parse_content(data.get("content")) if x[0] == "text")
                if txt.strip():
                    timeline.append(("U", tm, txt.strip()))
            elif tp == "assistant/message":
                msg = data.get("message") or {}
                parts = parse_content(msg.get("content"))
                txt = "".join(x[1] for x in parts if x[0] == "text")
                calls = [x[1] for x in parts if x[0] == "toolcall"]
                if txt.strip():
                    timeline.append(("A", tm, txt.strip()))
                for c in calls:
                    timeline.append(("C", tm, c))
            elif tp == "tool/call":
                timeline.append(("C:" + str(data.get("name", "?")), tm,
                                 _tool_cmd(str(data.get("name", "")), str(data.get("arguments", "")))))
            elif tp == "tool/result":
                msg = data.get("message") or {}
                err, txts = False, []
                for kind, *rest in parse_content(msg.get("content")):
                    if kind == "toolresult":
                        txts.append(rest[0])
                        err = err or bool(rest[1])
                timeline.append(("E" if err else "R", tm, "".join(txts).strip()))
            elif tp == "turn/end":
                r = str(data.get("reason"))
                if "completed" not in r:
                    timeline.append(("!", tm, "turn 中断: " + r[:80]))
            elif tp == "session/end-seed":
                timeline.append(("M", tm, "end-seed（会话被加载/重放）"))
            if len(timeline) > 20000:  # 内存护栏：单会话时间线封顶
                timeline.append(("meta", tm, "... 时间线截断（>20000 条）"))
                break

        sz = _zsize(d)
        tot_b = sum(v[1] for v in kinds.values()) or 1
        top = sorted(kinds.items(), key=lambda kv: -kv[1][1])[:8]
        print("\n=== " + d.name + "  [" + fmt_ms(_zmtime(d) * 1000) + " 最后活动]"
              "  压缩 %.1fMB / 解压 %.1fMB" % (sz / 1e6, tot_b / 1e6))
        print("    事件构成: " + " | ".join(
            "%s %d条/%.1fMB(%.0f%%)" % (k.decode(), v[0], v[1] / 1e6, 100.0 * v[1] / tot_b)
            for k, v in top))
        tool_calls = kinds.get(b"tool/call", [0])[0]
        print("    工具调用 %d 次 | 时间线条目 %d" % (tool_calls, len(timeline)))

        if pat:
            shown = [e for e in timeline if pat.search(e[2] or "")]
            print("    --grep 命中 %d 条：" % len(shown))
            if len(shown) > max_lines:  # 输出护栏：只留最近 max_lines 条
                print("    （保留最近 %d 条；--max-lines N 调整）" % max_lines)
                shown = shown[-max_lines:]
        else:
            shown = timeline if full else timeline[-max_lines:]
            if not full and len(timeline) > max_lines:
                print("    （尾部 %d 条；--full 全量）" % max_lines)
        for label, tm, body in shown:
            body = " ".join(str(body).split())
            if not body:
                continue
            lim = 400 if full else 200
            print("      [%s] (%s) %s%s" % (fmt_ms(tm) if tm else "--", label,
                                            body[:lim], "..." if len(body) > lim else ""))
    return 0



def _errors_one(args):
    abs_dir, cap = args
    z = Path(abs_dir) / "session.jsonl.zstd"
    found = []
    for raw in stream_lines(z):
        if len(found) >= cap:
            break
        if b'"isError":true' not in raw:
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if obj.get("type") != "tool/result":
            continue
        data = obj.get("data") or {}
        msg = data.get("message") or {}
        for kind, *rest in parse_content(msg.get("content")):
            if kind == "toolresult" and rest[1]:
                found.append((obj.get("seq"), rest[0][:400]))
                break
    return found


def cmd_errors(path_str, jobs, cap=10, since_min=0, newest=0, all_flag=False,
               max_size=0, budget_mb=DEFAULT_BUDGET_MB):
    path = Path(path_str).expanduser() if path_str else DEFAULT_ROOT
    dirs, notes = select_dirs(_resolve_path(str(path)), since_min=since_min, newest=newest,
                              all_flag=all_flag, max_size_mb=max_size, budget_mb=budget_mb)
    print_scope(notes, len(dirs), "errors")
    if not dirs:
        print("[warn] 作用域内无会话: " + str(path))
        return 1
    total, t0 = 0, time.time()
    with ThreadPoolExecutor(max_workers=jobs or DEFAULT_JOBS) as ex:
        for abs_dir, found in zip([str(d) for d in dirs],
                                  ex.map(_errors_one, [(str(d), cap) for d in dirs])):
            if found:
                print("=== " + Path(abs_dir).name + ": %d 个错误 ===" % len(found))
                for seq, txt in found[:cap]:
                    print("  (seq %s) %s" % (seq, txt[:300].replace("\n", " ")))
                total += len(found)
    print("共 %d 个 isError 工具结果（扫 %d 会话，%.1fs）" % (total, len(dirs), time.time() - t0))
    return 0


def cmd_show(session_dir_str, start, count, tail, max_len):
    d = Path(session_dir_str).expanduser()
    z = d / "session.jsonl.zstd" if d.name.startswith("session-") else d
    if not Path(z).exists():
        print("[error] 会话文件不存在: " + str(z))
        return 1
    events = []
    for seq, t, data in iter_events(z):
        if t == "user/message":
            src = data.get("source") or {}
            if src.get("kind") != "user":
                continue
            txt = "".join(x[1] for x in parse_content(data.get("content")) if x[0] == "text")
            events.append(("U", seq, data.get("time"), txt[:max_len]))
        elif t == "assistant/message":
            msg = data.get("message") or {}
            parts = parse_content(msg.get("content"))
            texts = [x[1] for x in parts if x[0] == "text"]
            think = [x[1] for x in parts if x[0] == "thinking"]
            tools = [x[1] for x in parts if x[0] == "toolcall"]
            body = "".join(texts)[:max_len]
            label = "A(思考)" if think else "A"
            if tools:
                label += " [工具x%d]" % len(tools)
            events.append((label, seq, data.get("time"), body))
        elif t == "tool/call":
            events.append(("C:" + str(data.get("name", "?")), seq, data.get("time"),
                           str(data.get("arguments", ""))[:max_len]))
        elif t == "tool/result":
            msg = data.get("message") or {}
            err, txts = False, []
            for kind, *rest in parse_content(msg.get("content")):
                if kind == "toolresult":
                    txts.append(rest[0])
                    err = err or rest[1]
            events.append(("R[ERROR]" if err else "R", seq, data.get("time"),
                           "".join(txts)[:max_len]))
    if tail:
        events = events[-tail:]
    else:
        events = events[start:start + count] if count else events[start:]
    for label, seq, tm, body in events:
        tstr = fmt_ms(tm) if tm else ""
        shown = body[:400]
        suffix = "..." if len(body) > 400 else ""
        print("[" + tstr + "] (" + label + ") " + shown + suffix)
    return 0


def cmd_todos(path_str):
    root = _resolve_path(path_str)
    sessions = build_index([root])
    metas = [m for d, m in sessions.items()
             if d.startswith(str(root)) and not is_current(Path(d).name)]
    metas.sort(key=lambda m: m.get("created") or 0, reverse=True)
    for meta in metas:
        flags = []
        if meta.get("bad_turns"):
            flags.append("turn中断x%d" % len(meta["bad_turns"]))
        if not meta.get("end_seed"):
            flags.append("无 end-seed")
        if meta.get("last_kind") in ("tool/call", "tool/result") and not (meta.get("last_text_tail") or "").strip():
            flags.append("尾部停在工具调用(无结论)")
        if flags:
            print("=== " + Path(meta["dir"]).name + " [" + fmt_ms(meta.get("created")) + "] " + "; ".join(flags))
            if (meta.get("last_text_tail") or "").strip():
                print("    尾部正文: " + meta["last_text_tail"][:200])
            print()
    return 0


_VALUED = {"--limit", "--context", "--max-hits", "--jobs", "--max-len", "--tail", "--max-lines",
           "--since-min", "--newest", "--max-size", "--budget-mb", "--grep"}
_FLAGS = {"--rebuild", "--oldest-first", "--all", "--full"}


def parse_args(args):
    """一次性解析：返回 (positionals, opts)。带值选项吃掉下一个 token；布尔选项置 True。"""
    pos, opts = [], {}
    i = 0
    while i < len(args):
        a = args[i]
        if a in _VALUED and i + 1 < len(args):
            opts[a] = args[i + 1]
            i += 2
        elif a in _FLAGS:
            opts[a] = True
            i += 1
        else:
            pos.append(a)
            i += 1
    return pos, opts


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    cmd, args = argv[0], argv[1:]
    pos, opts = parse_args(args)

    def opt_int(name, default):
        try:
            return int(opts[name])
        except (KeyError, ValueError):
            return default

    # v3：作用域护栏参数对所有"扫描类"命令统一生效
    scope = dict(since_min=opt_int("--since-min", 0), newest=opt_int("--newest", 0),
                 all_flag=bool(opts.get("--all")), max_size=opt_int("--max-size", 0),
                 budget_mb=opt_int("--budget-mb", DEFAULT_BUDGET_MB))

    if cmd == "dirs":
        return cmd_dirs(pos[0] if pos else None)
    if cmd == "index":
        return cmd_index(pos[0] if pos else None,
                         rebuild=bool(opts.get("--rebuild")),
                         jobs=opt_int("--jobs", 0) or None)
    if cmd == "scan":
        limit = 0 if opts.get("--all") else opt_int("--limit", 30)
        return cmd_scan(pos[0] if pos else None, limit,
                        oldest_first=bool(opts.get("--oldest-first")),
                        rebuild=bool(opts.get("--rebuild")))
    if cmd == "recent":
        return cmd_recent(pos[0] if pos else None,
                          since_min=scope["since_min"], newest=scope["newest"],
                          grep=opts.get("--grep"), full=bool(opts.get("--full")),
                          max_lines=opt_int("--max-lines", 40),
                          budget_mb=scope["budget_mb"], all_flag=scope["all_flag"],
                          max_size=scope["max_size"])
    if cmd == "search":
        if not pos:
            print("[error] search 需要 pattern"); return 1
        return cmd_search(pos[0], pos[1] if len(pos) > 1 else None,
                          opt_int("--context", 200), opt_int("--max-hits", 20),
                          opt_int("--jobs", DEFAULT_JOBS), **scope)
    if cmd == "show":
        if not pos:
            print("[error] show 需要会话目录"); return 1
        start = int(pos[1]) if len(pos) > 1 and pos[1].isdigit() else 0
        count = int(pos[2]) if len(pos) > 2 and pos[2].isdigit() else 0
        return cmd_show(pos[0], start, count,
                        tail=opt_int("--tail", 0), max_len=opt_int("--max-len", 2000))
    if cmd == "errors":
        return cmd_errors(pos[0] if pos else None, jobs=opt_int("--jobs", DEFAULT_JOBS), **scope)
    if cmd == "todos":
        return cmd_todos(pos[0] if pos else None)
    print("[error] 未知命令: " + cmd)
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
