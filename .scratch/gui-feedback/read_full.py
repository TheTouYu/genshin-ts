#!/usr/bin/env python3
"""read_full.py — 把帧交给 GUI 模块读，产出**网页可视化用的全量读数**（含 bbox）。

ys-screen --json 的真实形状（2026-10-19 实测，别猜）：
  text[]        = {id,text,cx,cy,bbox,w,h,score,kind}   kind ∈ hud|content
  free_text[]   = **纯字符串**（没有 bbox —— 它们正是"没被容器接住"的文本）
  free_glyphs[] = {bbox,role,fill,contrast}             （纯图形元素，无文字）
  containers[]  = {id,parent,bbox,kind,skin,text[],glyphs[],...}
  structure[]   = {bbox,n_rows,row_y[],rows[]}          （组/分区级）

用法: python3 .scratch/gui-feedback/read_full.py out.json frame1.png frame2.png ...
"""
import json
import os
import subprocess
import sys

REPO = "/home/h/genshin-ts"


def bx(o):
    b = o.get("bbox") or o.get("box")
    return [int(round(v)) for v in b] if b and len(b) == 4 else None


def read(png):
    p = subprocess.run([f"{REPO}/tools/ys-screen", png, "--json"],
                       capture_output=True, text=True, timeout=300,
                       env=dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":0")))
    if p.returncode != 0:
        return {"frame": os.path.basename(png), "error": f"rc={p.returncode}",
                "stderr": (p.stderr or "")[-400:]}
    d = json.loads(p.stdout)
    cs = [{"id": c.get("id"), "parent": c.get("parent"), "kind": c.get("kind"),
           "bbox": bx(c), "text": (c.get("text") or [])[:6],
           "glyphs": len(c.get("glyphs") or []),
           "conf": c.get("confidence"),
           "clipped": bool((c.get("clipped") or {}).get("edges")),
           "clickable": ((c.get("affordance") or {}).get("clickable"))}
          for c in (d.get("containers") or []) if bx(c)]
    tx = [{"t": (t.get("text") or "").strip(), "bbox": bx(t), "kind": t.get("kind"),
           "score": t.get("score")}
          for t in (d.get("text") or []) if (t.get("text") or "").strip() and bx(t)]
    ft = [str(s).strip() for s in (d.get("free_text") or []) if str(s).strip()]
    fg = [{"bbox": bx(g), "role": g.get("role"), "contrast": g.get("contrast")}
          for g in (d.get("free_glyphs") or []) if bx(g)]
    st = [{"bbox": bx(s), "n_rows": s.get("n_rows"), "row_y": s.get("row_y")}
          for s in (d.get("structure") or []) if bx(s)]
    return {"frame": os.path.basename(png), "schema": d.get("schema"),
            "containers": cs, "text": tx, "free_text": ft, "free_glyphs": fg,
            "structure": st, "timing": d.get("timing"), "degraded": d.get("degraded")}


if __name__ == "__main__":
    out = sys.argv[1]
    rows = []
    for png in sys.argv[2:]:
        r = read(png)
        rows.append(r)
        print(f"read {r['frame']} c={len(r.get('containers') or [])} "
              f"t={len(r.get('text') or [])} g={len(r.get('free_glyphs') or [])} "
              f"s={len(r.get('structure') or [])}", file=sys.stderr, flush=True)
    json.dump(rows, open(out, "w"), ensure_ascii=False)
    print(f"wrote {out} n={len(rows)}", file=sys.stderr)
