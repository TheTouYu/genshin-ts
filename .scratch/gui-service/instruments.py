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
YS_SCROLL = os.path.join(YS_EDITOR, "ys-scroll")
YS_WATCH = os.path.join(REPO_ROOT, "tools", "ys-watch")
YS_DETAIL = os.path.join(REPO_ROOT, "tools", "ys-detail")
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
                "10": "FORMAT_NOT_READY", "11": "COPY_FAILED", "1": "BAD_ARG",
                # 12：守护是 window 模式、帧是后台帧，但调用方没显式 --allow-background
                # （后台帧必须由调用方声明；默认拒绝，防止上层把后台帧当可见画面去动作）
                "12": "BACKGROUND_NOT_ALLOWED"}


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
        # 2026-10-22：用户在别的虚拟桌面时（游戏 ds=3、当前 ds=2），只读感知仍要能取到游戏画面。
        # 默认仍拒（避免把"用户看不见的画面"当成所见）；显式环境变量才放行。
        if os.environ.get("YS_CAPTURE_ALLOW_OTHER_DESKTOP") == "1":
            cmd.append("--allow-other-desktop")
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


DAEMON_RPC_TIMEOUT = float(os.environ.get("YS_DAEMON_RPC_TIMEOUT", "60"))


def daemon_rpc(req, *, timeout=None):
    """裸 socket 调 ys-lookd（一行 JSON 请求/响应）。失败抛 InstrumentError（fail-closed）。

    2026-10-21（F-20261021-LOOKD-WEDGE 的客户端半边）：默认上界从 180s 收到 60s，
    并把**超时单独成类**（DAEMON_TIMEOUT）。事故形态是「服务端被一个卡住的请求钉死 ⇒
    后来者排队 ⇒ 客户端 180s 静默」，报错若只说 TimeoutError，排查者根本不知道该看服务。
    """
    import socket
    timeout = DAEMON_RPC_TIMEOUT if timeout is None else timeout
    if not os.path.exists(LOOKD_SOCK):
        raise InstrumentError("DAEMON_UNAVAILABLE", f"常驻服务 socket 不存在：{LOOKD_SOCK}")
    t0 = time.time()
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
    except socket.timeout:
        raise InstrumentError(
            "DAEMON_TIMEOUT",
            f"常驻服务 {timeout:g}s 内没有回包（cmd={req.get('cmd')}，socket={LOOKD_SOCK}，"
            f"已等 {time.time() - t0:.1f}s）。常见原因：ys-lookd 被某个卡住的请求钉死（单线程串行）。"
            f"排查：systemctl --user status ys-lookd；恢复：systemctl --user restart ys-lookd")
    except (OSError, ValueError) as exc:
        raise InstrumentError("DAEMON_FAILED", f"常驻服务调用失败：{type(exc).__name__}: {exc}")
    if isinstance(out, dict) and out.get("error"):
        _code = out.get("code") or "DAEMON_ERROR"
        _detail = f"常驻服务报错：{str(out.get('error'))[:300]}"
        if "ATTRIBUTION" in _code or "OTHER_DESKTOP" in _code or "OTHER_DESKTOP" in str(out.get("error")):
            _detail += _cross_desktop_suffix()
        raise InstrumentError(_code, _detail)
    return out


def _cross_desktop_suffix():
    """归属失败时补「窗口在哪张桌面 / 你在哪张 / 下一步」——复用 ys-lease 的唯一实现，不在这里重算。"""
    try:
        import subprocess as _sp
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .scratch/
        tool = os.path.join(os.path.dirname(here), "tools", "ys-editor", "ys-lease")
        r = _sp.run([tool, "resolve-window"], capture_output=True, text=True, timeout=20)
        d = json.loads((r.stdout or "{}").strip().splitlines()[-1])
        st = d.get("state") or {}
        if st.get("found"):
            # 2026-10-21 修正口径：桌面借用已并入会话授权（ys-session begin 内部会 grant 并按需切桌面），
            # 不再教调用方手搓 YS_ALLOW_DESKTOP_SWITCH / 请用户拖窗口（那是旧契约的写法）。
            return (f"；窗口在桌面 ds={st.get('window_desktop')}、当前 ds={st.get('current_desktop')}"
                    f" ⇒ 只感知不动作：加 --allow-background 读后台帧；"
                    f"要在可见层操作： ys-session begin --task ... --user-said '<用户原话>'"
                    f"（会话授权内含桌面借用，end 自动切回）；只读核对桌面： ys-wins --attrib")
    except Exception:                                            # noqa: BLE001
        pass
    return ""


def get_world_daemon(frame=None, *, profile=None, ocr=True, objects=True,
                     structure=True, cache=True, apply_uid=False, timeout=180,
                     advice=True, allow_background=False):
    """世界状态仪器（ys-lookd cmd=world，**新版服务才有**；旧服务会报 unknown cmd）。

    structure=False 是 2026-10-21 新增的快速路径（跳过 D2 检测 + D3 结构层）；
    请求里显式给 `structure` 键，旧服务会忽略未知键、语义仍是全量。
    """
    req = {"cmd": "world", "ocr": bool(ocr), "objects": bool(objects),
           "structure": bool(structure), "cache": bool(cache),
           "advice": bool(advice)}
    if allow_background:
        # 2026-10-21：以前这个 flag 在 daemon 后端被**静默吞掉**（客户端收、守护不知道），
        # 代理会以为自己读的是后台帧其实是 fail-closed。现在原样转发，由守护决定是否放行，
        # 并在回执 attribution.allow_background 里如实标注。
        req["allow_background"] = True
    if apply_uid:
        # 帧来自文件但内容是活体抓帧 ⇒ 仍做 UID 本体态补判（与 ys-state 同判据）
        req["apply_uid"] = True
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


# ═══════════════════════════════════════════════════════════════
# 2026-10-19：act 的语义期待所需仪器（滚动注入 / 变化事件 / 局部下钻）
# 纪律：判据不在这里——滚动注入走 ys-scroll，变化事件走 ys-watch，界面态走 ys-state，
# 局部图走 ys-detail。本文件只做「调用 + 解析 + 失败出声」。
# ═══════════════════════════════════════════════════════════════

def parse_json_doc(stdout, *, what):
    """解析工具输出：优先整段 JSON（有些工具 pretty-print），退化为最后一行 JSON。"""
    text = (stdout or "").strip()
    if not text:
        raise InstrumentError("EMPTY_OUTPUT", f"{what}：stdout 为空")
    try:
        return json.loads(text)
    except ValueError:
        return parse_json_line(stdout, what=what)


def _ocr_env():
    """ys-watch / ys-detail 的 OCR 环境。

    YS_WATCH_OCR_DAEMON=1：让 ys-watch 优先走常驻 ys-lookd 的 OCR（2026-10-21 实测：
    子进程 ys_ocr 每次 1–3s，daemon 热 45ms 级）；不可用时它自己回退本地子进程。
    YS_OCR_CPU：沙箱/无 GPU 环境强制走 CPU（否则 ORT 的 EP 错误会污染 stdout）。
    """
    env = {"YS_WATCH_OCR_DAEMON": "1"}
    try:
        if not os.path.exists("/dev/nvidia0"):
            env["YS_OCR_CPU"] = "1"
    except OSError:
        env["YS_OCR_CPU"] = "1"
    return env


def inject_scroll(x, y, *, clicks=3, direction="down", drag=0, lease=True, timeout=180):
    """滚动注入：走 `ys-scroll`（它自己走 ys-gui-slot/租约；绝不裸调 xdotool）。

    **G6 通道自选且透明（2026-10-21 复盘）**：`--lease` 快（~30ms）但走的是裸注入，
    槽内 shim 会拦下 ⇒ `ok:false` 而调用方常看漏；槽位模式慢（~2s）但可靠。
    以前写死 lease，结果真机上一路静默无效、我又去手搓 gdbus。
    现在：**先 lease，失败自动退到 slot**，并在回执里明写 `channel` 与 `attempts`。
    """
    import os as _os
    base = [YS_SCROLL, "--at", "%d,%d" % (int(x), int(y)),
            "--clicks", str(max(1, int(clicks))), "--dir", direction,
            # ys-scroll **总是**输出 JSON，没有 --json 参数（传了会 rc=2 usage error）
            "--no-verify"]
    if drag:
        base += ["--drag", str(int(drag))]
    in_slot = bool(_os.environ.get("YS_SLOT_ACTIVE"))
    channels = ["slot"] if (in_slot or not lease) else ["lease", "slot"]
    attempts = []
    last = {"rc": None, "result": {}, "stdout_tail": "", "stderr_tail": ""}
    for ch in channels:
        cmd = list(base) + ([] if ch == "slot" else ["--lease"])
        rc, out, err = run(cmd, timeout=timeout, env_extra=_ocr_env())
        res = {}
        try:
            res = parse_json_doc(out, what="ys-scroll") if out.strip() else {}
        except InstrumentError:
            res = {}
        ok = (res.get("ok") is not False) and rc == 0
        attempts.append({"channel": ch, "rc": rc, "ok": res.get("ok"),
                         "ms": res.get("ms"), "moved": res.get("moved_confirmed")})
        last = {"rc": rc, "result": res, "stdout_tail": _tail(out, 600),
                "stderr_tail": _tail(err, 400)}
        if ok:
            last.update({"channel": ch, "attempts": attempts})
            return last
    last.update({"channel": None, "attempts": attempts})
    return last



_WATCH_CACHE = {}          # (帧a指纹, 帧b指纹, roi, no_ocr, debug) → (pair, stderr)
_WATCH_CACHE_MAX = 32


def _frame_fp(path):
    """帧指纹：路径 + mtime_ns + size（与 worldsvc._sb_cached / cache.py 同一套口径）。"""
    try:
        st = os.stat(path)
        return (os.path.abspath(path), st.st_mtime_ns, st.st_size)
    except OSError:
        return (os.path.abspath(path), None, None)


def watch_region(before, after, region, *, no_ocr=False, debug=True, timeout=300):
    """变化事件层：一律调 `tools/ys-watch`（不自己写帧差/文本差判据）。

    2026-10-22 记忆化（用户令「回归太慢，每次一个看影响最大的」）：
    实测 selftest 一次跑里 ys-watch 被调 **12 次，只有 4 种 (帧对 × ROI)**——
    同一份静态帧 + 同一个 ROI 重算是纯浪费（13.6s → ~4.5s）。
    判据安全：ys-watch 的输入就是这两个文件，指纹含 mtime_ns（活体每次抓帧都会变）
    ⇒ 生产轮询路径不会命中旧结果；活帧重写必然换 key。
    """
    key = (_frame_fp(before), _frame_fp(after),
           tuple(int(v) for v in region), bool(no_ocr), bool(debug))
    hit = _WATCH_CACHE.get(key)
    if hit is not None:
        pair, err, _ms = hit
        _WATCH_CACHE[key] = (pair, err, _ms)
        return pair, err
    roi = ",".join(str(int(v)) for v in region)
    cmd = [YS_WATCH, "--frames", os.path.abspath(before), os.path.abspath(after),
           "--roi", roi, "--json"]
    if no_ocr:
        cmd.append("--no-ocr")
    if debug:
        cmd.append("--debug")
    rc, out, err = run(cmd, timeout=timeout, env_extra=_ocr_env())
    if rc != 0:
        raise InstrumentError("WATCH_FAILED", f"ys-watch rc={rc}：{_tail(err, 500)}",
                              rc=rc, stderr_tail=_tail(err, 800))
    d = parse_json_doc(out, what="ys-watch")
    pairs = d.get("pairs") or []
    if not pairs:
        raise InstrumentError("WATCH_BAD", f"ys-watch 回执无 pairs：{str(d)[:300]}")
    if len(_WATCH_CACHE) >= _WATCH_CACHE_MAX:
        _WATCH_CACHE.pop(next(iter(_WATCH_CACHE)))
    _WATCH_CACHE[key] = (pairs[0], err, 0.0)
    return pairs[0], err


def detail_image(frame, region, out, *, scale=1.0, ocr=True, timeout=240):
    """局部下钻图：`tools/ys-detail`（只裁这一块 + 框内 OCR）。"""
    cmd = [YS_DETAIL, "--frame", os.path.abspath(frame), "--out", os.path.abspath(out),
           "--scale", str(scale), "--json"]
    if region:
        cmd += ["--bbox", ",".join(str(int(v)) for v in region)]
    else:
        cmd += ["--at", "1280,720", "--pad", "320"]
    if ocr:
        cmd.append("--ocr")
    rc, so, se = run(cmd, timeout=timeout, env_extra=_ocr_env())
    res = {}
    try:
        res = parse_json_doc(so, what="ys-detail") if so.strip() else {}
    except InstrumentError:
        res = {}
    return {"rc": rc, "result": res, "stderr_tail": _tail(se, 400)}


def copy_frame(src, dst):
    import shutil
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    shutil.copy2(src, dst)
    return dst


def ocr_boxes(frame, *, timeout=120):
    """整帧 OCR → 框列表（带 cx/cy，屏幕坐标）。给「只在 free_text、无归属容器」的目标补坐标用。

    走常驻服务的 `cmd=ocr`（引擎已热，~0.6s）；服务不可用才回退子进程 ys_ocr。
    """
    if not frame or not os.path.exists(frame):
        return []
    try:
        r = daemon_rpc({"cmd": "ocr", "frame": os.path.abspath(frame)}, timeout=timeout)
        if isinstance(r, dict) and isinstance(r.get("boxes"), list) and not r.get("error"):
            return r["boxes"]
    except InstrumentError:
        pass
    try:
        rc, out, err = run([sys.executable, os.path.join(YS_EDITOR, "ys_ocr.py"),
                            "ocr", os.path.abspath(frame), "--json"],
                           timeout=timeout, env_extra=_ocr_env())
        if rc != 0:
            return []
        doc = parse_json_doc(out, what="ys_ocr")
        return doc.get("boxes") or []
    except InstrumentError:
        return []
