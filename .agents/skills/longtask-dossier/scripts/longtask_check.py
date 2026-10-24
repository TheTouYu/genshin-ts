#!/usr/bin/env python3
"""长期任务档案体检器（longtask-dossier）。

用法：
    python3 longtask_check.py [--dir docs/longtask] [--max-age-days 14] [--quiet]

检查项（任一 FAIL → 退出码 1）：
  1. 必备文件齐全（INDEX / LINES / 01-charter / 02-xinfa / 03-state / 04-timeline / 05-open）
  2. 每份 .md 前 15 行含 `状态：` 与 `最近校验：`（docs/ 目录的 doc_health 协议）
  3. 行数预算（INDEX 120 / LINES 150 / charter 200 / xinfa 300 / state 200 / timeline 400 / open 200 / dossier 200）
  4. INDEX.md 用链接指向每一份必备文件，且不把 archive/ 当当前入口
  5. 最近校验日期可解析，且不早于 --max-age-days 天（过期只 WARN，不拦构建）
  6. **多线模型（2026-10-24）**：LINES.md §二 线表每行有合法的线 id / 状态词表 / 可达的恢复入口，
     且「活跃」同时最多一条；INDEX.md 与 03-state.md 不得再出现"活动分支"这种单线口径；
     05-open.md 的开放条目（A/A2/B/C 四段）每行必须标线 id。

设计取舍：只做机器能判的事（存在性/字段/预算/指针/多线字段），文档内容质量留给人类与接手模型判断。
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import sys
import tempfile
from pathlib import Path

REQUIRED = [
    "INDEX.md",
    "LINES.md",
    "01-charter.md",
    "02-xinfa.md",
    "03-state.md",
    "04-timeline.md",
    "05-open.md",
]
BUDGETS = {
    "INDEX.md": 120,
    "LINES.md": 150,
    "01-charter.md": 200,
    "02-xinfa.md": 300,
    "03-state.md": 200,
    "04-timeline.md": 400,
    "05-open.md": 200,
}
DOSSIER_BUDGET = 200
HEADER_KEYS = ("状态：", "最近校验：")
DATE_RE = re.compile(r"最近校验[：:]\s*(\d{4}-\d{2}-\d{2})")

# 线表（LINES.md §二）的 8 列：线 id | 名称 | 目标 | 判据 | 状态 | 断点 | 恢复入口 | 上次读数
LINE_COLS = 8
LINE_STATES = {"活跃", "等用户", "暂停", "待裁决", "已闭环", "已废弃"}
LINE_ID_RE = re.compile(r"^`[a-z0-9][a-z0-9-]*`$")
# 已废除的单线口径（2026-10-24 用户：系统没考虑多任务并行 ⇒ 只能拿到一条任务）
BANNED_SINGLE_LINE = "活动分支"
LINK_RE = re.compile(r"\]\(([^)#]+)")
OPEN_LINE_TAG_RE = re.compile(r"`\[[a-z0-9][a-z0-9-]*\]`")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def strip_emphasis(s: str) -> str:
    return s.replace("*", "").strip()


def table_rows(text: str) -> list[tuple[int, list[str]]]:
    """返回 (行号, 单元格列表)；跳过表头与分隔行。"""
    rows: list[tuple[int, list[str]]] = []
    for no, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells:
            continue
        if all(set(c) <= set("-: ") for c in cells if c) or not any(cells):
            continue  # 分隔行 |---|---|
        rows.append((no, cells))
    return rows


def section(text: str, start_pat: str) -> str:
    """取从 start_pat 所在标题到下一个二级标题之间的正文。"""
    m = re.search(start_pat, text, re.M)
    if not m:
        return ""
    rest = text[m.end():]
    nxt = re.search(r"^## ", rest, re.M)
    return rest[: nxt.start()] if nxt else rest


def check_lines_table(root: Path, text: str) -> list[str]:
    fails: list[str] = []
    body = section(text, r"^## 二、")
    if not body:
        return ["LINES.md: 找不到 §二 线表（`## 二、...`）"]
    data = [(no, cells) for no, cells in table_rows(body) if cells[0].startswith("`")]
    if not data:
        return ["LINES.md: §二 线表没有数据行（线 id 首列写成 `id` 形式）"]
    seen: dict[str, int] = {}
    active: list[str] = []
    for no, cells in data:
        if len(cells) < LINE_COLS:
            fails.append(
                f"LINES.md:{no}: 线表行只有 {len(cells)} 列，需 {LINE_COLS} 列"
                "（线 id|名称|目标|判据|状态|断点|恢复入口|上次读数）"
            )
            continue
        line_id = strip_emphasis(cells[0])
        if not LINE_ID_RE.match(line_id):
            fails.append(f"LINES.md:{no}: 线 id {line_id!r} 不合规（写成 `kebab-case`）")
        else:
            if line_id in seen:
                fails.append(f"LINES.md:{no}: 线 id {line_id} 重复（首次在第 {seen[line_id]} 行）")
            seen.setdefault(line_id, no)
        state = strip_emphasis(cells[4])
        if state not in LINE_STATES:
            fails.append(
                f"LINES.md:{no}: 状态 {state!r} 不在词表 {sorted(LINE_STATES)}"
            )
        if state == "活跃":
            active.append(line_id)
        entry = cells[6]
        targets = LINK_RE.findall(entry)
        if not targets:
            fails.append(f"LINES.md:{no}: 恢复入口列没有相对链接（要能直接点进去）")
        for t in targets:
            if not (root / t).exists():
                fails.append(f"LINES.md:{no}: 恢复入口不可达 → {t}")
    if len(active) > 1:
        fails.append(f"LINES.md: 「活跃」线 {len(active)} 条 {active}（同时最多一条）")
    return fails


def check_open_line_tags(text: str) -> list[str]:
    """05-open.md 的开放条目（A/A2/B/C 段）每行必须标 `[line-id]`。"""
    fails: list[str] = []
    body = text.split("## D.")[0]
    for no, cells in table_rows(body):
        if not cells[0].startswith("O-"):
            continue
        if len(cells) < 2 or not OPEN_LINE_TAG_RE.search(strip_emphasis(cells[1])):
            fails.append(
                f"05-open.md:{no}: {cells[0]} 第 2 列缺线 id 标注（形如 `[football]`）"
            )
    return fails


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

    # ---- 多线模型（2026-10-24）----
    lines_md = root / "LINES.md"
    if lines_md.is_file():
        fails += check_lines_table(root, read_text(lines_md))

    for name in ("INDEX.md", "03-state.md"):
        p = root / name
        if p.is_file() and BANNED_SINGLE_LINE in read_text(p):
            fails.append(
                f"{name}: 仍出现 {BANNED_SINGLE_LINE!r} 这种单线口径"
                "（2026-10-24 起改为多线，见 LINES.md §一/§四）"
            )

    open_md = root / "05-open.md"
    if open_md.is_file():
        fails += check_open_line_tags(read_text(open_md))

    return fails, warns


SELFTEST_CASES = [
    # (名字, 变异函数(目录), 期望 FAIL 消息里的子串)
    (
        "line-state-vocab",
        lambda d: _sub(d / "LINES.md", "| **活跃** |", "| 进行中 |"),
        "状态 '进行中' 不在词表",
    ),
    (
        "line-entry-unreachable",
        lambda d: _sub(d / "LINES.md", "](dossiers/football-v3.md)", "](dossiers/nope.md)"),
        "恢复入口不可达",
    ),
    (
        "two-active-lines",
        lambda d: _sub(d / "LINES.md", "| 等用户 |", "| 活跃 |"),
        "同时最多一条",
    ),
    (
        "open-row-missing-line-tag",
        lambda d: _sub(d / "05-open.md", "| `[football]` | 造物技能链", "| football | 造物技能链"),
        "缺线 id 标注",
    ),
    (
        "banned-single-line-wording",
        lambda d: (d / "INDEX.md").write_text(
            (d / "INDEX.md").read_text(encoding="utf-8") + "\n当前活动分支：模拟器 2D\n",
            encoding="utf-8",
        ),
        "单线口径",
    ),
    (
        "missing-lines-md",
        lambda d: (d / "LINES.md").unlink(),
        "缺少必备文件：LINES.md",
    ),
]


def _sub(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise AssertionError(f"自测夹具失效：{path.name} 里找不到 {old!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def selftest(root: Path) -> int:
    """判定器自证：基线必须 PASS，每类注入必须被抓到（抓不到=门禁空转）。"""
    if not root.is_dir():
        print(f"FAIL 自测源目录不存在：{root}")
        return 1
    bad = 0
    with tempfile.TemporaryDirectory(prefix="longtask-selftest-") as tmp:
        base = Path(tmp) / "base"
        shutil.copytree(root, base)
        fails, _ = check(base, 14)
        if fails:
            bad += 1
            print(f"FAIL baseline（基线应 PASS，实得 {fails}）")
        else:
            print("PASS baseline")
        for name, mutate, expect in SELFTEST_CASES:
            case = Path(tmp) / name
            shutil.copytree(root, case)
            try:
                mutate(case)
            except AssertionError as e:
                bad += 1
                print(f"FAIL {name}: 夹具失效 — {e}")
                continue
            fails, _ = check(case, 14)
            hit = any(expect in f for f in fails)
            if hit:
                print(f"PASS {name}（抓到：{expect}）")
            else:
                bad += 1
                print(f"FAIL {name}: 注入后未被抓到（期望含 {expect!r}，实得 {fails}）")
    print(f"RESULT: {'PASS' if not bad else 'FAIL'}（selftest，{len(SELFTEST_CASES)} 类注入）")
    return 0 if not bad else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="长期任务档案体检（含多线模型）")
    ap.add_argument("--dir", default="docs/longtask", help="档案根目录")
    ap.add_argument("--max-age-days", type=int, default=14, help="最近校验的容忍天数")
    ap.add_argument("--quiet", action="store_true", help="只输出结论")
    ap.add_argument(
        "--selftest",
        action="store_true",
        help="判定器自证：基线 PASS + 6 类注入各被抓到（抓不到=门禁空转）",
    )
    args = ap.parse_args()

    root = Path(args.dir).resolve()
    if args.selftest:
        return selftest(root)

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
