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
import os
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
    # 显式 UTF-8：git 输出按系统 locale（Win11 默认 GBK）解码会在含中文路径时抛错
    return subprocess.check_output(
        ["git", *args], cwd=REPO_ROOT, encoding="utf-8", errors="replace"
    ).strip()


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


LONGTASK_GLOB = "docs/longtask*"
LONGTASK_CHECK = ".agents/skills/longtask-dossier/scripts/longtask_check.py"
LONGTASK_TASKS_CHECK = ".agents/skills/longtask-dossier/scripts/longtask_tasks.py"
LONGTASK_REGISTRY = "docs/LONG_TASKS.md"


def longtask_dirs() -> list[Path]:
    """所有长期任务档案目录（`docs/longtask*` 且含 INDEX.md）。

    2026-10-28 由「单目录 docs/longtask」扩到多任务：一任务一目录，登记表 docs/LONG_TASKS.md。
    """
    return sorted(
        p for p in REPO_ROOT.glob(LONGTASK_GLOB) if p.is_dir() and (p / "INDEX.md").is_file()
    )


def _run_script(script: Path, argv: list[str]) -> list[str]:
    # 子进程的 stdio 与这里的解码都显式 UTF-8，不看系统 locale（Win11 默认 GBK），也不看调用者的
    # PYTHONIOENCODING。2026-11-25 Win11 实证：旧实现（text=True）在只设 PYTHONIOENCODING=utf-8 时读取线程
    # 抛 UnicodeDecodeError，之后 proc.stdout/stderr 为 None，子检查一旦 FAIL 本函数直接 TypeError（门禁自身崩溃）。
    # 判定器自证见 --selftest-utf8（门禁 doc-health-utf8）。
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.run(
        [sys.executable, str(script), *argv],
        cwd=REPO_ROOT,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if proc.returncode == 0:
        return []
    lines = [ln.strip() for ln in ((proc.stdout or "") + (proc.stderr or "")).splitlines() if ln.strip()]
    return [
        ln for ln in lines if not ln.startswith("体检目录") and not ln.startswith("RESULT:")
    ] or [f"{script.name} 退出码 {proc.returncode}"]


def selftest_utf8() -> int:
    """判定器自证：子进程的中文输出必须原样读回，不依赖调用者的编码环境变量。

    2026-11-25 Win11 实证：子进程继承 PYTHONIOENCODING=utf-8 按 UTF-8 输出，而本脚本用
    subprocess(text=True) 按系统 GBK 解码 ⇒ 读取线程抛 UnicodeDecodeError，真 FAIL 的具体文本被吞
    （判定按退出码走、不会假 PASS，但问题原因全丢）。
    """
    import tempfile

    keys = ("PYTHONUTF8", "PYTHONIOENCODING")
    saved = {k: os.environ.get(k) for k in keys}
    problems: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        child = Path(tmp) / "child_with_cjk_output.py"
        child.write_text(
            "import sys\n"
            "print('体检目录：自测夹具')\n"
            "print('FAIL 中文原因：判断器自述', file=sys.stderr)\n"
            "sys.exit(1)\n",
            encoding="utf-8",
        )
        try:
            for label, override in (
                ("默认环境", {}),
                ("PYTHONIOENCODING=utf-8", {"PYTHONIOENCODING": "utf-8"}),
                ("PYTHONIOENCODING=gbk", {"PYTHONIOENCODING": "gbk"}),
            ):
                for k in keys:
                    os.environ.pop(k, None)
                os.environ.update(override)
                try:
                    out = _run_script(child, [])
                except (UnicodeDecodeError, TypeError) as exc:
                    # 旧实现在 utf-8 用例的两种失败形态：读取线程抛 UnicodeDecodeError；
                    # 线程崩了之后 proc.stdout 为 None，拼接时 TypeError（门禁自身崩溃）
                    problems.append(f"{label}: {type(exc).__name__} {exc}")
                    continue
                if not any("FAIL 中文原因：判断器自述" in ln for ln in out):
                    problems.append(f"{label}: 子进程输出未原样读回，得到 {out!r}")
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
    for p in problems:
        print(f"FAIL  doc_health --selftest-utf8  {p}")
    print("SELFTEST doc_health utf8:", "FAIL" if problems else "PASS")
    return 1 if problems else 0


def _legacy_run_script(script: Path, argv: list[str]) -> list[str]:
    """2026-11-25 之前的 _run_script 形态，只供注入用例 --inject-legacy 使用。

    解码按 GBK 严格模式＝模拟 Win11 的系统 locale（cp936）；这样「子进程 UTF-8 输出、父进程按系统
    编码解码」的故障在 UTF-8 locale 的 Linux 上也能复现，而不是只在出过事的机器上才红。
    """
    proc = subprocess.run(
        [sys.executable, str(script), *argv], cwd=REPO_ROOT, capture_output=True, encoding="gbk"
    )
    if proc.returncode == 0:
        return []
    lines = [ln.strip() for ln in ((proc.stdout or "") + (proc.stderr or "")).splitlines() if ln.strip()]
    return [
        ln for ln in lines if not ln.startswith("体检目录") and not ln.startswith("RESULT:")
    ] or [f"{script.name} 退出码 {proc.returncode}"]


def selftest_inject_legacy() -> int:
    """注入用例（失败账本用）：把 _run_script 换回旧实现，自测必须报红——证明门禁不是空转。"""
    import threading

    global _run_script
    real, real_hook = _run_script, threading.excepthook
    _run_script = _legacy_run_script
    threading.excepthook = lambda args: None  # 旧实现下读取线程的异常栈是预期噪音
    try:
        rc = selftest_utf8()
    finally:
        _run_script, threading.excepthook = real, real_hook
    if rc == 0:
        print("INJECT doc_health utf8: NOT-CAUGHT（旧实现下自测仍绿 ⇒ 自测空转）")
        return 1
    print("INJECT doc_health utf8: CAUGHT（旧实现被自测抓到）")
    return 0


def check_longtask() -> list[str]:
    """长期任务档案体检（2026-10-24 接入单任务；2026-10-28 扩到多任务）。

    - 每个 `docs/longtask*/` 目录跑一次 `longtask_check.py`
    - 登记表 `docs/LONG_TASKS.md` 跑 `longtask_tasks.py --check`
    只在「全量模式」或「暂存区含 docs/longtask* / 登记表」时跑；判定器自身带 --selftest。
    """
    problems: list[str] = []
    script = REPO_ROOT / LONGTASK_CHECK
    if not script.exists():
        return [f"多线档案体检器缺失：{LONGTASK_CHECK}"]
    for d in longtask_dirs():
        for ln in _run_script(script, ["--dir", str(d)]):
            problems.append(f"{d.name}: {ln}")
    tasks_script = REPO_ROOT / LONGTASK_TASKS_CHECK
    registry = REPO_ROOT / LONGTASK_REGISTRY
    if tasks_script.exists() and registry.is_file():
        for ln in _run_script(tasks_script, ["--registry", str(registry), "--check"]):
            problems.append(f"登记表: {ln}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="只检查 git 暂存区文件（pre-commit）")
    parser.add_argument(
        "--selftest-utf8", action="store_true", help="自测：子进程的中文输出必须原样读回（不依赖编码环境变量）"
    )
    parser.add_argument(
        "--inject-legacy", action="store_true", help="注入用例：换回旧版 _run_script，自测必须报红（失败账本用）"
    )
    args = parser.parse_args()
    if args.selftest_utf8:
        return selftest_utf8()
    if args.inject_legacy:
        return selftest_inject_legacy()

    raw_staged: list[str] = []
    if args.staged:
        raw_staged = sorted(staged_files())
        files = [
            f
            for f in raw_staged
            if in_scope_md(f) or in_scope_src(f) or f in ("AGENTS.md", "CLAUDE.md")
        ]
        run_longtask = any(
            f.startswith("docs/longtask") or f == LONGTASK_REGISTRY for f in raw_staged
        )
        if not files and not run_longtask:
            print("doc_health: no in-scope staged files; PASS")
            return 0
    else:
        files = discover_full()
        run_longtask = True

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

    if run_longtask:
        lt = check_longtask()
        names = ", ".join(d.name for d in longtask_dirs()) or "（无）"
        if lt:
            total += len(lt)
            print(f"FAIL  长期任务档案（{names} + {LONGTASK_REGISTRY}）")
            for p in lt:
                print(f"      - {p}")
        else:
            print(f"PASS  长期任务档案（{names} + {LONGTASK_REGISTRY}）")

    print(f"\n{total} problem(s) found.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
