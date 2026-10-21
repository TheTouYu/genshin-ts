#!/usr/bin/env python3
"""screen-gated-scan.py — 「测试不许偷偷占用用户屏幕」的**静态**门禁（F-20261021-54）。

症状：回归测试传的是空命令 `true`，但 ys-gui-slot 照样抬窗抢焦点 ⇒ failure-ledger check
      每次都在用户不知情时把画面切走、还会响铃。用户原话：「说完成了却还有操作音」。

判据（技能 §4.5 的同一条，这里做成可跑的门禁）：
  测试文件里凡是**执行** ys-gui-slot / ys-act（两者内部都会真抬窗），该文件必须显式声明其一：
    · YS_ALLOW_SCREEN_TEST=1 —— 真的要动屏（需先在对话里拿到用户授权）
    · YS_SLOT_TEST=1          —— 走假槽，不碰屏幕（判据与屏幕无关时用这个）
  注释、文档字符串、静态断言/读取（grep / want_has / check / open / os.path.join）不算执行。

为什么是静态的：这条门禁要防的正是"跑起来才发现动了屏幕"；动态检测（读 KWin active）
本身就要先把屏幕动了。

退出码：0 PASS / 1 有违规（点名文件与行）/ 2 环境异常
"""
from __future__ import annotations

import ast
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
TOOLS = ("ys-gui-slot", "ys-act")
# 这些调用拿到同名参数只是"读/打印/断言"，不是执行（实测的四种假阳性来源）
READONLY_FUNCS = {"join", "open", "check", "print", "format", "read", "readlines",
                  "Path", "exists", "grep", "want_has", "expect_has"}
# 注意：printf/echo 里出现命令名是**造字符串**（账户的注入用例就是这么写注入物的），不是执行。
# 代价：`echo $(ys-gui-slot ...)` 这种写法会漏；本仓没有这种写法，出现时按执行处理请改扫描器。
SH_SKIP = re.compile(r"grep|want_has|expect_has|check\(|\.read\(|printf|echo")


def targets():
    out = []
    tdir = os.path.join(ROOT, "tools", "ys-editor", "tests")
    for name in sorted(os.listdir(tdir)):
        if name.endswith((".sh", ".py")):
            out.append(os.path.join(tdir, name))
    extra = os.path.join(ROOT, ".scratch", "gui-service", "selftest.py")
    if os.path.isfile(extra):
        out.append(extra)
    return out


def execs_in_sh(path):
    """shell：非注释行里出现命令名，且不是 grep/断言上下文。"""
    hits = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for i, line in enumerate(fh, 1):
            s = line.rstrip("\n")
            if s.lstrip().startswith("#"):
                continue
            if not any(t in s for t in TOOLS):
                continue
            if SH_SKIP.search(s):
                continue
            hits.append((i, s.strip()[:110]))
    return hits


def _looks_like_cmd(value):
    v = str(value)
    return any(v == t or v.endswith("/" + t) for t in TOOLS)


def execs_in_py(path):
    """python：只认**调用参数里的路径字面量**；文档字符串/断言文本不算。"""
    try:
        tree = ast.parse(open(path, encoding="utf-8").read())
    except SyntaxError:
        return []
    hits = []

    def fname(func):
        if isinstance(func, ast.Name):
            return func.id
        if isinstance(func, ast.Attribute):
            return func.attr
        return ""

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if fname(node.func) in READONLY_FUNCS:
            continue
        consts = [a for a in list(node.args) + [k.value for k in node.keywords]
                  if isinstance(a, ast.Constant) and isinstance(a.value, str)]
        if any(_looks_like_cmd(c.value) for c in consts):
            hits.append((getattr(node, "lineno", 0),
                         "%s(...)" % (fname(node.func) or "call")))
    return hits


def main():
    bad, scanned = [], 0
    for path in targets():
        rel = os.path.relpath(path, ROOT)
        scanned += 1
        hits = execs_in_sh(path) if path.endswith(".sh") else execs_in_py(path)
        if not hits:
            continue
        src = open(path, encoding="utf-8", errors="replace").read()
        if "YS_ALLOW_SCREEN_TEST" in src or "YS_SLOT_TEST" in src:
            continue
        bad.append((rel, hits))

    if bad:
        print("SCREEN-GATED FAIL 这些测试会真占屏却没声明闸门"
              "（加 YS_ALLOW_SCREEN_TEST=1 或 YS_SLOT_TEST=1）：")
        for rel, hits in bad:
            print("  %s" % rel)
            for ln, txt in hits[:3]:
                print("    %s:%s  %s" % (rel, ln, txt))
        print("SCREEN-GATED-RESULT files=%d viol=%d verdict=FAIL" % (scanned, len(bad)))
        return 1
    print("SCREEN-GATED-RESULT files=%d viol=0 verdict=PASS" % scanned)
    return 0


if __name__ == "__main__":
    sys.exit(main())
