#!/usr/bin/env python3
"""instruments.py — 世界状态服务的**仪器适配层**（只调用既有工具，不改它们）。

单一源纪律（AGI-BAR §五 / 项目 AGENTS「状态判定单一源」）：
  · 状态判定 → `tools/ys-editor/ys-state`（本服务不重写任何判据）
  · 对象/容器 → `tools/ys-screen --containers`（本服务不重写检测，只做 schema 映射）
  · 取帧     → `tools/ys-editor/ys-observe frame`（唯一取数入口，自带新鲜度证明）
  · 栈顶判定 → `tools/ys-editor/ys-atop`
  · 意图动作 → `tools/ys-editor/ys-do`（有 pre/post 契约 + append-only 账本）
  · 注入     → 唯一硬通道 `tools/ys-editor/ys-gui-slot`（本会话禁止执行；见 allow_inject）

硬纪律（写进代码而不是文档）：
  · **绝不为读数抬窗口**：`grab_frame()` 先查 ys-atop；不在栈顶直接抛 LIVE_NOT_ATOP，
    不调用会抬窗的取帧路径（ys-observe 在窗口被压住时会抬升，见其文件头）。
  · 仪器失败必须出声：每个失败都带 `code` + 人读 `detail`（退出码、stderr 尾部），
    不返回"看起来像成功"的空结果。
"""
from __future__ import annotations

import json
import os
import subprocess
import time

from cache import instrument_signature

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
YS_EDITOR = os.path.join(REPO_ROOT, "tools", "ys-editor")
YS_STATE = os.path.join(YS_EDITOR, "ys-state")
YS_SCREEN = os.path.join(REPO_ROOT, "tools", "ys-screen")
YS_OBSERVE = os.path.join(YS_EDITOR, "ys-observe")
YS_ATOP = os.path.join(YS_EDITOR, "ys-atop")
YS_DO = os.path.join(YS_EDITOR, "ys-do")
YS_GUI_SLOT = os.path.join(YS_EDITOR, "ys-gui-slot")
YS_POINTER_CLICK = os.path.join(YS_EDITOR, "ys-pointer-click")
ACTIONS_DIR = os.path.join(YS_EDITOR, "actions")
PROFILE_DEFAULT = os.path.join(REPO_ROOT, ".scratch", "gui-profiles", "qianxing.json")
WIN_DEFAULT = os.environ.get("YS_WIN", "0x01400001")


class InstrumentError(RuntimeError):
    """仪器不可用 / 拒绝执行。code 是稳定判据，detail 是人读原因。"""

    def __init__(self, code, detail, *, rc=None, stderr_tail=None):
        self.code = code
        self.detail = detail
        self.rc = rc
        self.stderr_tail = stderr_tail
        super().__init__(f"[{code}] {detail}")


def _tail(s, n=400):
    s = (s or "").strip()
    return s[-n:]


def run(cmd, *, timeout=120, env_extra=None, cwd=None):
    """跑一条命令；返回 (rc, stdout, stderr)。超时抛 InstrumentError(TIMEOUT)。"""
    env = dict(os.environ)
    if env_extra:
        env.update({k: str(v) for k, v in env_extra.items()})
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                           env=env, cwd=cwd or REPO_ROOT)
    except subprocess.TimeoutExpired:
        raise InstrumentError("TIMEOUT", f"命令超时 {timeout}s：{' '.join(cmd)}")
    return p.returncode, p.stdout, p.stderr


def parse_json_line(stdout, *, what):
    """工具约定：JSON 在 stdout 的最后一行（前面可能有日志/摘要）。"""
    lines = [ln for ln in (stdout or "").strip().splitlines() if ln.strip()]
    if not lines:
        raise InstrumentError("EMPTY_OUTPUT", f"{what}：stdout 为空")
    try:
        return json.loads(lines[-1])
    except ValueError:
        raise InstrumentError("BAD_JSON", f"{what}：最后一行不是 JSON：{_tail(lines[-1], 200)}")


# ── 栈顶 / 取帧 ─────────────────────────────────────────────────────────────

def atop_status(title=None, *, timeout=30):
    """ys-atop：0=在栈顶 / 1=被压住 / 2=找不到窗口。返回 {atop, rc, line, win}。"""
    rc, out, err = run([YS_ATOP, title or "原神"], timeout=timeout)
    line = (out or "").strip().splitlines()[-1] if out.strip() else ""
    win = line.split("|")[0] if line and line != "NONE" else None
    return {"atop": rc == 0, "rc": rc, "line": line, "win": win,
            "stderr": _tail(err, 200) if rc not in (0, 1, 2) else ""}


def grab_frame(*, timeout=60, skip_atop=False):
    """取一帧并返回 ys-observe 的读数字典；**不在栈顶就拒绝**（不抬窗口）。

    skip_atop=True 只给 WorldService 用：它已经按同一判据查过栈顶，避免一次调用查两遍。
    """
    st = atop_status() if not skip_atop else {"atop": True, "rc": 0, "line": "prechecked", "win": None}
    if not st["atop"]:
        raise InstrumentError(
            "LIVE_NOT_ATOP",
            f"游戏窗口不在栈顶（ys-atop rc={st['rc']}，line={st['line']!r}）；"
            "本服务绝不为了取数抬窗口 —— 请把窗口切到栈顶或改用 --frame 离线帧",
            rc=st["rc"])
    rc, out, err = run([YS_OBSERVE, "frame"], timeout=timeout)
    if rc != 0:
        raise InstrumentError("GRAB_FAILED", f"ys-observe frame rc={rc}：{_tail(err, 300)}",
                              rc=rc, stderr_tail=_tail(err))
    meta = parse_json_line(out, what="ys-observe frame")
    if not meta.get("atop") or not meta.get("fresh"):
        raise InstrumentError("GRAB_NOT_FRESH", f"取帧读数不新鲜：{json.dumps(meta, ensure_ascii=False)[:400]}")
    path = meta.get("path") or ""
    if not os.path.isfile(path):
        raise InstrumentError("GRAB_NO_FILE", f"ys-observe 返回的帧不存在：{path!r}")
    meta["atop_status"] = st
    return meta


# ── 状态判定（单一源：ys-state）────────────────────────────────────────────

def get_state(frame, *, channel="fast", profile=None, timeout=120):
    """ys-state --json：返回其结果 dict（含 state/confidence/evidence 原料）。

    rc 语义（见 ys-state 文件头）：0 成功 / 2 AMBIGUOUS / 3 取帧失败 / 4 UNKNOWN / 5 回归失败。
    2 与 4 是**合法结论**（有证据的不确定/未知），不是仪器故障；3/5 才是故障。
    """
    cmd = [YS_STATE, "--json", "--frame", os.path.abspath(frame)]
    cmd.append("--full" if channel == "full" else "--fast")
    if profile:
        cmd += ["--profile", profile]
    rc, out, err = run(cmd, timeout=timeout)
    if rc not in (0, 2, 4):
        raise InstrumentError("STATE_FAILED", f"ys-state rc={rc}：{_tail(err, 300)}",
                              rc=rc, stderr_tail=_tail(err))
    res = parse_json_line(out, what="ys-state")
    res["_rc"] = rc
    res["_stderr_tail"] = _tail(err, 200)
    return res


# ── 对象层（单一源：ys-screen --containers）────────────────────────────────

def get_containers(frame, *, timeout=180):
    rc, out, err = run([YS_SCREEN, os.path.abspath(frame), "--json", "--containers"], timeout=timeout)
    if rc != 0:
        raise InstrumentError("SCREEN_FAILED", f"ys-screen --containers rc={rc}：{_tail(err, 300)}",
                              rc=rc, stderr_tail=_tail(err))
    res = parse_json_line(out, what="ys-screen")
    res["_rc"] = rc
    res["_stderr_tail"] = _tail(err, 200)
    return res


def get_full_screen(frame, *, timeout=180):
    """全量摘要（controls/regions/adjacency）——v0 不用，留作对照/后续 L2。"""
    rc, out, err = run([YS_SCREEN, os.path.abspath(frame), "--json"], timeout=timeout)
    if rc != 0:
        raise InstrumentError("SCREEN_FAILED", f"ys-screen rc={rc}：{_tail(err, 300)}",
                              rc=rc, stderr_tail=_tail(err))
    return parse_json_line(out, what="ys-screen")


# ── 意图动作（ys-do：有 pre/post 契约）────────────────────────────────────

def list_intents():
    """读取 ys-do 意图清单（只读 actions/*.json）。"""
    out = []
    if not os.path.isdir(ACTIONS_DIR):
        return out
    for name in sorted(os.listdir(ACTIONS_DIR)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(ACTIONS_DIR, name)
        try:
            with open(path, encoding="utf-8") as f:
                a = json.load(f)
        except (OSError, ValueError):
            continue
        out.append({
            "intent": name[:-5], "path": path,
            "pre": a.get("pre"), "post": a.get("post"),
            "steps": len(a.get("steps") or []), "desc": a.get("desc", ""),
        })
    return out


def run_intent(intent, *, dry=False, allow_focus=False, timeout=180):
    """调 ys-do 执行意图。**默认拒绝**：ys-do 的 acquire_focus 会抬升游戏窗口。

    allow_focus=True 才真正调用（需用户明确授权 + 窗口可占焦点）；本会话硬约束
    「不动游戏窗口」⇒ WorldService 默认 allow_inject=False，这里也默认 False。
    """
    if not allow_focus:
        raise InstrumentError(
            "FOCUS_REQUIRED",
            f"意图 {intent} 需要 ys-do 占焦点/抬窗口（其 dry-run 也 acquire_focus）；"
            "本服务默认不抬窗口 —— 需要用户在环授权后传 allow_focus=True")
    cmd = [YS_DO, intent] + (["--dry"] if dry else [])
    rc, out, err = run(cmd, timeout=timeout)
    return {"rc": rc, "stdout_tail": _tail(out, 1200), "stderr_tail": _tail(err, 400)}


# ── 注入（唯一硬通道；本会话默认禁用）──────────────────────────────────────

def inject_click(x, y, *, win=None, seconds=6, timeout=45):
    """经 ys-gui-slot 包装的点击注入。**只在 allow_inject=True 的会话里被调用**。

    裸调 ydotoool/xdotool 会被 PATH shim 拦下（rc=77）；ys-pointer-click 自带闭环定位，
    但仍必须包在 ys-gui-slot 里（唯一硬通道），否则事件可能进到别的窗口。
    """
    win = win or WIN_DEFAULT
    cmd = [YS_GUI_SLOT, win, str(seconds), YS_POINTER_CLICK, str(int(x)), str(int(y))]
    rc, out, err = run(cmd, timeout=timeout)
    return {"rc": rc, "stdout_tail": _tail(out, 800), "stderr_tail": _tail(err, 400)}


def signature():
    return instrument_signature(REPO_ROOT)


def click_point(bbox):
    """bbox=[x,y,w,h] → 点击点（中心，整数）。"""
    x, y, w, h = [int(v) for v in bbox]
    return [x + w // 2, y + h // 2]


def now_ms():
    return int(time.time() * 1000)
