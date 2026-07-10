"""本地电脑控制 HTTP 服务（Windows）。

从 BeyondEditor 采样工作流中沉淀的通用桌面自动化服务：窗口枚举/管理、鼠标键盘注入、
截图（整屏/窗口/区域）、剪贴板、像素取色。供 AI 代理或脚本通过 HTTP 编程控制本机 UI。

启动（控制管理员权限窗口时，必须在管理员 PowerShell 中运行）：
    python scripts/tools/computer_control_server.py [--port 8765] [--screenshot-dir DIR]
    或 npm run tool:computer-control

仅绑定 127.0.0.1。依赖：Python 3.10+；截图优先用 Pillow（pip install pillow），缺失时回退 GDI。

端点总览：
    GET  /health                 服务状态（版本/管理员/虚拟屏/前台窗口）
    GET  /windows[?query=子串]   可见窗口列表（hwnd/pid/title/rect）
    GET  /window?target=标题     单窗口详情（rect/clientRect/前台/最小化）
    POST /window                 {"target":..,"op":"focus|minimize|maximize|restore|move|resize|topmost|notopmost",
                                  "x":..,"y":..,"w":..,"h":..}
    GET  /cursor                 当前鼠标位置
    GET  /pixel?x=..&y=..        屏幕坐标像素颜色（十六进制 RGB）
    GET  /clipboard              读文本剪贴板
    POST /clipboard              {"text":"..."} 写文本剪贴板
    GET  /screenshot             ?target=标题&mode=window|screen&coords=window|client|screen
                                 &x=&y=&w=&h=（区域裁剪）&focus=0（不抢焦点，transient UI 必用）
    POST /action                 见下方动作列表

/action 通用字段：
    target   窗口标题（精确优先、子串兜底）；"*" 表示不聚焦任何窗口（操作弹层/下拉等 transient UI 必用）
    coords   "window"（默认，相对窗口外框）| "client"（相对客户区）| "screen"（屏幕绝对坐标）
    delayMs / postMs   动作前/后等待毫秒
    modifiers          ["ctrl","shift","alt","win"]，动作期间按住（支持 click/drag/scroll 类）

动作列表：
    click / doubleclick / rightclick / middleclick   {"x":..,"y":..}
    mousedown / mouseup      {"x":..,"y":..,"button":"left|right|middle"} 自由组合长按拖放
    move                     {"x":..,"y":..}
    scroll / hscroll         {"x":..,"y":..,"amount":格数}（负数=向下/向左）
    drag                     {"fromX":..,"fromY":..,"toX":..,"toY":..,"button":"left|right",
                              "steps":30,"durationMs":500}
    key                      {"key":"ctrl+a"} 组合键一次按下抬起
    keys                     {"keys":["ctrl+a","backspace","esc"]} 按序执行多个组合键
    keydown / keyup          {"key":"ctrl"} 按住/释放（配合自由组合）
    text                     {"text":"任意 Unicode 文本"} 直接注入（无需剪贴板）
    batch                    {"actions":[{...},{...}]} 单请求顺序执行多个动作（不可嵌套 batch）

已验证的编辑器实操经验（BeyondEditor / 千星沙箱）：
    - 下拉/右键菜单等 transient UI：动作 target 用 "*"，截图加 focus=0，否则重新聚焦会关闭弹层。
    - 节点库搜索框会保留上次输入：先 keys ["ctrl+a","backspace"] 再 text；禁止回车（会建默认项），要点击结果行。
    - 画布平移用右键 drag；滚轮在画布上是缩放，慎用。
    - 窗口会被用户移动/缩放：每轮会话开始先 GET /windows 重取 rect。
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import time
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

SERVER_VERSION = "ComputerControlServer/2.0"
HOST_DEFAULT = "127.0.0.1"
PORT_DEFAULT = 8765
SCREENSHOT_DIR_DEFAULT = Path(r"C:\tmp\beyond_admin_input_screenshots")
screenshot_dir = SCREENSHOT_DIR_DEFAULT

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
gdi32 = ctypes.windll.gdi32
shell32 = ctypes.windll.shell32

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        user32.SetProcessDPIAware()
    except Exception:
        pass

# 64 位句柄/指针必须显式声明原型，否则 ctypes 默认按 32 位 int 截断
kernel32.GlobalAlloc.restype = ctypes.c_void_p
kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
kernel32.GlobalLock.restype = ctypes.c_void_p
kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
kernel32.GlobalFree.argtypes = [ctypes.c_void_p]
user32.GetClipboardData.restype = ctypes.c_void_p
user32.SetClipboardData.restype = ctypes.c_void_p
user32.SetClipboardData.argtypes = [wintypes.UINT, ctypes.c_void_p]


EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

SW_RESTORE = 9
SW_MINIMIZE = 6
SW_MAXIMIZE = 3
VK_MENU = 0x12
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_SHOWWINDOW = 0x0040
HWND_TOPMOST = wintypes.HWND(-1)
HWND_NOTOPMOST = wintypes.HWND(-2)

INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000
MOUSEEVENTF_VIRTUALDESK = 0x4000
MOUSEEVENTF_ABSOLUTE = 0x8000
WHEEL_DELTA = 120
SRCCOPY = 0x00CC0020
SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79
CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002

KEY_ALIASES = {
    "return": 0x0D,
    "enter": 0x0D,
    "escape": 0x1B,
    "esc": 0x1B,
    "tab": 0x09,
    "space": 0x20,
    "backspace": 0x08,
    "delete": 0x2E,
    "insert": 0x2D,
    "left": 0x25,
    "up": 0x26,
    "right": 0x27,
    "down": 0x28,
    "home": 0x24,
    "end": 0x23,
    "pageup": 0x21,
    "pagedown": 0x22,
    "shift": 0x10,
    "ctrl": 0x11,
    "control": 0x11,
    "alt": 0x12,
    "win": 0x5B,
    "capslock": 0x14,
    "printscreen": 0x2C,
    "minus": 0xBD,
    "plus": 0xBB,
    "comma": 0xBC,
    "period": 0xBE,
    **{f"f{i}": 0x6F + i for i in range(1, 13)},
    **{f"numpad{i}": 0x60 + i for i in range(10)},
}

BUTTON_FLAGS = {
    "left": (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    "right": (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
    "middle": (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
}


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_long),
        ("dy", ctypes.c_long),
        ("mouseData", ctypes.c_ulong),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_ushort),
        ("wScan", ctypes.c_ushort),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("union",)
    _fields_ = [("type", ctypes.c_ulong), ("union", INPUT_UNION)]


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", ctypes.c_uint32),
        ("biWidth", ctypes.c_long),
        ("biHeight", ctypes.c_long),
        ("biPlanes", ctypes.c_ushort),
        ("biBitCount", ctypes.c_ushort),
        ("biCompression", ctypes.c_uint32),
        ("biSizeImage", ctypes.c_uint32),
        ("biXPelsPerMeter", ctypes.c_long),
        ("biYPelsPerMeter", ctypes.c_long),
        ("biClrUsed", ctypes.c_uint32),
        ("biClrImportant", ctypes.c_uint32),
    ]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", ctypes.c_uint32 * 3)]


def send_json(handler: BaseHTTPRequestHandler, status: int, data: dict[str, Any]) -> None:
    body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def parse_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8-sig"))


# ---------------------------------------------------------------------------
# Windows
# ---------------------------------------------------------------------------


def enum_windows(query: str | None = None) -> list[dict[str, Any]]:
    windows: list[dict[str, Any]] = []

    def cb(hwnd: int, _: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value
        if not title:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        windows.append(
            {
                "hwnd": int(hwnd),
                "pid": int(pid.value),
                "title": title,
                "rect": [int(rect.left), int(rect.top), int(rect.right), int(rect.bottom)],
            }
        )
        return True

    user32.EnumWindows(EnumWindowsProc(cb), 0)
    if query:
        needle = query.lower()
        windows = [w for w in windows if needle in str(w["title"]).lower()]
    return windows


def find_window(title: str) -> int:
    exact = [item for item in enum_windows() if item["title"] == title]
    if exact:
        return int(exact[0]["hwnd"])
    target = title.lower()
    fuzzy = [item for item in enum_windows() if target in str(item["title"]).lower()]
    return int(fuzzy[0]["hwnd"]) if fuzzy else 0


def get_rect(hwnd: int) -> wintypes.RECT:
    rect = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        raise RuntimeError("GetWindowRect failed")
    return rect


def window_detail(hwnd: int) -> dict[str, Any]:
    rect = get_rect(hwnd)
    client = wintypes.RECT()
    user32.GetClientRect(hwnd, ctypes.byref(client))
    origin = wintypes.POINT(0, 0)
    user32.ClientToScreen(hwnd, ctypes.byref(origin))
    length = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return {
        "hwnd": int(hwnd),
        "pid": int(pid.value),
        "title": buf.value,
        "rect": [int(rect.left), int(rect.top), int(rect.right), int(rect.bottom)],
        "clientOrigin": [int(origin.x), int(origin.y)],
        "clientSize": [int(client.right), int(client.bottom)],
        "isForeground": int(user32.GetForegroundWindow()) == int(hwnd),
        "isMinimized": bool(user32.IsIconic(hwnd)),
    }


def force_foreground(hwnd: int) -> None:
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.keybd_event(VK_MENU, 0, 0, 0)
    user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)
    if not user32.SetForegroundWindow(hwnd):
        flags = SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW
        user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, flags)
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.08)
        user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, flags)
        user32.SetForegroundWindow(hwnd)
    time.sleep(0.15)


def handle_window_op(payload: dict[str, Any]) -> dict[str, Any]:
    target = str(payload.get("target", ""))
    hwnd = find_window(target)
    if not hwnd:
        return {"ok": False, "error": "window not found", "windows": enum_windows()}
    op = str(payload.get("op", "focus")).lower()
    rect = get_rect(hwnd)
    if op == "focus":
        force_foreground(hwnd)
    elif op == "minimize":
        user32.ShowWindow(hwnd, SW_MINIMIZE)
    elif op == "maximize":
        user32.ShowWindow(hwnd, SW_MAXIMIZE)
    elif op == "restore":
        user32.ShowWindow(hwnd, SW_RESTORE)
    elif op in ("move", "resize"):
        x = int(payload.get("x", rect.left))
        y = int(payload.get("y", rect.top))
        w = int(payload.get("w", rect.right - rect.left))
        h = int(payload.get("h", rect.bottom - rect.top))
        if not user32.MoveWindow(hwnd, x, y, w, h, True):
            raise RuntimeError("MoveWindow failed")
    elif op == "topmost":
        user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW)
    elif op == "notopmost":
        user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW)
    else:
        raise ValueError(f"unknown window op: {op}")
    return {"ok": True, "op": op, "window": window_detail(hwnd)}


# ---------------------------------------------------------------------------
# Input injection
# ---------------------------------------------------------------------------


def send_inputs(inputs: list[INPUT]) -> None:
    count = len(inputs)
    if count == 0:
        return
    arr = (INPUT * count)(*inputs)
    sent = user32.SendInput(count, ctypes.byref(arr), ctypes.sizeof(INPUT))
    if int(sent) != count:
        raise RuntimeError(f"SendInput failed: sent={int(sent)} expected={count}")


def virtual_screen_metrics() -> tuple[int, int, int, int]:
    left = int(user32.GetSystemMetrics(SM_XVIRTUALSCREEN))
    top = int(user32.GetSystemMetrics(SM_YVIRTUALSCREEN))
    width = int(user32.GetSystemMetrics(SM_CXVIRTUALSCREEN))
    height = int(user32.GetSystemMetrics(SM_CYVIRTUALSCREEN))
    if width <= 0 or height <= 0:
        return 0, 0, int(user32.GetSystemMetrics(0)), int(user32.GetSystemMetrics(1))
    return left, top, width, height


def normalized_absolute(x: int, y: int) -> tuple[int, int]:
    left, top, width, height = virtual_screen_metrics()
    abs_x = int((int(x) - left) * 65535 / max(1, width - 1))
    abs_y = int((int(y) - top) * 65535 / max(1, height - 1))
    return abs_x, abs_y


def mouse_input(flags: int, x: int = 0, y: int = 0, data: int = 0) -> INPUT:
    item = INPUT()
    item.type = INPUT_MOUSE
    item.mi.dx = int(x)
    item.mi.dy = int(y)
    item.mi.mouseData = ctypes.c_ulong(int(data) & 0xFFFFFFFF)
    item.mi.dwFlags = int(flags)
    item.mi.time = 0
    item.mi.dwExtraInfo = None
    return item


def key_input(vk: int, flags: int = 0, scan: int = 0) -> INPUT:
    item = INPUT()
    item.type = INPUT_KEYBOARD
    item.ki.wVk = int(vk)
    item.ki.wScan = int(scan)
    item.ki.dwFlags = int(flags)
    item.ki.time = 0
    item.ki.dwExtraInfo = None
    return item


def send_mouse_move(x: int, y: int) -> None:
    abs_x, abs_y = normalized_absolute(x, y)
    flags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
    send_inputs([mouse_input(flags, abs_x, abs_y)])


def button_flags(button: str) -> tuple[int, int]:
    flags = BUTTON_FLAGS.get(str(button).lower())
    if not flags:
        raise ValueError(f"unknown mouse button: {button}")
    return flags


def send_mouse_click(x: int, y: int, button: str) -> None:
    down_flag, up_flag = button_flags(button)
    pre_down, between = (0.05, 0.06) if button != "left" else (0.01, 0.01)
    send_mouse_move(x, y)
    time.sleep(pre_down)
    send_inputs([mouse_input(down_flag)])
    time.sleep(between)
    send_inputs([mouse_input(up_flag)])


def send_mouse_wheel(x: int, y: int, notches: float, horizontal: bool = False) -> None:
    send_mouse_move(x, y)
    time.sleep(0.02)
    flag = MOUSEEVENTF_HWHEEL if horizontal else MOUSEEVENTF_WHEEL
    send_inputs([mouse_input(flag, data=int(float(notches) * WHEEL_DELTA))])


def send_mouse_drag(
    from_x: int,
    from_y: int,
    to_x: int,
    to_y: int,
    *,
    button: str,
    steps: int,
    duration_ms: int,
) -> None:
    down_flag, up_flag = button_flags(button)
    total_steps = max(1, int(steps))
    per_step_sleep = max(0.0, float(duration_ms) / 1000.0 / float(total_steps))
    send_mouse_move(int(from_x), int(from_y))
    time.sleep(0.05)
    send_inputs([mouse_input(down_flag)])
    time.sleep(0.05)
    for index in range(1, total_steps + 1):
        ratio = float(index) / float(total_steps)
        x = int(round(float(from_x) + (float(to_x) - float(from_x)) * ratio))
        y = int(round(float(from_y) + (float(to_y) - float(from_y)) * ratio))
        send_mouse_move(x, y)
        if per_step_sleep > 0:
            time.sleep(per_step_sleep)
    time.sleep(0.05)
    send_inputs([mouse_input(up_flag)])


def resolve_point(payload: dict[str, Any], hwnd: int | None) -> tuple[int, int, list[int] | None]:
    x = int(payload.get("x", 0))
    y = int(payload.get("y", 0))
    coords = str(payload.get("coords", "window")).lower()
    rect_list = None
    if coords == "screen" or hwnd is None:
        return x, y, rect_list
    if coords == "client":
        point = wintypes.POINT(x, y)
        if not user32.ClientToScreen(int(hwnd), ctypes.byref(point)):
            raise RuntimeError("ClientToScreen failed")
        return int(point.x), int(point.y), rect_list
    rect = get_rect(int(hwnd))
    rect_list = [int(rect.left), int(rect.top), int(rect.right), int(rect.bottom)]
    return int(rect.left) + x, int(rect.top) + y, rect_list


def resolve_named_point(payload: dict[str, Any], hwnd: int | None, x_key: str, y_key: str) -> tuple[int, int]:
    copied = dict(payload)
    copied["x"] = int(payload.get(x_key, payload.get("x", 0)))
    copied["y"] = int(payload.get(y_key, payload.get("y", 0)))
    x, y, _rect = resolve_point(copied, hwnd)
    return x, y


def parse_key_chord(name: str) -> list[int]:
    parts = [part.strip().lower() for part in str(name).replace("+", " ").split() if part.strip()]
    if not parts:
        raise ValueError("empty key")
    keys: list[int] = []
    for part in parts:
        if part in KEY_ALIASES:
            keys.append(KEY_ALIASES[part])
        elif len(part) == 1:
            keys.append(user32.VkKeyScanW(ord(part)) & 0xFF)
        else:
            raise ValueError(f"unsupported key: {part}")
    return keys


def press_key(name: str) -> None:
    keys = parse_key_chord(name)
    inputs: list[INPUT] = []
    for vk in keys:
        inputs.append(key_input(vk))
    for vk in reversed(keys):
        inputs.append(key_input(vk, KEYEVENTF_KEYUP))
    send_inputs(inputs)


def hold_keys(name: str, down: bool) -> None:
    inputs = [key_input(vk, 0 if down else KEYEVENTF_KEYUP) for vk in parse_key_chord(name)]
    if not down:
        inputs.reverse()
    send_inputs(inputs)


def type_text(text: str, per_char_delay_ms: int = 0) -> None:
    if per_char_delay_ms > 0:
        for ch in str(text):
            scan = ord(ch)
            send_inputs(
                [
                    key_input(0, KEYEVENTF_UNICODE, scan),
                    key_input(0, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, scan),
                ]
            )
            time.sleep(per_char_delay_ms / 1000.0)
        return
    inputs: list[INPUT] = []
    for ch in str(text):
        scan = ord(ch)
        inputs.append(key_input(0, KEYEVENTF_UNICODE, scan))
        inputs.append(key_input(0, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, scan))
    send_inputs(inputs)


# ---------------------------------------------------------------------------
# Clipboard / cursor / pixel
# ---------------------------------------------------------------------------


def clipboard_get() -> str:
    if not user32.OpenClipboard(0):
        raise RuntimeError("OpenClipboard failed")
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            return ""
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            raise RuntimeError("GlobalLock failed")
        try:
            return ctypes.wstring_at(pointer)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def clipboard_set(text: str) -> None:
    data = str(text)
    size = (len(data) + 1) * ctypes.sizeof(ctypes.c_wchar)
    handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, size)
    if not handle:
        raise RuntimeError("GlobalAlloc failed")
    pointer = kernel32.GlobalLock(handle)
    if not pointer:
        kernel32.GlobalFree(handle)
        raise RuntimeError("GlobalLock failed")
    ctypes.memmove(pointer, ctypes.create_unicode_buffer(data), size)
    kernel32.GlobalUnlock(handle)
    if not user32.OpenClipboard(0):
        kernel32.GlobalFree(handle)
        raise RuntimeError("OpenClipboard failed")
    try:
        user32.EmptyClipboard()
        if not user32.SetClipboardData(CF_UNICODETEXT, handle):
            kernel32.GlobalFree(handle)
            raise RuntimeError("SetClipboardData failed")
    finally:
        user32.CloseClipboard()


def cursor_position() -> tuple[int, int]:
    point = wintypes.POINT()
    if not user32.GetCursorPos(ctypes.byref(point)):
        raise RuntimeError("GetCursorPos failed")
    return int(point.x), int(point.y)


def pixel_color(x: int, y: int) -> str:
    dc = user32.GetDC(0)
    if dc == 0:
        raise RuntimeError("GetDC failed")
    try:
        colorref = gdi32.GetPixel(dc, int(x), int(y))
        if colorref == 0xFFFFFFFF:
            raise RuntimeError("GetPixel failed (point off-screen?)")
        r = colorref & 0xFF
        g = (colorref >> 8) & 0xFF
        b = (colorref >> 16) & 0xFF
        return f"#{r:02x}{g:02x}{b:02x}"
    finally:
        user32.ReleaseDC(0, dc)


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


def handle_action(payload: dict[str, Any], *, allow_batch: bool = True) -> dict[str, Any]:
    delay_ms = int(payload.get("delayMs") or payload.get("delayms") or 0)
    if delay_ms > 0:
        time.sleep(delay_ms / 1000.0)

    action = str(payload.get("action", "rightclick")).lower()

    if action == "batch":
        if not allow_batch:
            raise ValueError("nested batch is not allowed")
        actions = payload.get("actions")
        if not isinstance(actions, list) or not actions:
            raise ValueError("batch requires non-empty actions array")
        results = []
        for item in actions:
            results.append(handle_action(dict(item), allow_batch=False))
        return {"ok": True, "action": "batch", "results": results}

    target = str(payload.get("target", "千星沙箱"))
    hwnd = None
    if target and target not in ("*", "none", "None"):
        found = find_window(target)
        if not found:
            return {"ok": False, "error": "window not found", "windows": enum_windows()}
        hwnd = int(found)
        force_foreground(hwnd)

    x, y, rect = resolve_point(payload, hwnd)
    modifiers = payload.get("modifiers") or []

    for mod in modifiers:
        hold_keys(str(mod), True)
    try:
        if action == "click":
            send_mouse_click(x, y, str(payload.get("button", "left")))
        elif action == "doubleclick":
            send_mouse_click(x, y, "left")
            send_mouse_click(x, y, "left")
        elif action == "rightclick":
            send_mouse_click(x, y, "right")
        elif action == "middleclick":
            send_mouse_click(x, y, "middle")
        elif action == "mousedown":
            down_flag, _ = button_flags(str(payload.get("button", "left")))
            send_mouse_move(x, y)
            time.sleep(0.03)
            send_inputs([mouse_input(down_flag)])
        elif action == "mouseup":
            _, up_flag = button_flags(str(payload.get("button", "left")))
            send_mouse_move(x, y)
            time.sleep(0.03)
            send_inputs([mouse_input(up_flag)])
        elif action == "move":
            send_mouse_move(x, y)
        elif action == "scroll":
            send_mouse_wheel(x, y, float(payload.get("amount", -5)))
        elif action == "hscroll":
            send_mouse_wheel(x, y, float(payload.get("amount", -5)), horizontal=True)
        elif action == "drag":
            from_x, from_y = resolve_named_point(payload, hwnd, "fromX", "fromY")
            to_x, to_y = resolve_named_point(payload, hwnd, "toX", "toY")
            send_mouse_drag(
                from_x,
                from_y,
                to_x,
                to_y,
                button=str(payload.get("button", "left")),
                steps=int(payload.get("steps", 30)),
                duration_ms=int(payload.get("durationMs", payload.get("durationms", 500))),
            )
            x, y = to_x, to_y
        elif action == "key":
            press_key(str(payload.get("key", "Return")))
        elif action == "keys":
            chords = payload.get("keys")
            if not isinstance(chords, list) or not chords:
                raise ValueError("keys action requires non-empty keys array")
            interval = int(payload.get("intervalMs", 60))
            for index, chord in enumerate(chords):
                press_key(str(chord))
                if interval > 0 and index < len(chords) - 1:
                    time.sleep(interval / 1000.0)
        elif action == "keydown":
            hold_keys(str(payload.get("key", "")), True)
        elif action == "keyup":
            hold_keys(str(payload.get("key", "")), False)
        elif action == "text":
            type_text(str(payload.get("text", "")), int(payload.get("perCharDelayMs", 0)))
        else:
            raise ValueError(f"unknown action: {action}")
    finally:
        for mod in reversed(modifiers):
            hold_keys(str(mod), False)

    post_ms = int(payload.get("postMs") or payload.get("postms") or 0)
    if post_ms > 0:
        time.sleep(post_ms / 1000.0)

    return {
        "ok": True,
        "action": action,
        "point": [x, y],
        "target": target,
        "hwnd": hwnd,
        "rect": rect,
        "virtualScreen": list(virtual_screen_metrics()),
    }


# ---------------------------------------------------------------------------
# Screenshot
# ---------------------------------------------------------------------------


def save_screenshot(query: dict[str, list[str]]) -> dict[str, Any]:
    target = (query.get("target") or ["千星沙箱"])[0]
    mode = (query.get("mode") or ["window"])[0].lower()
    coords = (query.get("coords") or ["window"])[0].lower()
    focus = (query.get("focus") or ["1"])[0] not in ("0", "false", "False", "no")

    hwnd = None
    bbox = None
    rect_list = None
    if (mode != "screen" or coords != "screen") and target and target not in ("*", "none", "None"):
        found = find_window(target)
        if not found:
            return {"ok": False, "error": "window not found", "windows": enum_windows()}
        hwnd = int(found)
        if focus:
            force_foreground(hwnd)
        rect = get_rect(hwnd)
        rect_list = [int(rect.left), int(rect.top), int(rect.right), int(rect.bottom)]
        bbox = tuple(rect_list)

    if all(key in query for key in ("x", "y", "w", "h")):
        x = int((query.get("x") or ["0"])[0])
        y = int((query.get("y") or ["0"])[0])
        w = int((query.get("w") or ["0"])[0])
        h = int((query.get("h") or ["0"])[0])
        if w <= 0 or h <= 0:
            raise ValueError("screenshot crop w/h must be positive")
        if coords == "screen" or hwnd is None:
            left = x
            top = y
        elif coords == "client":
            point = wintypes.POINT(x, y)
            if not user32.ClientToScreen(int(hwnd), ctypes.byref(point)):
                raise RuntimeError("ClientToScreen failed")
            left = int(point.x)
            top = int(point.y)
        else:
            rect = get_rect(int(hwnd))
            left = int(rect.left) + x
            top = int(rect.top) + y
        bbox = (int(left), int(top), int(left + w), int(top + h))
        mode = "region"

    if mode == "screen" or bbox is None:
        left, top, width, height = virtual_screen_metrics()
        bbox = (left, top, left + width, top + height)

    try:
        from PIL import ImageGrab

        image = ImageGrab.grab(bbox=bbox, all_screens=True)
    except Exception:
        image = grab_region_gdi(int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3]))

    screenshot_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    pid = os.getpid()
    path = screenshot_dir / f"{timestamp}-{pid}.png"
    image.save(path)
    return {
        "ok": True,
        "path": str(path),
        "mode": mode,
        "coords": coords,
        "target": target,
        "hwnd": hwnd,
        "bbox": [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])],
        "rect": rect_list,
        "size": [int(image.size[0]), int(image.size[1])],
    }


def grab_region_gdi(left: int, top: int, right: int, bottom: int):
    from PIL import Image

    width = int(right - left)
    height = int(bottom - top)
    if width <= 0 or height <= 0:
        raise ValueError("invalid screenshot region")

    screen_dc = user32.GetDC(0)
    if screen_dc == 0:
        raise RuntimeError("GetDC failed")
    memory_dc = gdi32.CreateCompatibleDC(screen_dc)
    if memory_dc == 0:
        user32.ReleaseDC(0, screen_dc)
        raise RuntimeError("CreateCompatibleDC failed")
    bitmap = gdi32.CreateCompatibleBitmap(screen_dc, width, height)
    if bitmap == 0:
        gdi32.DeleteDC(memory_dc)
        user32.ReleaseDC(0, screen_dc)
        raise RuntimeError("CreateCompatibleBitmap failed")

    previous = gdi32.SelectObject(memory_dc, bitmap)
    try:
        if not gdi32.BitBlt(memory_dc, 0, 0, width, height, screen_dc, int(left), int(top), SRCCOPY):
            raise RuntimeError("BitBlt failed")

        bitmap_info = BITMAPINFO()
        bitmap_info.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bitmap_info.bmiHeader.biWidth = width
        bitmap_info.bmiHeader.biHeight = -height
        bitmap_info.bmiHeader.biPlanes = 1
        bitmap_info.bmiHeader.biBitCount = 32
        bitmap_info.bmiHeader.biCompression = 0
        bitmap_info.bmiHeader.biSizeImage = width * height * 4

        buffer_size = width * height * 4
        pixel_buffer = ctypes.create_string_buffer(buffer_size)
        lines = gdi32.GetDIBits(
            memory_dc,
            bitmap,
            0,
            height,
            pixel_buffer,
            ctypes.byref(bitmap_info),
            0,
        )
        if int(lines) == 0:
            raise RuntimeError("GetDIBits failed")
        image = Image.frombuffer("RGBA", (width, height), pixel_buffer, "raw", "BGRA", 0, 1)
        return image.convert("RGB")
    finally:
        gdi32.SelectObject(memory_dc, previous)
        gdi32.DeleteObject(bitmap)
        gdi32.DeleteDC(memory_dc)
        user32.ReleaseDC(0, screen_dc)


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    server_version = SERVER_VERSION

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.client_address[0]} - {fmt % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        try:
            if parsed.path == "/health":
                foreground = int(user32.GetForegroundWindow())
                send_json(
                    self,
                    200,
                    {
                        "ok": True,
                        "version": SERVER_VERSION,
                        "isAdmin": bool(shell32.IsUserAnAdmin()),
                        "virtualScreen": list(virtual_screen_metrics()),
                        "foreground": window_detail(foreground) if foreground else None,
                        "screenshotDir": str(screenshot_dir),
                    },
                )
            elif parsed.path == "/windows":
                q = (query.get("query") or [None])[0]
                send_json(self, 200, {"ok": True, "windows": enum_windows(q)})
            elif parsed.path == "/window":
                target = (query.get("target") or [""])[0]
                hwnd = find_window(target)
                if not hwnd:
                    send_json(self, 404, {"ok": False, "error": "window not found"})
                else:
                    send_json(self, 200, {"ok": True, "window": window_detail(hwnd)})
            elif parsed.path == "/cursor":
                x, y = cursor_position()
                send_json(self, 200, {"ok": True, "x": x, "y": y})
            elif parsed.path == "/pixel":
                x = int((query.get("x") or ["0"])[0])
                y = int((query.get("y") or ["0"])[0])
                send_json(self, 200, {"ok": True, "x": x, "y": y, "color": pixel_color(x, y)})
            elif parsed.path == "/clipboard":
                send_json(self, 200, {"ok": True, "text": clipboard_get()})
            elif parsed.path == "/screenshot":
                send_json(self, 200, save_screenshot(query))
            else:
                send_json(self, 404, {"ok": False, "error": "not found"})
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": repr(exc)})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = parse_json_body(self)
            if parsed.path == "/action":
                send_json(self, 200, handle_action(payload))
            elif parsed.path == "/window":
                send_json(self, 200, handle_window_op(payload))
            elif parsed.path == "/clipboard":
                clipboard_set(str(payload.get("text", "")))
                send_json(self, 200, {"ok": True})
            else:
                send_json(self, 404, {"ok": False, "error": "not found"})
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": repr(exc)})


def main() -> None:
    global screenshot_dir
    parser = argparse.ArgumentParser(description="Local computer control HTTP server (Windows)")
    parser.add_argument("--host", default=HOST_DEFAULT)
    parser.add_argument("--port", type=int, default=PORT_DEFAULT)
    parser.add_argument("--screenshot-dir", default=str(SCREENSHOT_DIR_DEFAULT))
    args = parser.parse_args()

    if args.host not in ("127.0.0.1", "localhost"):
        raise SystemExit("Refusing to bind non-localhost host")

    screenshot_dir = Path(args.screenshot_dir)
    admin = bool(shell32.IsUserAnAdmin())
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"{SERVER_VERSION} listening on http://{args.host}:{args.port}")
    print(f"screenshots -> {screenshot_dir}")
    print(f"admin: {admin}" + ("" if admin else "  (提示：控制管理员权限窗口需以管理员身份运行)"))
    server.serve_forever()


if __name__ == "__main__":
    main()
