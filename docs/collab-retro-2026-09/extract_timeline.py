# -*- coding: utf-8 -*-
"""从 6 个重点 DSH 会话提取协作事件时间线原料：每轮用户输入全文 + AI 回复摘要。只读。"""
import json, subprocess, sys, datetime

SESSIONS = [
    ("a0425aac-2583-4219-b4cc-c1fd5661bf5b", "0831 足球架构阐述"),
    ("fc449599-6990-439b-b84a-46d7363009bc", "0831 魔方A线/回归"),
    ("98b44274-7ede-4ab2-90d0-1c17ce560d68", "0831 football v5"),
    ("36e6df4e-ced3-43f2-874e-0fc55399a455", "0901 魔方回归撤销"),
    ("0312e388-9269-4dc3-a633-997df46fe795", "0901 football v7"),
    ("1d44d374-5829-4df7-80bd-7afe969db64b", "0901 足球调试"),
]
BASE = "/home/h/.dsh/sessions/--home-h-genshin-ts--/session-"

def ts_of(line_obj):
    t = line_obj.get("time") or line_obj.get("data", {}).get("time")
    if isinstance(t, (int, float)) and t > 0:
        return datetime.datetime.fromtimestamp(t / 1000).strftime("%m-%d %H:%M:%S")
    return "?"

def trunc(s, n):
    s = s.replace("\n", " ⏎ ").strip()
    return s[:n] + ("…" if len(s) > n else "")

out = open("/home/h/genshin-ts/docs/collab-retro-2026-09/raw-timeline-6sessions.txt", "w", encoding="utf-8")
for sid, label in SESSIONS:
    path = BASE + sid + "/session.jsonl.zstd"
    out.write(f"\n{'='*100}\nSESSION {sid}  [{label}]\n{'='*100}\n")
    proc = subprocess.Popen(["zstd", "-d", "-c", path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    pending_user = []   # user texts in current turn
    turn_no = 0
    last_assistant_texts = []
    for raw in proc.stdout:
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        typ = obj.get("type", "")
        if typ == "turn/start":
            data = obj.get("data", {})
            turn_no = data.get("turn", turn_no)
        elif typ == "user/message":
            data = obj.get("data", {})
            if data.get("source", {}).get("kind") != "user":
                continue
            texts = [c.get("text", "") for c in data.get("content", []) if c.get("type") == "text"]
            txt = " ".join(t for t in texts if t).strip()
            if txt:
                pending_user.append((ts_of(obj), txt))
        elif typ == "assistant/message":
            msg = obj.get("data", {}).get("message", {})
            for c in msg.get("content", []):
                if c.get("type") == "text" and c.get("text", "").strip():
                    last_assistant_texts.append(c["text"])
        elif typ == "turn/end":
            reason = obj.get("data", {}).get("reason", {}).get("kind", "")
            # flush turn
            for t, txt in pending_user:
                out.write(f"\n[T{turn_no} {t} USER] {trunc(txt, 1500)}\n")
            pending_user = []
            if last_assistant_texts:
                final = last_assistant_texts[-1]
                out.write(f"[T{turn_no} {ts_of(obj)} AI→] {trunc(final, 500)}\n")
            if reason and reason != "completed":
                out.write(f"[T{turn_no} !!turn/end reason={reason}]\n")
            last_assistant_texts = []
    # flush trailing
    for t, txt in pending_user:
        out.write(f"\n[T{turn_no} {t} USER-未答] {trunc(txt, 800)}\n")
    if last_assistant_texts:
        out.write(f"[T{turn_no} {ts_of({}) if False else ''} AI→(尾部)] {trunc(last_assistant_texts[-1], 300)}\n")
    proc.wait()
out.close()
print("written raw-timeline-6sessions.txt")
