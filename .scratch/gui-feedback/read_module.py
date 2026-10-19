#!/usr/bin/env python3
"""read_module.py — 把一帧交给 GUI 模块读，输出紧凑的「模块读数」（不给人眼读图）。

用法: python3 .scratch/gui-feedback/read_module.py <png> [--full]
输出: JSON —— containers(kinds/数量) / text(前 N 条) / free_text / structure / timing / degraded
"""
import json
import subprocess
import sys
import os

REPO = "/home/h/genshin-ts"


def read(png):
    p = subprocess.run([f"{REPO}/tools/ys-screen", png, "--json"],
                       capture_output=True, text=True, timeout=180,
                       env=dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":0")))
    if p.returncode != 0:
        return {"error": f"rc={p.returncode}", "stderr": p.stderr[-300:]}
    d = json.loads(p.stdout)
    from collections import Counter
    cs = d.get("containers") or []
    kinds = Counter(c.get("kind") for c in cs)
    out = {
        "frame": os.path.basename(png),
        "schema": d.get("schema"),
        "containers_n": len(cs),
        "kinds": dict(kinds),
        "texts_n": len(d.get("text") or []),
        "free_text_n": len(d.get("free_text") or []),
        "free_glyphs_n": len(d.get("free_glyphs") or []),
        "structure": (len(d["structure"]) if isinstance(d.get("structure"), list)
                      else {k: (len(v) if isinstance(v, list) else v)
                            for k, v in (d.get("structure") or {}).items()}),
        "timing": d.get("timing"),
        "degraded": d.get("degraded"),
    }
    out["texts"] = [t["text"].strip() for t in (d.get("text") or []) if t.get("text", "").strip()]
    out["containers"] = [{"id": c.get("id"), "kind": c.get("kind"), "bbox": c.get("bbox"),
                          "text": (c.get("text") or [])[:3]} for c in cs[:40]]
    return out


if __name__ == "__main__":
    full = "--full" in sys.argv
    for png in [a for a in sys.argv[1:] if not a.startswith("--")]:
        r = read(png)
        if not full:
            r.pop("containers", None)
            r["texts"] = r.get("texts", [])[:24]
        print(json.dumps(r, ensure_ascii=False))
