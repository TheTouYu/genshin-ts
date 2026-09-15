#!/usr/bin/env python3
"""T04 · 把 822 条按轴切成专题输入片 + 生成能力覆盖参照

产出：
  slices/k<NN>-<轴>.md    每个 K 轴的条目全文（子代理写专题文档的输入）
  slices/d<N>-<域>.md     每个 D 域的条目全文（含细化子域）
  slices/_INDEX.md        切片索引（条数/源数）
用法: slice.py --agg aggregate.json --out slices
"""
import argparse
import collections
import json
import os
import re
import sys


def slug(s: str) -> str:
    s = s.replace(" ", "-")
    return re.sub(r"[^\w\u4e00-\u9fa5-]", "", s)[:40]


def render(entries: list) -> str:
    out, cur = [], None
    for x in sorted(entries, key=lambda e: (e["section"], -len(e["statement"]))):
        if x["section"] != cur:
            out.append(f"\n## {x['section']}\n")
            cur = x["section"]
        out.append(f"- **{x['statement']}**")
        out.append(f"  - 出处：`{x['bv']}` `[{x['ts']}]` \"{x['quote']}\"")
        out.append(f"  - 证据等级：{x['evidence']}")
        out.append(f"  - 原始维度：{x['dimension']}")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agg", default="aggregate.json")
    ap.add_argument("--out", default="slices")
    a = ap.parse_args()
    with open(a.agg, encoding="utf-8") as f:
        agg = json.load(f)
    E = agg["entries"]
    for x in E:
        x.setdefault("family", "?")
        x.setdefault("axis", x["dimension"])

    os.makedirs(a.out, exist_ok=True)
    index = ["# 切片索引（T04 输入）", "", "| 片 | 条数 | 源数 | 文件 |", "|---|---|---|---|"]
    groups = collections.defaultdict(list)
    for x in E:
        groups[x["axis"]].append(x)

    K_ORDER = ["K1 选题与赛道", "K2 引导与上手", "K3 难度与关卡", "K4 玩家心理",
               "K5 数据与迭代", "K6 平台与生态", "K7 团队与项目管理", "K8 质量保证"]

    def emit(name: str, tag: str) -> None:
        rows = groups.get(name, [])
        if not rows:
            return
        fn = f"{tag}-{slug(name)}.md"
        hdr = (f"# 切片：{name}\n\n"
               f"> {len(rows)} 条 / {len(set(x['bv'] for x in rows))} 个源\n"
               f"> 来源：`aggregate.json`（由 8 个子代理精读 40 源产出，822 条）\n"
               f"> 每条格式：陈述 / 出处(`BV` `[时间戳]` 可grep引文) / 证据等级 / 原始维度\n")
        with open(os.path.join(a.out, fn), "w", encoding="utf-8") as f:
            f.write(hdr + render(rows))
        index.append(f"| {name} | {len(rows)} | {len(set(x['bv'] for x in rows))} | `{fn}` |")

    for i, k in enumerate(K_ORDER, 1):
        emit(k, f"k{i:02d}")
    for d in ("D0", "D1", "D2", "D3", "D4", "D5", "D7"):
        rows = [x for x in E if (x["axis"] or "").startswith(d)]
        if rows:
            fn = f"d{d[1]}-{slug(d)}.md"
            with open(os.path.join(a.out, fn), "w", encoding="utf-8") as f:
                f.write(f"# 切片：{d} 域（含细化子域）\n\n"
                        f"> {len(rows)} 条 / {len(set(x['bv'] for x in rows))} 个源\n" + render(rows))
            index.append(f"| {d}（含细化） | {len(rows)} | {len(set(x['bv'] for x in rows))} | `{fn}` |")

    index += ["", "## D 轴细化子域分布", "", "| 细化子域 | 条数 | 源数 |", "|---|---|---|"]
    for k, v in sorted(collections.Counter(x["axis"] for x in E if "（+" in (x["axis"] or "")).items(),
                        key=lambda x: -x[1]):
        index.append(f"| {k} | {v} | {len(set(x['bv'] for x in E if x['axis'] == k))} |")
    with open(os.path.join(a.out, "_INDEX.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(index) + "\n")
    print(f"✓ {len([f for f in os.listdir(a.out) if f.endswith('.md')])} 个切片 → {a.out}")
    print("\n".join(index[:14]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
