#!/usr/bin/env python3
"""PKC 项目包装器：转发到锁定的 runtime，并修复两个检索缺陷（2026-08-22 实证）：

1. `query` 默认 level 1 只搜 node/topic 标题（13 个），不搜 claim 内容（300+ 条）——
   未显式传 --level 时自动注入 `--level 2`（claim 级全库检索）。
2. `progressive-query` 中文长句意图 coverage gap 时整体报错、claim 不可达——
   自动降级为 `query --level 2 <intent 全文>`，并在 stderr 提示降级原因。
"""
from __future__ import annotations
import json, os, subprocess, sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
lock = json.loads((root / "tools/pkc-lock.json").read_text(encoding="utf-8"))
runtime = root / lock["runtime"]
exe = runtime / ("Scripts/pkc.exe" if os.name == "nt" else "bin/pkc")
if not exe.is_file():
    raise SystemExit("locked PKC runtime is missing; invoke global pkc-project-operator doctor")
env = os.environ.copy(); env.pop("PYTHONPATH", None)

args = sys.argv[1:]
cmd = args[0] if args else ""

# --- 修复 1：query 未显式 --level 时默认 level 2（搜 claim 内容） ---
if cmd == "query" and "--level" not in args and not any(a.startswith("--level=") for a in args):
    args += ["--level", "2"]

# --- 修复 2：progressive-query coverage gap 自动降级 query --level 2 ---
if cmd == "progressive-query":
    probe = subprocess.run([str(exe), "--root", str(root), *args], env=env,
                           capture_output=True, text=True)
    if probe.returncode != 0:
        try:
            err = json.loads(probe.stdout)
            gap_codes = ("RETRIEVAL_CANDIDATE_UNKNOWN", "RETRIEVAL_ROUTE_UNKNOWN",
                         "RETRIEVAL_CONTEXT_UNKNOWN", "RETRIEVAL_CONTEXT_UNAVAILABLE",
                         "RETRIEVAL_CONTEXT_SCOPE_VIOLATION")
            if any(e.get("code") in gap_codes for e in err.get("errors", [])):
                intent = ""
                for i, a in enumerate(args):
                    if a == "--intent" and i + 1 < len(args):
                        intent = args[i + 1]
                        break
                    if a.startswith("--intent="):
                        intent = a.split("=", 1)[1]
                        break
                fallback = ["query", "--level", "2"] + ([intent] if intent else [])
                if "--format" in args:
                    idx = args.index("--format")
                    if idx + 1 < len(args):
                        fallback += ["--format", args[idx + 1]]
                elif any(a.startswith("--format=") for a in args):
                    fallback += [next(a for a in args if a.startswith("--format="))]
                print("[PKC AUTO-FALLBACK] progressive-query coverage gap"
                      + (f" ({err['errors'][0]['code']})" if err.get("errors") else "")
                      + " → 降级 query --level 2", file=sys.stderr)
                raise SystemExit(subprocess.run([str(exe), "--root", str(root), *fallback], env=env).returncode)
        except (json.JSONDecodeError, KeyError, IndexError):
            pass
    sys.stdout.write(probe.stdout)
    sys.stderr.write(probe.stderr)
    sys.exit(probe.returncode)

raise SystemExit(subprocess.run([str(exe), "--root", str(root), *args], env=env).returncode)
