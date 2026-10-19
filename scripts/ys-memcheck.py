#!/usr/bin/env python3
"""ys-memcheck — 压缩前自查：把「本会话真实的用户消息」摆出来（2026-10-17 建）

## 为什么需要它
实证事故（2026-10-17）：一个压缩区间里 5 条用户**指路**被折成两句技术结论 ⇒ 指路消失。
「数字好补，指路难补」——所以压缩前必须逐条看一眼用户到底说过什么。

## 用法
    ys-memcheck                  # 本会话最后 20 条真实用户消息 + 最近压缩点
    ys-memcheck -n 40            # 多看一些
    ys-memcheck --since 8300     # 只看 seq ≥ 8300（常配合"最近一次压缩点"）
    ys-memcheck --session <id>   # 指定会话
    ys-memcheck --all            # 不过滤：连 /skill 调用与系统提醒一起列（调试用）

退出码：0 正常；2 找不到会话文件。
设计约束（都是踩过的坑）：
  · 会话是**目录** `session-<id>/session.v4.jsonl.zstd`，`$DSH_SESSION_JSONL` 常为 UNSET；
  · 取会话要按时间（`ls -dt`）或按 id，**`ls -d | head -1` 是按名字排序，会取错会话**；
  · 必须排掉 `source.kind=="skill-invocation"`（`/skill` 正文数千字会冲掉真消息）。
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys

BASE = pathlib.Path.home() / ".dsh" / "sessions" / "--home-h-genshin-ts--"
# 指路/诉求的线索词——命中就标 ★，提醒"这条别再被压掉"
HEAD_KEEP = 6          # 即便截断也保留开头几条：会话开头定义目标，丢了就只剩"当前诉求"
CUE = re.compile(r"去|看|查|试|问|不要|应该|可能|为什么|怎么|？|\?|记住|注意|提醒|不是")


def pick_session(sid: str | None) -> pathlib.Path | None:
    if sid:
        p = BASE / sid
        if (p / "session.v4.jsonl.zstd").is_file():
            return p
    env = os.environ.get("DSH_SESSION_ID")
    if env and (BASE / env / "session.v4.jsonl.zstd").is_file():
        return BASE / env
    dirs = [d for d in BASE.glob("session-*") if (d / "session.v4.jsonl.zstd").is_file()]
    dirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)   # ← 必须按时间
    return dirs[0] if dirs else None


def stream(path: pathlib.Path):
    with subprocess.Popen(["zstd", "-dc", str(path)], stdout=subprocess.PIPE) as pr:
        for raw in pr.stdout:
            if raw.startswith(b'{"type":'):
                yield raw


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", "--num", type=int, default=0,
                    help="显示最后 N 条；0（缺省）=全量。截断时仍保留开头几条，并报告省略的 seq 区间")
    ap.add_argument("--since", type=int, default=0, help="只看 seq ≥ 该值")
    ap.add_argument("--session", help="会话 id（默认本会话）")
    ap.add_argument("--all", action="store_true", help="不过滤 skill-invocation/系统提醒")
    args = ap.parse_args()

    d = pick_session(args.session)
    if not d:
        print(f"找不到会话目录：{BASE}", file=sys.stderr)
        return 2
    f = d / "session.v4.jsonl.zstd"

    users, comps = [], []
    for raw in stream(f):
        try:
            o = json.loads(raw)
        except Exception:
            continue
        t = o.get("type", "")
        if t.startswith("compaction"):
            if t == "compaction/summary":
                dr = (o.get("data") or {}).get("shadowedRange") or {}
                comps.append((o.get("seq"), dr.get("start"), dr.get("end")))
            continue
        if t != "user/message":
            continue
        dd = o.get("data") or {}
        src = dd.get("source") or {}
        if not args.all and isinstance(src, dict) and src.get("kind") != "user":
            continue
        c = dd.get("content")
        txt = " ".join(x.get("text", "") for x in c if isinstance(x, dict)) if isinstance(c, list) else str(c or "")
        if not args.all and (txt.startswith("<system-reminder>") or txt.startswith("<skill_content")
                             or txt.startswith("This is an automatically generated checkpoint")):
            continue
        ts = dd.get("time") or o.get("time") or 0
        ts = datetime.datetime.fromtimestamp(ts / 1000).strftime("%m-%d %H:%M") if ts else "?"
        users.append((o.get("seq", 0), ts, " ".join(txt.split())))

    print(f"会话 {d.name}｜文件 {f.stat().st_size:,} B｜真实用户消息 {len(users)} 条")
    if comps:
        print(f"最近压缩点：seq {comps[-1][0]}（影子区 {comps[-1][1]}–{comps[-1][2]}）"
              f"｜共 {len(comps)} 次 summary")
    pool = [u for u in users if u[0] >= args.since]
    if args.num and len(pool) > args.num:
        head = pool[:HEAD_KEEP]                       # 开头定目标：截断也要留住
        tail = pool[-args.num:]
        omitted = [u for u in pool[len(head):len(pool) - args.num]]
        sel = head + tail
        cut_note = (f"（-n {args.num} 截断：开头 {len(head)} 条 + 末尾 {len(tail)} 条；"
                    f"**省略 {len(omitted)} 条**，seq {omitted[0][0]}–{omitted[-1][0]}）")
    else:
        sel, cut_note = pool, ""
    print(f"\n共 {len(sel)} 条（★=含指路/诉求线索）{cut_note}\n"
          "  开头=目标从哪来，中间=转折与指路，结尾=当前诉求；三段都要看，别只读尾巴。\n")
    for seq, ts, txt in sel:
        mark = "★" if CUE.search(txt) else " "
        print(f"  {mark} seq={seq:<6} {ts}  {txt[:150]}")
    if args.since and any(u[0] < args.since for u in users):
        print(f"\n（--since {args.since} 之前的 {sum(1 for u in users if u[0] < args.since)} 条已隐藏）")
    if cut_note:
        print("\n⚠ 本视图是截断视图：判「已满足/未满足」前请用 `ys-memcheck`（缺省全量）或 -n 0 复看一遍。")
    print("\n判据：★ 行逐条回答——已满足（证据在哪）／未满足（进摘要，别压掉）；"
          "用户给的指针先执行完再压。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
