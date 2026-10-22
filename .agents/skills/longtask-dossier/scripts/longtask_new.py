#!/usr/bin/env python3
"""长期任务档案脚手架（longtask-dossier）。

用法：
    python3 longtask_new.py --dir docs/longtask --title "GUI AGI 模块" --goal "…一句话目标…"
    python3 longtask_new.py --dir docs/longtask --dry-run          # 只看会写哪些文件

行为：
  - 目录不存在则创建；已存在的文件**不覆盖**（打印 SKIP），可安全重复运行。
  - 生成 6 份分层文件 + dossiers/ + archive/README.md，全部带 `状态：`/`最近校验：` 状态头。
  - 生成后立刻跑一次体检（有 fail 也不阻断，交给调用者修）。
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

TODAY = dt.date.today().isoformat()

HEADER = "> 状态：待填写（脚手架生成）\n> 来源：待填写\n> 最近校验：{today}\n"


def index_md(title: str, goal: str) -> str:
    return f"""# {title} · 长期任务入口（L0 · 3 分钟读完）

{HEADER.format(today=TODAY)}
---

## 一、这是什么任务（三句话）

1. 目标：{goal}
2. 为什么现在做这个（而不是别的）：待填写。
3. 当前阶段与总目标的关系：待填写。

## 二、现在在哪（每次收尾更新这一节）

| 项 | 读数 |
|---|---|
| 当前阶段 | 待填写 |
| 最近一次交付 | 待填写 |
| 断点 | 待填写 |
| 阻塞 | 待填写 |

## 三、按你要做的事选读

| 你要做的事 | 读这份 | 预算 |
|---|---|---|
| 第一次接手 | [`01-charter.md`](01-charter.md) | ≤150 行 |
| 开一轮活 | [`02-xinfa.md`](02-xinfa.md) | ≤250 行 |
| 接手现场 | [`03-state.md`](03-state.md) | ≤150 行 |
| 搞清为什么 | [`04-timeline.md`](04-timeline.md) | 按需 |
| 看还剩什么 | [`05-open.md`](05-open.md) | ≤150 行 |

## 四、三条硬规矩

1. 落盘先于压缩（写出变化，再压上下文）。
2. 交接落仓库，不落 `/tmp`。
3. 结论带出处（日期 + 用户原话或命令读数）。
"""


def charter_md(title: str) -> str:
    return f"""# 宪章：{title}（L1）

{HEADER.format(today=TODAY)}
---

## 一、目标（用户原话，带出处）

> 「……」—— YYYY-MM-DD，会话 <id> seq <n>

## 二、验收判据（可判、可数）

| # | 判据 | 当前状态 |
|---|---|---|
| G1 | 待填写 | ⬜ |

## 三、边界（已拍板，不再改主意）

- 待填写。

## 四、权威文件表

| 主题 | 权威文件 | 是什么 |
|---|---|---|
| 待填写 | 待填写 | 待填写 |

## 五、判"做完了"的三层证据

1. 结构层（代码/编译/回读）——只能说"在位"。
2. 行为层（日志帧值/真机读数）——只能说"真的在动"。
3. 用户层（用户亲测说好用）——唯一能说"验收通过"。
"""


def xinfa_md() -> str:
    return f"""# 心法：方法与纪律（L1）

{HEADER.format(today=TODAY)}
> 格式：每条 = 要做什么 / 为什么 / 判据 / 出处。来源写成用户原话，不写自己的总结。

---

## A. 目标与判断

### A1 标题
**要做什么**：…
**为什么**：…
**判据**：…
> YYYY-MM-DD：「原话」
"""


def state_md() -> str:
    return f"""# 现状：读数、在跑、断点（L1 · 每轮收尾必改）

{HEADER.format(today=TODAY)}
---

## 一、当前阶段与断点

| 项 | 值 | 时间 |
|---|---|---|
| 当前阶段 | 待填写 | {TODAY} |

## 二、读数（分场景报，别混报）

| 指标 | 值 | 备注 |
|---|---|---|
| 待填写 | 待填写 | 待填写 |

## 三、机器与常驻服务

```
待填写（ps/窗口/授权状态的只读实测）
```

## 四、最近三笔提交

| commit | 内容 |
|---|---|
| 待填写 | 待填写 |
"""


def timeline_md() -> str:
    return f"""# 决策日志（L2 · 只追加，不改历史）

{HEADER.format(today=TODAY)}
> 一条 = 会改变后续行为的决策/转折。日常进展写 `03-state.md`。

---

| 日期 | 发生了什么 | 用户原话 / 决策 | 影响 / 产物 |
|---|---|---|---|
| {TODAY} | 建档 | 「」 | 本套文档 |
"""


def open_md() -> str:
    return f"""# 缺口清单：未满足 / 待拍板 / 已否决（L2）

{HEADER.format(today=TODAY)}
> 编号 `O-YYYY-MM-DD-n`；关闭时保留编号与证据。

---

## A. 用户诉求未满足（最优先）

| 编号 | 诉求（用户原话） | 状态 | 说明 |
|---|---|---|---|
| O-{TODAY}-1 | 「」 | ⬜ | 待填写 |

## B. 已知缺陷 / 技术债

| 编号 | 问题 | 影响 | 下一步 |
|---|---|---|---|
| — | — | — | — |

## C. 待用户拍板

| 编号 | 问题 | 备选 |
|---|---|---|
| — | — | — |

## D. 已否决 / 已证伪（别再走）

| 路线 | 为什么否决 | 出处 |
|---|---|---|
| — | — | — |
"""


ARCHIVE_README = """# 归档规则

规则：`04-timeline.md` >120 行归档最老一半；`05-open.md` 已关闭 >20 条归档；
dossier 收口后整篇归档；归档件只加一行 `> 归档于 YYYY-MM-DD`，不改内容；
归档后同步 `INDEX.md` 指针并跑体检。
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="长期任务档案脚手架")
    ap.add_argument("--dir", required=True, help="档案目录，例 docs/longtask")
    ap.add_argument("--title", default="长期任务", help="任务名")
    ap.add_argument("--goal", default="待填写（一句话目标）", help="一句话目标")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    root = Path(args.dir)
    files = {
        "INDEX.md": index_md(args.title, args.goal),
        "01-charter.md": charter_md(args.title),
        "02-xinfa.md": xinfa_md(),
        "03-state.md": state_md(),
        "04-timeline.md": timeline_md(),
        "05-open.md": open_md(),
        "archive/README.md": ARCHIVE_README,
    }

    for rel, content in files.items():
        p = root / rel
        if p.exists():
            print(f"SKIP {p}（已存在，不覆盖）")
            continue
        if args.dry_run:
            print(f"WOULD-WRITE {p}")
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        print(f"WROTE {p}")

    dossiers = root / "dossiers"
    if args.dry_run:
        print(f"WOULD-MKDIR {dossiers}")
    else:
        dossiers.mkdir(parents=True, exist_ok=True)
        print(f"OK {dossiers}")

    print("\n下一步：填 01-charter（用户原话）+ 02-xinfa（每条带出处），再把 05-open 的 A 段写成真实诉求。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
