#!/usr/bin/env python3
"""env-single-source-scan.py — 「X11 会话环境解析只许有一个源」的静态门禁（F-20261022-75）。

症状（3 周内被独立修了 4 次，用户令「彻底杜绝」）：
    bf11dfa6 常驻服务启动时 source ys-env.sh（重启后 XAUTHORITY 丢失，px 全线失败）
    4431b48c ys-capture 自愈 XAUTHORITY（换会话后守护 30min 找不到窗口）
    26b2a96e win-attrib 自测不 source ys-env.sh（裸跑 3 条假红）
    4946d448 ys-scroll DISPLAY 空串 + XAUTHORITY 缺失 ⇒ 注入静默失败
每次只修当时出事的工具，因为解析规则散落在 ~19 个文件里：各自
`os.environ.get("DISPLAY", ":1")`、XAUTHORITY 不读、DISPLAY 空串不兜底。

判据：`tools/ys-editor/` 下凡是**执行** xdotool / ydotool（或把它们写进将要执行的脚本串）的文件，
必须引用统一入口——
    · bash    → `. "$HERE/ys-env.sh"`（或任意引用 `ys-env.sh`）
    · python  → `import ys_env`
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
YSDIR = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(YSDIR))

# 只扫 ys-editor 顶层的工具（tests/ 自己会造故障串，shims/ 是 ydotool 的替身，都不算工具）
SKIP_DIRS = {"tests", "shims", "actions", "calib", "models", "templates", "__pycache__",
             "domain.json"}
SCAN_SUFFIX = ("", ".sh", ".py")
SKIP_SUFFIX = (".md", ".json", ".tsv", ".c", ".service", ".bak", ".log", ".txt", ".html",
               ".pyc", ".so")

# 统一入口的**定义处**（它们当然会提到命令名）
ENTRY = {"ys-env.sh", "ys_env.py"}

# 豁免必须带理由，且每次运行都打印出来（不许静默变绿）
EXEMPT = {
    # task-2（常驻 OCR 守护显存）正在改这个文件；它的 X 环境靠 ys_capture/ys_look 自愈。
    # 迁移已排期：等 task-2 收尾后改成 import ys_env（不要为过门禁抢改别人的文件）。
    "ys_lookd.py": "task-2 写作用域中，X 环境由 ys_capture._refresh_env() 自愈；迁移待其收尾",
}

# 这些是"名字出现在命令位置"以外的只读上下文，不算执行
SH_SKIP = re.compile(r"^\s*(?:#|grep|rg|sed|awk|echo|printf|cat|wc|ls|command -v|type|which|"
                     r"pgrep|pkill|test|\[)")
SH_HIT = re.compile(
    r"(?:\A|[;&|({]|\s)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*[\"']?(?:/usr/bin/|/bin/|shims/)?"
    r"(xdotool|ydotool)(?=\s+[a-z])")
PY_HIT = re.compile(
    r"(?:\A|[;&|]\s+|\(\s*)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*[\"']?(?:/usr/bin/|/bin/|shims/)?"
    r"(xdotool|ydotool)(?=\s+[a-z])")
BASH_REF = re.compile(r"\bys-env\.sh\b|\bys_env\.py\b")
PY_REF = re.compile(r"^\s*(?:import\s+ys_env\b|from\s+ys_env\s+import\b)", re.M)


def _shebang_kind(path: str, first: str) -> str:
    if path.endswith(".py"):
        return "py"
    if path.endswith(".sh"):
        return "sh"
    if "python" in first:
        return "py"
    return "sh"


def _strip_sh_comment(line: str) -> str:
    """去掉行尾注释（够用即可：本仓工具不在字符串里写 ' #'）。"""
    idx = line.find(" #")
    return line if idx < 0 else line[:idx]


def scan_sh(text: str):
    hits = []
    for no, raw in enumerate(text.splitlines(), 1):
        line = _strip_sh_comment(raw)
        if not line.strip() or SH_SKIP.search(line):
            continue
        m = SH_HIT.search(line)
        if m:
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


def _is_cmd_str(s: str) -> bool:
    return s.strip() in ("xdotool", "ydotool") or bool(PY_HIT.search(s))


def scan_py(text: str):
    """只用 AST 看**会进到调用里的字符串常量**：注释/文档串/纯查表不算。

    · 列表形态 `subprocess.run(["ydotool", "key", ...])` → 常量正好是命令名
    · 脚本串形态 `[PUT, "x y; xdotool click ..."]` / `bash -c "ydotool key ..."` → 命令位置
    """
    try:
        tree = ast.parse(text)
    except SyntaxError as exc:
        return [(exc.lineno or 0, "语法错误：%s" % exc.msg)]
    docs = _py_docstrings(tree)
    hits = []
    seen = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        for sub in ast.walk(node):
            if not (isinstance(sub, ast.Constant) and isinstance(sub.value, str)):
                continue
            if id(sub) in docs or id(sub) in seen:
                continue
            if not _is_cmd_str(sub.value):
                continue
            seen.add(id(sub))
            hits.append((sub.lineno, sub.value.strip().replace("\n", " ")[:110]))
    hits.sort()
    return hits


def files_to_scan(directory: str):
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

    files = files_to_scan(YSDIR)
    violators = []
    exempted = []
    scanned = 0
    for path in files:
        name = os.path.basename(path)
        if name in ENTRY:
            continue
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
        # 两条栈互认：python 工具可调 ys-env.sh（既有做法），bash 工具也可调 ys_env.py
        referenced = bool(PY_REF.search(text) or BASH_REF.search(text))
        if referenced:
            continue
        rel = os.path.relpath(path, ROOT)
        if name in EXEMPT:
            exempted.append((rel, EXEMPT[name], hits[0][0]))
            continue
        violators.append((rel, kind, hits))

    # ② 范围外的同类（先记录、不扩：写作用域在 task-4 之外，交 Lead 决策）
    notes = []
    for path in files_to_scan(os.path.join(ROOT, "tools")):
        name = os.path.basename(path)
        if not name.startswith("ys-") or name in ENTRY:
            continue
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        kind = _shebang_kind(path, text.splitlines()[0] if text else "")
        hits = scan_py(text) if kind == "py" else scan_sh(text)
        if hits and not (PY_REF.search(text) if kind == "py" else BASH_REF.search(text)):
            notes.append((os.path.relpath(path, ROOT), hits[0][0]))

    for rel, reason, line in exempted:
        print("  [EXEMPT] %-38s L%-5s %s" % (rel, line, reason))
    for rel, line in notes:
        print("  [NOTE 未纳入本次迁移] %-30s L%-5s 同类绕过，写作用域外（Lead 决策）" % (rel, line))

    if violators:
        for rel, kind, hits in violators:
            how = "bash: . \"$HERE/ys-env.sh\"" if kind == "sh" else "python: import ys_env"
            print("  ✗ %-38s L%-5s 执行 xdotool/ydotool 但未引用统一环境入口（%s）" % (
                rel, hits[0][0], how))
            for line, snippet in hits[:2]:
                print("      L%-5s %s" % (line, snippet))
        print("ENV-SINGLE-SOURCE-RESULT scanned=%d violators=%d exempt=%d note=%d verdict=FAIL"
              % (scanned, len(violators), len(exempted), len(notes)))
        return 1
    print("ENV-SINGLE-SOURCE-RESULT scanned=%d violators=0 exempt=%d note=%d verdict=PASS"
          % (scanned, len(exempted), len(notes)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
