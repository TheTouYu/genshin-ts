#!/usr/bin/env python3
"""把 GSR 快捷键截的图收进语料库（只读原文件，复制进来；按内容 sha 去重）。

约定（2026-10-18 与用户定）：
  用户用 GPU Screen Recorder 的截图快捷键 → 默认落 ~/Pictures/Screenshot_<日期>_<时分秒>.jpg
  本脚本把它们复制到 .scratch/gui-corpus/inbox/raw/，同名保留时间戳，
  并在 $.scratch/gui-corpus/inbox/manifest.jsonl 追加一行（src/sha/size/mtime），
  重复图片（同 sha）只记一次。

用法:
  python3 tools/gui-frames-ingest.py            # 扫描 ~/Pictures 下所有 Screenshot_*
  python3 tools/gui-frames-ingest.py --since 2h # 只看最近 2 小时
  python3 tools/gui-frames-ingest.py --src ~/Pictures --dst .scratch/gui-corpus/inbox
"""
import argparse
import glob
import hashlib
import json
import os
import shutil
import sys
import time

from PIL import Image

DST_DEFAULT = ".scratch/gui-corpus/inbox"
SRC_DEFAULT = os.path.expanduser("~/Pictures")
PATTERNS = ["Screenshot_*", "截图_*", "screen_*"]


def sha256_of(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SRC_DEFAULT)
    ap.add_argument("--dst", default=DST_DEFAULT)
    ap.add_argument("--since", default="", help="只看最近多久，如 2h / 30m")
    args = ap.parse_args()

    cutoff = 0.0
    if args.since:
        unit = args.since[-1]
        val = float(args.since[:-1])
        cutoff = time.time() - val * (3600 if unit == "h" else 60)

    raw = os.path.join(args.dst, "raw")
    os.makedirs(raw, exist_ok=True)
    man_path = os.path.join(args.dst, "manifest.jsonl")

    known = set()
    if os.path.exists(man_path):
        for line in open(man_path, encoding="utf-8"):
            try:
                known.add(json.loads(line)["sha"])
            except Exception:
                pass

    files = []
    for pat in PATTERNS:
        files += glob.glob(os.path.join(args.src, pat))
    files = [f for f in files
             if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
             and os.path.isfile(f) and os.path.getmtime(f) >= cutoff]
    files.sort(key=os.path.getmtime)

    added = dup = bad = 0
    with open(man_path, "a", encoding="utf-8") as mf:
        for f in files:
            try:
                sha = sha256_of(f)
                im = Image.open(f)
                w, h = im.size
            except Exception as e:
                print(f"  SKIP {os.path.basename(f)}: {e}", file=sys.stderr)
                bad += 1
                continue
            if sha in known:
                dup += 1
                continue
            dst = os.path.join(raw, os.path.basename(f))
            shutil.copyfile(f, dst)
            rec = {"src": os.path.abspath(f), "dst": os.path.abspath(dst), "sha": sha,
                   "w": w, "h": h, "bytes": os.path.getsize(f),
                   "mtime": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(os.path.getmtime(f))),
                   "ingested_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
            mf.write(json.dumps(rec, ensure_ascii=False) + "\n")
            known.add(sha)
            added += 1
    print(f"scanned={len(files)} added={added} dup={dup} bad={bad} dst={os.path.abspath(raw)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
