#!/usr/bin/env python3
"""T03 · 生成 docs/knowledge-graph/MAP.md（图谱总图）

地图不是目录树复述：必须给出**依赖边**与**覆盖度**，否则只是索引。
本脚本产出四张视图：
  ① D×K 覆盖矩阵（哪一格空 → 下一步查哪）
  ② D 轴索引（每域有哪些条目、来自哪些源）
  ③ K 轴索引（优质度面，本图谱的学习重点）
  ④ 源索引（40 源分别贡献了哪些轴）
用法: mappify.py --agg aggregate.json --out ../../docs/knowledge-graph
"""
import argparse
import collections
import json
import os
import sys

D_NAME = {"D0": "元知识与工具生态", "D1": "概念模型", "D2": "编辑器资产",
          "D3": "逻辑编写", "D4": "玩法系统", "D5": "表现层", "D7": "工程化工具链"}
K_ORDER = ["K1 选题与赛道", "K2 引导与上手", "K3 难度与关卡", "K4 玩家心理",
           "K5 数据与迭代", "K6 平台与生态", "K7 团队与项目管理", "K8 质量保证"]


def heat(n: int) -> str:
    if n >= 20:
        return "█"
    if n >= 10:
        return "▓"
    if n >= 5:
        return "▒"
    if n >= 1:
        return "░"
    return "·"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agg", default="aggregate.json")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    with open(a.agg, encoding="utf-8") as f:
        agg = json.load(f)
    E = agg["entries"]
    for x in E:
        x.setdefault("family", "?")
        x.setdefault("axis", x["dimension"])

    dsel = [x for x in E if x["family"] in ("D", "D-refine")]
    ksel = [x for x in E if x["family"] == "K"]

    # ① D×K 矩阵：D 域（含细化） × K 轴（按源共现——同一源既讲 D 又讲 K）
    d_of = collections.defaultdict(set)
    k_of = collections.defaultdict(set)
    for x in E:
        bv = x["bv"]
        if x["family"] in ("D", "D-refine"):
            d_of[bv].add((x["axis"] or "")[:2])
        elif x["family"] == "K":
            k_of[bv].add(x["axis"])
    cell = collections.Counter()
    for bv in set(list(d_of) + list(k_of)):
        for d in d_of[bv]:
            for k in k_of[bv]:
                cell[(d, k)] += 1

    axis_src = collections.defaultdict(set)
    for x in E:
        axis_src[x["axis"]].add(x["bv"])

    L = ["# MAP — 千星奇域「做优质游戏」知识图谱", "",
         "> 状态：**当前实现**（2026-09-15 建）｜来源：40 个 B站教程源 822 条知识条目 + 官方指南/KB 目录",
         "> 最近校验：2026-09-15（docs/ 治理要求的状态头字段，见 docs/AGENTS.md）",
         "> 上游：`research/千星知识图谱/`（SOURCES / KEYWORDS / CORPUS / COMMENTS-INSIGHTS / extract/）",
         "> 本图是**导航 + 覆盖度视图**，条目的正文在 `aggregate.json` 与 `extract/<BV>.md`（不在此复制）", "",
         "## 零、怎么用这张图", "",
         "| 你的处境 | 看哪 |", "|---|---|",
         "| 要做一个新玩法，不知道选什么品类 | ② K1 选题与赛道 |",
         "| 玩法能做出来但玩家玩不下去 | ② K2 引导与上手 + K4 玩家心理 |",
         "| 难度不知道怎么定 | ② K3 难度与关卡 |",
         "| 想知道某个引擎功能的具体做法 | ① D 轴索引 |",
         "| 卡在引擎做不到某件事 | ① D7（+引擎边界）（+打表映射）——先看有没有邪修 |",
         "| 做完了没人玩 | ② K6 平台与生态（**条数最多的 K 轴**）|", "",
         "## 一、核心结论：D 骨架装不下 48% 的知识", "",
         "| 族 | 条数 | 占比 | 含义 |", "|---|---|---|---|",
         f"| D（官方目录 7 域） | {len([x for x in E if x['family']=='D'])} | "
         f"{len([x for x in E if x['family']=='D'])/len(E):.0%} | 官方指南能装下的功能知识 |",
         f"| D-refine（骨架细化） | {len([x for x in E if x['family']=='D-refine'])} | "
         f"{len([x for x in E if x['family']=='D-refine'])/len(E):.0%} | 骨架太粗，语料自发生成的实现子域 |",
         f"| **K（优质度面）** | {len(ksel)} | {len(ksel)/len(E):.0%} | **官方目录里没有，但决定游戏好不好** |", "",
         "**方法论证据**：派 8 个子代理精读时只给了 D 骨架，并规定「D 骨架不合适就自拟维度加 ⊕」。",
         f"结果自发产出 58 个 ⊕ 维、{len([x for x in E if x['family'] in ('K','D-refine')])} 条装不进骨架——",
         "**这不是我预设的维度清单，是从 21 万字语料里长出来的**。", "",
         "## 二、K 轴 · 优质度面（学习重点）", "",
         "| K 轴 | 条数 | 源数 | 一句话 |", "|---|---|---|---|"]
    K_NOTE = {
        "K1 选题与赛道": "做什么品类/赛道决定了天花板；选错赛道再努力也白费",
        "K2 引导与上手": "**玩家第一分钟决定留不留**；无引导=再好的玩法也玩不下去",
        "K3 难度与关卡": "难度节奏要「舒服」；一次性地图/纯高难度都是坑",
        "K4 玩家心理": "玩家时间的稀缺性、啊哈时刻、挫败点",
        "K5 数据与迭代": "用数据判断改什么，而不是凭感觉",
        "K6 平台与生态": "**条数最多的 K 轴**——推荐机制/曝光/激励/等级门槛；平台规则比玩法更决定成败",
        "K7 团队与项目管理": "分工四角色；单人项目的取舍与失控信号",
        "K8 质量保证": "测试方法论；「能跑通 ≠ 好玩」",
    }
    for k in K_ORDER:
        n = len([x for x in ksel if x["axis"] == k])
        if n:
            L.append(f"| **{k}** | {n} | {len(axis_src[k])} | {K_NOTE.get(k,'')} |")
    L += ["", "## 三、D 轴索引（能力面）", "", "| D 域 | 条数 | 源数 | 覆盖的文件 |", "|---|---|---|---|"]
    for d in sorted(D_NAME):
        rows = [x for x in dsel if (x["axis"] or "").startswith(d)]
        if rows:
            L.append(f"| **{d} {D_NAME[d]}** | {len(rows)} | {len(set(x['bv'] for x in rows))} | "
                     f"`extract/` 中 {len(set(x['bv'] for x in rows))} 个源 |")
    L += ["", "### D 轴细化子域（语料自发产生的，官方目录没单列）", "",
          "| 细化子域 | 条数 | 源数 |", "|---|---|---|"]
    for k, v in sorted(collections.Counter(x["axis"] for x in dsel).items(), key=lambda x: -x[1]):
        if "（+" in k:
            L.append(f"| {k} | {v} | {len(axis_src[k])} |")
    L += ["", "## 四、D × K 覆盖矩阵（源级共现）", "",
          "> 读法：行列交叉的数字 = **同时讲了该 D 域与 K 轴的源数**。`·` 表示没有源同时覆盖 → 空白格，",
          "> 是后续轮次要重点补的方向（也可能是该组合本身不存在）。", "",
          "| D \\ K | " + " | ".join(k.split()[0] for k in K_ORDER) + " |",
          "|---|" + "---|" * len(K_ORDER)]
    for d in sorted(D_NAME):
        cells = []
        for k in K_ORDER:
            n = cell.get((d, k), 0)
            cells.append(f"{heat(n)}{n if n else ''}")
        L.append(f"| **{d}** | " + " | ".join(cells) + " |")
    L += ["", f"图例：█≥20 ▓≥10 ▒≥5 ░≥1 ·=0    （图例按源数；当前语料规模下 ░/▒ 已是有效覆盖）", "",
          "## 五、源索引（40 源 → 覆盖的轴）", "", "| BV | 条目 | 覆盖轴 |", "|---|---|---|"]
    per_src = agg["per_source"]
    src_axes = collections.defaultdict(set)
    for x in E:
        src_axes[x["bv"]].add(x["axis"])
    for bv, n in sorted(per_src.items(), key=lambda x: -x[1]):
        ax = sorted(src_axes[bv])
        L.append(f"| {bv} | {n} | {', '.join(a for a in ax[:6])}{'…' if len(ax) > 6 else ''} |")
    L += ["", "## 六、证据分级（引用时必须带）", "",
          "| 等级 | 条数 | 判据 | 怎么用 |", "|---|---|---|---|",
          "| 硬规则 | — | 官方文档/引擎事实 | 可直接依赖 |",
          "| 实测 | — | 有人真做过并给出数据/现象 | 可依赖，注明样本 |",
          "| 经验共识 | — | 多来源同说 | 可用，标注来源数 |",
          "| 个人经验 | — | 单一讲师主观 | **可用但必须标注**，不可当规则写进实现 |", "",
          "## 七、覆盖度与缺口", "",
          "| 分母 | 已覆盖 | 状态 |", "|---|---|---|",
          "| B站教程源（S+A 级 50 个） | 40 个有字幕轨已精读 | 10 个无轨待 ASR |",
          "| 官方指南镜像 `docs/ui-tutorial/` 8 文件 | 章节结构已登记 | 正文逐节映射待 T04+ |",
          "| 官方 KB 305 篇 | 已做域映射 | tutorial 85 篇（项目案例实战）待精读 |",
          "| `docs/composite-library/` 21 类 | 未纳入本轮 | T05 D3 域填实时复用 |", "",
          "## 八、下一步", "",
          "- T04+ 逐域填实：把 `aggregate.json` 的条目按轴分配到 `docs/knowledge-graph/<域>/<专题>.md`",
          "- 每专题绑定 ≥2 源且 ≥1 为教程（T01 的 SOURCES.md 已是源池）",
          "- 官方指南/KB 的硬规则逐节补进 D 轴（当前 D 轴偏薄，多为语料二手转述）",
          "- 缺 ASR 的 10 个源按需补转写",
          "- 终验收：端到端复现一款真实存在的优质玩法", ""]
    # 专题文档索引（扫描实际文件，不手写——避免地图与实体脱节）
    L += ["", "## 九、专题文档索引（已写成的域/专题）", "",
          "> 本表由 `mappify.py` 扫描 `docs/knowledge-graph/{k,d}/` 生成，**不手写**，",
          "> 保证地图与实际文件不脱节。每篇七段式：定义 / 源绑定 / 规则与做法 / 节点资产命令 /",
          "> 我方覆盖度 / 诊断路径 / 缺口与待验证。", "",
          "| 专题 | 文件 | 行 | 源数 | 硬规则提及 | 官方锚点 | 时间戳引文 |",
          "|---|---|---|---|---|---|---|"]
    import re as _re
    for sub, label in (("k", "K 轴 · 优质度面"), ("d", "D 轴 · 能力面")):
        sd = os.path.join(a.out, sub)
        if not os.path.isdir(sd):
            continue
        L.append(f"| **{label}** | | | | | | |")
        for fn in sorted(os.listdir(sd)):
            if not fn.endswith(".md"):
                continue
            t = open(os.path.join(sd, fn), encoding="utf-8").read()
            n_src = len(set(_re.findall(r"BV[0-9A-Za-z]{10}", t)))
            n_hr = len(_re.findall(r"硬规则", t))
            n_an = (len(_re.findall(r"official-guide-[a-z-]+\.md:\d+", t))
                    + len(_re.findall(r"official-ui-tutorial\.md:\d+", t)))
            n_ts = len(_re.findall(r"`?\[\d{2}:\d{2}:\d{2}\]`?", t))
            L.append(f"| {fn[:-3]} | `{sub}/{fn}` | {len(t.splitlines())} | {n_src} | "
                     f"{n_hr} | {n_an} | {n_ts} |")

    # 十、复现工程与能力参照（保持图谱自洽：从地图能一步到验收现场）
    L += ["", "## 十、终验收现场与能力参照", "",
          "> 图谱的用法终点是**用它做出一款游戏**。以下是从地图直达验收现场的入口。", "",
          "| 入口 | 内容 |", "|---|---|",
          "| **`DELIVERY.md`** | **交付核对表**：objective 逐条对照 + 18 篇专题矩阵 + 未完成项；由 `audit.py` 重算（可作门禁，退出码 0=全达标） |",
          "| `reproduction/T12-design.md` | 端到端复现设计书：9 条决策**每条都引图谱条目**（对图谱可用性的实测）+ 5 项图谱缺口 + 4 项能力缺口 |",
          "| `reproduction/maze-layout.md` | 迷宫俯视图与设计原则落点标注（造景即路标/惯性引导/手累坑/隐藏物） |",
          "| `reproduction/gen-maze.py` | 几何生成器（可复现，150 实体；自带 BFS 验证） |",
          "| `research/千星知识图谱/slices/_CAPABILITY.md` | **能力覆盖三档判定**（✅可做/🟡部分/🔴缺），每项带 `文件:行` 或命令证据 |",
          "| `docs/knowledge-graph/ATOMIC-RULES.md` | 可复用原子规则候选（13 条已回灌 PKC） |",
          "| `examples/maze-repro/PROGRESS.md` | 复现工程进度与两条施工硬规则 |", "",
          "**复现当前状态**：设计 ✅ / 几何 ✅ / 节点 ✅（`.gia` id=1073741931，IR 核验 9/9） / "
          "**注入 ⬜（需确认目标 mapId）** / 游戏内核验 ⬜（需用户在游戏内执行）", ""]

    os.makedirs(a.out, exist_ok=True)
    p = os.path.join(a.out, "MAP.md")
    with open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"✓ {p}（{len(L)} 行）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
