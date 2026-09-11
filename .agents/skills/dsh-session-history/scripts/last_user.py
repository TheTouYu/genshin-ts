#!/usr/bin/env python3
"""last_user.py —— 压缩/失忆后 30 秒回收「用户到底说了什么」。

背景：长会话里上下文被压缩（或跨天了）之后，模型最容易犯的错是"凭记忆重建用户诉求"，
结果改了用户没提的东西、漏了真问题。用户的原始反馈其实**一直都在**当前会话的 JSONL 里，
本脚本就是把它捞回来的最短路径——不需要模型自己维护摘要，也不需要落盘写笔记。

用法（默认当前会话 = $DSH_SESSION_JSONL）：
    python3 last_user.py                      # 最近 10 条用户原话
    python3 last_user.py --limit 20           # 最近 20 条
    python3 last_user.py --since-min 30       # 最近 30 分钟内（时间过滤，条数不限）
    python3 last_user.py --full               # 不截断（默认每条 300 字）
    python3 last_user.py --session <会话目录或 session.jsonl[.zstd]>
    python3 last_user.py --list <sessions/<cwd> 目录>   # 该工作目录下每个会话的最后一条用户原话
    python3 last_user.py --injected           # 连注入消息一起看（子代理转发/插件/压缩通知）

实测（2026-09-10，30MB 压缩 / 本会话）：扫描全量 **3.3 秒**，返回最近 10 条用户原话。

判据（实测自本会话 JSONL）：真人的 user/message 事件带
`data.source = {"kind":"user","rpcId":"...","clientTimeZone":"Asia/Shanghai"}`；
其余 source.kind（plugin / agent-instructions / skill-catalog / agent-messaging…）
全是注入，不是人说的话——不过滤就会把技能目录、压缩通知当成用户诉求。
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess
import sys
import time

NOISE_PREFIXES = ("<system-reminder", "<available_skills", "<workspace", "Instructions from:")
SESSIONS_ROOT = os.path.join(os.environ.get("DSH_HOME", os.path.expanduser("~/.dsh")), "sessions")


def _open_lines(path: str):
    """流式产出 JSONL 字节行；.zstd 走 zstd CLI（本机 v1.5.7），普通文件直接读。"""
    if path.endswith(".zstd"):
        p = subprocess.Popen(["zstd", "-d", "-c", path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        assert p.stdout is not None
        for raw in p.stdout:
            yield raw
        p.wait()
    else:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for raw in f:
                yield raw.encode()


def _text_of(data: dict) -> str:
    out = []
    for c in data.get("content") or []:
        if isinstance(c, dict) and c.get("type") == "text":
            out.append(c.get("text") or "")
    return "\n".join(out).strip()


def collect(path: str, since_ms: int | None = None, include_injected: bool = False) -> list[dict]:
    """按时间顺序收集用户原话（含 agent/inbox/spliced 里 source.kind=user 的注入）。"""
    msgs: list[dict] = []
    for raw in _open_lines(path):
        if b"user/message" not in raw and b"spliced" not in raw:
            continue
        try:
            e = json.loads(raw)
        except Exception:
            continue
        t = e.get("type")
        if t not in ("user/message", "agent/inbox/spliced"):
            continue
        d = e.get("data") or {}
        src = d.get("source") or {}
        kind = src.get("kind") if isinstance(src, dict) else None
        human = kind == "user" and bool(src.get("rpcId"))
        if not include_injected and not human:
            continue
        txt = _text_of(d)
        if not txt or txt.startswith(NOISE_PREFIXES):
            continue
        ts = e.get("time") or d.get("time") or 0
        if since_ms and ts and ts < since_ms:
            continue
        msgs.append({"time": ts, "text": txt, "type": t, "kind": kind})
    msgs.sort(key=lambda m: m["time"] or 0)
    return msgs


def _fmt(ts: int) -> str:
    if not ts:
        return "??"
    lt = time.localtime(ts / 1000)
    age = (time.time() * 1000 - ts) / 60000
    age_s = f"{age:.0f}分钟前" if age < 120 else f"{age/60:.1f}小时前" if age < 2880 else f"{age/1440:.1f}天前"
    return f"{time.strftime('%m-%d %H:%M', lt)} ({age_s})"


def _find_session(arg: str | None) -> str:
    if arg:
        if os.path.isdir(arg):
            cand = os.path.join(arg, "session.jsonl.zstd")
            if os.path.exists(cand):
                return cand
            hits = glob.glob(os.path.join(arg, "*.jsonl.zstd")) + glob.glob(os.path.join(arg, "*.jsonl"))
            if hits:
                return max(hits, key=os.path.getmtime)
            raise SystemExit(f"目录里没有会话文件: {arg}")
        return arg
    env = os.environ.get("DSH_SESSION_JSONL")
    if env and os.path.exists(env):
        return env
    cwd_key = "--" + os.getcwd().strip("/").replace("/", "-").replace(".", "-") + "--"
    root = os.path.join(SESSIONS_ROOT, cwd_key)
    hits = glob.glob(os.path.join(root, "*", "session.jsonl.zstd"))
    if not hits:
        raise SystemExit(f"找不到会话（cwd={os.getcwd()}，试 --session）")
    return max(hits, key=os.path.getmtime)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", help="会话目录或 session.jsonl[.zstd]（默认当前会话）")
    ap.add_argument("--limit", type=int, default=10, help="最近 N 条（默认 10）")
    ap.add_argument("--since-min", type=int, default=0, help="只看最近 M 分钟")
    ap.add_argument("--chars", type=int, default=300, help="每条截断字数（默认 300）")
    ap.add_argument("--full", action="store_true", help="不截断")
    ap.add_argument("--injected", action="store_true", help="连注入消息一起列（子代理转发/插件/压缩通知）")
    ap.add_argument("--list", metavar="SESSIONS_DIR", help="列出该工作目录下每个会话的最后一条用户原话")
    a = ap.parse_args()

    if a.list:
        for d in sorted(glob.glob(os.path.join(a.list, "*")), key=os.path.getmtime, reverse=True)[:20]:
            f = os.path.join(d, "session.jsonl.zstd")
            if not os.path.exists(f):
                continue
            try:
                ms = collect(f, include_injected=a.injected)
            except Exception:
                continue
            if not ms:
                continue
            last = ms[-1]
            print(f"[{os.path.basename(d)[:38]}] {_fmt(last['time'])} 共{len(ms)}条")
            print("   " + last["text"].replace("\n", " ")[:160])
        return 0

    path = _find_session(a.session)
    since = int((time.time() - a.since_min * 60) * 1000) if a.since_min else None
    msgs = collect(path, since, include_injected=a.injected)
    if not a.since_min:
        msgs = msgs[-a.limit:]
    tag = f"（最近 {a.since_min} 分钟）" if a.since_min else f"（最近 {a.limit} 条）"
    print(f"# 会话 {os.path.basename(os.path.dirname(path))}  用户原话 {len(msgs)} 条 {tag}"
          + ("（含注入）" if a.injected else ""))
    for m in msgs:
        body = m["text"] if a.full else (m["text"][: a.chars] + ("…" if len(m["text"]) > a.chars else ""))
        print(f"\n── {_fmt(m['time'])} ──")
        print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
