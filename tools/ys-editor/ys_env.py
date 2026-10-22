#!/usr/bin/env python3
"""ys_env.py — X11 会话环境解析的 Python 侧**唯一入口**（bash 侧对应 `ys-env.sh`）。

存在理由（2026-10-22 用户令「不能总是这样修修补补的，要彻底杜绝这样的不规范」）：
同一条根因「X11 会话环境解析」在 3 周内被独立修了 4 次，每次都只修当时出事的那个工具：

    bf11dfa6  常驻服务启动时 source ys-env.sh（重启后 XAUTHORITY 丢失，px 全线失败）
    4431b48c  ys-capture 自愈 XAUTHORITY（换会话后守护 30min 找不到窗口）
    26b2a96e  win-attrib 自测不 source ys-env.sh（裸跑 3 条假红）
    4946d448  ys-scroll DISPLAY 空串 + XAUTHORITY 缺失 ⇒ 注入静默失败

根因结构：bash 侧有统一入口 `ys-env.sh`（43 个工具 `.` 了它），Python/脚本侧**没有等价物**
—— 19 个调用 xdotool/ydotool 的文件各自从 `os.environ` 读，DISPLAY 缺省写 `:1`，
而 agent shell 里 DISPLAY 可能是**空串**、XAUTHORITY 没设 ⇒ 注入失败但回执只写 `injected:false`。
本文件就是那个缺失的等价物：**规则只有一份，解析只在这里发生**。

解析规则（与 `ys-env.sh` 对齐，两条栈共享 `/tmp/ys-env.cache`，结论一致）：
  1. DISPLAY：继承值非空 → `:1` → `:0`（空串/None 一律兜底为 `:1`，这是 4946d448 那个坑）
  2. XAUTHORITY：运行中的原神/编辑器进程 environ 抄一份 → 继承值 →
     `/run/user/<uid>/xauth_*`（按 mtime 新→旧；本机每会话随机文件名）
  3. YDOTOOL_SOCKET：`/run/user/<uid>/.ydotool_socket`
  4. 可用性判据：`wmctrl -m`（缺 wmctrl 退 `xdotool getdisplaygeometry`）真能连上 X；
     两个探针都不在（无 GUI 的容器）时判「无法验证」，不冒充失败也不冒充成功。
  5. 结果写 `/tmp/ys-env.cache`（与 bash 侧同一格式），下次秒读。

用法（新增工具必须这样写，见 `tools/AGENTS.md`）：
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # 让 ys_env 可导入
    import ys_env
    subprocess.run([...], env=ys_env.env(YS_SLOT_ACTIVE="1"))        # 注入类一律走它
    r = ys_env.resolve(); r.display / r.xauth / r.source             # 需要读数时
    ys_env.require()      # 环境不可用时抛 EnvError（消息可直接给人看）

自检（只读、不占屏）：
    python3 tools/ys-editor/ys_env.py            # 人读诊断
    python3 tools/ys-editor/ys_env.py --json     # 机读诊断
    cd tools/ys-editor && python3 -m ys_env      # 同上

零第三方依赖；导入与解析都不产生副作用（不改 os.environ、不写除缓存外的文件）。
"""
from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
import sys
import time
from typing import Dict, Iterable, List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_SH = os.path.join(HERE, "ys-env.sh")
CACHE_PATH = os.environ.get("YS_ENV_CACHE") or "/tmp/ys-env.cache"
DEFAULT_DISPLAY = ":1"
PROBE_TIMEOUT = 2.0


class EnvError(RuntimeError):
    """X11 环境不可用；`str(e)` 是给人读的一句话（含试过什么、下一步查什么）。"""


class Resolved:
    """一次解析的结论。`env()` 只依赖它，不再二次读 os.environ。"""

    __slots__ = ("ok", "verified", "display", "xauth", "source", "probes", "ms", "notes")

    def __init__(self, ok: bool, verified: bool, display: str, xauth: Optional[str],
                 source: str, probes: int, ms: int, notes: List[str]):
        self.ok = ok
        self.verified = verified
        self.display = display
        self.xauth = xauth
        self.source = source
        self.probes = probes
        self.ms = ms
        self.notes = notes

    @property
    def socket(self) -> str:
        return socket_path()

    def as_dict(self) -> Dict[str, object]:
        return {"ok": self.ok, "verified": self.verified, "display": self.display,
                "xauth": self.xauth, "ydotool_socket": self.socket,
                "source": self.source, "probes": self.probes, "ms": self.ms,
                "cache": CACHE_PATH, "notes": self.notes}

    def __repr__(self) -> str:  # pragma: no cover - 调试用
        return "Resolved(ok=%r display=%r xauth=%r source=%r)" % (
            self.ok, self.display, self.xauth, self.source)


_CACHE: Optional[Resolved] = None


def socket_path() -> str:
    """ydotool 的 socket。空串也当未设（与 ys-env.sh 的 `${VAR:-default}` 一致）。"""
    return os.environ.get("YDOTOOL_SOCKET") or "/run/user/%d/.ydotool_socket" % os.getuid()


def _probe_cmds() -> Iterable[List[str]]:
    for cmd in (["wmctrl", "-m"], ["xdotool", "getdisplaygeometry"]):
        if shutil.which(cmd[0]):
            yield cmd


def _probe(display: str, xauth: Optional[str], notes: List[str]) -> Optional[bool]:
    """True=能连上 X；False=连不上；None=本机**没有探针工具**（无法判定，不冒充失败）。"""
    base = {k: v for k, v in os.environ.items() if k not in ("DISPLAY", "XAUTHORITY")}
    base["DISPLAY"] = display
    if xauth:
        base["XAUTHORITY"] = xauth
    ran = False
    for cmd in _probe_cmds():
        ran = True
        try:
            p = subprocess.run(cmd, env=base, capture_output=True, text=True,
                              timeout=PROBE_TIMEOUT)
        except (OSError, subprocess.TimeoutExpired) as exc:        # noqa: BLE001
            notes.append("%s: %s" % (cmd[0], type(exc).__name__))
            continue
        if p.returncode == 0:
            return True
        err = ((p.stderr or "") + (p.stdout or "")).strip().splitlines()
        notes.append("%s DISPLAY=%s XAUTHORITY=%s rc=%d %s" % (
            cmd[0], display, xauth or "<无>", p.returncode, (err[0][:90] if err else "")))
    return False if ran else None


def _proc_xauth(pid: int) -> Optional[str]:
    try:
        with open("/proc/%d/environ" % pid, "rb") as fh:
            raw = fh.read()
    except OSError:
        return None
    for item in raw.split(b"\0"):
        if item.startswith(b"XAUTHORITY="):
            val = item[len(b"XAUTHORITY="):].decode("utf-8", "replace").strip()
            return val or None
    return None


def _game_pids() -> List[int]:
    """运行中的原神/编辑器进程 —— 它们的 environ 是最权威的会话环境来源。"""
    try:
        p = subprocess.run(["pgrep", "-f", "-u", str(os.getuid()),
                            "YuanShen.exe|BeyondEditor.exe"],
                           capture_output=True, text=True, timeout=2)
    except (OSError, subprocess.TimeoutExpired):
        return []
    return [int(x) for x in (p.stdout or "").split() if x.isdigit()]


def _auth_candidates() -> List[str]:
    out: List[str] = []

    def add(path: Optional[str]) -> None:
        if path and path not in out and os.access(path, os.R_OK):
            out.append(path)

    for pid in _game_pids()[:3]:
        add(_proc_xauth(pid))
    add((os.environ.get("XAUTHORITY") or "").strip() or None)
    paths = glob.glob("/run/user/%d/xauth_*" % os.getuid())
    try:
        paths.sort(key=os.path.getmtime, reverse=True)   # 最新的会话授权优先
    except OSError:
        paths.sort()
    for path in paths:
        add(path)
    return out


def _read_cache() -> Optional[Tuple[str, Optional[str]]]:
    try:
        with open(CACHE_PATH, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return None
    disp, xauth = "", None
    for line in lines:
        if line.startswith("DISPLAY="):
            disp = line[len("DISPLAY="):].strip()
        elif line.startswith("XAUTHORITY="):
            xauth = line[len("XAUTHORITY="):].strip() or None
    return (disp, xauth) if disp else None


def _write_cache(display: str, xauth: Optional[str]) -> None:
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as fh:
            fh.write("DISPLAY=%s\nXAUTHORITY=%s\n" % (display, xauth or ""))
    except OSError:
        pass


def resolve(refresh: bool = False) -> Resolved:
    """解析一次（进程内缓存）。`refresh=True` 强制重来（会话切换后自愈用）。"""
    global _CACHE
    if _CACHE is not None and not refresh:
        return _CACHE
    t0 = time.time()
    notes: List[str] = []
    tried: set = set()
    probes = [0]

    inherited_display = (os.environ.get("DISPLAY") or "").strip()
    inherited_auth = (os.environ.get("XAUTHORITY") or "").strip() or None

    def attempt(display: str, xauth: Optional[str], source: str) -> Optional[Resolved]:
        key = (display, xauth)
        if not display or key in tried:
            return None
        tried.add(key)
        probes[0] += 1
        verdict = _probe(display, xauth, notes)
        if verdict is True:
            ms = int((time.time() - t0) * 1000)
            return Resolved(True, True, display, xauth, source, probes[0], ms, notes)
        if verdict is None:      # 无探针工具：结构上可用，但无法验证
            ms = int((time.time() - t0) * 1000)
            notes.append("本机没有 wmctrl/xdotool 探针，环境未经验证")
            return Resolved(True, False, display, xauth, source + "/unverified",
                            probes[0], ms, notes)
        return None

    # ① 继承环境（绝大多数情况：调用方已经带对了）
    hit = attempt(inherited_display, inherited_auth, "inherited")
    if hit:
        _CACHE = hit
        return hit

    # ② 与 ys-env.sh 共享的缓存
    cached = _read_cache()
    if cached:
        hit = attempt(cached[0], cached[1], "cache")
        if hit:
            _CACHE = hit
            return hit

    # ③ 发现：候选 DISPLAY × 候选 XAUTHORITY，第一个能连上 X 的胜出
    displays: List[str] = []
    for disp in (inherited_display, DEFAULT_DISPLAY, ":0"):
        if disp and disp not in displays:
            displays.append(disp)
    auths: List[Optional[str]] = list(_auth_candidates()) or [None]
    for disp in displays:
        for auth in auths:
            hit = attempt(disp, auth, "discover")
            if hit:
                if hit.verified:
                    _write_cache(hit.display, hit.xauth)
                _CACHE = hit
                return hit

    # ④ 全都不行：给出**可读**结论（不返回空串 DISPLAY，也不静默）
    ms = int((time.time() - t0) * 1000)
    _CACHE = Resolved(False, False, inherited_display or DEFAULT_DISPLAY, inherited_auth,
                      "failed", probes[0], ms, notes)
    return _CACHE


def env(**overrides: object) -> Dict[str, str]:
    """可直接传给 `subprocess.run(env=...)` 的环境。

    · DISPLAY 永远非空（空串/未设 ⇒ 解析结果，解析失败兜底 `:1`）
    · XAUTHORITY 解析到了就显式带上（本机每会话随机文件名，不带就 "Authorization required"）
    · YDOTOOL_SOCKET 缺省 `/run/user/<uid>/.ydotool_socket`
    · 其余继承 os.environ；`overrides` 覆盖之，值为 None 表示**删除该键**
    """
    r = resolve()
    out = dict(os.environ)
    out["DISPLAY"] = r.display or DEFAULT_DISPLAY
    if r.xauth:
        out["XAUTHORITY"] = r.xauth
    out["YDOTOOL_SOCKET"] = socket_path()
    out["YS_ENV_SOURCE"] = r.source
    for key, val in overrides.items():
        if val is None:
            out.pop(key, None)
        else:
            out[key] = str(val)
    return out


def apply() -> Resolved:
    """把解析结果写进**本进程**的 os.environ（给 ctypes/libX11 这类进程内 X 客户端用）。

    子进程一律用 `env()`；只有 in-process（XShmGrabber 抓帧、XQueryPointer 读指针）的
    `XOpenDisplay` 才会从进程环境读 DISPLAY/XAUTHORITY，那时用本函数。
    """
    r = resolve()
    if r.display:
        os.environ["DISPLAY"] = r.display
    if r.xauth:
        os.environ["XAUTHORITY"] = r.xauth
    if not os.environ.get("YDOTOOL_SOCKET"):
        os.environ["YDOTOOL_SOCKET"] = socket_path()
    return r


def explain() -> str:
    """一句人读结论：就绪时给来源，不可用时给「试过什么 + 下一步查什么」。"""
    r = resolve()
    if r.ok:
        return ("X11 环境%s：DISPLAY=%s XAUTHORITY=%s（来源=%s，探测 %d 次/%dms）" % (
            "就绪" if r.verified else "未验证", r.display, r.xauth or "<无>",
            r.source, r.probes, r.ms))
    tail = "；".join(r.notes[-3:]) if r.notes else "无探针输出"
    return ("X11 环境不可用：DISPLAY=%s XAUTHORITY=%s —— 试过 %d 个组合仍连不上 X（%s）。"
            "下一步：看 /run/user/%d/xauth_* 是否存在，或跑 `bash %s --print` 看 bash 侧结论" % (
                r.display, r.xauth or "<无>", r.probes, tail, os.getuid(), ENV_SH))


def require() -> Resolved:
    """环境不可用就抛 EnvError（消息可直接打印给用户）。"""
    r = resolve()
    if not r.ok:
        raise EnvError(explain())
    return r


def diagnose(refresh: bool = False) -> Dict[str, object]:
    r = resolve(refresh=refresh)
    d = r.as_dict()
    d["explain"] = explain()
    return d


def main(argv: Optional[List[str]] = None) -> int:
    import argparse
    ap = argparse.ArgumentParser(
        description="X11 会话环境诊断（ys_env.py）：DISPLAY / XAUTHORITY / YDOTOOL_SOCKET 的唯一解析入口")
    ap.add_argument("--json", action="store_true", help="机读输出")
    ap.add_argument("--refresh", action="store_true", help="忽略进程内缓存，重新解析")
    ap.add_argument("--quiet", action="store_true", help="只设退出码，不打印（环境不可用时 sql 仍打印）")
    a = ap.parse_args(argv)
    info = diagnose(refresh=a.refresh)
    if not a.quiet or not info["ok"]:
        if a.json:
            print(json.dumps(info, ensure_ascii=False, indent=2))
        else:
            print(info["explain"])
            print("  cache=%s  probes=%d  ms=%d" % (info["cache"], info["probes"], info["ms"]))
    return 0 if info["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
