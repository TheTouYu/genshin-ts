#!/usr/bin/env python3
"""env-single-source-scan.py — 「X11 会话环境解析只许有一个源」的**严格**静态门禁（F-20261022-75）。

症状（3 周内被独立修了 4 次，用户令「彻底杜绝」）：
    bf11dfa6 常驻服务启动时 source ys-env.sh（重启后 XAUTHORITY 丢失，px 全线失败）
    4431b48c ys-capture 自愈 XAUTHORITY（换会话后守护 30min 找不到窗口）
    26b2a96e win-attrib 自测不 source ys-env.sh（裸跑 3 条假红）
    4946d448 ys-scroll DISPLAY 空串 + XAUTHORITY 缺失 ⇒ 注入静默失败
每次只修当时出事的工具，因为解析规则散落在 ~19 个文件里：各自
`os.environ.get("DISPLAY", ":1")`、XAUTHORITY 不读、DISPLAY 空串不兜底。

判据（**无豁免通道**：任何例外都必须先改代码，不允许在门禁里开口子）：
扫描范围 = `tools/ys-editor/` 顶层工具 + `tools/` 顶层工具。`tests/` 与 `shims/` 除外——
它们故意构造裸命令串来测门禁本身（注入用例、ydotool 替身）。
凡是**执行** xdotool / ydotool（或把它们写进将要执行的脚本串）的文件，必须真的引用统一入口：
    · bash    → `. <path>/ys-env.sh` 或 `source <path>/ys-env.sh`（**在命令位置**；
                只在注释/提示文案里提到不算——2026-10-22 实测有个工具正是靠提示语混过去的）
    · python  → `import ys_env`，或调用参数里出现字面量 `ys-env.sh`
                （如 `os.path.join(HERE, "ys-env.sh")`，既有 ys_look/ys_capture/ys-state 的形态）
注释、文档字符串、纯查表（没进任何调用）不算执行。

为什么不动态检测：本门禁要防的正是「跑起来才发现环境不对」；而且动态检测本身就要先解析环境。

退出码：0 PASS / 1 有绕过者 / 2 门禁自身异常
"""
from __future__ import annotations

import ast
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
YSDIR = os.path.dirname(HERE)                     # tools/ys-editor
TOOLS = os.path.dirname(YSDIR)                    # tools
ROOT = os.path.dirname(TOOLS)
ROOTS = (YSDIR, TOOLS)

SKIP_DIRS = {"tests", "shims", "actions", "calib", "models", "templates", "__pycache__"}
SCAN_SUFFIX = ("", ".sh", ".py")
SKIP_SUFFIX = (".md", ".json", ".tsv", ".c", ".service", ".bak", ".log", ".txt", ".html",
               ".pyc", ".so")

# 统一入口的**定义处**（它们当然会提到命令名）
ENTRY = {"ys-env.sh", "ys_env.py"}

# bash 里 command 位置的 source/.：`[ -f X ] && . X` 也算
BASH_SRC = re.compile(
    r"(?:^|[\n;&|)]|\bthen|\bdo|\belse)\s*(?:\[[^\]\n]*\]\s*&&\s*)?"
    r"(?:\.|source)\s+[^\n]*ys-env\.sh", re.M)
SH_SKIP = re.compile(r"^\s*(?:#|grep|rg|sed|awk|echo|printf|cat|wc|ls|command -v|type|which|"
                     r"pgrep|pkill|test|\[)")
SH_HIT = re.compile(
    r"(?:\A|[;&|({]|\s)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*[\"']?(?:/usr/bin/|/bin/|shims/)?"
    r"(xdotool|ydotool)(?=\s+[a-z])")
PY_HIT = re.compile(
    r"(?:\A|[;&|]\s+|\(\s*)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*[\"']?(?:/usr/bin/|/bin/|shims/)?"
    r"(xdotool|ydotool)(?=\s+[a-z])")


def _shebang_kind(path: str, first: str) -> str:
    if path.endswith(".py"):
        return "py"
    if path.endswith(".sh"):
        return "sh"
    if "python" in first:
        return "py"
    return "sh"


def _strip_sh_comment(line: str) -> str:
    idx = line.find(" #")
    return line if idx < 0 else line[:idx]


def sh_code_only(text: str) -> str:
    """去掉整行注释与行尾注释后再判「是否引用入口」——注释里写一句 source 不算。"""
    out = []
    for raw in text.splitlines():
        out.append("" if raw.lstrip().startswith("#") else _strip_sh_comment(raw))
    return "\n".join(out)


def scan_sh(text: str):
    hits = []
    for no, raw in enumerate(text.splitlines(), 1):
        line = _strip_sh_comment(raw)
        if not line.strip() or SH_SKIP.search(line):
            continue
        if SH_HIT.search(line):
            hits.append((no, raw.strip()[:110]))
    return hits


def _py_docstrings(tree: ast.AST) -> set:
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = getattr(node, "body", [])
            if (body and isinstance(body[0], ast.Expr)
                    and isinstance(body[0].value, ast.Constant)
                    and isinstance(body[0].value.value, str)):
                out.add(id(body[0].value))
    return out


RE_FUNCS = {"compile", "search", "match", "fullmatch", "findall", "finditer", "sub", "subn",
            "split"}


def _is_re_call(node: ast.Call) -> bool:
    """`re.search(r"\b(xdotool click|ydotool key)", cmd)` 是**判据模式**，不是执行。"""
    f = node.func
    return (isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name)
            and f.value.id == "re" and f.attr in RE_FUNCS)


def _is_cmd_str(s: str) -> bool:
    return s.strip() in ("xdotool", "ydotool") or bool(PY_HIT.search(s))


def scan_py(text: str):
    """只用 AST 看**会进到调用里的字符串常量**：注释/文档串/纯查表不算。"""
    try:
        tree = ast.parse(text)
    except SyntaxError as exc:
        return [(exc.lineno or 0, "语法错误：%s" % exc.msg)]
    docs = _py_docstrings(tree)
    hits, seen = [], set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or _is_re_call(node):
            continue
        for sub in ast.walk(node):
            if not (isinstance(sub, ast.Constant) and isinstance(sub.value, str)):
                continue
            if id(sub) in docs or id(sub) in seen or not _is_cmd_str(sub.value):
                continue
            seen.add(id(sub))
            hits.append((sub.lineno, sub.value.strip().replace("\n", " ")[:110]))
    hits.sort()
    return hits


def py_refs_entry(text: str) -> bool:
    """真的引用了入口：import ys_env / 调用参数里带 ys-env.sh 字面量。"""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(a.name == "ys_env" for a in node.names):
                return True
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] == "ys_env":
                return True
        elif isinstance(node, ast.Call):
            for sub in ast.walk(node):
                if (isinstance(sub, ast.Constant) and isinstance(sub.value, str)
                        and sub.value.endswith("ys-env.sh")):
                    return True
    return False


def files_to_scan(directory: str):
    """只扫目录**顶层**的文件（tools/ys-editor/ 与 tools/ 各一层）。"""
    out = []
    if not os.path.isdir(directory):
        return out
    for name in sorted(os.listdir(directory)):
        path = os.path.join(directory, name)
        if not os.path.isfile(path) or name in SKIP_DIRS:
            continue
        if name.endswith(SKIP_SUFFIX) or ".bak" in name:
            continue
        if not name.endswith(SCAN_SUFFIX):
            continue
        out.append(path)
    return out


def main() -> int:
    # ① 入口自身可用性（不依赖 X：断言的是"返回值结构"，不是"这台机器有 X"）
    sys.path.insert(0, YSDIR)
    try:
        import ys_env
        resolved = ys_env.resolve(refresh=True)
        probe_env = ys_env.env()
    except Exception as exc:                                    # noqa: BLE001
        print("ENV-SINGLE-SOURCE-BROKEN 统一入口不可用：%s: %s" % (type(exc).__name__, exc))
        return 2
    problems = []
    if not resolved.display:
        problems.append("resolve().display 为空（空串就是不兜底的老坑，4946d448）")
    if not probe_env.get("DISPLAY"):
        problems.append("env()['DISPLAY'] 为空")
    if not probe_env.get("YDOTOOL_SOCKET"):
        problems.append("env()['YDOTOOL_SOCKET'] 为空")
    if problems:
        print("ENV-SINGLE-SOURCE-BROKEN 统一入口自检失败：%s" % "；".join(problems))
        return 2

    scanned, violators, seen_paths = 0, [], set()
    for base in ROOTS:
        for path in files_to_scan(base):
            name = os.path.basename(path)
            if name in ENTRY or path in seen_paths:
                continue
            seen_paths.add(path)
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except OSError as exc:
                print("ENV-SINGLE-SOURCE-BROKEN 读不了 %s：%s" % (path, exc))
                return 2
            kind = _shebang_kind(path, text.splitlines()[0] if text else "")
            hits = scan_py(text) if kind == "py" else scan_sh(text)
            if not hits:
                continue
            scanned += 1
            referenced = py_refs_entry(text) if kind == "py" else bool(
                BASH_SRC.search(sh_code_only(text)))
            if referenced:
                continue
            violators.append((os.path.relpath(path, ROOT), kind, hits))

    for rel, kind, hits in violators:
        how = "python: import ys_env（或调用 ys-env.sh）" if kind == "py" else \
            'bash: . "$HERE/ys-env.sh"'
        print("  ✗ %-40s L%-5s 执行 xdotool/ydotool 但未引用统一环境入口（%s）" % (
            rel, hits[0][0], how))
        for line, snippet in hits[:2]:
            print("      L%-5s %s" % (line, snippet))
    print("ENV-SINGLE-SOURCE-RESULT roots=ys-editor,tools scanned=%d violators=%d verdict=%s"
          % (scanned, len(violators), "FAIL" if violators else "PASS"))
    return 1 if violators else 0


if __name__ == "__main__":
    sys.exit(main())
