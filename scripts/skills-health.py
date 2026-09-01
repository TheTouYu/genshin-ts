#!/usr/bin/env python3
"""技能路由完整性体检（2026-09-01 事故催生）。

背景：commit 57d2795 以"全局 ~/.agents/skills 已有同内容副本"为由删除项目技能副本，
但那个"全局副本"是指向项目目录的软链接——删除后 dsh-session-history / dsh-plugin-search
两个技能静默死亡 9 天，AGENTS.md 路由表每天注入死引用，直到用户 09-01 会话中爆发才定位。

本脚本回答三个问题：
  1. AGENTS.md / CLAUDE.md 里反引号引用的技能，是否都能解析到真实 SKILL.md？
  2. 全局 ~/.agents/skills/ 下的软链接是否有悬空？
  3. 项目与全局是否存在同名重复实体（结构漂移预警）？

用法：
  python3 scripts/skills-health.py            # 体检，死引用/悬空链接时 exit 1
  python3 scripts/skills-health.py --all      # 额外列出所有健康技能

约定：删除技能、修改 ~/.agents/skills 链接结构前必须先跑本脚本，且属破坏性操作需用户确认。
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PROJECT_SKILLS = PROJECT / ".agents" / "skills"
GLOBAL_SKILLS = Path.home() / ".agents" / "skills"
DOCS = [PROJECT / "AGENTS.md", PROJECT / "CLAUDE.md"]

# 反引号里形如 kebab-case 的词（≥1 个连字符、全小写字母数字）。
KEBAB = re.compile(r"`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`")

# 已知非技能引用（示例项目名 / npm 包名 / PKC 子命令等），避免误报。
IGNORE = {
    "rubik-2x2", "rubik-3x3", "rubik-3x3-client", "lights-out", "football",
    "cube-replica-c4", "create-genshin-ts", "node-modules", "signal-demo",
    "progressive-query", "knowledge-search",
}


def has_skillmd(name: str) -> tuple[bool, str]:
    """返回 (是否可解析到 SKILL.md, 说明)。跟随软链接，但区分悬空。"""
    for label, base in (("项目", PROJECT_SKILLS), ("全局", GLOBAL_SKILLS)):
        p = base / name
        if p.is_symlink() and not p.exists():
            return False, f"{label}软链接悬空 -> {os.readlink(p)}"
        if (p / "SKILL.md").is_file():
            return True, f"{label}"
    return False, "项目/全局均无 SKILL.md"


def collect_refs() -> dict[str, list[str]]:
    refs: dict[str, list[str]] = {}
    for doc in DOCS:
        if not doc.is_file():
            continue
        for name in KEBAB.findall(doc.read_text(encoding="utf-8")):
            if name not in IGNORE:
                refs.setdefault(name, []).append(doc.name)
    return refs


def main() -> int:
    show_all = "--all" in sys.argv
    refs = collect_refs()
    dead: list[tuple[str, str]] = []
    dupes: list[str] = []
    ok: list[str] = []

    for name in sorted(refs):
        fine, where = has_skillmd(name)
        if fine:
            ok.append(name)
            if where == "全局" and (PROJECT_SKILLS / name).exists():
                dupes.append(name)
        else:
            dead.append((name, where))

    dangling: list[tuple[str, str]] = []
    if GLOBAL_SKILLS.is_dir():
        for entry in sorted(GLOBAL_SKILLS.iterdir()):
            if entry.is_symlink() and not entry.exists():
                dangling.append((entry.name, os.readlink(entry)))

    print(f"技能引用体检：AGENTS.md/CLAUDE.md 共 {len(refs)} 个 kebab 引用")
    if show_all:
        for name in ok:
            print(f"  OK   {name}")
    for name, why in dead:
        print(f"  DEAD {name} — {why}")
    for name in dupes:
        print(f"  NOTE {name} — 项目/全局双实体，注意同步")
    for name, target in dangling:
        print(f"  DANGLING 全局软链接 {name} -> {target} 目标不存在")

    if dead or dangling:
        print(f"\n结果：FAIL（{len(dead)} 死引用，{len(dangling)} 悬空链接）")
        print("处理：先确认引用是否仍在用（在用→恢复实体），删除/改链接属破坏性操作须用户确认。")
        return 1
    print(f"\n结果：PASS（{len(ok)} 技能引用全部可解析，0 悬空链接）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
