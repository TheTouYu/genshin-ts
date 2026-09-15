#!/usr/bin/env python3
"""T03 · 聚合 8 批精读产出 → 维度归纳 + 图谱数据

解析 extract/<BV>.md（子代理按 _SPEC.md 产出），抽出结构化条目：
  {bv, title, section, statement, quote, evidence, dimension}

产出：
  aggregate.json   全量条目（后续 T04+ 的填实输入）
  DIMENSIONS.md    涌现维度清单（含 ⊕ 自拟维度及其分布、哪些 bv 在讲）

用法: aggregate.py --dir extract --out .
"""
import argparse
import collections
import json
import os
import re
import sys

# 条目行允许闭合 `**` 后带全角标点（子代理实际写成 `- **陈述**，`）
# 条目行形如 `- **加粗**，后续整句说明。` —— 闭合 ** 后仍可能有正文，
# 故整行捕获再剥掉 ** 标记（曾因要求行尾而丢掉 249 条，41% 语料）
ENTRY = re.compile(r"^- \*\*(?P<stmt>.+)$")
# 时间戳可带分P前缀（多分P源用 `[P9 00:18:33]`），故用 [^\]]+ 而非 [\d:]+
QUOTE = re.compile(r"^\s+-\s*出处[：:]\s*`?\[(?P<ts>[^\]]+)\]`?\s*[「\"“]?(?P<q>.*?)[」\"”]?[，。；;]?\s*$")
EV = re.compile(r"^\s+-\s*证据等级[：:]\s*(?P<ev>.+?)\s*$")
DIM = re.compile(r"^\s+-\s*维度[：:]\s*(?P<dim>.+?)\s*$")
SECT = re.compile(r"^##\s+(?P<name>.+?)\s*$")
SRC = re.compile(r"^#\s+(?P<bv>BV[0-9A-Za-z]+)\s*(?P<title>.*)$")

VALID_EV = {"硬规则", "实测", "经验共识", "个人经验"}


def norm_ev(raw: str) -> str:
    """子代理常写 `个人经验（讲师自述…）`——括号里是限定语，基等级仍是个人经验。
    归一化到基等级，同时保留限定语供后续引用。"""
    for k in ("经验共识", "个人经验", "硬规则", "实测"):
        if raw.startswith(k):
            return k
    return raw


def parse_file(path: str) -> list:
    out, bv, title, sect = [], None, "", ""
    cur = None
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n")
        m = SRC.match(line)
        if m:
            bv, title = m.group("bv"), m.group("title").strip()
            continue
        m = SECT.match(line)
        if m:
            # 必须先收尾上一条：曾因直接 cur=None 在每个章节边界丢 1 条
            # （3 章节 → 每文件丢 2 条，全库丢 9.4%）
            if cur:
                out.append(cur)
                cur = None
            sect = m.group("name").strip()
            continue
        m = ENTRY.match(line)
        if m:
            if cur:
                out.append(cur)
            cur = {"bv": bv, "title": title, "section": sect,
                   "statement": m.group("stmt").replace("**", "").strip(),
                   "quote": "", "ts": "", "evidence": "", "dimension": ""}
            continue
        if cur is None:
            continue
        m = QUOTE.match(line)
        if m:
            cur["ts"], cur["quote"] = m.group("ts"), m.group("q").strip()
            continue
        m = EV.match(line)
        if m:
            cur["evidence"] = m.group("ev").strip()
            continue
        m = DIM.match(line)
        if m:
            cur["dimension"] = m.group("dim").strip()
            continue
    if cur:
        out.append(cur)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="extract")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    files = sorted(f for f in os.listdir(a.dir)
                   if f.endswith(".md") and not f.startswith("_"))
    entries, per_src, bad = [], {}, []
    for fn in files:
        e = parse_file(os.path.join(a.dir, fn))
        per_src[fn[:-3]] = len(e)
        entries += e
        for x in e:
            x["evidence_raw"] = x["evidence"]
            x["evidence"] = norm_ev(x["evidence"])
            if not x["dimension"] or not x["evidence"] or not x["quote"]:
                bad.append({"file": fn, "why": ("维度 " if not x["dimension"] else "")
                            + ("证据 " if not x["evidence"] else "")
                            + ("出处" if not x["quote"] else ""), **x})

    print(f"精读文件 {len(files)} 个，条目 {len(entries)} 条")
    print(f"字段缺失 {len(bad)} 条"
          + (f"（{len(bad)/max(len(entries),1):.0%}）" if bad else " ✅"))

    by_dim = collections.Counter(x["dimension"] for x in entries)
    by_ev = collections.Counter(x["evidence"] for x in entries)
    by_sec = collections.Counter(x["section"] for x in entries)

    # 维度归一：⊕ 自拟维度单独列出（这是"从语料长出来"的证据）
    emergent = {d: c for d, c in by_dim.items() if "⊕" in d}
    dskeleton = {d: c for d, c in by_dim.items() if "⊕" not in d}

    print(f"\n=== 证据等级分布 ===")
    for k, v in by_ev.most_common():
        flag = "" if k in VALID_EV else "  ⚠ 非规范取值"
        print(f"  {v:>4}  {k}{flag}")
    print(f"\n=== D 骨架维度（{len(dskeleton)} 个）===")
    for k, v in sorted(dskeleton.items(), key=lambda x: -x[1]):
        print(f"  {v:>4}  {k}")
    print(f"\n=== ⊕ 涌现维度（{len(emergent)} 个，非预设）===")
    for k, v in sorted(emergent.items(), key=lambda x: -x[1]):
        print(f"  {v:>4}  {k}")

    with open(os.path.join(a.out, "aggregate.json"), "w", encoding="utf-8") as f:
        json.dump({"entries": entries, "per_source": per_src,
                   "by_dimension": dict(by_dim), "by_evidence": dict(by_ev),
                   "by_section": dict(by_sec), "missing_fields": bad},
                  f, ensure_ascii=False, indent=1)

    # 维度文档：每个维度由哪些源在讲（图谱的"边"的第一种）
    dim_src = collections.defaultdict(set)
    for x in entries:
        if x["dimension"]:
            dim_src[x["dimension"]].add(x["bv"])
    L = ["# 维度归纳（T03 产出）", "",
         f"> 来源：{len(files)} 个源 / **{len(entries)} 条知识条目**（子代理按 `extract/_SPEC.md` 精读）",
         f"> 数据：`aggregate.json`（全量结构化条目，T04+ 的填实输入）", "",
         "## 一、证据等级分布", "", "| 等级 | 条数 | 含义 |", "|---|---|---|",
         "| 硬规则 | — | 官方文档/引擎事实 |", "| 实测 | — | 有人真做过并给出数据 |",
         "| 经验共识 | — | 多来源同说 |", "| 个人经验 | — | 单一讲师主观 |", ""]
    EV_DESC = {"硬规则": "官方文档/引擎事实", "实测": "有人真做过并给出数据",
               "经验共识": "多来源同说", "个人经验": "单一讲师主观"}
    for k, v in by_ev.most_common():
        L.append(f"| {k} | {v} | {EV_DESC.get(k, '⚠ 非规范取值')} |")
    L += ["", "## 二、⊕ 涌现维度（**不是预设的，是从语料里长出来的**）", "",
          "> 判据：子代理按 `_SPEC.md` 规则，当 D 骨架不合适时自拟维度名并加 ⊕。",
          "> 这些维度**官方目录里没有**，但语料里反复出现 —— 正是「如何做优质游戏」的知识所在。", "",
          "| 涌现维度 | 条数 | 讲它的源数 | 源 |", "|---|---|---|---|"]
    for k, v in sorted(emergent.items(), key=lambda x: -x[1]):
        srcs = sorted(dim_src[k])
        L.append(f"| **{k}** | {v} | {len(srcs)} | {', '.join(srcs[:6])}{'…' if len(srcs) > 6 else ''} |")
    L += ["", "## 三、D 骨架维度覆盖", "", "| 维度 | 条数 | 源数 |", "|---|---|---|"]
    for k, v in sorted(dskeleton.items(), key=lambda x: -x[1]):
        L.append(f"| {k} | {v} | {len(dim_src[k])} |")
    L += ["", "## 四、章节分布", "", "| 章节 | 条数 |", "|---|---|"]
    for k, v in by_sec.most_common():
        L.append(f"| {k} | {v} |")
    L += ["", "## 五、逐源条目数", "", "| BV | 条目 |", "|---|---|"]
    for k, v in sorted(per_src.items(), key=lambda x: -x[1]):
        L.append(f"| {k} | {v} |")
    L.append("")
    with open(os.path.join(a.out, "DIMENSIONS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"\n✓ aggregate.json + DIMENSIONS.md → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
