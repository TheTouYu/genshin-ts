#!/usr/bin/env python3
"""DSH 会话记录（聊天历史）检索工具 — pi-session-history 的 DSH 适配 + 长期进化增强版。

存储：~/.dsh/sessions/<项目目录>/<session-id>/session.jsonl.zstd（zstd 压缩 JSONL 事件流）

事件类型（每行一个 JSON）：
  {"type":"session", "createdAt":<ms>, "cwd":...}          会话头（毫秒时间戳，顶层字段）
  {"type":"user/message", "data":{"content":[...], "role":"user", "source":{...}}}  用户消息（source.kind=user 才是真人原话）
  {"type":"assistant/message", "data":{"message":{"content":[...]}}} 助手消息
    content 元素：{"type":"reasoning","text"} / {"type":"tool-call","name","arguments"} / {"type":"text","text"}
  {"type":"tool/call", "data":{"callId","name","arguments"(json字符串)}}  工具调用
  {"type":"tool/result", "data":{"message":{"content":[{"type":"tool-result","content":[...],"isError"}]}}}  工具结果
  {"type":"turn/start"|"turn/end", "data":{"turn":N, "reason":...}}  对话轮边界
  {"type":"session/title", "data":{"title":...}}  会话标题
  {"type":"agent/inbox/spliced", "data":{"inserted":[消息...]}}  注入消息（可能含用户消息，按 id 去重）
  {"type":"session/end-seed"}  会话收尾
  注意：seq/time 在事件顶层；iter_events 已把它们并入 data。

用法：
  python3 search_dsh_sessions.py dirs [<cwd>]                 列出会话目录
  python3 search_dsh_sessions.py scan [<session-root|session-dir>] [--max-lines N]
                                                             会话全景：标题+时间+user摘要
  python3 search_dsh_sessions.py search <pattern> [<root|dir>] [--context N] [--max-hits N]
                                                             关键词搜索（正则，流式）
  python3 search_dsh_sessions.py show <session-dir> [<start>] [<count>] [--tail N] [--max-len N]
                                                             按消息序号浏览（含思考/工具/错误标记）
  python3 search_dsh_sessions.py errors [<session-dir|root>]  列出所有 isError=true 的工具结果
  python3 search_dsh_sessions.py todos [<session-root>]       未完成任务检测

环境：DSH_HOME（默认 ~/.dsh）；DSH_SESSION_JSONL/DSH_SESSION_ID 标识当前会话（检索时自动排除）。
依赖：zstd CLI（系统自带），通过管道流式解压，不落盘大文件。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

DEFAULT_ROOT = Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser() / "sessions"
CURRENT_JSONL = os.environ.get("DSH_SESSION_JSONL", "")
CURRENT_SESSION_ID = os.environ.get("DSH_SESSION_ID", "")


def dir_for(cwd: str) -> str:
    """把工作目录转成 DSH 会话目录名：/home/h/genshin-ts -> --home-h-genshin-ts--"""
    name = cwd.strip("/").replace("/", "-").replace(".", "-")
    return "--" + name + "--"


def stream_lines(zstd_path: Path):
    """流式解压 jsonl：yield 每行文本；自动终止。"""
    if not zstd_path.exists():
        print("[warn] missing: " + str(zstd_path), file=sys.stderr)
        return
    p = subprocess.Popen(
        ["zstd", "-d", "-c", str(zstd_path)],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
    )
    try:
        for line in p.stdout:
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


def fmt_ms(ms) -> str:
    """毫秒时间戳 -> 本地时间字符串。"""
    try:
        ms = int(ms)
        if ms < 1e12:
            ms *= 1000
        return datetime.fromtimestamp(ms / 1000).strftime("%m-%d %H:%M")
    except Exception:
        return "?"


def parse_content(content):
    """把 content 列表/字符串解析成 (kind, text) 序列。kind: text|thinking|toolcall|toolresult"""
    out = []
    if isinstance(content, str):
        if content.strip():
            out.append(("text", content))
        return out
    if not isinstance(content, list):
        return out
    for p in content:
        if not isinstance(p, dict):
            continue
        t = p.get("type")
        if t == "text" and p.get("text"):
            out.append(("text", p["text"]))
        elif t == "reasoning" and p.get("text"):
            out.append(("thinking", p["text"]))
        elif t in ("tool-call", "toolCall"):
            name = p.get("name", "?")
            args = p.get("arguments") or ""
            if isinstance(args, str):
                args = args[:200]
            else:
                try:
                    args = json.dumps(args, ensure_ascii=False)[:200]
                except Exception:
                    args = str(args)[:200]
            out.append(("toolcall", "[toolCall " + name + "] " + args))
        elif t == "tool-result":
            inner = p.get("content") or []
            texts = "".join(
                x.get("text", "") for x in inner if isinstance(x, dict) and x.get("type") == "text"
            )
            is_err = bool(p.get("isError"))
            out.append(("toolresult", texts, is_err))
    return out


def iter_events(zstd_path: Path):
    """流式产出 (seq, type, data)；容错坏行。
    session 事件把顶层 createdAt/cwd/id 并入 data；其余事件把顶层 time 并入 data。"""
    for line in stream_lines(zstd_path):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
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


def session_meta(zstd_path: Path, max_lines=20000):
    """扫描单个会话：返回摘要信息（只收集 source.kind=user 的真人原话，按消息 id 去重）。"""
    meta = {"id": zstd_path.parent.name, "created": None, "cwd": None,
            "title": None, "users": [], "turn_ends": [], "n_msgs": 0,
            "end_seed": False, "last_kinds": [], "last_texts": [],
            "seen_user_ids": set()}
    for seq, t, data in iter_events(zstd_path):
        if meta["n_msgs"] >= max_lines:
            meta["truncated"] = True
            break
        if t == "session":
            meta["created"] = data.get("createdAt")
            meta["cwd"] = data.get("cwd")
        elif t == "session/title" and not meta["title"]:
            meta["title"] = data.get("title")
        elif t == "user/message":
            src = data.get("source") or {}
            # 只收真人原话；系统注入（agent-instructions/plugin/skill-catalog）不是意图来源
            if src.get("kind") != "user":
                meta["n_msgs"] += 1
                continue
            mid = data.get("id") or ""
            txt = "".join(x[1] for x in parse_content(data.get("content")) if x[0] == "text")
            if mid and mid in meta["seen_user_ids"]:
                meta["n_msgs"] += 1
                continue
            if mid:
                meta["seen_user_ids"].add(mid)
            if txt.strip():
                meta["users"].append(txt.strip()[:400])
            meta["n_msgs"] += 1
        elif t == "agent/inbox/spliced":
            for m in data.get("inserted") or []:
                src = m.get("source") or {}
                if src.get("kind") != "user":
                    continue
                mid = m.get("id") or ""
                if mid and mid in meta["seen_user_ids"]:
                    continue
                if mid:
                    meta["seen_user_ids"].add(mid)
                txt = "".join(x[1] for x in parse_content(m.get("content")) if x[0] == "text")
                if txt.strip():
                    meta["users"].append(txt.strip()[:400])
        elif t == "assistant/message":
            msg = data.get("message") or {}
            for kind, *rest in parse_content(msg.get("content")):
                if kind == "text":
                    meta["last_texts"].append(rest[0])
            meta["n_msgs"] += 1
        elif t in ("tool/call", "tool/result"):
            meta["n_msgs"] += 1
            meta["last_kinds"].append(t)
        elif t == "turn/end":
            meta["turn_ends"].append(str(data.get("reason")))
        elif t == "session/end-seed":
            meta["end_seed"] = True
    return meta


def print_scan_entry(meta: dict):
    sid = meta["id"]
    created = fmt_ms(meta["created"]) if meta["created"] else "?"
    title = meta["title"] or "(无标题)"
    print("=== " + sid + "  [" + created + "] " + title)
    if meta["cwd"]:
        print("    cwd: " + str(meta["cwd"]))
    for u in meta["users"][:6]:
        print("    U: " + u[:160])
    if len(meta["users"]) > 6:
        print("    ... 共 %d 条 user 消息" % len(meta["users"]))
    flags = []
    if meta.get("truncated"):
        flags.append("超限截断")
    if not meta["end_seed"]:
        flags.append("无结束标记(可能未完成/中断)")
    for r in meta["turn_ends"]:
        if "completed" not in r:
            flags.append("turn中断: " + r[:60])
    if flags:
        print("    [!] " + "; ".join(flags))
    print()


def cmd_dirs(cwd):
    root = DEFAULT_ROOT
    if not root.exists():
        print("[error] 会话根不存在: " + str(root))
        return 1
    if cwd:
        d = root / dir_for(cwd)
        n = len(list(d.glob("session-*"))) if d.exists() else 0
        print(str(d) + "  " + ("存在 (%d 会话)" % n if d.exists() else "不存在"))
        return 0
    for d in sorted(root.iterdir()):
        if d.is_dir():
            n = len(list(d.glob("session-*")))
            print(d.name + "  (" + str(n) + " 会话)")
    return 0


def _is_current(session_dir: Path) -> bool:
    if CURRENT_SESSION_ID and session_dir.name == CURRENT_SESSION_ID:
        return True
    if CURRENT_JSONL and str(session_dir) in CURRENT_JSONL:
        return True
    return False


def _collect_session_dirs(path: Path):
    """输入可能是会话根、项目目录或单个会话目录。返回会话目录列表（按 mtime 升序）。"""
    if path.name.startswith("session-") and (path / "session.jsonl.zstd").exists():
        return [path]
    out = []
    for d in sorted(path.glob("session-*")):
        if (d / "session.jsonl.zstd").exists():
            out.append(d)
    if not out:
        for sub in sorted(path.iterdir()):
            if sub.is_dir() and not sub.name.startswith("session-"):
                out.extend(_collect_session_dirs(sub))
    return sorted(out, key=lambda d: (d / "session.jsonl.zstd").stat().st_mtime)


def cmd_scan(path_str, max_lines):
    path = Path(path_str).expanduser() if path_str else DEFAULT_ROOT
    if path.name.startswith("session-") and (path / "session.jsonl.zstd").exists():
        dirs = [path]
    elif (path / "session.jsonl.zstd").exists():
        dirs = [path]
    else:
        dirs = _collect_session_dirs(path)
    if not dirs:
        print("[warn] 未找到会话: " + str(path))
        return 1
    for d in dirs:
        if _is_current(d):
            print("(跳过当前会话 " + d.name + ")")
            continue
        meta = session_meta(d / "session.jsonl.zstd", max_lines=max_lines)
        print_scan_entry(meta)
    return 0


def _grep_texts(zstd_path: Path, pattern, max_hits: int):
    """流式搜索所有文本字段。yield (seq, kind_label, text) 命中片段。
    kind_label: U=用户原话 A=助手正文 T=思考 C=工具调用 R=工具结果 E=工具结果(错误)"""
    hits = 0
    for seq, t, data in iter_events(zstd_path):
        if t == "user/message":
            src = data.get("source") or {}
            if src.get("kind") != "user":
                continue
            for kind, txt in parse_content(data.get("content")):
                if kind == "text" and pattern.search(txt):
                    yield seq, "U", txt
                    hits += 1
        elif t == "assistant/message":
            msg = data.get("message") or {}
            for kind, *rest in parse_content(msg.get("content")):
                if kind == "text" and pattern.search(rest[0]):
                    yield seq, "A", rest[0]
                    hits += 1
                elif kind == "thinking" and pattern.search(rest[0]):
                    yield seq, "T", rest[0]
                    hits += 1
                elif kind == "toolcall" and pattern.search(rest[0]):
                    yield seq, "C", rest[0]
                    hits += 1
        elif t == "tool/call":
            name = data.get("name", "")
            args = data.get("arguments", "")
            if pattern.search(name) or pattern.search(args):
                yield seq, "C", "[toolCall " + name + "] " + args[:300]
                hits += 1
        elif t == "tool/result":
            msg = data.get("message") or {}
            for kind, *rest in parse_content(msg.get("content")):
                if kind == "toolresult":
                    txt, is_err = rest[0], rest[1]
                    if pattern.search(txt):
                        yield seq, ("E" if is_err else "R"), txt
                        hits += 1
        if hits >= max_hits:
            return


def cmd_search(pattern_str, path_str, context, max_hits):
    try:
        pattern = re.compile(pattern_str, re.IGNORECASE)
    except re.error as e:
        print("[error] 正则无效: " + str(e))
        return 1
    path = Path(path_str).expanduser() if path_str else DEFAULT_ROOT
    dirs = _collect_session_dirs(path)
    if not dirs:
        print("[warn] 未找到会话: " + str(path))
        return 1
    dirs.sort(key=lambda d: (d / "session.jsonl.zstd").stat().st_size)
    total = 0
    for d in dirs:
        if _is_current(d):
            continue
        z = d / "session.jsonl.zstd"
        file_hits = 0
        for seq, label, txt in _grep_texts(z, pattern, max_hits - total):
            piece = (txt[:context] if context else txt[:200]).replace(chr(10), " ")
            print("[" + d.name + "] (" + label + ":" + str(seq) + ") " + piece)
            file_hits += 1
            total += 1
            if total >= max_hits:
                print("(达到 --max-hits %d)" % max_hits)
                return 0
        if file_hits:
            print("  -- " + d.name + ": %d 处命中 --" % file_hits)
    print("共 %d 处命中" % total)
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
            name = data.get("name", "?")
            args = data.get("arguments", "")[:max_len]
            events.append(("C:" + name, seq, data.get("time"), args))
        elif t == "tool/result":
            msg = data.get("message") or {}
            err = False
            txts = []
            for kind, *rest in parse_content(msg.get("content")):
                if kind == "toolresult":
                    txts.append(rest[0])
                    err = err or rest[1]
            body = "".join(txts)[:max_len]
            label = "R[ERROR]" if err else "R"
            events.append((label, seq, data.get("time"), body))
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


def cmd_errors(path_str, max_len):
    path = Path(path_str).expanduser() if path_str else DEFAULT_ROOT
    dirs = _collect_session_dirs(path)
    if not dirs:
        print("[warn] 未找到会话: " + str(path))
        return 1
    total = 0
    for d in dirs:
        if _is_current(d):
            continue
        found = []
        for seq, t, data in iter_events(d / "session.jsonl.zstd"):
            if t != "tool/result":
                continue
            msg = data.get("message") or {}
            for kind, *rest in parse_content(msg.get("content")):
                if kind == "toolresult" and rest[1]:
                    found.append((seq, rest[0][:max_len]))
        if found:
            print("=== " + d.name + ": %d 个错误 ===" % len(found))
            for seq, txt in found[:10]:
                print("  (seq %d) %s" % (seq, txt[:300].replace(chr(10), " ")))
            total += len(found)
    print("共 %d 个 isError 工具结果" % total)
    return 0


def cmd_todos(path_str):
    path = Path(path_str).expanduser() if path_str else DEFAULT_ROOT
    dirs = _collect_session_dirs(path)
    if not dirs:
        print("[warn] 未找到会话: " + str(path))
        return 1
    for d in dirs:
        if _is_current(d):
            continue
        meta = session_meta(d / "session.jsonl.zstd", max_lines=50000)
        reasons = [r[:80] for r in meta["turn_ends"] if "completed" not in r]
        no_end = not meta["end_seed"]
        last_text = (" ".join(meta["last_texts"]))[-200:] if meta["last_texts"] else ""
        flag = []
        if reasons:
            flag.append("turn中断x%d" % len(reasons))
        if no_end:
            flag.append("无 end-seed")
        if meta["last_kinds"] and meta["last_kinds"][-1] in ("tool/call", "tool/result") and not last_text.strip():
            flag.append("尾部停在工具调用(无结论)")
        if flag:
            print("=== " + d.name + " [" + fmt_ms(meta["created"]) + "] " + "; ".join(flag))
            if last_text.strip():
                print("    尾部正文: " + last_text[:200])
            print()
    return 0


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    cmd = argv[0]
    args = argv[1:]
    if cmd == "dirs":
        return cmd_dirs(args[0] if args else None)
    if cmd == "scan":
        max_lines = 20000
        rest = []
        i = 0
        while i < len(args):
            if args[i] == "--max-lines":
                max_lines = int(args[i + 1]); i += 2
            else:
                rest.append(args[i]); i += 1
        return cmd_scan(rest[0] if rest else None, max_lines)
    if cmd == "search":
        if not args:
            print("[error] search 需要 pattern"); return 1
        pattern_str = args[0]
        context, max_hits = 200, 20
        rest = []
        i = 1
        while i < len(args):
            a = args[i]
            if a == "--context":
                context = int(args[i + 1]); i += 2
            elif a == "--max-hits":
                max_hits = int(args[i + 1]); i += 2
            else:
                rest.append(a); i += 1
        return cmd_search(pattern_str, rest[0] if rest else None, context, max_hits)
    if cmd == "show":
        if not args:
            print("[error] show 需要会话目录"); return 1
        max_len = 2000
        start, count, tail = 0, 0, 0
        rest = []
        i = 1
        while i < len(args):
            a = args[i]
            if a == "--tail":
                tail = int(args[i + 1]); i += 2
            elif a == "--max-len":
                max_len = int(args[i + 1]); i += 2
            elif a.isdigit():
                if not rest and start == 0:
                    start = int(a)
                else:
                    count = int(a)
                i += 1
            else:
                rest.append(a); i += 1
        return cmd_show(args[0], start, count, tail, max_len)
    if cmd == "errors":
        max_len = 2000
        rest = []
        i = 1
        while i < len(args):
            if args[i] == "--max-len":
                max_len = int(args[i + 1]); i += 2
            else:
                rest.append(args[i]); i += 1
        return cmd_errors(rest[0] if rest else None, max_len)
    if cmd == "todos":
        return cmd_todos(args[0] if args else None)
    print("[error] 未知命令: " + cmd)
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
