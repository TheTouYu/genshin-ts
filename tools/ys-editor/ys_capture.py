#!/usr/bin/env python3
"""ys_capture.py — `ys-capture` 的常驻抓帧守护（票 25/33；独立工具，不改 ys-observe）。

为什么是独立文件（2026-10-18 实测，见 .scratch/gui-perf/capture-bench.md）：
  · `spectacle -b -n -f -o` 全屏 PNG **946ms**；`import -silent -window <win>` 出 PNG **1099ms**、
    出 raw rgb **~97ms**；ffmpeg x11grab 连续流 ~33ms/帧；
    **进程内 XShmGetImage（共享内存读回）2–12ms** —— 差 100 倍的是「读回路径 + 进程启动」，
    不是抓图本身。所以本工具把读回搬进常驻进程。
  · `spectacle` 抓的是**当前虚拟桌面**（票 34：实测抓到浏览器而不是原神）。按窗口 id 抓图
    天然不会抓错对象，但**不能证明「用户看到的是游戏」**——归属校验必须保留、且必须
    fail-closed（见下）。

契约（客户端只读状态文件，不解析图像）
  状态目录（默认 /dev/shm/ys-capture）：
    state.tsv   单行、**\x1f 分隔**（不是 tab：bash 的 read 会把连续 tab 折叠，空字段丢失、整行错位——实测踩过）
    f-<seq>.rgb 该帧 2560×1440×3 RGB 原始像素（11 MB）
    e-<crc8>.<fmt>  按内容寻址的预编码文件（bmp/png/jpg；--pre 开启）
    daemon.pid  守护进程 pid
  state.tsv = v1 <US-separated> <seq> <wall_ns> <wall_iso> <w> <h> <crc32> <rgb> <bmp> <bmp_crc> <png> <png_crc>
              <jpg> <jpg_crc> <fast_verdict> <fast_age_ms> <strict_verdict> <strict_age_ms>
              <strict_src> <win> <class> <pid> <daemon_pid>
              <mode screen|background> <src xshm-window|kwin-ss2> <visible 0|1>
  （后 3 个字段 2026-10-18 task-6 新增：`--source window` 的帧必须明示"后台抓帧"，不许冒充栈顶）

fail-closed（票 34 的红线，客户端 `ys-capture latest` 执行）：
  · 守护进程不在（pid 死了）           → 退出 7（DAEMON_DOWN），不返回像素
  · 帧太旧（age > --max-age-ms）        → 退出 8（STALE_FRAME），不返回像素
  · fast 归属 verdict != OK             → 退出 2/4/5（NOT_ATOP/OTHER_DESKTOP/OCCLUDED）
  · strict（KWin）verdict != OK 或过旧   → 退出 9（STRICT_UNAVAILABLE；**KWin 通道静默失效时
                                          绝不用 X11 快路径冒充**，见下）
  · 请求的编码格式与当前帧内容不符       → 退出 10（FORMAT_NOT_READY），不回旧图
  唯一例外是显式 `--allow-background`（只供离线分析该窗口自身缓冲，**不得用于动作**）。

已知且实测过的坑（别重犯）：
  1. **X11/EWMH 的桌面属性会骗人**（2026-10-18 实测）：原神窗口 `_NET_WM_DESKTOP=0`、
     `_NET_CURRENT_DESKTOP=0` ⇒ `ys_attrib.py` 判 OK；同一时刻 KWin（`ys-atop --verify`）判
     **OTHER_DESKTOP**（游戏在 desktop 3，当前 desktop 1），屏幕上是 Firefox。⇒ 快路径只作
     **廉价次级信号**（身份/最小化/桌面明显不一致时立刻拒），**权威闸门只能是 KWin 通道**
     （单次 ~1.2s、子进程 CPU ~73ms，后台线程低频跑 + 客户端按 TTL 判旧）。
  2. **ZPixmap 是 BGRX 不是 RGB**：XShmGetImage 拿到的 32bpp 字节序是 B,G,R,X；直接喂 OCR/
     模板匹配不报错、只掉准。本文件统一转成 RGB 再落盘（与 `import … rgb:-` 同序）。
  3. **XShmDetach/shmdt 顺序**：先 XDestroyImage → XShmDetach → shmdt → XCloseDisplay，
     否则进程退出时可能 core dump（实测过一次）。
  4. KWin 脚本必须落在**宿主可见**路径（D385：DSH 的 /tmp 是 tmpfs）——本文件不自己写 KWin
     脚本，统一调 `ys-wins`（它已把 JS 写到仓库内）。

用法：
  ys-capture serve [--fps 10] [--ring 4] [--pre bmp] [--dir /dev/shm/ys-capture]
                    # --pre 默认只有 bmp（编码 24ms/帧）。png 预编码 52ms/帧 ⇒ 显式加才开；
                    # 客户端 --format bmp|png 缺预编码时会自动按需编码（见 ys-capture latest）。
                   [--win 0x01400001|auto] [--


class yuanshen.exe]
                   [--fast-sec 0.3] [--strict-sec 1.5]
  ys-capture latest [--out FILE] [--format bmp|png|jpg|raw] [--max-age-ms 1000]
                    [--strict-ttl-ms 6000] [--allow-background] [--json]
  ys-capture status | stop | selftest | bench
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import zlib

STATE_VERSION = 'v1'
DEFAULT_DIR = '/dev/shm/ys-capture'
DEFAULT_WIN = 'auto'   # 2026-10-21: 原 '0x01400001' 是写死的旧 id；游戏重启后窗口 id 会变
                       # （实测 0x01400001 → 0x1800001 → 0x1600001），写死 ⇒ X BadDrawable
                       # 启动即崩、latest 恒 DAEMON_DOWN。discover_window() 本来就能按 WM_CLASS 找，
                       # 把默认值设成 auto 才是唯一不会过期的那条路。
DEFAULT_CLASS = 'yuanshen.exe'
FRAME_W, FRAME_H = 2560, 1440
VERDICT_CODES = {'OK': 0, 'NOT_ATOP': 2, 'NOT_FOUND': 2, 'OTHER_DESKTOP': 4,
                 'OCCLUDED': 5, 'UNKNOWN': 9}
EXIT = {'OK': 0, 'DAEMON_DOWN': 7, 'STALE_FRAME': 8, 'STRICT_UNAVAILABLE': 9,
        'FORMAT_NOT_READY': 10}


# ────────────────────────────────────────────────────────────── X11 / XShm
x11 = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
xext = ctypes.CDLL(ctypes.util.find_library('Xext') or 'libXext.so.6')
libc = ctypes.CDLL(ctypes.util.find_library('c') or 'libc.so.6', use_errno=True)
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
x11.XDefaultScreen.restype = ctypes.c_int
x11.XDefaultScreen.argtypes = [ctypes.c_void_p]
x11.XDefaultVisual.restype = ctypes.c_void_p
x11.XDefaultVisual.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDefaultDepth.restype = ctypes.c_int
x11.XDefaultDepth.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDestroyImage.argtypes = [ctypes.c_void_p]
x11.XGetGeometry.restype = ctypes.c_int
x11.XGetGeometry.argtypes = [ctypes.c_void_p, ctypes.c_ulong,
                             ctypes.POINTER(ctypes.c_ulong),
                             ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                             ctypes.POINTER(ctypes.c_uint), ctypes.POINTER(ctypes.c_uint),
                             ctypes.POINTER(ctypes.c_uint), ctypes.POINTER(ctypes.c_uint)]


def window_geometry(dpy, win):
    """返回窗口 (w, h)；取不到返回 (0, 0)。抓帧尺寸必须以它为准，见 XShmGrabber.__init__。"""
    root = ctypes.c_ulong()
    x = ctypes.c_int()
    y = ctypes.c_int()
    w = ctypes.c_uint()
    h = ctypes.c_uint()
    bw = ctypes.c_uint()
    depth = ctypes.c_uint()
    ok = x11.XGetGeometry(dpy, ctypes.c_ulong(int(win)), ctypes.byref(root),
                          ctypes.byref(x), ctypes.byref(y), ctypes.byref(w),
                          ctypes.byref(h), ctypes.byref(bw), ctypes.byref(depth))
    if not ok:
        return 0, 0
    return int(w.value), int(h.value)


def write_rgb_atomic(path, rgb):
    """**原子落盘**（2026-10-21 修复）。

    原实现是 `open(path,'wb')` 原地写 11MB：读者可能打开到"写到一半"的文件——
    实测症状就是同一张图里**标题区已是新角色、头像区还是旧角色**（撕裂帧）。
    tmp + os.replace 保证读者只会看到完整帧（rename 在同一文件系统内原子）。
    """
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(rgb)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

class XErrorEvent(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('display', ctypes.c_void_p),
                ('resourceid', ctypes.c_ulong), ('serial', ctypes.c_ulong),
                ('error_code', ctypes.c_ubyte), ('request_code', ctypes.c_ubyte),
                ('minor_code', ctypes.c_ubyte)]


class ShmSeg(ctypes.Structure):
    _fields_ = [('shmseg', ctypes.c_ulong), ('shmid', ctypes.c_int),
                ('shmaddr', ctypes.c_void_p), ('readOnly', ctypes.c_int)]


xext.XShmQueryExtension.restype = ctypes.c_bool
xext.XShmQueryExtension.argtypes = [ctypes.c_void_p]
xext.XShmCreateImage.restype = ctypes.c_void_p
xext.XShmCreateImage.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_int,
                                 ctypes.c_void_p, ctypes.POINTER(ShmSeg), ctypes.c_uint,
                                 ctypes.c_uint]
xext.XShmAttach.restype = ctypes.c_bool
xext.XShmAttach.argtypes = [ctypes.c_void_p, ctypes.POINTER(ShmSeg)]
xext.XShmDetach.restype = ctypes.c_bool
xext.XShmDetach.argtypes = [ctypes.c_void_p, ctypes.POINTER(ShmSeg)]
xext.XShmGetImage.restype = ctypes.c_void_p
xext.XShmGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p,
                              ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
libc.shmget.restype = ctypes.c_int
libc.shmat.restype = ctypes.c_void_p
libc.shmdt.argtypes = [ctypes.c_void_p]
libc.shmctl.restype = ctypes.c_int

_XERR_HANDLER = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
_XERR_LAST = {'code': 0}


def _xerr_handler(_dpy, ev):
    try:
        e = ctypes.cast(ev, ctypes.POINTER(XErrorEvent)).contents
        _XERR_LAST['code'] = int(e.error_code)
    except Exception:                                         # noqa: BLE001
        _XERR_LAST['code'] = -1
    return 0


def install_xerr_handler():
    """X 错误不再打屏、不再杀进程：记录到 _XERR_LAST，由调用方判定（窗口没了=可恢复）。"""
    h = _XERR_HANDLER(_xerr_handler)
    x11.XSetErrorHandler(h)
    return h


class GrabError(RuntimeError):
    pass


class XShmGrabber:
    """进程内共享内存抓帧：一次 attach，之后每帧 2–12ms（实测）。"""

    def __init__(self, display, win, w=FRAME_W, h=FRAME_H):
        self.display_name = display
        self.win = win
        self.dpy = x11.XOpenDisplay(display.encode())
        if not self.dpy:
            raise GrabError(f'XOpenDisplay({display}) 失败（DISPLAY/XAUTHORITY？）')
        self.addr = None
        self.img = None
        self.seg = None
        # 窗口比请求尺寸小 → XShmGetImage 必然 BadMatch（实测：千星沙箱 2560x1371 vs 默认
        # 2560x1440，守护因此一帧都写不出、state.tsv 永不出现，被误读成「守护不产帧」）。
        # 抓帧尺寸按**窗口实际几何**裁剪（多出的部分抓不到，少于窗口的部分不存在）。
        gw, gh = window_geometry(self.dpy, win)
        if gw and gh:
            self.w, self.h = min(w, gw), min(h, gh)
        else:
            self.w, self.h = w, h
        self._handler = install_xerr_handler()
        scr = x11.XDefaultScreen(self.dpy)
        vis = x11.XDefaultVisual(self.dpy, scr)
        dep = x11.XDefaultDepth(self.dpy, scr)
        self.depth = dep
        self.size = self.w * self.h * 4          # 尺寸一律用裁剪后的 (self.w,self.h)
        self.shmid = None
        try:
            self.shmid = libc.shmget(0, ctypes.c_size_t(self.size), ctypes.c_int(0o100600))
            if self.shmid < 0:
                raise GrabError(f'shmget 失败 errno={ctypes.get_errno()}')
            self.addr = libc.shmat(ctypes.c_int(self.shmid), ctypes.c_void_p(0), ctypes.c_int(0))
            if self.addr in (None, ctypes.c_void_p(-1).value):
                raise GrabError(f'shmat 失败 errno={ctypes.get_errno()}')
            self.seg = ShmSeg(0, self.shmid, self.addr, 0)
            self.img = xext.XShmCreateImage(self.dpy, vis, dep, 2, ctypes.c_void_p(self.addr),
                                            ctypes.byref(self.seg), self.w, self.h)
            if not self.img:
                raise GrabError('XShmCreateImage 失败')
            if not xext.XShmAttach(self.dpy, ctypes.byref(self.seg)):
                raise GrabError('XShmAttach 失败（MIT-SHM 不可用？）')
            x11.XSync(self.dpy, 0)
        except Exception:                        # noqa: BLE001 —— 半成品必须自毁，别把段漏给内核
            self.close()
            raise
        import numpy as np
        self.np = np
        # 共享内存地址固定 → 视图只建一次；每帧只付一次 BGRX→RGB 的 11MB 拷贝
        self.view = np.ctypeslib.as_array(
            (ctypes.c_ubyte * self.size).from_address(self.addr)).reshape(self.h, self.w, 4)

    def grab(self):
        """返回 (rgb uint8 H×W×3, ms)；失败抛 GrabError（窗口没了/读回失败）。"""
        _XERR_LAST['code'] = 0
        t0 = time.perf_counter()
        ok = xext.XShmGetImage(self.dpy, int(self.win), self.img, 0, 0, 0xffffffff)
        x11.XSync(self.dpy, 0)
        ms = (time.perf_counter() - t0) * 1000.0
        if not ok or _XERR_LAST['code']:
            raise GrabError(f'XShmGetImage 失败 ok={ok} xerr={_XERR_LAST["code"]}')
        # 零拷贝视图 + 一次 11MB 拷贝做 BGRX→RGB。SHM 缓冲下一次 grab 就被覆盖，必须立刻 copy。
        rgb = self.np.ascontiguousarray(self.view[:, :, 2::-1])
        return rgb, ms

    def close(self):
        try:
            if self.img:
                x11.XDestroyImage(self.img)
            xext.XShmDetach(self.dpy, ctypes.byref(self.seg))
        except Exception:                                     # noqa: BLE001
            pass
        try:
            if self.addr:
                libc.shmdt(ctypes.c_void_p(self.addr))
        except Exception:                                     # noqa: BLE001
            pass
        # 段必须由创建者显式销毁：shmdt 只解映射，不释放 shmid 槽位。
        # 实测（2026-10-20）：不销毁时每重建一次 grabber 就永久占掉 1 个 14MB 段；
        # 抓帧失败重试 0.5s/次 ⇒ 2 段/秒，把内核 shmmni(=4096) 吃到 2519/4096，
        # 全局 MIT-SHM 客户端（Xwayland/Wine/CEF）再申请共享内存就会 ENOSPC。
        try:
            if self.shmid is not None:
                libc.shmctl(ctypes.c_int(self.shmid), ctypes.c_int(0), None)  # IPC_RMID
        except Exception:                                     # noqa: BLE001
            pass
        try:
            if self.dpy:
                x11.XCloseDisplay(self.dpy)
        except Exception:                                     # noqa: BLE001
            pass
        self.addr = None
        self.img = None
        self.dpy = None
        self.shmid = None


# ────────────────────────────────────────────────────── 归属校验（两条通道）
def desktop_check(window_desktop, current_desktop, n_desktops):
    """EWMH 桌面维度三态：'ok' / 'mismatch' / 'unavailable'。

    **本机实测（2026-10-21）**：`_NET_NUMBER_OF_DESKTOPS=1`、`_NET_CURRENT_DESKTOP=0`、
    原神窗 `_NET_WM_DESKTOP=0`，而 KWin（权威）说游戏 ds=3 / 当前 cur=2。
    ⇒ `window_desktop == current_desktop` 是 **恒真式**，根本判不出「游戏在别的桌面」。
    判不了就报 unavailable —— 不许用 0==0 冒充"通过"（那正是票 34 的失效模式）。
    """
    if window_desktop is None or current_desktop is None:
        return 'unavailable'
    if n_desktops is not None and n_desktops <= 1:
        return 'unavailable'          # EWMH 没暴露虚拟桌面 ⇒ 该维度无从判断
    if window_desktop not in (current_desktop, 0xffffffff):
        return 'mismatch'
    return 'ok'


def fast_attrib(display, win_hex, want_class=DEFAULT_CLASS):
    """X11/EWMH 快路径（身份/最小化/桌面/遮挡）。**只是次级信号**：EWMH 会把桌面说错。"""
    t0 = time.perf_counter()
    out = {'verdict': 'UNKNOWN', 'detail': '', 'identity_ok': False, 'minimized': None,
           'window_desktop': None, 'current_desktop': None, 'covered_ratio': None,
           'desktop_check': None}
    try:
        from Xlib import display as xd, X
        d = xd.Display(display)
        root = d.screen().root
        win = d.create_resource_object('window', int(win_hex, 16))

        def prop(w, name, default=None):
            try:
                p = w.get_full_property(d.intern_atom(name), X.AnyPropertyType)
                return p.value if p is not None else default
            except Exception:                                 # noqa: BLE001
                return default

        cls = prop(win, 'WM_CLASS') or b''
        if isinstance(cls, (bytes, bytearray)):
            cls = cls.decode('latin-1', 'ignore')
        classes = [c for c in str(cls).replace('\x00', ' ').split(' ') if c]
        identity_ok = any(want_class.lower() in c.lower() for c in classes)
        state = prop(win, '_NET_WM_STATE') or []
        minimized = any(int(s) == d.intern_atom('_NET_WM_STATE_HIDDEN') for s in state)
        wd = prop(win, '_NET_WM_DESKTOP')
        window_desktop = int(wd[0]) if wd is not None and len(wd) else None
        cd = prop(root, '_NET_CURRENT_DESKTOP')
        current_desktop = int(cd[0]) if cd is not None and len(cd) else None
        nd = prop(root, '_NET_NUMBER_OF_DESKTOPS')
        n_desktops = int(nd[0]) if nd is not None and len(nd) else None
        stacking = prop(root, '_NET_CLIENT_LIST_STACKING') or []
        stacking = [hex(int(w)) for w in stacking]
        # 目标几何（绝对坐标）与上方窗口的并集覆盖率
        try:
            g = win.get_geometry()
            tc = win.translate_coords(root, 0, 0)
            tgt = [int(tc.x), int(tc.y), int(g.width), int(g.height)]
        except Exception:                                     # noqa: BLE001
            tgt = [0, 0, FRAME_W, FRAME_H]
        idx = stacking.index(hex(int(win_hex, 16))) if hex(int(win_hex, 16)) in stacking else len(stacking)
        rects = []
        for wid in stacking[idx + 1:]:
            try:
                w2 = d.create_resource_object('window', int(wid, 16))
                g2 = w2.get_geometry()
                tc2 = w2.translate_coords(root, 0, 0)
                st2 = w2.get_full_property(d.intern_atom('_NET_WM_STATE'), X.AnyPropertyType)
                hidden = False
                if st2 is not None:
                    hidden = any(int(s) == d.intern_atom('_NET_WM_STATE_HIDDEN') for s in st2.value)
                if hidden:
                    continue
                x0 = max(tgt[0], int(tc2.x))
                y0 = max(tgt[1], int(tc2.y))
                x1 = min(tgt[0] + tgt[2], int(tc2.x) + int(g2.width))
                y1 = min(tgt[1] + tgt[3], int(tc2.y) + int(g2.height))
                if x1 > x0 and y1 > y0:
                    rects.append((x1 - x0) * (y1 - y0))
            except Exception:                                 # noqa: BLE001
                continue
        area = max(1, tgt[2] * tgt[3])
        covered = min(1.0, sum(rects) / float(area)) if rects else 0.0
        dchk = desktop_check(window_desktop, current_desktop, n_desktops)
        out.update({'identity_ok': identity_ok, 'minimized': minimized, 'desktop_check': dchk,
                    'window_desktop': window_desktop, 'current_desktop': current_desktop,
                    'covered_ratio': round(covered, 4), 'class': classes[0] if classes else ''})
        if not identity_ok:
            out.update(verdict='NOT_FOUND', detail=f'窗口 {win_hex} 的 WM_CLASS 不含 {want_class!r}')
        elif minimized:
            out.update(verdict='OCCLUDED', detail='窗口最小化')
        elif dchk == 'mismatch':
            out.update(verdict='OTHER_DESKTOP',
                       detail=f'_NET_WM_DESKTOP={window_desktop} != _NET_CURRENT_DESKTOP={current_desktop}')
        elif covered >= 0.995:
            out.update(verdict='OCCLUDED', detail=f'上方窗口覆盖 {covered:.1%}')
        elif dchk == 'unavailable':
            out.update(verdict='OK',
                       detail='EWMH 快路径通过，但**桌面维度不可判**'
                              f'（n_desktops={n_desktops}）——要权威判定请用 ys-wins --attrib 的 ds=/cur=')
        else:
            out.update(verdict='OK', detail='EWMH 快路径通过（仅次级信号）')
    except Exception as e:                                    # noqa: BLE001
        out.update(verdict='UNKNOWN', detail=f'{type(e).__name__}: {e}')
    out['elapsed_ms'] = round((time.perf_counter() - t0) * 1000, 2)
    return out


def strict_attrib(display, win_hex, want_class=DEFAULT_CLASS, timeout=25):
    """KWin 权威路径：调 `ys-atop --json --verify`（单次 ~1.2s，子进程 CPU ~73ms）。"""
    t0 = time.perf_counter()
    here = os.path.dirname(os.path.abspath(__file__))
    env = {**os.environ, 'DISPLAY': display, 'YS_WIN': win_hex,
           'YS_WIN_CLASS': want_class,
           'XDG_RUNTIME_DIR': os.environ.get('XDG_RUNTIME_DIR', '/run/user/1000'),
           'DBUS_SESSION_BUS_ADDRESS': os.environ.get(
               'DBUS_SESSION_BUS_ADDRESS', 'unix:path=/run/user/1000/bus')}
    try:
        p = subprocess.run([os.path.join(here, 'ys-atop'), '--json', '--verify'],
                           capture_output=True, text=True, timeout=timeout, env=env)
        obj = json.loads(p.stdout.strip().splitlines()[-1]) if p.stdout.strip() else {}
    except Exception as e:                                    # noqa: BLE001
        obj = {'verdict': 'UNKNOWN', 'error': f'{type(e).__name__}: {e}'}
    verdict = obj.get('verdict', 'UNKNOWN')
    src = obj.get('src', 'kwin')
    if src != 'kwin':
        # xs 快路径冒充权威 = 票 34 的原样失效；这里显式降级为 UNKNOWN，由客户端 fail closed
        verdict = 'UNKNOWN'
    return {'verdict': verdict, 'src': src, 'detail': obj.get('detail', ''),
            'covered_ratio': obj.get('covered_ratio'),
            'window': obj.get('window'), 'current_desktop': obj.get('current_desktop'),
            'elapsed_ms': round((time.perf_counter() - t0) * 1000, 1)}


# ──────────────────────────────────────── KWin ScreenShot2（后台按窗口抓）
def kwin_internal_id(class_substr, timeout=12, want_w=None, want_h=None):
    """用 KWin 脚本取窗口的 internalId（ScreenShot2 的 handle）。

    2026-10-20 增 want_w/want_h：同一 class 常有多条（编辑器 = 左栏 384x1371 + 主画布 2176x1371
    + 若干 1x1 幽灵窗）。调用方带着"我选的是哪个尺寸"来，这里按 frameGeometry **最近匹配**，
    这样每个窗口都能单独定位，不需要按 class 撞运气。
    JS 必须落在宿主可见路径（D385）。
    """
    import uuid
    tag = 'yscap' + uuid.uuid4().hex[:8]
    js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'.ys-cap-{tag}.js')
    js = f"""
var ord = workspace.stackingOrder;
for (var i = 0; i < ord.length; i++) {{
  var w = ord[i];
  if (String(w.resourceClass || '').toLowerCase().indexOf({class_substr!r}) >= 0) {{
    try {{
      var g = w.frameGeometry;
      console.info('YS-CAP-{tag} ' + String(w.internalId) + ' ' + g.width + ' ' + g.height);
    }} catch (e) {{}}
  }}
}}
"""
    env = {**os.environ, 'XDG_RUNTIME_DIR': os.environ.get('XDG_RUNTIME_DIR', '/run/user/1000'),
           'DBUS_SESSION_BUS_ADDRESS': os.environ.get(
               'DBUS_SESSION_BUS_ADDRESS', 'unix:path=/run/user/1000/bus')}
    try:
        with open(js_path, 'w') as f:
            f.write(js)
        for args in (['gdbus', 'call', '--session', '--dest', 'org.kde.KWin', '--object-path',
                      '/Scripting', '--method', 'org.kde.kwin.Scripting.loadScript', js_path, tag],
                     ['gdbus', 'call', '--session', '--dest', 'org.kde.KWin', '--object-path',
                      '/Scripting', '--method', 'org.kde.kwin.Scripting.start']):
            subprocess.run(args, capture_output=True, env=env, timeout=8)
        time.sleep(1.6)
        out = subprocess.run(['journalctl', '--user', '--since', '6 seconds ago'],
                             capture_output=True, text=True, timeout=10).stdout
        # 2026-10-20 修：同一 class 常常有**多个窗口**（主窗 + 一条 384px 宽的面板），
        # 原实现取 journal 里第一行命中的那个 ⇒ 随手指到一个。改成**按面积取最大**——
        # 与 ys-win-id 同一判据（那条也踩过"取最后一个匹配命中 1×1 幽灵窗"）。
        best, best_area, best_err = None, 0, None
        for ln in out.splitlines():
            marker = f'YS-CAP-{tag} '
            if marker not in ln:
                continue
            parts = ln.split(marker, 1)[1].strip().split()
            if not parts:
                continue
            try:
                w = int(parts[1]) if len(parts) >= 3 else 0
                h = int(parts[2]) if len(parts) >= 3 else 0
            except ValueError:
                w = h = 0
            if want_w and want_h and w and h:
                # 先按"我选的那一块"匹配 —— 同一 class 下每个窗口都能单独定位
                err = abs(w - want_w) + abs(h - want_h)
                if best_err is None or err < best_err:
                    best, best_err, best_area = parts[0], err, w * h
            else:
                if w * h >= best_area:      # 没指定尺寸时按面积取最大（1x1 幽灵窗永远不会赢）
                    best, best_area = parts[0], w * h
        return best
    except Exception:                                     # noqa: BLE001
        return None
    finally:
        try:
            os.unlink(js_path)
        except OSError:
            pass
    return None


_HANDLE_CACHE = {}


class KWinSS2:
    """KWin ScreenShot2 CaptureWindow：**按窗口自身缓冲**抓，与是否在栈顶/当前桌面无关。

    协议：CaptureWindow(handle, options, pipe) → 结果 dict{format,width,height,stride,scale,type}；
    `type='raw'` 时 pipe 里是**裸像素**（BGRA，按 stride 行对齐），不是 QImage 序列化流。
    实测（2560×1440 原神窗）：242–288ms/帧（冷 604ms），比 XShm 慢 20–40×，所以只作兜底
    （XShm 在窗口最小化时会 BadMatch，这条能出活帧）。
    """

    IFACE = 'org.kde.KWin.ScreenShot2'

    def __init__(self, class_substr, display=None, want_w=None, want_h=None):
        import dbus
        self.dbus = dbus
        self.class_substr = (class_substr or 'yuanshen').lower()
        self.want_w, self.want_h = want_w, want_h
        self.handle = None
        self.bus = dbus.SessionBus()
        self.obj = self.bus.get_object('org.kde.KWin', '/org/kde/KWin/ScreenShot2',
                                       introspect=False)
        self.iface = dbus.Interface(self.obj, self.IFACE)

    def ensure_handle(self):
        if not self.handle:
            key = (self.class_substr, self.want_w, self.want_h)
            if key in _HANDLE_CACHE:
                self.handle = _HANDLE_CACHE[key]
            else:
                self.handle = kwin_internal_id(self.class_substr, want_w=self.want_w,
                                               want_h=self.want_h)
                if self.handle:
                    # 只在解析成功时缓存：窗口关了再重开会换 handle，失败路径不缓存才有自愈机会
                    _HANDLE_CACHE[key] = self.handle
        return self.handle

    def grab(self):
        if not self.ensure_handle():
            raise GrabError('KWin: 取不到窗口 internalId（KWin 脚本不可用？）')
        r, w = os.pipe()
        t0 = time.perf_counter()
        try:
            res = self.iface.CaptureWindow(self.handle, self.dbus.Dictionary(
                {'native-resolution': True}, signature='sv'),
                self.dbus.types.UnixFd(w), timeout=20)
        finally:
            os.close(w)
        data = b''
        while True:
            chunk = os.read(r, 1 << 22)
            if not chunk:
                break
            data += chunk
        os.close(r)
        ms = (time.perf_counter() - t0) * 1000
        meta = {str(k): v for k, v in dict(res).items()}
        if str(meta.get('type')) != 'raw':
            raise GrabError(f"KWin: 非 raw 结果 type={meta.get('type')!r}（协议变了？）")
        import numpy as np
        h = int(meta.get('height') or 0)
        stride = int(meta.get('stride') or 0)
        if h <= 0 or stride <= 0 or len(data) < h * stride:
            raise GrabError(f'KWin: 像素长度不符 bytes={len(data)} h={h} stride={stride}')
        arr = np.frombuffer(data[:h * stride], np.uint8).reshape(h, stride // 4, 4)
        rgb = np.ascontiguousarray(arr[:, :, 2::-1])      # BGRA → RGB
        return rgb, ms, {'src': 'kwin-ss2', 'format': int(meta.get('format') or 0),
                         'scale': float(meta.get('scale') or 1), 'height': h,
                         'width': int(meta.get('width') or (stride // 4))}

class KWinScreen(KWinSS2):
    """整屏抓取（KWin ScreenShot2 CaptureScreen）。

    为什么不能用 XShm 抓 root：KWin 是合成器，**root 窗口里没有合成后的画面**
    （2026-10-20 实测：XShm 抓 root 得到全黑 2560x1440，58KB）。
    CaptureScreen(index, options, pipe) 才是拿"用户看到的这一整屏"的正路。
    """

    def __init__(self, screen_index=0, display=None):
        super().__init__('__screen__', display=display)
        self.screen_index = screen_index
        self.handle = True          # 不需要 internalId

    def grab(self):
        r, w = os.pipe()
        t0 = time.perf_counter()
        try:
            # 用 CaptureActiveScreen：无参数版，抓"用户当前所在的那块物理屏"。
            # 注意 CaptureScreen 的入参是 **输出名字符串**（如 'DP-1'），不是索引——
            # 按索引传会报 No such method（实测 signature 不匹配）。
            res = self.iface.CaptureActiveScreen(self.dbus.Dictionary(
                {'native-resolution': True}, signature='sv'),
                self.dbus.types.UnixFd(w), timeout=20)
        finally:
            os.close(w)
        data = b''
        while True:
            chunk = os.read(r, 1 << 22)
            if not chunk:
                break
            data += chunk
        os.close(r)
        ms = (time.perf_counter() - t0) * 1000
        meta = {str(k): v for k, v in dict(res).items()}
        if str(meta.get('type')) != 'raw':
            raise GrabError(f"KWin: 非 raw 结果 type={meta.get('type')!r}")
        import numpy as np
        h = int(meta.get('height') or 0)
        stride = int(meta.get('stride') or 0)
        if h <= 0 or stride <= 0 or len(data) < h * stride:
            raise GrabError(f'KWin: 像素长度不符 bytes={len(data)} h={h} stride={stride}')
        arr = np.frombuffer(data[:h * stride], np.uint8).reshape(h, stride // 4, 4)
        rgb = np.ascontiguousarray(arr[:, :, 2::-1])
        return rgb, ms, {'src': 'kwin-screen', 'scale': float(meta.get('scale') or 1)}


# ─────────────────────────────────────────────────────────────── 编码器
def encode_bmp(rgb):
    """BMP（top-down，24bpp）：头 54B + BGR。PIL/ImageMagick/cv2 都能读。"""
    import numpy as np
    h, w, _ = rgb.shape
    size = 54 + h * w * 3
    hdr = bytearray(54)
    hdr[0:2] = b'BM'
    hdr[2:6] = size.to_bytes(4, 'little')
    hdr[10:14] = (54).to_bytes(4, 'little')
    hdr[14:18] = (40).to_bytes(4, 'little')
    hdr[18:22] = w.to_bytes(4, 'little')
    hdr[22:26] = (-h).to_bytes(4, 'little', signed=True)      # 负高度 = top-down
    hdr[26:28] = (1).to_bytes(2, 'little')
    hdr[28:30] = (24).to_bytes(2, 'little')
    hdr[34:38] = (h * w * 3).to_bytes(4, 'little')
    bgr = np.ascontiguousarray(rgb[:, :, ::-1])
    return bytes(hdr) + bgr.tobytes()


def encode_png_stored(rgb):
    """PNG（filter=0 + zlib stored blocks）：19–26ms/1440p，PIL/magick 读得、逐像素相等。

    level 0 的普通 zlib 也要 ~25ms（crc32/adler32 就 8.6ms）；stored 块省掉 deflate 搜索。
    """
    import numpy as np
    h, w, _ = rgb.shape
    raw = np.empty((h, w * 3 + 1), np.uint8)
    raw[:, 0] = 0
    raw[:, 1:] = rgb.reshape(h, w * 3)
    data = raw.tobytes()
    out = bytearray(b'\x78\x01')
    pos, n = 0, len(data)
    while pos < n:
        blk = data[pos:pos + 65535]
        pos += len(blk)
        out.append(1 if pos >= n else 0)
        ln = len(blk)
        out += (ln).to_bytes(2, 'little') + (ln ^ 0xffff).to_bytes(2, 'little') + blk
    out += (zlib.adler32(data) & 0xffffffff).to_bytes(4, 'big')

    def chunk(typ, payload):
        return (len(payload).to_bytes(4, 'big') + typ + payload
                + (zlib.crc32(typ + payload) & 0xffffffff).to_bytes(4, 'big'))
    ihdr = (w.to_bytes(4, 'big') + h.to_bytes(4, 'big') + bytes([8, 2, 0, 0, 0]))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', bytes(out)) + chunk(b'IEND', b''))


def encode_jpg(rgb, quality=90):
    import cv2
    import numpy as np
    ok, buf = cv2.imencode('.jpg', np.ascontiguousarray(rgb[:, :, ::-1]),
                           [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError('JPEG 编码失败')
    return buf.tobytes()


ENCODERS = {'bmp': encode_bmp, 'png': encode_png_stored, 'jpg': encode_jpg}


# ─────────────────────────────────────────────────────────────── 守护进程
class Daemon:
    def __init__(self, args):
        self.args = args
        self.dir = args.dir
        self.fps = max(0.2, args.fps)
        self.win = args.win
        self.want_class = args.class_
        self.ring = max(1, args.ring)
        self.pre = [f.strip() for f in (args.pre or '').split(',') if f.strip()]
        for f in self.pre:
            if f not in ENCODERS:
                raise SystemExit(f'未知 --pre 格式 {f}（可选 bmp,png,jpg）')
        self.stop = threading.Event()
        self.grabber = None
        self.seq = 0
        self.last_crc = None
        self.enc = {f: {'path': '', 'crc': ''} for f in self.pre}
        self.enc_lock = threading.Lock()
        self.enc_queue = {}            # fmt -> (crc, rgb) 只保留最新
        self.enc_event = threading.Event()
        self.fast = {'verdict': 'UNKNOWN', 'detail': '未跑', 'elapsed_ms': 0}
        self.fast_ms = 0
        self.fast_ts = 0.0
        self.strict = {'verdict': 'UNKNOWN', 'src': 'none', 'detail': '未跑', 'elapsed_ms': 0}
        self.strict_ts = 0.0
        self.strict_lock = threading.Lock()
        self.capture_ms = 0.0
        self.loop_ms = 0.0
        self.last_rgb_path = ''
        self.frames_written = 0
        self.frames_reused = 0
        self.last_err = ''
        self.source = getattr(args, 'source', 'screen') or 'screen'
        if self.source not in ('screen', 'window'):
            raise SystemExit(f'未知 --source {self.source}（screen|window）')
        self.last_src = 'xshm-window'
        self.kwin = None

    # ---- 窗口发现（--win auto 或 id 失效时按 WM_CLASS 找）
    def discover_window(self):
        """按 WM_CLASS 找目标窗，**取面积最大的那个**。

        2026-10-21 修（F-20261021-CAPTURE-WIN）：原实现**返回第一个命中的 id**，
        实测拿到 0x1600003（同 class 的子窗口），对它 XShmGetImage 直接 `xerr=8`(BadMatch)
        ⇒ 守护进程活着但一帧写不出、state.tsv 永不更新，外部只看得到 DAEMON_DOWN。
        与 `ys_look._resolve_win` 是同一个坑（文档里写着「取最后一个 ⇒ 抓到 1×1」），
        两边口径统一为「面积最大」。
        """
        if self.win and self.win.lower() != 'auto':
            return self.win
        best, best_area = None, -1
        try:
            from Xlib import display as xd, X
            d = xd.Display(self.args.display)
            want = self.want_class.lower()
            stack = [d.screen().root]
            while stack:
                w = stack.pop()
                try:
                    cls = w.get_full_property(d.intern_atom('WM_CLASS'), X.AnyPropertyType)
                    val = ''
                    if cls is not None:
                        v = cls.value
                        val = (v.decode('latin-1', 'ignore') if isinstance(v, (bytes, bytearray))
                               else str(v))
                    if want in val.lower().replace('\x00', ' '):
                        g = w.get_geometry()
                        area = int(g.width) * int(g.height)
                        if area > best_area:
                            best, best_area = hex(int(w.id)), area
                    stack.extend(w.query_tree().children)
                except Exception:                             # noqa: BLE001
                    continue
        except Exception:                                     # noqa: BLE001
            pass
        return best

    def grabber_alive(self):
        return self.grabber is not None

    def _refresh_env(self):
        """会话换 XAUTHORITY 后自愈（2026-10-22 事故：单元只写 DISPLAY=:1）。

        XAUTHORITY 是 `/run/user/<uid>/xauth_XXXX`（每会话随机名）。守护若在会话切换前
        启动，会把旧路径/空值带进进程环境，此后 `xd.Display()` 静默失败 →
        `discover_window()` 返回 None → 日志连续刷「找不到窗口（class=…）」，
        而 `xdotool search` 明明找得到 —— 用户视角就是「抓帧坏了」（实测持续 30 分钟）。
        修法：连续多次找不到窗口时重跑 ys-env.sh 取权威环境，更新 os.environ 再试。
        """
        import subprocess as _sp
        env_sh = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ys-env.sh')
        if not os.path.exists(env_sh):
            return
        try:
            out = _sp.run(['bash', env_sh, '--print'], capture_output=True, text=True,
                          timeout=8).stdout
        except Exception:                                     # noqa: BLE001
            return
        for line in out.splitlines():
            if line.startswith('DISPLAY=') and len(line) > len('DISPLAY='):
                disp = line[len('DISPLAY='):].strip()
                if disp:
                    os.environ['DISPLAY'] = disp
                    self.args.display = disp
            elif line.startswith('XAUTHORITY=') and len(line) > len('XAUTHORITY='):
                xa = line[len('XAUTHORITY='):].strip()
                if xa:
                    os.environ['XAUTHORITY'] = xa
        print(json.dumps({'ok': True, 'role': 'serve', 'stage': 'env-refresh',
                          'DISPLAY': os.environ.get('DISPLAY'),
                          'XAUTHORITY': os.environ.get('XAUTHORITY')},
                         ensure_ascii=False), flush=True)

    def ensure_grabber(self):
        if self.grabber is not None:
            return True
        win = self.discover_window()
        if not win:
            self.last_err = f'找不到窗口（class={self.want_class}）'
            return False
        try:
            self.grabber = XShmGrabber(self.args.display, int(win, 16),
                                       self.args.width, self.args.height)
            self.win = win
            self.last_err = ''
            return True
        except Exception as e:                                # noqa: BLE001
            self.last_err = f'{type(e).__name__}: {e}'
            self.grabber = None
            return False

    # ---- 归属：两条线程
    def fast_loop(self):
        while not self.stop.is_set():
            t0 = time.perf_counter()
            if self.win and self.win.lower() != 'auto':
                res = fast_attrib(self.args.display, self.win, self.want_class)
                self.fast = res
                self.fast_ts = time.time()
            self.fast_ms = (time.perf_counter() - t0) * 1000
            self.stop.wait(max(0.05, self.args.fast_sec))

    def strict_loop(self):
        while not self.stop.is_set():
            res = strict_attrib(self.args.display, self.win or DEFAULT_WIN, self.want_class)
            with self.strict_lock:
                self.strict = res
                self.strict_ts = time.time()
            self.stop.wait(max(0.2, self.args.strict_sec))

    # ---- 编码线程：只为「最新内容」编码，落后就丢旧帧
    def encode_loop(self):
        while not self.stop.is_set():
            self.enc_event.wait(0.2)
            self.enc_event.clear()
            while not self.stop.is_set():
                with self.enc_lock:
                    if not self.enc_queue:
                        break
                    fmt, (crc, rgb) = next(iter(self.enc_queue.items()))
                    self.enc_queue.pop(fmt, None)
                try:
                    self._write_enc(fmt, crc, rgb)
                except Exception as e:                        # noqa: BLE001
                    self.last_err = f'encode {fmt}: {type(e).__name__}: {e}'

    def _write_enc(self, fmt, crc, rgb):
        data = ENCODERS[fmt](rgb)
        path = os.path.join(self.dir, f'e-{crc:08x}.{fmt}')
        tmp = path + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, path)
        with self.enc_lock:
            self.enc[fmt] = {'path': path, 'crc': f'{crc:08x}'}
            self._prune_enc()

    def _prune_enc(self):
        """每种格式只留最新 3 个（客户端可能硬链走，删了也不影响 link 计数）。"""
        for fmt in self.pre:
            files = sorted((os.path.join(self.dir, f) for f in os.listdir(self.dir)
                            if f.startswith('e-') and f.endswith('.' + fmt)),
                           key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0)
            for p in files[:-3]:
                try:
                    os.unlink(p)
                except OSError:
                    pass

    def _free_shm_ok(self):
        """tmpfs 全满会拖垮整机（D238 事故），保留 512MB 余量；不够就停（fail-closed）。"""
        try:
            sv = os.statvfs('/dev/shm')
            free_mb = sv.f_bavail * sv.f_frsize / (1024 * 1024)
            if free_mb < 512:
                self.last_err = f'/dev/shm 只剩 {free_mb:.0f}MB（<512MB），停止抓帧以免拖垮整机'
                return False
        except Exception:                                     # noqa: BLE001
            pass
        return True

    # ---- 主循环
    def _grab_once(self):
        """取一帧：screen 模式只走 XShm；window 模式 XShm 失败时回退 KWin ScreenShot2。

        window 模式的两个已知失败：① 窗口最小化 → XShm BadMatch（不可映射）；
        ② 窗口被销毁/换 id → BadWindow。前者用 KWin 兜底（实测最小化仍出**活帧**），
        后者交给外层重建。返回 (rgb, ms, src)。
        """
        try:
            rgb, ms = self.grabber.grab()
            return rgb, ms, 'xshm-window'
        except Exception as e:                            # noqa: BLE001
            if self.source != 'window':
                raise
            if self.kwin is None:
                self.kwin = KWinSS2(self.want_class)
            try:
                rgb, ms, kinfo = self.kwin.grab()
            except Exception as e2:                       # noqa: BLE001
                raise GrabError(f'XShm: {type(e).__name__}: {e}; '
                                f'KWin: {type(e2).__name__}: {e2}') from e2
            return rgb, ms, kinfo.get('src', 'kwin-ss2')

    def _log_fail(self, stage):
        """限频把抓帧失败打到 stdout（journal/nohup 日志里能看见）。

        2026-10-21：原先失败是**完全静默**的——`last_err` 只存在内存里，stdout 只有一行启动 JSON。
        于是「守护进程活着但一帧不写」在外部看起来和「守护进程没起」一模一样，只能靠猜。
        限频 3s，避免窗口不在时把日志刷爆。
        """
        now = time.time()
        if now - getattr(self, '_last_fail_log', 0.0) < 3.0:
            return
        self._last_fail_log = now
        print(json.dumps({'ok': False, 'role': 'serve', 'stage': stage,
                          'win': self.win, 'class': self.want_class,
                          'detail': self.last_err, 'frames_written': self.frames_written,
                          'ts': time.strftime('%Y-%m-%dT%H:%M:%S%z')}, ensure_ascii=False),
              flush=True)

    def capture_loop(self):
        period = 1.0 / self.fps
        last_ok = 0.0
        while not self.stop.is_set():
            t0 = time.perf_counter()
            if self.seq % 15 == 0 and not self._free_shm_ok():
                print(json.dumps({'ok': False, 'error': 'SHM_LOW', 'detail': self.last_err},
                                 ensure_ascii=False), flush=True)
                self.stop.set()
                break
            if not self.ensure_grabber():
                self._log_fail('grabber')
                # 连续 5 次找不到窗口 ⇒ 怀疑环境（XAUTHORITY 随会话变），自愈一次再试
                self.env_fails = getattr(self, 'env_fails', 0) + 1
                if self.env_fails >= 5:
                    self.env_fails = 0
                    self.grabber = None
                    try:
                        self._refresh_env()
                    except Exception:                         # noqa: BLE001
                        pass
                self.stop.wait(1.0)
                continue
            self.env_fails = 0
            try:
                rgb, ms, src = self._grab_once()
                self.capture_ms = ms
                self.last_src = src
                self.last_err = ''
            except Exception as e:                            # noqa: BLE001
                self.last_err = f'grab: {type(e).__name__}: {e}'
                # 两条路都失败（窗口没了/重启/换 id）：重建 grabber 与 KWin handle
                try:
                    self.grabber.close()
                except Exception:                             # noqa: BLE001
                    pass
                self.grabber = None
                if self.kwin is not None:
                    self.kwin.handle = None
                # 退避：窗口真的没了（缩窗/最小化/换 id）时不要每 0.5s 重建一次 grabber
                self.fail_backoff = min(5.0, getattr(self, 'fail_backoff', 0.5) * 2)
                self._log_fail('grab')
                self.stop.wait(self.fail_backoff)
                continue
            self.fail_backoff = 0.5
            self.seq += 1
            crc = zlib.crc32(rgb) & 0xffffffff
            crc8 = f'{crc:08x}'
            changed = crc != self.last_crc
            if not changed and self.last_rgb_path and os.path.exists(self.last_rgb_path):
                # 内容与上一帧逐字节相同：**不重写 11MB、不重编码**，只把「内容在此刻被再次确认」
                # 写进 wall_ns（age_ms 的语义 = 距最近一次内容确认，不是文件 mtime）。
                self.frames_reused += 1
                rgb_path = self.last_rgb_path
            else:
                self.last_crc = crc
                rgb_path = os.path.join(self.dir, f'f-{self.seq:09d}.rgb')
                write_rgb_atomic(rgb_path, rgb)   # 原子：读者不会看到半帧（2026-10-21）
                self.last_rgb_path = rgb_path
                self.frames_written += 1
            if changed:
                # BMP **同步**编码（3–5ms）：保证 state 一写出去，--format bmp 就一定命中当前内容
                # （异步编码会让客户端偶发 FORMAT_NOT_READY，实测 6/20 失败）。
                if 'bmp' in self.pre and self.enc['bmp']['crc'] != crc8:
                    try:
                        self._write_enc('bmp', crc, rgb)
                    except Exception as e:                    # noqa: BLE001
                        self.last_err = f'encode bmp: {type(e).__name__}: {e}'
                with self.enc_lock:
                    for fmt in self.pre:
                        if fmt == 'bmp':
                            continue
                        if self.enc[fmt]['crc'] != crc8:
                            self.enc_queue[fmt] = (crc, rgb)
                if self.enc_queue:
                    self.enc_event.set()
            if self.frames_written % 2 == 0:
                self._prune_rgb()
            self.write_state(rgb_path, crc)
            last_ok = time.time()
            dt = time.perf_counter() - t0
            self.loop_ms = dt * 1000
            self.stop.wait(max(0.0, period - dt))

    def _prune_rgb(self):
        files = sorted((os.path.join(self.dir, f) for f in os.listdir(self.dir)
                        if f.startswith('f-') and f.endswith('.rgb')))
        keep = set(files[-self.ring:])
        if getattr(self, 'last_rgb_path', None):
            keep.add(self.last_rgb_path)   # state 正在引用的帧**绝不回收**（否则读者拿到已删除路径）
        for p in files:
            if p in keep:
                continue
            try:
                os.unlink(p)
            except OSError:
                pass

    def write_state(self, rgb_path, crc):
        now = time.time()
        fast_age = int(max(0.0, now - self.fast_ts) * 1000) if self.fast_ts else 999999
        with self.strict_lock:
            strict = dict(self.strict)
            strict_age = int(max(0.0, time.time() - self.strict_ts) * 1000) if self.strict_ts else 999999
        with self.enc_lock:
            enc = {f: dict(v) for f, v in self.enc.items()}
        fields = [STATE_VERSION, str(self.seq), str(time.time_ns()),
                  time.strftime('%Y-%m-%dT%H:%M:%S%z'), str(self.args.width),
                  str(self.args.height), f'{crc:08x}', rgb_path,
                  enc.get('bmp', {}).get('path', ''), enc.get('bmp', {}).get('crc', ''),
                  enc.get('png', {}).get('path', ''), enc.get('png', {}).get('crc', ''),
                  enc.get('jpg', {}).get('path', ''), enc.get('jpg', {}).get('crc', ''),
                  self.fast.get('verdict', 'UNKNOWN'), str(fast_age),
                  strict.get('verdict', 'UNKNOWN'), str(strict_age), strict.get('src', 'none'),
                  str(self.win or ''), self.want_class,
                  str(0), str(os.getpid()),
                  ('background' if self.source == 'window' else 'screen'),
                  self.last_src,
                  ('1' if self.strict.get('verdict') == 'OK' else '0')]
        line = '\x1f'.join(fields) + '\n'
        tmp = os.path.join(self.dir, '.state.tsv.tmp')
        with open(tmp, 'w') as f:
            f.write(line)
        os.replace(tmp, os.path.join(self.dir, 'state.tsv'))
        if self.seq % 10 == 0:
            json_tmp = os.path.join(self.dir, '.state.json.tmp')
            with open(json_tmp, 'w') as f:
                json.dump({'seq': self.seq, 'crc32': f'{crc:08x}', 'rgb': rgb_path,
                           'enc': enc, 'fast': self.fast, 'fast_age_ms': fast_age,
                           'strict': strict, 'strict_age_ms': strict_age,
                           'capture_ms': round(self.capture_ms, 2),
                           'loop_ms': round(self.loop_ms, 2),
                           'frames_written': self.frames_written,
                           'frames_reused': self.frames_reused,
                           'win': self.win, 'class': self.want_class,
                           'last_err': self.last_err,
                           'ts': time.strftime('%Y-%m-%dT%H:%M:%S%z')},
                          f, ensure_ascii=False)
            os.replace(json_tmp, os.path.join(self.dir, 'state.json'))

    def run(self):
        os.makedirs(self.dir, exist_ok=True)
        with open(os.path.join(self.dir, 'daemon.pid'), 'w') as f:
            f.write(str(os.getpid()))
        threads = [threading.Thread(target=self.fast_loop, daemon=True, name='fast'),
                   threading.Thread(target=self.strict_loop, daemon=True, name='strict')]
        if self.pre:
            threads.append(threading.Thread(target=self.encode_loop, daemon=True, name='enc'))
        for t in threads:
            t.start()
        print(json.dumps({'ok': True, 'role': 'serve', 'pid': os.getpid(), 'dir': self.dir,
                          'fps': self.fps, 'ring': self.ring, 'pre': self.pre,
                          'win': self.win, 'class': self.want_class}, ensure_ascii=False),
              flush=True)
        try:
            self.capture_loop()
        except KeyboardInterrupt:
            pass
        finally:
            self.stop.set()
            if self.grabber:
                self.grabber.close()
            for name in ('state.tsv', 'daemon.pid'):
                try:
                    os.unlink(os.path.join(self.dir, name))
                except OSError:
                    pass


# ─────────────────────────────────────────────────────────────── CLI 子命令
def cmd_serve(args):
    d = Daemon(args)

    def _stop(_sig, _frm):
        d.stop.set()
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    d.run()
    return 0


def cmd_status(args):
    d = args.dir
    st = {}
    p = os.path.join(d, 'state.json')
    if os.path.exists(p):
        with open(p) as f:
            st = json.load(f)
    pidf = os.path.join(d, 'daemon.pid')
    alive = False
    if os.path.exists(pidf):
        try:
            pid = int(open(pidf).read().strip())
            os.kill(pid, 0)
            alive = True
        except Exception:                                     # noqa: BLE001
            alive = False
    out = {'dir': d, 'daemon_alive': alive, 'state': st}
    print(json.dumps(out, ensure_ascii=False, indent=1 if args.pretty else None))
    return 0


def cmd_stop(args):
    pidf = os.path.join(args.dir, 'daemon.pid')
    if not os.path.exists(pidf):
        print(json.dumps({'ok': True, 'note': '没有 daemon.pid（未在跑）'}))
        return 0
    pid = int(open(pidf).read().strip())
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            time.sleep(0.05)
            try:
                os.kill(pid, 0)
            except OSError:
                break
        print(json.dumps({'ok': True, 'stopped_pid': pid}))
        return 0
    except Exception as e:                                    # noqa: BLE001
        print(json.dumps({'ok': False, 'error': f'{type(e).__name__}: {e}'}))
        return 1


def cmd_encode(args):
    """离线：raw RGB → png/bmp/jpg（客户端 --encode-if-needed 用它；也可单独用）。"""
    import numpy as np
    rgb = np.fromfile(args.raw, np.uint8)
    if rgb.size != args.width * args.height * 3:
        print(json.dumps({'ok': False, 'error': f'raw 大小 {rgb.size} != '
                                                f'{args.width*args.height*3}'}))
        return 3
    rgb = rgb.reshape(args.height, args.width, 3)
    t0 = time.perf_counter()
    data = ENCODERS[args.format](rgb)
    with open(args.out, 'wb') as f:
        f.write(data)
    ms = (time.perf_counter() - t0) * 1000
    print(json.dumps({'ok': True, 'format': args.format, 'out': args.out,
                      'bytes': len(data), 'ms': round(ms, 2)}, ensure_ascii=False))
    return 0


def cmd_selftest(args):
    """离线自测（不碰屏幕）：① 编码器往返 ② 客户端四道闸门的 fail-closed 行为。

    闸门用例全部用**夹具状态文件 + 夹具帧**，跑的是真 bash 客户端（不是另写一份判据）：
    拒绝时必须非零退出且**不落任何像素文件**。
    """
    import numpy as np
    from PIL import Image
    cli = args.cli or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ys-capture')
    root = args.workdir or '.scratch/gui-perf/selftest'
    os.makedirs(root, exist_ok=True)
    results = []

    def record(name, ok, detail):
        results.append({'case': name, 'ok': bool(ok), 'detail': detail})
        print(('PASS ' if ok else 'FAIL ') + name + '  ' + str(detail), flush=True)

    # ── ① 编码器往返（BMP/PNG 必须逐像素相等；JPEG 只验可解码）
    arr = np.random.randint(0, 256, (48, 64, 3), dtype=np.uint8)
    for fmt in ('bmp', 'png', 'jpg'):
        t0 = time.perf_counter()
        try:
            data = ENCODERS[fmt](arr)
            p = os.path.join(root, f'enc.{fmt}')
            with open(p, 'wb') as f:
                f.write(data)
            with Image.open(p) as im:
                got = np.asarray(im.convert('RGB'))
            ms = (time.perf_counter() - t0) * 1000
            if fmt == 'jpg':
                ok = got.shape == arr.shape
                detail = f'{len(data)}B {ms:.1f}ms（有损，只验可解码）'
            else:
                ok = got.shape == arr.shape and np.array_equal(got, arr)
                detail = f'{len(data)}B {ms:.1f}ms 逐像素相等={ok}'
        except Exception as e:                                # noqa: BLE001
            ok, detail = False, f'{type(e).__name__}: {e}'
        record(f'encode_roundtrip_{fmt}', ok, detail)

    # ── ①b 桌面维度三态（本机 EWMH 只报 1 个桌面 ⇒ 该维度不可判，必须报 unavailable）
    for (wd, cd, nd), want in (((0, 0, 1), 'unavailable'), ((3, 2, 4), 'mismatch'),
                               ((2, 2, 4), 'ok'), ((None, 0, 4), 'unavailable')):
        got = desktop_check(wd, cd, nd)
        record(f'desktop_check_{wd}_{cd}_{nd}', got == want, f'got={got} want={want}')

    # ── ② 客户端闸门
    fx = os.path.join(root, 'fixtures')
    os.makedirs(fx, exist_ok=True)
    frame = os.path.join(fx, 'frame.rgb')
    with open(frame, 'wb') as f:
        f.write(np.zeros((48, 64, 3), np.uint8).tobytes())
    bmp = os.path.join(fx, 'e-deadbeef.bmp')
    with open(bmp, 'wb') as f:
        f.write(encode_bmp(np.zeros((48, 64, 3), np.uint8)))
    crc = 'deadbeef'

    def write_state(name, **kw):
        d = dict(seq=7, wall_ns=time.time_ns(), w=64, h=48, crc=crc,
                 rgb=frame, bmp=bmp, bcrc=crc, png='', pcrc='', jpg='', jcrc='',
                 fast='OK', fage=12, strict='OK', sage=200, ssrc='kwin',
                 win='0x01400001', klass='yuanshen.exe', pid=0, dpid=os.getpid(),  # noqa: phantom-id 自测夹具的合成状态，不是真实窗口
                 mode='screen', src='xshm-window', visible='1')
        d.update(kw)
        line = '\x1f'.join(str(v) for v in [STATE_VERSION, d['seq'], d['wall_ns'],
                                          time.strftime('%Y-%m-%dT%H:%M:%S%z'),
                                          d['w'], d['h'], d['crc'], d['rgb'],
                                          d['bmp'], d['bcrc'], d['png'], d['pcrc'],
                                          d['jpg'], d['jcrc'], d['fast'], d['fage'],
                                          d['strict'], d['sage'], d['ssrc'], d['win'],
                                          d['klass'], d['pid'], d['dpid'],
                                          d['mode'], d['src'], d['visible']]) + '\n'
        p = os.path.join(fx, f'state-{name}.tsv')
        with open(p, 'w') as f:
            f.write(line)
        return p

    env0 = {**os.environ, 'YS_CAPTURE_DIR': fx, 'DISPLAY': args.display}

    def run_client(state_path, out_name, extra=None, skip_daemon=True):
        out = os.path.join(fx, out_name)
        if os.path.exists(out):
            os.unlink(out)
        env = dict(env0)
        env['YS_CAPTURE_STATE'] = state_path
        if skip_daemon:
            env['YS_CAPTURE_SKIP_DAEMON_CHECK'] = '1'
        cmd = [cli, 'latest', '--out', out, '--format', 'bmp'] + (extra or [])
        p = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=20)
        return p.returncode, p.stdout.strip(), out, os.path.exists(out) and os.path.getsize(out) > 0

    cases = [
        # name, kwargs, expected_rc, expect_pixels, extra_args, skip_daemon
        ('ok_bmp', {}, 0, True, [], True),
        # 2026-10-22 策略变更（用户裁决：AI 不该为了读一眼屏幕先学切虚拟桌面）
        # 感知默认允许跨桌面；只有动作前校验才要求"与用户当前所见一致"。
        ('other_desktop_allowed', {'strict': 'OTHER_DESKTOP'}, 0, True, [], True),
        ('other_desktop_require_current', {'strict': 'OTHER_DESKTOP'}, 4, False,
         ['--require-current-desktop'], True),
        ('strict_occluded', {'strict': 'OCCLUDED'}, 5, False, [], True),
        ('strict_stale', {'sage': 60000}, 9, False, [], True),
        ('fast_occluded', {'fast': 'OCCLUDED'}, 5, False, [], True),
        ('fast_not_found', {'fast': 'NOT_FOUND'}, 2, False, [], True),
        ('kwin_unavailable', {'ssrc': 'x11', 'strict': 'OK'}, 9, False, [], True),
        ('frame_stale', {'wall_ns': time.time_ns() - 5_000_000_000}, 8, False, [], True),
        ('daemon_down', {'dpid': 999999}, 7, False, [], False),
        # 2026-10-21：bmp/png 缺预编码时**自动按需编码**（此前 png 恒定 rc=10，
        # 根因是守护默认 --pre bmp、从不预编码 png；用户报了"稳定报 FORMAT_NOT_READY"）
        ('png_auto_encode', {}, 0, True, ['--format', 'png'], True),
        # jpg 编码 1.8s ⇒ 仍必须显式 --encode-if-needed，不许自动
        ('jpg_needs_optin', {}, 10, False, ['--format', 'jpg'], True),
        ('allow_background', {'strict': 'OTHER_DESKTOP'}, 0, True,
         ['--allow-background'], True),
        # --source window（background）：不可见也必须出像素，但必须**明示 background**
        ('background_mode', {'mode': 'background', 'src': 'kwin-ss2', 'visible': '0',
                             'fast': 'OTHER_DESKTOP', 'strict': 'OTHER_DESKTOP'}, 0, True,
         ['--allow-background'], True),
        # 语义门禁：background 帧 + **不带** --allow-background ⇒ 必须拒且不落像素
        ('background_requires_flag', {'mode': 'background', 'src': 'kwin-ss2', 'visible': '0',
                                     'fast': 'OTHER_DESKTOP', 'strict': 'OTHER_DESKTOP'},
         12, False, [], True),
        ('background_identity_fail', {'mode': 'background', 'fast': 'NOT_FOUND'}, 2, False,
         ['--allow-background'], True),
    ]
    for name, kw, want_rc, want_px, extra, skip in cases:
        sp = write_state(name, **kw)
        try:
            rc, out, path, has_px = run_client(sp, f'out-{name}.bmp', extra, skip)
            ok = (rc == want_rc) and (has_px == want_px)
            detail = f'rc={rc}(want {want_rc}) pixels={has_px}(want {want_px})'
            if name == 'background_requires_flag':
                ok = ok and ('BACKGROUND_NOT_ALLOWED' in out) and ('allow-background' in out)
                detail += ' hint=' + str('allow-background' in out)
            if name == 'background_mode':
                ok = ok and ('"capture_mode":"background"' in out) and ('"visible":0' in out)
                detail += ' bg_fields=' + str('"capture_mode":"background"' in out and '"visible":0' in out)
            if name == 'allow_background':
                ok = ok and ('"allow_background":1' in out)
                detail += ' json_allow_background=' + str('"allow_background":1' in out)
            if name == 'ok_bmp' and has_px:
                same = open(path, 'rb').read() == open(bmp, 'rb').read()
                ok = ok and same
                detail += f' bytes_equal={same}'
        except Exception as e:                                # noqa: BLE001
            ok, detail = False, f'{type(e).__name__}: {e}'
        record(f'gate_{name}', ok, detail)

    passed = sum(1 for r in results if r['ok'])
    total = len(results)
    summary = {'ok': passed == total, 'passed': passed, 'total': total,
               'results': results, 'workdir': os.path.abspath(root)}
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0 if passed == total else 1


def main(argv=None):
    ap = argparse.ArgumentParser(prog='ys_capture.py')
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('serve')
    s.add_argument('--dir', default=os.environ.get('YS_CAPTURE_DIR', DEFAULT_DIR))
    s.add_argument('--display', default=os.environ.get('DISPLAY') or ':1')
    s.add_argument('--win', default=os.environ.get('YS_WIN') or DEFAULT_WIN)
    s.add_argument('--class', dest='class_', default=DEFAULT_CLASS)
    s.add_argument('--fps', type=float, default=10.0)
    s.add_argument('--ring', type=int, default=4)
    s.add_argument('--pre', default='bmp')
    s.add_argument('--source', default=os.environ.get('YS_CAPTURE_SOURCE', 'screen'),
                   choices=['screen', 'window'],
                   help='screen=要求窗口可见（原语义）；window=按窗口抓（后台窗口也能抓，明示 background）')
    s.add_argument('--fast-sec', type=float, default=0.3)
    s.add_argument('--strict-sec', type=float, default=1.5)
    s.add_argument('--width', type=int, default=FRAME_W)
    s.add_argument('--height', type=int, default=FRAME_H)
    s.set_defaults(func=cmd_serve)
    st = sub.add_parser('status')
    st.add_argument('--dir', default=os.environ.get('YS_CAPTURE_DIR', DEFAULT_DIR))
    st.add_argument('--pretty', action='store_true')
    st.set_defaults(func=cmd_status)
    sp = sub.add_parser('stop')
    sp.add_argument('--dir', default=os.environ.get('YS_CAPTURE_DIR', DEFAULT_DIR))
    sp.set_defaults(func=cmd_stop)
    se = sub.add_parser('encode')
    se.add_argument('raw')
    se.add_argument('--format', default='png')
    se.add_argument('--out', required=True)
    se.add_argument('--width', type=int, default=FRAME_W)
    se.add_argument('--height', type=int, default=FRAME_H)
    se.set_defaults(func=cmd_encode)
    ss = sub.add_parser('selftest')
    ss.add_argument('--cli', default='')
    ss.add_argument('--workdir', default='')
    ss.add_argument('--display', default=os.environ.get('DISPLAY') or ':1')
    ss.set_defaults(func=cmd_selftest)
    a = ap.parse_args(argv)
    return a.func(a)


if __name__ == '__main__':
    sys.exit(main())
