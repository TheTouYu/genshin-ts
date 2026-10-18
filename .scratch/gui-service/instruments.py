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
import sys
import time

from cache import instrument_signature

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
YS_EDITOR = os.path.join(REPO_ROOT, "tools", "ys-editor")
YS_STATE = os.path.join(YS_EDITOR, "ys-state")
YS_SCREEN = os.path.join(REPO_ROOT, "tools", "ys-screen")
YS_OBSERVE = os.path.join(YS_EDITOR, "ys-observe")
YS_CAPTURE = os.path.join(YS_EDITOR, "ys-capture")
YS_ATOP = os.path.join(YS_EDITOR, "ys-atop")
YS_DO = os.path.join(YS_EDITOR, "ys-do")
YS_GUI_SLOT = os.path.join(YS_EDITOR, "ys-gui-slot")
YS_POINTER_CLICK = os.path.join(YS_EDITOR, "ys-pointer-click")
ACTIONS_DIR = os.path.join(YS_EDITOR, "actions")
PROFILE_DEFAULT = os.path.join(REPO_ROOT, ".scratch", "gui-profiles", "qianxing.json")
LOOKD_SOCK = os.environ.get("YS_LOOKD_SOCK", "/run/user/%d/ys-lookd.sock" % os.getuid())
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
    rc, out, err = run([YS_ATOP, title or os.environ.get("YS_WIN_TITLE", "原神")], timeout=timeout)
    line = (out or "").strip().splitlines()[-1] if out.strip() else ""
    win = line.split("|")[0] if line and line != "NONE" else None
    return {"atop": rc == 0, "rc": rc, "line": line, "win": win,
            "stderr": _tail(err, 200) if rc not in (0, 1, 2) else ""}


def attrib_fast(title=None, win=None, *, timeout=20):
    """快速窗口归属（票 34）：X11/EWMH 快路径（ys_attrib.py，~20ms），不抬窗、不抓屏。

    返回 dict（verdict/atop/window/current_desktop/occluders/elapsed_ms…）；rc 语义：
    0 OK / 1 NOT_ATOP / 2 NOT_FOUND / 6 OTHER_DESKTOP / 7 OCCLUDED / 9 检查不可用。
    """
    # 用当前解释器执行（不依赖文件的 +x 位；交付/解包后也能跑）
    rc, out, err = run([sys.executable, os.path.join(YS_EDITOR, "ys_attrib.py"),
                        title or os.environ.get("YS_WIN_TITLE", "原神"),
                        "--win", win or WIN_DEFAULT], timeout=timeout)
    if rc not in (0, 1, 2, 6, 7, 9):
        raise InstrumentError("ATTRIB_FAILED", f"ys_attrib rc={rc}：{_tail(err, 300)}",
                              rc=rc, stderr_tail=_tail(err))
    d = parse_json_line(out, what="ys_attrib")
    d["rc"] = rc
    return d


CAPTURE_EXIT = {"7": "DAEMON_DOWN", "4": "OTHER_DESKTOP", "5": "OCCLUDED",
                "2": "NOT_ATOP", "8": "STALE_FRAME", "9": "STRICT_UNAVAILABLE",
                "10": "FORMAT_NOT_READY", "11": "COPY_FAILED", "1": "BAD_ARG"}


def grab_frame(*, timeout=60, skip_atop=False, allow_background=False, backend=None):
    """取一帧；**不在栈顶/被遮挡/不在当前桌面就拒绝**（绝不抬窗口）。

    两条后端（`YS_CAPTURE_BACKEND` 选择）：
      · `ys-capture`（默认，2026-10-18 接入）：常驻 XShm 抓帧 + /dev/shm 环形缓冲，
        客户端 **~13ms**；归属闸门在**守护进程里**：X11/EWMH 快路径只做保守拒绝，
        **权威 = KWin（ys-atop --verify，后台刷新 + TTL）**——它的结论过旧/不可用就 exit 9。
        退出码→InstrumentError.code 一一对应，上层据此判"是拒绝还是故障"。
      · `observe`（旧路径，保留回退）：ys-observe frame（spectacle 全屏 PNG，~1s）。
    `allow_background=True` 显式跳过 KWin 严格闸门（只供离线分析目标窗口自身缓冲，**不得用于动作**）。
    """
    backend = backend or os.environ.get("YS_CAPTURE_BACKEND", "ys-capture")
    if backend == "ys-capture":
        out = os.path.join("/dev/shm", "ys-service-frame-%d.bmp" % os.getpid())
        cmd = [YS_CAPTURE, "latest", "--out", out, "--format", "bmp"]
        if allow_background:
            cmd.append("--allow-background")
        rc, so, se = run(cmd, timeout=timeout)
        try:
            meta = json.loads((so or "").strip().splitlines()[-1]) if so.strip() else {}
        except ValueError:
            meta = {}
        if rc != 0:
            code = CAPTURE_EXIT.get(str(rc), "GRAB_FAILED")
            raise InstrumentError(
                code,
                f"ys-capture latest rc={rc}：{meta.get('error') or ''} {meta.get('detail') or ''}"
                f"（{_tail(se, 200)}）",
                rc=rc, stderr_tail=_tail(se, 400))
        path = meta.get("out") or ""
        if not path or not os.path.isfile(path):
            raise InstrumentError("GRAB_NO_FILE", f"ys-capture 没落帧：{path!r}")
        attr = meta.get("attribution") or {}
        return {"path": path, "source": "ys-capture", "fresh": True,
                "capture_ms": meta.get("ms"),
                "frame": meta.get("frame") or {},
                "attribution": attr, "window": meta.get("win"),
                "atop": attr.get("strict") == "OK",
                "static": None, "diffFromPrev": None, "reused": None,
                "allow_background": bool(allow_background)}
    # ── 旧路径（仅回退用）
    st = atop_status() if not skip_atop else {"atop": True, "rc": 0, "line": "prechecked", "win": None}
    if not st["atop"]:
        raise InstrumentError(
            "LIVE_NOT_ATOP",
            f"游戏窗口不在栈顶（ys-atop rc={st['rc']}，line={st['line']!r}）；"
            "本服务绝不为了取数抬窗口 —— 请把窗口切到栈顶或改用 --frame 离线帧",
            rc=st["rc"])
    rc, out_s, err = run([YS_OBSERVE, "frame"], timeout=timeout)
    if rc != 0:
        raise InstrumentError("GRAB_FAILED", f"ys-observe frame rc={rc}：{_tail(err, 300)}",
                              rc=rc, stderr_tail=_tail(err))
    meta = parse_json_line(out_s, what="ys-observe frame")
    if not meta.get("atop") or not meta.get("fresh"):
        raise InstrumentError("GRAB_NOT_FRESH", f"取帧读数不新鲜：{json.dumps(meta, ensure_ascii=False)[:400]}")
    path = meta.get("path") or ""
    if not os.path.isfile(path):
        raise InstrumentError("GRAB_NO_FILE", f"ys-observe 返回的帧不存在：{path!r}")
    meta["atop_status"] = st
    meta["source"] = "ys-observe"
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


def daemon_rpc(req, *, timeout=180):
    """裸 socket 调 ys-lookd（一行 JSON 请求/响应）。失败抛 InstrumentError（fail-closed）。"""
    import socket
    if not os.path.exists(LOOKD_SOCK):
        raise InstrumentError("DAEMON_UNAVAILABLE", f"常驻服务 socket 不存在：{LOOKD_SOCK}")
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect(LOOKD_SOCK)
        s.sendall((json.dumps(req, ensure_ascii=False) + "\n").encode())
        buf = b""
        while not buf.endswith(b"\n"):
            chunk = s.recv(1 << 20)
            if not chunk:
                break
            buf += chunk
        s.close()
        out = json.loads(buf.decode())
    except (OSError, ValueError) as exc:
        raise InstrumentError("DAEMON_FAILED", f"常驻服务调用失败：{type(exc).__name__}: {exc}")
    if isinstance(out, dict) and out.get("error"):
        raise InstrumentError(out.get("code") or "DAEMON_ERROR",
                              f"常驻服务报错：{str(out.get('error'))[:300]}")
    return out


def get_world_daemon(frame=None, *, profile=None, ocr=True, objects=True, cache=True,
                     timeout=180):
    """世界状态仪器（ys-lookd cmd=world，**新版服务才有**；旧服务会报 unknown cmd）。"""
    req = {"cmd": "world", "ocr": bool(ocr), "objects": bool(objects), "cache": bool(cache)}
    if frame:
        req["frame"] = os.path.abspath(frame)
    if profile:
        req["profile"] = os.path.abspath(profile)
    return daemon_rpc(req, timeout=timeout)


def signature():
    return instrument_signature(REPO_ROOT)


def click_point(bbox):
    """bbox=[x,y,w,h] → 点击点（中心，整数）。"""
    x, y, w, h = [int(v) for v in bbox]
    return [x + w // 2, y + h // 2]


def now_ms():
    return int(time.time() * 1000)
