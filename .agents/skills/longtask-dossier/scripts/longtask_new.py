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

## 二、现在在哪（每次收尾更新这一节；**分线细节去 `LINES.md`**）

| 项 | 读数 |
|---|---|
| 并行线（≥2 条时看线表） | [`LINES.md`](LINES.md) §二 是唯一权威 |
| 本会话在哪条线 | 待填写（由用户指定） |
| 共享读数 | [`03-state.md`](03-state.md)（只放共享面 + 标了线 id 的分节） |
| 阻塞 | 待填写 |

## 三、按你要做的事选读

| 你要做的事 | 读这份 | 预算 |
|---|---|---|
| **先确认自己在哪条线** | [`LINES.md`](LINES.md) | ≤150 行 |
| 第一次接手 | [`01-charter.md`](01-charter.md) | ≤150 行 |
| 开一轮活 | [`02-xinfa.md`](02-xinfa.md) | ≤250 行 |
| 接手现场（共享读数） | [`03-state.md`](03-state.md) | ≤150 行 |
| 搞清为什么 | [`04-timeline.md`](04-timeline.md) | 按需 |
| 看还剩什么 | [`05-open.md`](05-open.md) | ≤150 行 |
| 做某条线 | `dossiers/<line>.md` | ≤200 行 |

## 四、四条硬规矩

1. 落盘先于压缩（写出变化，再压上下文）。
2. 交接落仓库，不落 `/tmp`。
3. 结论带出处（日期 + 用户原话或命令读数）。
4. **多线并行：线由用户指定，收尾只改本线**（`LINES.md` §一/§四）。
"""


def lines_md(title: str, goal: str, line_id: str) -> str:
    """L0.5 并行线看板（2026-10-24 多线模型）：一次可能有 ≥2 条线在跑。"""
    return f"""# 并行线看板（L0.5 · 多线入口）

> 状态：待填写（INDEX 给全局目标，本文件回答"我是哪条线、做到哪了"）
> 来源：待填写（用户指定线的原话）
> 最近校验：{TODAY}
> 读法：§一 认领本线 → 读 §二 那一行的「恢复入口」→ 只读那条线的档案

---

## 一、进门协议（三条）

1. **线由用户指定，不由时间戳猜**：用户首句点明线 → 只读那条线；没点明就问一句，不按 mtime / 最新提交自动挑。
2. **一轮一条线**：本会话只推进 §二 里状态为「活跃」的那一条；要临时碰第二条，先登记并确认 §三 独占资源不冲突。
3. **收尾只改本线**：只改 §二 自己那一行 + 本线 dossier + `03-state.md` 标了本线 id 的分节。

## 二、线表（唯一权威）

| 线 id | 名称 | 目标（一句） | 判据（怎么算完成） | 状态 | 当前断点（一句话能接手） | 恢复入口 | 上次读数 |
|---|---|---|---|---|---|---|---|
| `{line_id}` | {title} | {goal} | 待填写 | **活跃** | 待填写 | [dossiers/{line_id}.md](dossiers/{line_id}.md) | {TODAY} |

**状态词表**：活跃（同时最多一条）/ 等用户 / 暂停 / 待裁决 / 已闭环 / 已废弃。

## 三、共享资源与仲裁

| 资源 | 独占性 | 获取 | 释放判据 |
|---|---|---|---|
| 待填写（屏幕/真机/存档/服务端口/显存/git 工作树） | 独占 / 共享 | 待填写 | 待填写 |

## 四、收尾怎么更新（多线版三件套）

1. §二 自己那一行（状态 / 断点 / 上次读数）。
2. 本线 dossier 的 §现状读数 + §断点。
3. `03-state.md` 里标了本线 id 的分节（只改自己那条线）。
+ `04-timeline.md` 只在跨线决策时 append；`05-open.md` 每条标线 id。

## 五、开线 / 关线

开线三问：有自己的判据吗？断点能被别人接手吗？会不会抢 §三 的独占资源？三问全过 → §二 加一行 + 建 dossier + 跑体检。
关线：状态改 `已闭环`，证据写进 dossier，**不删行**。

## 六、指针

- 全局：[`INDEX.md`](INDEX.md)｜共享读数：[`03-state.md`](03-state.md)｜缺口：[`05-open.md`](05-open.md)
- 体检：`python3 .agents/skills/longtask-dossier/scripts/longtask_check.py --dir <dir>`（含 `--selftest`）
"""


def dossier_md(title: str, line_id: str) -> str:
    return f"""# 档案：{title}（线 `{line_id}` · L3）

> 状态：待填写（并行线之一；线表见 [`../LINES.md`](../LINES.md)）
> 来源：待填写（会话 id + 时间 + 用户原话）
> 最近校验：{TODAY}
> 读法：动手前读 §一（判据）、§三（现状读数）、§五（断点）

---

## 一、这条线要交付什么

| 层 | 判据 | 当前 |
|---|---|---|
| 结构层 | 待填写 | ⬜ |
| 行为层 | 待填写 | ⬜ |
| 用户层 | 待填写 | ⬜ |

## 二、在哪（仓/图/环境）

- 待填写

## 三、现状读数（带测量时间）

| 项 | 读数 | 时间/证据 |
|---|---|---|
| 待填写 | 待填写 | {TODAY} |

## 四、已闭环的块（别再重做）

- 待填写

## 五、断点（按建议顺序）

1. 待填写

## 六、已否决 / 别再走

| 路线 | 为什么否决 |
|---|---|
| — | — |

## 七、指针

- 待填写
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


def state_md(line_id: str) -> str:
    return f"""# 共享现状：机器、常驻服务、门禁（L1 · 每轮收尾必改）

{HEADER.format(today=TODAY)}
> 读法：先看 §一 找"我这条线的读数在哪" → 只改本线分节（多线并行，别覆盖别人的读数）。

---

## 一、分线读数的归属

| 线 id | 断点与现状读数在哪 | 本文件里属于它的分节 |
|---|---|---|
| `{line_id}` | [`dossiers/{line_id}.md`](dossiers/{line_id}.md) §三/§五 | §三 标 `[{line_id}]` 的行 |

## 二、门禁与回归（按线分组）

| 线 | 套件 | 读数 | 时间 |
|---|---|---|---|
| `[{line_id}]` | 待填写 | 待填写 | {TODAY} |

## 三、机器与常驻服务（只读实测）

```
待填写（ps/窗口/授权状态的只读实测）
```

## 四、最近提交（滚动保留；跨线都记，标线 id）

| commit | 线 | 内容 |
|---|---|---|
| 待填写 | `[{line_id}]` | 待填写 |
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


def open_md(line_id: str) -> str:
    return f"""# 缺口清单：未满足 / 待拍板 / 已否决（L2）

{HEADER.format(today=TODAY)}
> 编号 `O-YYYY-MM-DD-n`；关闭时保留编号与证据。
> **线 id**：开放条目（A/B/C 段）每行第 2 列必须写 `[{line_id}]` 形式，否则没人知道该谁关。

---

## A. 用户诉求未满足（最优先）

| 编号 | 线 | 诉求（用户原话） | 状态 | 说明 |
|---|---|---|---|---|
| O-{TODAY}-1 | `[{line_id}]` | 「」 | ⬜ | 待填写 |

## B. 已知缺陷 / 技术债

| 编号 | 线 | 问题 | 影响 | 下一步 |
|---|---|---|---|---|
| — | — | — | — | — |

## C. 待用户拍板

| 编号 | 线 | 问题 | 备选 |
|---|---|---|---|
| — | — | — | — |

## D. 已否决 / 已证伪（别再走）

| 线 | 路线 | 为什么否决 | 出处 |
|---|---|---|---|
| — | — | — | — |
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
    ap.add_argument("--line", default="main", help="首条线的 id（kebab-case，生成 dossiers/<line>.md）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    root = Path(args.dir)
    files = {
        "INDEX.md": index_md(args.title, args.goal),
        "LINES.md": lines_md(args.title, args.goal, args.line),
        f"dossiers/{args.line}.md": dossier_md(args.title, args.line),
        "01-charter.md": charter_md(args.title),
        "02-xinfa.md": xinfa_md(),
        "03-state.md": state_md(args.line),
        "04-timeline.md": timeline_md(),
        "05-open.md": open_md(args.line),
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

    print("\n下一步：填 01-charter（用户原话）+ 02-xinfa（每条带出处）+ LINES.md §二（断点与判据），"
          "再把 05-open 的 A 段写成真实诉求；最后跑体检（含 --selftest）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
