#!/usr/bin/env python3
"""doc_health.py — 文档治理健康检查（P2 基础版）

检查目标：
1. 活跃/历史文档是否带状态头（doc-type/status/updated）。
2. 是否残留已知过时/占位表述（占位、候选、旧 ID 假设、复制头特征）。

用法：
    python3 scripts/doc_health.py               # 扫描内置默认清单
    python3 scripts/doc_health.py <file>...     # 追加指定文件

说明：
- 本脚本是文档治理的可重复检查器，不修改任何文件。
- 内置默认清单是足球项目文档治理范围；新文档可自行加入。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_FILES = [
    # 注入规则
    "examples/football/AGENTS.md",
    # 历史/设计文档
    "examples/football/ARCHITECTURE.md",
    "examples/football/ARCHITECTURE-V5.md",
    "examples/football/DESIGN.md",
    "examples/football/R2-DESIGN.md",
    "examples/football/REBUILD-V2-PLAN.md",
    "examples/football/REFACTOR-PLAN.md",
    "examples/football/PROGRESS.md",
    # 推进/票文档
    ".scratch/football-v2/BOARD.md",
    ".scratch/football-v2/issues/20-blackboard-capacity.md",
    ".scratch/football-v2/issues/20-experiment-design.md",
    ".scratch/football-v2/issues/20-multi-creature-orchestration.md",
    # 治理方案
    "docs/maintenance/document-governance.md",
]

# 源码注释文件：要求前几行含 @status 或 @derived-from（当前在飞/共享核心文件）
SOURCE_STATUS_FILES = [
    "examples/football/src-fb/fb-phys.ts",
    "examples/football/src-fb/fb-phys2.ts",
    "examples/football/src-fb/fb20c-loop.ts",
    "examples/football/src-fb/channels.ts",
    "examples/football/src-fb/fb-sink.ts",
    "examples/football/src-fb/fb-render.ts",
    "examples/football/src-fb/fb-idle-listen.ts",
    "examples/football/src-fb/fb20c-server.ts",
    "examples/football/src-fb/fb20d-calib.ts",
    "examples/football/src-fb/fb20d-ui.ts",
    "examples/football/src-fb/signals.ts",
]

# 这些文件要求有状态头；源码注释文件单独用 @status 约定，暂不强制 doc-type。
HEADER_REQUIRED = {
    "examples/football/AGENTS.md",
    "examples/football/ARCHITECTURE.md",
    "examples/football/ARCHITECTURE-V5.md",
    "examples/football/DESIGN.md",
    "examples/football/R2-DESIGN.md",
    "examples/football/REBUILD-V2-PLAN.md",
    "examples/football/REFACTOR-PLAN.md",
    "examples/football/PROGRESS.md",
    ".scratch/football-v2/BOARD.md",
    ".scratch/football-v2/issues/20-blackboard-capacity.md",
    ".scratch/football-v2/issues/20-experiment-design.md",
    ".scratch/football-v2/issues/20-multi-creature-orchestration.md",
    "docs/maintenance/document-governance.md",
}

# 陈旧/过时表述特征 -> 说明
STALE_MARKERS = [
    ("占位：注入按 config.nodeGraphId 改写", "仍写“占位”但图可能已是真实 ID"),
    ("dribble-v5.ts:107", "失效行号引用"),
    ("1207959558~568", "旧自持组 ID 假设段（实际 569~579）"),
    ("与 fb-phys.ts（1082130433 现网）的唯一差异", "fb-phys2 旧“唯一差异”头部特征"),
    ("40..43 空闲", "fb-shared 旧 ID 占用说明（40..43 已被本文件占用）"),
]


def check_header(path: Path) -> list[str]:
    """检查文件前 15 行是否包含状态头。返回问题列表。"""
    problems: list[str] = []
    try:
        head = "\n".join(path.read_text(encoding="utf-8").splitlines()[:15])
    except Exception as exc:  # noqa: BLE001
        return [f"无法读取: {exc}"]

    rel = path.relative_to(REPO_ROOT).as_posix()
    if rel in HEADER_REQUIRED:
        # docs/ 目录遵循 docs/AGENTS.md 的中文状态标签；其余文件遵循英文 doc-type 协议。
        keys = ("状态：", "最近校验：") if rel.startswith("docs/") else ("doc-type:", "status:", "updated:")
        for key in keys:
            if key not in head:
                problems.append(f"缺少状态头字段 {key!r}（前 15 行内）")
    if rel in SOURCE_STATUS_FILES:
        head5 = "\n".join(path.read_text(encoding="utf-8").splitlines()[:5])
        if "@status:" not in head5 and "@derived-from:" not in head5:
            problems.append("缺少 @status/@derived-from 状态标记（前 5 行内）")
    return problems


def check_stale(path: Path) -> list[str]:
    """检查整份文件是否残留陈旧表述。"""
    problems: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        return [f"无法读取: {exc}"]

    for marker, why in STALE_MARKERS:
        if marker in text:
            problems.append(f"残留陈旧表述 {marker!r}: {why}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", help="额外检查的文件（相对仓库根）")
    args = parser.parse_args()

    files = list(DEFAULT_FILES) + list(SOURCE_STATUS_FILES)
    files.extend(args.files)

    total_problems = 0
    for rel in files:
        path = (REPO_ROOT / rel).resolve()
        if not path.exists():
            print(f"SKIP  {rel}: 文件不存在")
            continue

        problems = check_header(path) + check_stale(path)
        if problems:
            total_problems += len(problems)
            print(f"FAIL  {rel}")
            for p in problems:
                print(f"      - {p}")
        else:
            print(f"PASS  {rel}")

    print(f"\n{total_problems} problem(s) found.")
    return 1 if total_problems else 0


if __name__ == "__main__":
    sys.exit(main())
