#!/usr/bin/env python3
"""doc_health.py — 文档治理强制门禁（不靠自觉）

模式：
    python3 scripts/doc_health.py                # 全量体检（返回非 0 = 有问题）
    python3 scripts/doc_health.py --staged       # 只检查 git 暂存区文件（pre-commit 用）

自动扫描范围：
- examples/football/ 顶层 .md（AGENTS/ARCHITECTURE*/DESIGN/R2/REBUILD/REFACTOR/PROGRESS）
- .scratch/football-v2/BOARD.md
- .scratch/football-v2/issues/ 下当前治理票 20*.md；staged 模式覆盖任意新增/修改 issue
- examples/football/src-fb/*.ts（要求 @status 或 @derived-from）
- docs/maintenance/document-governance.md

强制检查：
1. 治理文档状态头（doc-type/status/updated；docs/ 下用中文标签）
2. 源码 @status / @derived-from
3. 陈旧表述残留
4. 大小阈值：AGENTS.md <=16KB、CLAUDE.md <=12KB、PROGRESS.md <=20KB
5. BOARD.md 顶部 HEAD 必须等于当前 git HEAD（防看板滞后）
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# ———— 自动扫描范围 ————

FOOTBALL_MD = "examples/football"
BOARD = ".scratch/football-v2/BOARD.md"
ISSUES = ".scratch/football-v2/issues"
SRC_FB = "examples/football/src-fb"
GOV_DOC = "docs/maintenance/document-governance.md"

# 纳入治理门禁的权威知识文档目录（rglob *.md，仅查状态头字段）
KNOWLEDGE_DOC_DIRS = ("docs/knowledge-graph",)

# 当前已治理的 issue 前缀；全量模式只查这些，避免历史债一次阻断。
GOVERNED_ISSUE_PREFIX = "20"


def in_scope_md(rel: str) -> bool:
    if rel == GOV_DOC:
        return True
    if rel == BOARD:
        return True
    if rel.startswith(ISSUES + "/") and rel.endswith(".md"):
        return True
    if rel.startswith(FOOTBALL_MD + "/") and rel.endswith(".md"):
        return True
    return False


def is_governed_doc(rel: str) -> bool:
    """全量模式要求状态头的文档（已治理集合）。"""
    if rel == GOV_DOC:
        return True
    if rel == BOARD:
        return True
    if rel.startswith(FOOTBALL_MD + "/") and rel.endswith(".md"):
        # football 顶层 md（src-fb 子目录不算）
        return rel.count("/") == 2
    if rel.startswith(ISSUES + "/") and rel.endswith(".md"):
        name = Path(rel).name
        return name.startswith(GOVERNED_ISSUE_PREFIX)
    return False


def in_scope_src(rel: str) -> bool:
    return rel.startswith(SRC_FB + "/") and rel.endswith(".ts")


# ———— 陈旧表述 ————

STALE_MARKERS = [
    ("占位：注入按 config.nodeGraphId 改写", "仍写“占位”但图可能已是真实 ID"),
    ("dribble-v5.ts:107", "失效行号引用"),
    ("1207959558~568", "旧自持组 ID 假设段（实际 569~579）"),
    ("与 fb-phys.ts（1082130433 现网）的唯一差异", "fb-phys2 旧“唯一差异”头部特征"),
    ("40..43 空闲", "fb-shared 旧 ID 占用说明（40..43 已被本文件占用）"),
]

# 大小阈值（字节）
SIZE_LIMITS = {
    "AGENTS.md": 16 * 1024,
    "CLAUDE.md": 12 * 1024,
    "examples/football/PROGRESS.md": 20 * 1024,
}


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO_ROOT, text=True).strip()


def staged_files() -> set[str]:
    out = git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
    return {p for p in out.splitlines() if p}


def check_doc_header(path: Path, rel: str) -> list[str]:
    """检查文档状态头。"""
    problems: list[str] = []
    try:
        head = "\n".join(path.read_text(encoding="utf-8").splitlines()[:15])
    except Exception as exc:  # noqa: BLE001
        return [f"无法读取: {exc}"]

    # docs/ 目录遵循 docs/AGENTS.md 中文标签；其余治理文档用英文 doc-type 协议。
    if rel.startswith("docs/"):
        keys = ("状态：", "最近校验：")
    else:
        keys = ("doc-type:", "status:", "updated:")
    for key in keys:
        if key not in head:
            problems.append(f"缺少状态头字段 {key!r}（前 15 行内）")
    return problems


def check_src_status(path: Path) -> list[str]:
    """检查源码 @status / @derived-from。"""
    try:
        head5 = "\n".join(path.read_text(encoding="utf-8").splitlines()[:5])
    except Exception as exc:  # noqa: BLE001
        return [f"无法读取: {exc}"]
    if "@status:" not in head5 and "@derived-from:" not in head5:
        return ["缺少 @status/@derived-from 状态标记（前 5 行内）"]
    return []


def check_stale(path: Path) -> list[str]:
    problems: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        return [f"无法读取: {exc}"]
    for marker, why in STALE_MARKERS:
        if marker in text:
            problems.append(f"残留陈旧表述 {marker!r}: {why}")
    return problems


def check_size(path: Path, rel: str) -> list[str]:
    limit = SIZE_LIMITS.get(rel)
    if limit is None:
        return []
    size = path.stat().st_size
    if size > limit:
        return [f"文件过大 {size}B > 阈值 {limit}B（需要归档/瘦身）"]
    return []


def check_board_head(path: Path) -> list[str]:
    """BOARD 顶部 HEAD 必须等于当前 git HEAD。"""
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        return [f"无法读取: {exc}"]
    m = re.search(r">\s*HEAD[：:]\s*`([0-9a-f]{7,40})", text)
    if not m:
        return ["BOARD 顶部缺少 `> HEAD：<hash>` 行，无法做滞后检查"]
    board_head = m.group(1)
    current_head = git("rev-parse", "--short", "HEAD")
    if not board_head.startswith(current_head) and not current_head.startswith(board_head):
        return [f"BOARD HEAD 滞后：board={board_head} 但当前 git HEAD={current_head}；请更新 BOARD 顶部"]
    return []


def check_one(rel: str, staged: bool) -> list[str]:
    path = (REPO_ROOT / rel).resolve()
    if not path.exists():
        return [f"文件不存在: {rel}"]
    problems: list[str] = []

    if in_scope_src(rel):
        problems += check_src_status(path)
    elif in_scope_md(rel) and (is_governed_doc(rel) or staged):
        # staged 模式下新增/修改的 issue 等任何 in-scope md 都必须带状态头
        problems += check_doc_header(path, rel)

    # 陈旧/大小检查适用于范围内文档与根注入文件
    if rel == "AGENTS.md" or rel == "CLAUDE.md" or in_scope_md(rel) or in_scope_src(rel):
        problems += check_stale(path)
        problems += check_size(path, rel)

    if rel == BOARD:
        problems += check_board_head(path)

    return problems


def discover_full() -> list[str]:
    rels: set[str] = set()

    # football 顶层 md
    fb_dir = REPO_ROOT / FOOTBALL_MD
    if fb_dir.exists():
        for p in fb_dir.glob("*.md"):
            rels.add(p.relative_to(REPO_ROOT).as_posix())

    # BOARD + 治理 issue 前缀
    for rel in (BOARD,):
        if (REPO_ROOT / rel).exists():
            rels.add(rel)
    issues_dir = REPO_ROOT / ISSUES
    if issues_dir.exists():
        for p in issues_dir.glob("*.md"):
            rel = p.relative_to(REPO_ROOT).as_posix()
            if Path(rel).name.startswith(GOVERNED_ISSUE_PREFIX):
                rels.add(rel)

    # src-fb 全部 ts
    src_dir = REPO_ROOT / SRC_FB
    if src_dir.exists():
        for p in src_dir.glob("*.ts"):
            rels.add(p.relative_to(REPO_ROOT).as_posix())

    # 治理方案文档
    if (REPO_ROOT / GOV_DOC).exists():
        rels.add(GOV_DOC)

    # 权威知识文档目录（2026-09-15 补）：
    # 原扫描范围写死为 football 相关，导致新建的 docs/knowledge-graph/ 完全在门禁之外——
    # 我建该目录时漏了「最近校验：」状态头字段（docs/ 规则要求前 15 行含「状态：」+「最近校验：」），
    # 而门禁不报，直到主动按 doc_health 的真实规则手写脚本复验才发现。补入以防复发。
    for extra in KNOWLEDGE_DOC_DIRS:
        d = REPO_ROOT / extra
        if d.exists():
            for p2 in d.rglob("*.md"):
                rels.add(p2.relative_to(REPO_ROOT).as_posix())

    return sorted(rels)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="只检查 git 暂存区文件（pre-commit）")
    args = parser.parse_args()

    if args.staged:
        files = sorted(staged_files())
        # 只保留本脚本范围内文件
        files = [f for f in files if in_scope_md(f) or in_scope_src(f) or f in ("AGENTS.md", "CLAUDE.md")]
        if not files:
            print("doc_health: no in-scope staged files; PASS")
            return 0
    else:
        files = discover_full()

    total = 0
    for rel in files:
        problems = check_one(rel, staged=args.staged)
        if problems:
            total += len(problems)
            print(f"FAIL  {rel}")
            for p in problems:
                print(f"      - {p}")
        else:
            print(f"PASS  {rel}")

    print(f"\n{total} problem(s) found.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
