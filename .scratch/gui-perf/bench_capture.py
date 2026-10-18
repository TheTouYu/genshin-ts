#!/usr/bin/env python3
"""bench_capture.py — 抓帧路径横评（票 25/33；只读，不改任何共享工具语义）。

测什么：
  1) spectacle 全屏 PNG（当前 ys-observe 走的路）
  2) import -window <win> PNG / raw（ImageMagick，XGetImage + PNG 编码）
  3) python-xlib XGetImage（进程内，热）
  4) XShmGetImage（进程内，热；ctypes+libXext 共享内存）
  5) ffmpeg x11grab -window_id 连续流（steady-state 每帧）
  6) grim（KDE Wayland 期望失败）
  7) import -window root / ffmpeg -i :1（Xwayland rootless 全屏，期望全黑/失败）
  8) ys-observe frame 端到端（当前唯一取数入口）

每个方法给：min/median/max ms、成功/失败、输出字节、内容指纹（32×18 块均值）、
CPU（进程/子进程 cpu 时间）与 GPU（nvidia-smi 采样）。

用法：python3 .scratch/gui-perf/bench_capture.py --iters 5 --out .scratch/gui-perf/capture-bench.json
"""
import argparse
import ctypes
import ctypes.util
import json
import os
import subprocess
import sys
import time

import numpy as np

DISPLAY = os.environ.get('DISPLAY') or ':1'
WIN = os.environ.get('YS_WIN') or '0x01400001'
W, H = 2560, 1440
BPP = 4                      # ZPixmap 32bpp
FRAME_BYTES = W * H * 3

ENV = {
    **os.environ,
    'DISPLAY': DISPLAY,
    'XDG_RUNTIME_DIR': os.environ.get('XDG_RUNTIME_DIR', '/run/user/1000'),
    'DBUS_SESSION_BUS_ADDRESS': os.environ.get('DBUS_SESSION_BUS_ADDRESS',
                                               'unix:path=/run/user/1000/bus'),
    'WAYLAND_DISPLAY': os.environ.get('WAYLAND_DISPLAY', 'wayland-1'),
}

# ── X11 / XShm（ctypes，进程内，无第三方绑定依赖）
x11 = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
xext = ctypes.CDLL(ctypes.util.find_library('Xext') or 'libXext.so.6')
libc = ctypes.CDLL(ctypes.util.find_library('c') or 'libc.so.6', use_errno=True)
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XDefaultScreen.restype = ctypes.c_int
x11.XDefaultScreen.argtypes = [ctypes.c_void_p]
x11.XDefaultVisual.restype = ctypes.c_void_p
x11.XDefaultVisual.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDefaultDepth.restype = ctypes.c_int
x11.XDefaultDepth.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]


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
xext.XShmGetImage.restype = ctypes.c_void_p
xext.XShmGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p,
                              ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
libc.shmget.restype = ctypes.c_int
libc.shmat.restype = ctypes.c_void_p


class ShmGrabber:
    """进程内 XShm 抓帧器：一次 attach，之后每帧 ~1-15ms。"""

    def __init__(self):
        self.dpy = x11.XOpenDisplay(DISPLAY.encode())
        if not self.dpy:
            raise RuntimeError(f'XOpenDisplay({DISPLAY}) 失败')
        scr = x11.XDefaultScreen(self.dpy)
        vis = x11.XDefaultVisual(self.dpy, scr)
        dep = x11.XDefaultDepth(self.dpy, scr)
        self.size = W * H * BPP
        self.shmid = libc.shmget(0, ctypes.c_size_t(self.size), ctypes.c_int(0o100600))
        self.addr = libc.shmat(ctypes.c_int(self.shmid), ctypes.c_void_p(0), ctypes.c_int(0))
        if self.addr in (None, ctypes.c_void_p(-1).value):
            raise RuntimeError('shmat 失败')
        self.seg = ShmSeg(0, self.shmid, self.addr, 0)
        self.img = xext.XShmCreateImage(self.dpy, vis, dep, 2, ctypes.c_void_p(self.addr),
                                        ctypes.byref(self.seg), W, H)
        if not self.img:
            raise RuntimeError('XShmCreateImage 失败')
        if not xext.XShmAttach(self.dpy, ctypes.byref(self.seg)):
            raise RuntimeError('XShmAttach 失败')
        x11.XSync(self.dpy, 0)

    def grab(self):
        t0 = time.perf_counter()
        ok = xext.XShmGetImage(self.dpy, int(WIN, 16), self.img, 0, 0, 0xffffffff)
        x11.XSync(self.dpy, 0)
        t1 = time.perf_counter()
        return ok, (t1 - t0) * 1000.0


def sha16(a):
    import hashlib
    return hashlib.blake2b(np.ascontiguousarray(a).tobytes(), digest_size=8).hexdigest()


def signature(rgb):
    """32×18 块均值指纹：用于判断两条通道抓的是不是同一块内容（动画容忍）。"""
    a = rgb.astype(np.float32)
    bh, bw = H // 18, W // 32
    blocks = a[:bh * 18, :bw * 32].reshape(18, bh, 32, bw, 3).mean(axis=(1, 3))
    return blocks.round(1)


def sig_diff(a, b):
    d = np.abs(a - b)
    return {'mean': round(float(d.mean()), 2), 'max': round(float(d.max()), 2),
            'blocks_over_8': int((d.max(axis=2) > 8).sum())}


def gpu_sample():
    try:
        out = subprocess.run(
            ['nvidia-smi', '--query-gpu=utilization.gpu,utilization.memory,memory.used,temperature.gpu',
             '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=4).stdout
        vals = [v.strip() for v in out.strip().split(',')]
        return {'gpu_util_pct': int(vals[0]), 'mem_util_pct': int(vals[1]),
                'vram_used_mib': int(vals[2]), 'temp_c': int(vals[3])}
    except Exception as e:                                    # noqa: BLE001
        return {'error': f'{type(e).__name__}: {e}'}


def sample_gpu_during(fn, seconds):
    """跑 fn 循环 seconds 秒，期间 1Hz 采 GPU；返回 {samples, peak_util, peak_vram}。"""
    samples = [gpu_sample()]
    end = time.time() + seconds
    while time.time() < end:
        fn()
        samples.append(gpu_sample())
    return {'samples': samples,
            'peak_gpu_util_pct': max(s.get('gpu_util_pct', 0) for s in samples),
            'peak_vram_mib': max(s.get('vram_used_mib', 0) for s in samples)}


# ── 各方法实现：返回 (ok, ms, payload_bytes, frame_rgb_or_None, note)
def m_xshm(g):
    ok, ms = g.grab()
    if not ok:
        return False, ms, 0, None, 'XShmGetImage 返回 0'
    bgra = np.frombuffer(ctypes.string_at(g.addr, g.size), np.uint8).reshape(H, W, 4)
    rgb = np.ascontiguousarray(bgra[:, :, :3][:, :, ::-1])
    return True, ms, FRAME_BYTES, rgb, ''


def m_xlib_getimage(g):
    from Xlib import display as xd, X
    if not hasattr(g, 'xl_dpy'):
        g.xl_dpy = xd.Display(DISPLAY)
        g.xl_win = g.xl_dpy.create_resource_object('window', int(WIN, 16))
    t0 = time.perf_counter()
    raw = g.xl_win.get_image(0, 0, W, H, X.ZPixmap, 0xffffffff)
    ms = (time.perf_counter() - t0) * 1000
    bgra = np.frombuffer(raw.data, np.uint8).reshape(H, W, 4)
    return True, ms, len(raw.data), np.ascontiguousarray(bgra[:, :, :3][:, :, ::-1]), ''


def m_import(g, fmt):
    path = f'/dev/shm/bench_import.{fmt}'
    t0 = time.perf_counter()
    if fmt == 'png':
        p = subprocess.run(['import', '-window', WIN, path], capture_output=True, text=True,
                           timeout=30, env=ENV)
        ms = (time.perf_counter() - t0) * 1000
        if p.returncode != 0:
            return False, ms, 0, None, p.stderr.strip()[:160]
        from PIL import Image
        rgb = np.asarray(Image.open(path).convert('RGB'))
        return True, ms, os.path.getsize(path), rgb, ''
    p = subprocess.run(['import', '-window', WIN, '-depth', '8', 'rgb:-'],
                       capture_output=True, timeout=30, env=ENV)
    ms = (time.perf_counter() - t0) * 1000
    if p.returncode != 0 or len(p.stdout) != FRAME_BYTES:
        return False, ms, len(p.stdout or b''), None, p.stderr.decode()[:160]
    return True, ms, len(p.stdout), np.frombuffer(p.stdout, np.uint8).reshape(H, W, 3), ''


def m_spectacle(g):
    path = '/dev/shm/bench_spectacle.png'
    t0 = time.perf_counter()
    p = subprocess.run(['spectacle', '-b', '-n', '-f', '-o', path], capture_output=True,
                       text=True, timeout=40, env=ENV)
    ms = (time.perf_counter() - t0) * 1000
    if p.returncode != 0 or not os.path.exists(path):
        return False, ms, 0, None, (p.stderr or '')[:160]
    from PIL import Image
    rgb = np.asarray(Image.open(path).convert('RGB'))
    return True, ms, os.path.getsize(path), rgb, ''


def m_grim(g):
    path = '/dev/shm/bench_grim.png'
    t0 = time.perf_counter()
    p = subprocess.run(['grim', path], capture_output=True, text=True, timeout=20, env=ENV)
    ms = (time.perf_counter() - t0) * 1000
    exists = os.path.exists(path)
    note = (p.stderr or '').strip()[:160] or ('rc=0 但无输出文件' if not exists else '')
    if not exists:
        return False, ms, 0, None, f'rc={p.returncode} {note}'
    from PIL import Image
    return True, ms, os.path.getsize(path), np.asarray(Image.open(path).convert('RGB')), note


def m_root_import(g):
    path = '/dev/shm/bench_root.png'
    t0 = time.perf_counter()
    p = subprocess.run(['import', '-window', 'root', path], capture_output=True, text=True,
                       timeout=30, env=ENV)
    ms = (time.perf_counter() - t0) * 1000
    if p.returncode != 0 or not os.path.exists(path):
        return False, ms, 0, None, (p.stderr or '')[:160]
    from PIL import Image
    rgb = np.asarray(Image.open(path).convert('RGB'))
    return True, ms, os.path.getsize(path), rgb, f'mean={rgb.mean():.1f}'


def m_ffmpeg_root(g):
    t0 = time.perf_counter()
    p = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'x11grab',
                        '-video_size', f'{W}x{H}', '-i', DISPLAY, '-frames:v', '1',
                        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True,
                       timeout=30, env=ENV)
    ms = (time.perf_counter() - t0) * 1000
    if p.returncode != 0 or len(p.stdout) != FRAME_BYTES:
        return False, ms, len(p.stdout or b''), None, p.stderr.decode()[:160]
    rgb = np.frombuffer(p.stdout, np.uint8).reshape(H, W, 3)
    return True, ms, len(p.stdout), rgb, f'mean={rgb.mean():.1f}'


def m_ffmpeg_stream(g, seconds=3.0, fps=30):
    """连续流：ffmpeg x11grab + window_id → rawvideo pipe；读 3 秒，统计每帧间隔（=稳态单帧成本）。

    注意：这正是「常驻采集」的候选实现——ffmpeg 读回一帧就写一帧，读取端只保留最新。
    """
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'x11grab', '-window_id', WIN,
           '-video_size', f'{W}x{H}', '-framerate', str(fps), '-i', DISPLAY,
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    t0 = time.perf_counter()
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=ENV)
    intervals, frames = [], 0
    last = None
    try:
        while time.perf_counter() - t0 < seconds:
            buf = p.stdout.read(FRAME_BYTES)
            if not buf or len(buf) < FRAME_BYTES:
                break
            now = time.perf_counter()
            frames += 1
            if last is not None:
                intervals.append((now - last) * 1000)
            last = now
            if frames == 1:
                rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    finally:
        p.terminate()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
    if frames < 2:
        return False, 0, 0, None, f'只读到 {frames} 帧'
    steady = sorted(intervals)[len(intervals) // 2]
    return True, steady, frames * FRAME_BYTES, rgb, {'frames': frames,
                                                     'first_frame_ms': round((last or t0) - t0, 1),
                                                     'intervals_ms': [round(x, 1) for x in intervals[:12]]}


def m_ys_observe(g):
    t0 = time.perf_counter()
    p = subprocess.run(['tools/ys-editor/ys-observe', 'frame'], capture_output=True, text=True,
                       timeout=60, env=ENV)
    ms = (time.perf_counter() - t0) * 1000
    try:
        obj = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:                                         # noqa: BLE001
        return False, ms, 0, None, (p.stdout + p.stderr)[:200]
    if p.returncode != 0 or 'path' not in obj:
        return False, ms, 0, None, f'rc={p.returncode} {obj.get("error")}: {obj.get("detail","")[:120]}'
    from PIL import Image
    rgb = np.asarray(Image.open(obj['path']).convert('RGB'))
    return True, ms, os.path.getsize(obj['path']), rgb, {'verdict': obj.get('attribution', {}).get('verdict'),
                                                        'source': obj.get('source')}


def run_method(name, fn, iters, grabber):
    samples, last = [], None
    cpu0 = time.process_time()
    for i in range(iters):
        try:
            ok, ms, nbytes, rgb, note = fn(grabber)
        except Exception as e:                                # noqa: BLE001
            ok, ms, nbytes, rgb, note = False, 0.0, 0, None, f'{type(e).__name__}: {e}'
        samples.append({'ok': ok, 'ms': round(ms, 2), 'bytes': nbytes, 'note': note})
        if rgb is not None and last is None:
            last = rgb
    cpu = time.process_time() - cpu0
    ok_ms = sorted(s['ms'] for s in samples if s['ok'])
    return {
        'method': name,
        'iters': iters,
        'samples': samples,
        'ok_count': sum(1 for s in samples if s['ok']),
        'min_ms': ok_ms[0] if ok_ms else None,
        'median_ms': ok_ms[len(ok_ms) // 2] if ok_ms else None,
        'max_ms': ok_ms[-1] if ok_ms else None,
        'cpu_ms_total': round(cpu * 1000, 1),
        'cpu_ms_per_call': round(cpu * 1000 / max(1, iters), 1),
        'content_sig': signature(last).tolist() if last is not None else None,
        'sha16': sha16(last) if last is not None else None,
        'note': samples[-1]['note'] if samples else '',
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--iters', type=int, default=5)
    ap.add_argument('--out', default='.scratch/gui-perf/capture-bench.json')
    ap.add_argument('--raw-dir', default='.scratch/gui-perf/raw')
    a = ap.parse_args()
    os.makedirs(a.raw_dir, exist_ok=True)
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    g = ShmGrabber()
    results = []
    items = [
        ('xshm_inproc', m_xshm),
        ('xlib_getimage_inproc', m_xlib_getimage),
        ('import_window_png', lambda gg: m_import(gg, 'png')),
        ('import_window_raw_rgb', lambda gg: m_import(gg, 'raw')),
        ('ffmpeg_stream_steady_frame', m_ffmpeg_stream),
        ('ffmpeg_one_shot_root', m_ffmpeg_root),
        ('import_root_png', m_root_import),
        ('spectacle_fullscreen', m_spectacle),
        ('grim', m_grim),
        ('ys_observe_frame_e2e', m_ys_observe),
    ]
    for name, fn in items:
        it = 1 if name in ('ffmpeg_stream_steady_frame', 'ys_observe_frame_e2e') else a.iters
        r = run_method(name, fn, it, g)
        # GPU 采样：对每条通道跑 ~1.2s 循环
        def loop(fn=fn):
            try:
                fn(g)
            except Exception:                                 # noqa: BLE001
                pass
        try:
            r['gpu'] = sample_gpu_during(loop, 1.2)
        except Exception as e:                                # noqa: BLE001
            r['gpu'] = {'error': f'{type(e).__name__}: {e}'}
        results.append(r)
        print(f"{name:30s} ok={r['ok_count']}/{r['iters']} "
              f"min={r['min_ms']} med={r['median_ms']} max={r['max_ms']} "
              f"cpu/call={r['cpu_ms_per_call']}ms gpu_peak={r['gpu'].get('peak_gpu_util_pct')} "
              f"note={str(r['note'])[:80]}", flush=True)
    # 内容对账：以 xshm 为参照
    ref = next((r for r in results if r['method'] == 'xshm_inproc'), None)
    if ref and ref['content_sig']:
        ref_sig = np.array(ref['content_sig'])
        for r in results:
            if r['content_sig']:
                r['content_vs_xshm'] = sig_diff(np.array(r['content_sig']), ref_sig)
            else:
                r['content_vs_xshm'] = None
    docs = {'ts': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'display': DISPLAY, 'window': WIN,
            'screen': [W, H], 'cpu_count': os.cpu_count(), 'results': results}
    with open(a.out, 'w') as f:
        json.dump(docs, f, ensure_ascii=False, indent=1)
    print('wrote', a.out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
