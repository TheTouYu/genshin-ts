# -*- coding: utf-8 -*-
"""全库扫描 DSH 会话的 user 消息，统计两类协作模式（只读，流式解压）：
① 用户报告"球不动/离谱"类症状的会话分布（跨会话存续）
② 用户教授"分层排查"方法论的次数与分布
"""
import json, subprocess, os, glob, datetime, re

BASE = os.path.expanduser("~/.dsh/sessions/--home-h-genshin-ts--")
CUR = os.environ.get("DSH_SESSION_ID", "")

# 模式①：足球症状报告（球不动/离谱/铁球等）
PAT_SYMPTOM = re.compile(r"(球.{0,6}不动|不动.{0,6}球|足球.{0,10}离谱|数据.{0,4}离谱|像铁|懒得动|悬.{0,3}空|乱跳|飞出|瞬移|空转)")
# 模式②：分层排查教学（方法论传授）
PAT_TEACH = re.compile(r"(分层|逐层|层级|一点一点|缩小.{0,6}(范围|定位)|从头查|按照职责|职责.{0,4}查|用数据说话)")
# 模式③：用户情绪爆发/强烈不满
PAT_ANGRY = re.compile(r"(！！！|你到底|你知道.{0,10}吗|说人话|不要问)")

sessions = sorted(glob.glob(BASE + "/*/session.jsonl.zstd"))
symptom_hits, teach_hits, angry_hits = [], [], []
for path in sessions:
    sid_dir = os.path.basename(os.path.dirname(path))
    if CUR and CUR in sid_dir:
        continue
    sid = sid_dir.replace("session-", "")[:8]
    proc = subprocess.Popen(["zstd", "-d", "-c", path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    created = None
    for raw in proc.stdout:
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        t = obj.get("type", "")
        if t == "session":
            created = datetime.datetime.fromtimestamp(obj.get("createdAt", 0) / 1000).strftime("%m-%d")
        elif t == "user/message":
            data = obj.get("data", {})
            if data.get("source", {}).get("kind") != "user":
                continue
            texts = " ".join(c.get("text", "") for c in data.get("content", []) if c.get("type") == "text").strip()
            if not texts or texts.startswith("/"):
                continue
            ts = obj.get("time") or obj.get("data", {}).get("time")
            ts_s = datetime.datetime.fromtimestamp(ts / 1000).strftime("%m-%d %H:%M") if isinstance(ts, (int, float)) else "?"
            snip = texts.replace("\n", " ")[:120]
            if PAT_SYMPTOM.search(texts):
                symptom_hits.append((created, sid, ts_s, snip))
            if PAT_TEACH.search(texts):
                teach_hits.append((created, sid, ts_s, snip))
            if PAT_ANGRY.search(texts):
                angry_hits.append((created, sid, ts_s, snip))
    proc.wait()

out = "/home/h/genshin-ts/docs/collab-retro-2026-09/user-pattern-hits.txt"
with open(out, "w", encoding="utf-8") as f:
    f.write(f"=== ① 足球症状报告（球不动/离谱类）共 {len(symptom_hits)} 条 ===\n")
    for c, sid, ts, s in symptom_hits:
        f.write(f"{ts} [{sid}] {s}\n")
    f.write(f"\n=== ② 分层排查教学类 共 {len(teach_hits)} 条 ===\n")
    for c, sid, ts, s in teach_hits:
        f.write(f"{ts} [{sid}] {s}\n")
    f.write(f"\n=== ③ 情绪爆发/强烈表达类 共 {len(angry_hits)} 条 ===\n")
    for c, sid, ts, s in angry_hits:
        f.write(f"{ts} [{sid}] {s}\n")
print(f"symptom={len(symptom_hits)} teach={len(teach_hits)} angry={len(angry_hits)} -> {out}")
