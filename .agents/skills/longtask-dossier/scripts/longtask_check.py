#!/usr/bin/env python3
"""长期任务档案体检器（longtask-dossier）。

用法：
    python3 longtask_check.py [--dir docs/longtask] [--max-age-days 14] [--quiet]

检查项（任一 FAIL → 退出码 1）：
  1. 必备文件齐全（INDEX / 01-charter / 02-xinfa / 03-state / 04-timeline / 05-open）
  2. 每份 .md 前 15 行含 `状态：` 与 `最近校验：`（docs/ 目录的 doc_health 协议）
  3. 行数预算（INDEX 120 / charter 200 / xinfa 300 / state 200 / timeline 400 / open 200 / dossier 200）
  4. INDEX.md 用链接指向每一份必备文件，且不把 archive/ 当当前入口
  5. 最近校验日期可解析，且不早于 --max-age-days 天（过期只 WARN，不拦构建）

设计取舍：只做机器能判的事（存在性/字段/预算/指针），文档内容质量留给人类与接手模型判断。
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

REQUIRED = [
    "INDEX.md",
    "01-charter.md",
    "02-xinfa.md",
    "03-state.md",
    "04-timeline.md",
    "05-open.md",
]
BUDGETS = {
    "INDEX.md": 120,
    "01-charter.md": 200,
    "02-xinfa.md": 300,
    "03-state.md": 200,
    "04-timeline.md": 400,
    "05-open.md": 200,
}
DOSSIER_BUDGET = 200
HEADER_KEYS = ("状态：", "最近校验：")
DATE_RE = re.compile(r"最近校验[：:]\s*(\d{4}-\d{2}-\d{2})")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def check(root: Path, max_age_days: int) -> tuple[list[str], list[str]]:
    fails: list[str] = []
    warns: list[str] = []

    if not root.is_dir():
        return [f"目录不存在：{root}"], []

    for name in REQUIRED:
        p = root / name
        if not p.is_file():
            fails.append(f"缺少必备文件：{name}")
            continue
        text = read_text(p)
        lines = text.splitlines()
        head = "\n".join(lines[:15])
        for key in HEADER_KEYS:
            if key not in head:
                fails.append(f"{name}: 前 15 行缺状态头字段 {key!r}")
        budget = BUDGETS.get(name)
        if budget and len(lines) > budget:
            fails.append(f"{name}: {len(lines)} 行 > 预算 {budget}（该拆层或归档）")
        m = DATE_RE.search(head) or DATE_RE.search(text)
        if not m:
            fails.append(f"{name}: 未找到可解析的 `最近校验：YYYY-MM-DD`")
        else:
            try:
                d = dt.date.fromisoformat(m.group(1))
                age = (dt.date.today() - d).days
                if age > max_age_days:
                    warns.append(f"{name}: 最近校验 {d} 已 {age} 天（> {max_age_days}）")
            except ValueError:
                fails.append(f"{name}: 最近校验日期不可解析：{m.group(1)}")

    dossiers = root / "dossiers"
    if dossiers.is_dir():
        for p in sorted(dossiers.glob("*.md")):
            lines = read_text(p).splitlines()
            head = "\n".join(lines[:15])
            for key in HEADER_KEYS:
                if key not in head:
                    fails.append(f"dossiers/{p.name}: 前 15 行缺 {key!r}")
            if len(lines) > DOSSIER_BUDGET:
                fails.append(
                    f"dossiers/{p.name}: {len(lines)} 行 > 预算 {DOSSIER_BUDGET}"
                )

    index = root / "INDEX.md"
    if index.is_file():
        text = read_text(index)
        for name in REQUIRED[1:]:
            if name not in text:
                fails.append(f"INDEX.md: 没有指向 {name} 的链接")
        for m in re.finditer(r"\]\(([^)]+)\)", text):
            target = m.group(1)
            if "archive/" in target:
                fails.append(f"INDEX.md: 当前入口指向归档件 {target}（归档=历史）")

    return fails, warns


def main() -> int:
    ap = argparse.ArgumentParser(description="长期任务档案体检")
    ap.add_argument("--dir", default="docs/longtask", help="档案根目录")
    ap.add_argument("--max-age-days", type=int, default=14, help="最近校验的容忍天数")
    ap.add_argument("--quiet", action="store_true", help="只输出结论")
    args = ap.parse_args()

    root = Path(args.dir).resolve()
    fails, warns = check(root, args.max_age_days)

    if not args.quiet:
        print(f"体检目录：{root}")
        for w in warns:
            print(f"  WARN {w}")
        for f in fails:
            print(f"  FAIL {f}")

    if fails:
        print(f"RESULT: FAIL（{len(fails)} 项）")
        return 1
    print(f"RESULT: PASS（{root.name}，{len(warns)} 条警告）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
