#!/usr/bin/env python3
"""DSH 会话记录（聊天历史）检索工具 v2 —— 快速版（2026-09-01 重写）。

v1 痛点：scan/search 全量解压 + 逐行 json.loads，119 会话/537MB 压缩语料下 60s 必超时。
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

用法（与 v1 兼容 + 新增）：
  search_dsh_sessions.py dirs [<cwd>]                    列出会话目录（毫秒级）
  search_dsh_sessions.py index [<root|dir>] [--rebuild] [--jobs N]   建增量索引
  search_dsh_sessions.py scan [<root|dir>] [--limit N] [--all] [--oldest-first] [--rebuild]
                                                         会话全景：标题+时间+user摘要（走索引）
  search_dsh_sessions.py search <pattern> [<root|dir>] [--context N] [--max-hits N] [--jobs N]
                                                         关键词搜索（正则；最新优先；命中行才解析）
  search_dsh_sessions.py show <session-dir> [<start>] [<count>] [--tail N] [--max-len N]
                                                         按消息序号浏览（含思考/工具/错误标记）
  search_dsh_sessions.py errors [<dir|root>] [--jobs N] 列出所有 isError=true 的工具结果
  search_dsh_sessions.py todos [<session-root>]          未完成任务检测（走索引）

环境：DSH_HOME（默认 ~/.dsh）；DSH_SESSION_JSONL/DSH_SESSION_ID 标识当前会话（自动排除）。
依赖：zstd CLI。缓存：~/.cache/dsh-session-history/index.json（删掉即重建）。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

DEFAULT_ROOT = Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser() / "sessions"
CURRENT_JSONL = os.environ.get("DSH_SESSION_JSONL", "")
CURRENT_SESSION_ID = os.environ.get("DSH_SESSION_ID", "")


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
    """流式解压 yield 原始行（bytes）；超时/缺失安静终止。"""
    if not zstd_path.exists():
        return
    p = subprocess.Popen(
        ["zstd", "-d", "-c", str(zstd_path)],
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
        jobs = jobs or min(len(tasks), max(4, (os.cpu_count() or 4)))
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


def cmd_search(pattern_str, path_str, context, max_hits, jobs):
    try:
        re.compile(pattern_str)
    except re.error as e:
        print("[error] 正则无效: " + str(e))
        return 1
    root = _resolve_path(path_str)
    dirs = [d for d in collect_session_dirs(root) if not is_current(d.name)]
    if not dirs:
        print("[warn] 未找到会话: " + str(root))
        return 1
    # 索引只为输出标题/时间上下文；没有也不阻塞
    try:
        sessions = load_cache()["sessions"]
    except Exception:
        sessions = {}
    per_file = max(3, max_hits)
    tasks = [(str(d), pattern_str, per_file) for d in dirs]
    total, t0 = 0, time.time()
    with ThreadPoolExecutor(max_workers=jobs or 8) as ex:
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


def cmd_errors(path_str, jobs, cap=10):
    path = Path(path_str).expanduser() if path_str else DEFAULT_ROOT
    dirs = [d for d in collect_session_dirs(path) if not is_current(d.name)]
    if not dirs:
        print("[warn] 未找到会话: " + str(path))
        return 1
    total, t0 = 0, time.time()
    with ThreadPoolExecutor(max_workers=jobs or 8) as ex:
        for abs_dir, found in zip([str(d) for d in dirs],
                                  ex.map(_errors_one, [(str(d), cap) for d in dirs])):
            if found:
                print("=== " + Path(abs_dir).name + ": %d 个错误 ===" % len(found))
                for seq, txt in found[:cap]:
                    print("  (seq %s) %s" % (seq, txt[:300].replace("\n", " ")))
                total += len(found)
    print("共 %d 个 isError 工具结果（%.1fs）" % (total, time.time() - t0))
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


_VALUED = {"--limit", "--context", "--max-hits", "--jobs", "--max-len", "--tail", "--max-lines"}
_FLAGS = {"--rebuild", "--oldest-first", "--all"}


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
    if cmd == "search":
        if not pos:
            print("[error] search 需要 pattern"); return 1
        return cmd_search(pos[0], pos[1] if len(pos) > 1 else None,
                          opt_int("--context", 200), opt_int("--max-hits", 20),
                          opt_int("--jobs", 8))
    if cmd == "show":
        if not pos:
            print("[error] show 需要会话目录"); return 1
        start = int(pos[1]) if len(pos) > 1 and pos[1].isdigit() else 0
        count = int(pos[2]) if len(pos) > 2 and pos[2].isdigit() else 0
        return cmd_show(pos[0], start, count,
                        tail=opt_int("--tail", 0), max_len=opt_int("--max-len", 2000))
    if cmd == "errors":
        return cmd_errors(pos[0] if pos else None, jobs=opt_int("--jobs", 8))
    if cmd == "todos":
        return cmd_todos(pos[0] if pos else None)
    print("[error] 未知命令: " + cmd)
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
