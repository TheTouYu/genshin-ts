#!/usr/bin/env python3
"""跨任务登记表检查（longtask-dossier 多任务扩展，2026-10-28）。

一个长期任务一个档案目录（`docs/longtask-<task-id>/`），本脚本校验
`docs/LONG_TASKS.md` 这张"任务总表"是否与磁盘一致。

用法：
    python3 longtask_tasks.py --registry docs/LONG_TASKS.md --check
    python3 longtask_tasks.py --registry docs/LONG_TASKS.md --list
    python3 longtask_tasks.py --selftest            # 判定器自证：注入 4 类破坏必须被抓到

判定（任一 FAIL → 退出码 1）：
  1. 任务 id 写成 `kebab-case`（反引号包住）
  2. 档案目录存在，且含 INDEX.md + LINES.md
  3. INDEX.md / LINES.md 前 15 行有 `状态：` 与 `最近校验：`
  4. 恢复入口是可达的相对链接
  5. 状态在词表内；任务 id 不重复
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import sys
import tempfile
from pathlib import Path

TASK_ID_RE = re.compile(r"^`[a-z0-9][a-z0-9-]*`$")
LINK_RE = re.compile(r"\]\(([^)]+)\)")
STATES = {"活跃", "等用户", "暂停", "待裁决", "已闭环", "已废弃"}
HEADER_KEYS = ("状态：", "最近校验：")
REQUIRED_TABLE_COLS = 7


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def strip_emphasis(s: str) -> str:
    return s.replace("**", "").replace("`", "").strip()


def table_rows(text: str) -> list[tuple[int, list[str]]]:
    """返回 markdown 表格数据行（跳过表头与分隔行）。"""
    rows: list[tuple[int, list[str]]] = []
    for no, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue
        rows.append((no, cells))
    return rows


def find_task_rows(text: str) -> list[tuple[int, list[str]]]:
    return [
        (no, cells)
        for no, cells in table_rows(text)
        if cells and cells[0].startswith("`")
    ]


def check(registry: Path) -> list[str]:
    fails: list[str] = []
    if not registry.is_file():
        return [f"登记表不存在：{registry}"]
    text = read_text(registry)
    head = "\n".join(text.splitlines()[:15])
    for key in HEADER_KEYS:
        if key not in head:
            fails.append(f"{registry.name}: 前 15 行缺 {key!r}")
    m = re.search(r"最近校验：(\d{4}-\d{2}-\d{2})", head)
    if not m:
        fails.append(f"{registry.name}: 缺可解析的 `最近校验：YYYY-MM-DD`")
    else:
        try:
            age = (dt.date.today() - dt.date.fromisoformat(m.group(1))).days
            if age > 90:
                fails.append(f"{registry.name}: 最近校验已 {age} 天（>90），请复核")
        except ValueError:
            fails.append(f"{registry.name}: 最近校验日期不可解析")

    base = registry.parent
    rows = find_task_rows(text)
    if not rows:
        fails.append(f"{registry.name}: 找不到任务数据行（首列写成 `task-id`）")
    seen: dict[str, int] = {}
    for no, cells in rows:
        if len(cells) < REQUIRED_TABLE_COLS:
            fails.append(f"{registry.name}:{no}: 只有 {len(cells)} 列，需 {REQUIRED_TABLE_COLS} 列")
            continue
        tid = cells[0]
        if not TASK_ID_RE.match(tid):
            fails.append(f"{registry.name}:{no}: 任务 id {tid!r} 不合规（`kebab-case`）")
            continue
        if tid in seen:
            fails.append(f"{registry.name}:{no}: 任务 id {tid} 重复（首次第 {seen[tid]} 行）")
        seen.setdefault(tid, no)
        state = strip_emphasis(cells[3])
        if state not in STATES:
            fails.append(f"{registry.name}:{no}: 状态 {state!r} 不在词表 {sorted(STATES)}")
        dir_cell = strip_emphasis(cells[2]).strip("/")
        # 允许两种写法：相对登记表所在目录（t1/）或相对仓库根（docs/longtask/）
        cands = [base / dir_cell, base.parent / dir_cell]
        dir_path = next((c for c in cands if c.is_dir()), None)
        if dir_path is None:
            fails.append(f"{registry.name}:{no}: 档案目录不存在 → {cells[2]}")
        tasks = LINK_RE.findall(cells[5])
        if not tasks:
            fails.append(f"{registry.name}:{no}: 恢复入口没有相对链接")
        for t in tasks:
            target = (base / t).resolve()
            if not target.exists():
                fails.append(f"{registry.name}:{no}: 恢复入口不可达 → {t}")
                continue
            # 档案目录 = INDEX 所在目录
            task_dir = target.parent if target.name == "INDEX.md" else target
            for name in ("INDEX.md", "LINES.md"):
                f = task_dir / name
                if not f.is_file():
                    fails.append(f"{registry.name}:{no}: {task_dir.name}/ 缺 {name}")
                    continue
                h = "\n".join(read_text(f).splitlines()[:15])
                miss = [k for k in HEADER_KEYS if k not in h]
                if miss:
                    fails.append(f"{registry.name}:{no}: {task_dir.name}/{name} 缺状态头 {miss}")
    return fails


def cmd_list(registry: Path) -> int:
    for no, cells in find_task_rows(read_text(registry)):
        if len(cells) >= REQUIRED_TABLE_COLS:
            print(f"{strip_emphasis(cells[0]):<14} {strip_emphasis(cells[3]):<6} {cells[5]}")
    return 0


SELFTEST_CASES = [
    ("缺目录", lambda root: _rewrite_t1(root, 3, "`nope/`")),
    ("缺状态头", lambda root: (root / "t1" / "LINES.md").write_text("没有状态头\n", encoding="utf-8")),
    ("坏状态", lambda root: _rewrite_t1(root, 4, "跑着")),
    ("断链", lambda root: _rewrite_t1(root, 6, "[t1/INDEX.md](../../nope/INDEX.md)")),
]


def _rewrite_t1(root: Path, col: int, value: str) -> None:
    """改写 §二 表里 `t1` 那一行的第 col 列（1-based）。"""
    reg = root / "REG.md"
    out = []
    for line in reg.read_text(encoding="utf-8").splitlines():
        if line.startswith("| `t1`"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            cells[col - 1] = value
            line = "| " + " | ".join(cells) + " |"
        out.append(line)
    reg.write_text("\n".join(out) + "\n", encoding="utf-8")


def selftest() -> int:
    bad = 0
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ("t1", "t2"):
            d = root / tid
            d.mkdir()
            (d / "INDEX.md").write_text("> 状态：x\n> 最近校验：2026-10-28\n", encoding="utf-8")
            (d / "LINES.md").write_text("> 状态：x\n> 最近校验：2026-10-28\n", encoding="utf-8")
        base_rows = (
            "| 任务 id | 名称 | 档案目录 | 状态 | 断点 | 恢复入口 | 上次读数 |\n"
            "|---|---|---|---|---|---|---|\n"
            "| `t1` | 任务一 | `t1/` | 活跃 | a | [t1/INDEX.md](t1/INDEX.md) | 2026-10-28 |\n"
            "| `t2` | 任务二 | `t2/` | 暂停 | b | [t2/INDEX.md](t2/INDEX.md) | 2026-10-28 |\n"
        )

        def fresh() -> Path:
            reg = root / "REG.md"
            reg.write_text("> 状态：当前实现\n> 来源：selftest\n> 最近校验：2026-10-28\n\n"
                           + base_rows, encoding="utf-8")
            return reg

        baseline_fails = check(fresh())
        if baseline_fails:
            print(f"FAIL baseline（基线应 PASS，实得 {baseline_fails}）")
            return 1
        for name, mutate in SELFTEST_CASES:
            d = root / "case"
            if d.exists():
                shutil.rmtree(d)
            d.mkdir()
            for tid in ("t1", "t2"):
                src = root / tid
                dst = d / tid
                shutil.copytree(src, dst)
            reg = d / "REG.md"
            reg.write_text("> 状态：当前实现\n> 来源：selftest\n> 最近校验：2026-10-28\n\n"
                           + base_rows, encoding="utf-8")
            mutate(d)
            fails = check(reg)
            if not fails:
                print(f"FAIL {name}: 注入后未被抓到")
                bad += 1
            else:
                print(f"OK   {name}: {fails[0][:70]}")
        print(f"RESULT: {'PASS' if not bad else 'FAIL'}（selftest，{len(SELFTEST_CASES)} 类注入）")
    return 0 if not bad else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", default="docs/LONG_TASKS.md")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    reg = Path(args.registry)
    if args.list:
        return cmd_list(reg)
    fails = check(reg)
    for f in fails:
        print(f"  FAIL {f}")
    print(f"RESULT: {'PASS' if not fails else 'FAIL'}（{reg}）")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
