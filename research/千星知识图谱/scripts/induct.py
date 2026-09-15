#!/usr/bin/env python3
"""T03 · 维度归纳：58 个 ⊕ 涌现维 → D 轴细化 + K 轴优质度

归纳原则（用户 2026-09-15 口径：维度从语料长出来，不预设）：
  子代理在 D 骨架装不下时自拟维度并加 ⊕，共 58 个 / 393 条（占 48%）。
  归纳不是"把它们塞回 D 骨架"，而是先判断每个 ⊕ 维**本质属于哪一类**：

  A. 「这是引擎/实现面的哪个子域」→ 补进 D 轴（骨架太粗，需要细化）
  B. 「这是怎么把游戏做**好**」     → 升为 K 轴（优质度面，D 骨架本就不该装）

用法: induct.py --agg aggregate.json --out .
"""
import argparse
import collections
import json
import os
import sys

# ⊕ 维 → D 轴细化（"引擎/实现面"归属；括号内为归入的 D 域）
D_REFINE = {
    # D2 编辑器资产：建模/美术/场景是在编辑器里摆出来的资产
    "模型拼装⊕": "D2", "实体UI⊕": "D2", "场景美术⊕": "D2", "场景还原⊕": "D2",
    "素材平替⊕": "D2", "运镜演出⊕": "D2", "关卡基建⊕": "D2", "存档与养成⊕": "D2",
    # D3 逻辑编写：实现手法与运行语义
    "打表映射⊕": "D3", "执行流语义⊕": "D3", "技能插件化⊕": "D3", "程序架构⊕": "D3",
    "架构设计⊕": "D3", "数据同步⊕": "D3", "客户端通信⊕": "D3", "物理约束⊕": "D3",
    "客户端算力⊕": "D3",
    # D5 表现层
    "UI框架⊕": "D5", "UI 动效⊕": "D5",
    # D7 工程化工具链：负载/边界/适配是工具链侧的可测指标
    "性能负载⊕": "D7", "性能与负载⊕": "D7", "负载与开发机⊕": "D7",
    "引擎边界⊕": "D7", "能力边界⊕": "D7", "引擎天花板⊕": "D7",
    "多端适配⊕": "D7", "AI协作⊕": "D7",
}

# ⊕ 维 → K 轴（"怎样才算做好"；按语义归并近义维）
K_AXIS = {
    "K1 选题与赛道": ["选题决策⊕", "选题与赛道⊕", "赛道选择⊕", "品类选型⊕",
                      "内容选题⊕", "选题孵化⊕", "玩法融合⊕", "原型拆解⊕"],
    "K2 引导与上手": ["引导设计⊕", "上手与受众⊕", "上手成本⊕"],
    "K3 难度与关卡": ["难度平衡⊕", "难度节奏⊕", "对抗平衡⊕", "关卡设计⊕", "可重玩性⊕"],
    "K4 玩家心理": ["玩家心理⊕"],
    "K5 数据与迭代": ["数据统计⊕", "数据导向⊕", "迭代运维⊕"],
    "K6 平台与生态": ["平台生态⊕", "创作者生态⊕", "曝光机制⊕", "宣发与社区⊕", "发布运营⊕"],
    "K7 团队与项目管理": ["项目管理⊕", "团队协作⊕", "多人协作⊕", "创作者素质⊕", "开发成本⊕"],
    "K8 质量保证": ["测试与QA⊕"],
}
K_LOOKUP = {d: k for k, ds in K_AXIS.items() for d in ds}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agg", default="aggregate.json")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    with open(a.agg, encoding="utf-8") as f:
        agg = json.load(f)
    entries = agg["entries"]

    unclassified = set()
    for x in entries:
        d = x["dimension"]
        if "⊕" not in d:
            x["axis"], x["family"] = d, "D"
        elif d in K_LOOKUP:
            x["axis"], x["family"] = K_LOOKUP[d], "K"
        elif d in D_REFINE:
            x["axis"], x["family"] = f"{D_REFINE[d]}（+{d.rstrip('⊕')}）", "D-refine"
        else:
            x["axis"], x["family"] = "未归类", "?"
            unclassified.add(d)

    if unclassified:
        print(f"⚠ 未归类 {len(unclassified)}: {sorted(unclassified)}", file=sys.stderr)

    by_family = collections.Counter(x["family"] for x in entries)
    by_axis = collections.Counter(x["axis"] for x in entries)
    by_ev = collections.Counter(x["evidence"] for x in entries)
    sec = collections.Counter(x["section"] for x in entries)

    print(f"条目 {len(entries)}")
    print(f"族分布: D={by_family['D']}  D-refine={by_family['D-refine']}  "
          f"K={by_family['K']}  未归类={by_family['?']}")
    print(f"\n=== K 轴（优质度面，{sum(by_family[k] for k in ('K',))} 条）===")
    for k in sorted(by_axis):
        if k.startswith("K"):
            print(f"  {by_axis[k]:>3}  {k}")
    print(f"\n=== D 轴细化（{by_family['D-refine']} 条）===")
    for k, v in sorted(by_axis.items(), key=lambda x: -x[1]):
        if "（+" in k:
            print(f"  {v:>3}  {k}")

    # 每轴→源（图谱的边）
    axis_src = collections.defaultdict(set)
    for x in entries:
        axis_src[x["axis"]].add(x["bv"])

    with open(os.path.join(a.out, "aggregate.json"), "w", encoding="utf-8") as f:
        agg["entries"] = entries
        agg["by_axis"] = dict(by_axis)
        agg["by_family"] = dict(by_family)
        agg["axis_sources"] = {k: sorted(v) for k, v in axis_src.items()}
        json.dump(agg, f, ensure_ascii=False, indent=1)

    L = ["# 维度归纳（T03 产出）", "",
         f"> 输入：{len(agg['per_source'])} 个源 / **{len(entries)} 条知识条目**（8 个子代理按 `extract/_SPEC.md` 精读）",
         "> 数据：`aggregate.json`（全量结构化条目）｜脚本：`scripts/aggregate.py` + `scripts/induct.py`", "",
         "## 一、结论：D 骨架装不下 48% 的知识", "",
         f"| 族 | 条数 | 占比 | 含义 |", "|---|---|---|---|",
         f"| D（骨架 7 维） | {by_family['D']} | {by_family['D']/len(entries):.0%} | 官方目录能装下的功能知识 |",
         f"| D-refine（骨架细化） | {by_family['D-refine']} | {by_family['D-refine']/len(entries):.0%} | 骨架太粗，语料自发生成的实/现子域 |",
         f"| **K（优质度面）** | {by_family['K']} | {by_family['K']/len(entries):.0%} | **官方目录里没有，但决定游戏好不好** |",
         "",
         "**判据**：子代理按 `_SPEC.md` 规定，只有当 D 骨架确实不合适时才自拟维度加 ⊕。",
         f"结果 {len(set(x['dimension'] for x in entries if '⊕' in x['dimension']))} 个 ⊕ 维、"
         f"{by_family['K'] + by_family['D-refine']} 条（{ (by_family['K']+by_family['D-refine'])/len(entries):.0%}）装不进骨架 —— "
         "这印证了「维度要从语料长出来」而非预设。", "",
         "## 二、K 轴 · 优质度面（**本图谱的学习重点**）", "",
         "> 这些维度官方文档不写（它只讲功能有什么），但决定玩家会不会玩、会不会留下。", "",
         "| K 轴 | 条数 | 源数 | 讲它的源 |", "|---|---|---|---|"]
    for k in sorted(K_AXIS):
        if by_axis.get(k):
            srcs = sorted(axis_src[k])
            L.append(f"| **{k}** | {by_axis[k]} | {len(srcs)} | {', '.join(srcs[:5])}{'…' if len(srcs) > 5 else ''} |")
    L += ["", "## 三、D-refine · 骨架细化（语料自发产生的实现子域）", "",
          "> 这些不是新族，是 D 骨架太粗 —— 官方目录把「模型拼装」「打表映射」「执行流语义」这类"
          "有独立技法的子域平铺成了一个大章节，实际需要独立成篇。", "",
          "| 细化子域 | 条数 | 源数 |", "|---|---|---|"]
    for k, v in sorted(by_axis.items(), key=lambda x: -x[1]):
        if "（+" in k:
            L.append(f"| {k} | {v} | {len(axis_src[k])} |")
    L += ["", "## 四、D 骨架覆盖", "", "| D 域 | 条数 | 源数 |", "|---|---|---|"]
    for k in sorted(by_axis):
        if k.startswith("D") and "（" not in k:
            L.append(f"| {k} | {by_axis[k]} | {len(axis_src[k])} |")
    L += ["", "## 五、证据等级分布", "", "| 等级 | 条数 | 判据 |", "|---|---|---|"]
    desc = {"硬规则": "官方文档/引擎事实", "实测": "有人真做过并给出数据/现象",
            "经验共识": "多来源同说", "个人经验": "单一讲师主观（**引用时须标注**）"}
    for k, v in by_ev.most_common():
        L.append(f"| {k} | {v} | {desc.get(k, '—')} |")
    L += ["", "## 六、章节分布", "", "| 章节 | 条数 |", "|---|---|"]
    for k, v in sec.most_common():
        L.append(f"| {k} | {v} |")
    L += ["", "## 七、逐源条目数", "", "| BV | 条目 | | BV | 条目 |", "|---|---|---|---|"]
    ps = sorted(agg["per_source"].items(), key=lambda x: -x[1])
    half = (len(ps) + 1) // 2
    for i in range(half):
        l = ps[i]
        r = ps[i + half] if i + half < len(ps) else ("", "")
        L.append(f"| {l[0]} | {l[1]} | | {r[0]} | {r[1]} |")
    L.append("")
    with open(os.path.join(a.out, "DIMENSIONS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"\n✓ DIMENSIONS.md 已更新（{len(L)} 行）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
