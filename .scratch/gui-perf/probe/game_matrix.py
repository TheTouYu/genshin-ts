#!/usr/bin/env python3
"""游戏窗口矩阵：跨桌面 / 遮挡（move 到当前桌面并被 Firefox 完全盖住）/ 最小化，两条路径各测。

安全：所有状态改动都包在 try/finally 里还原（desktop 3 + 非最小化 + keepBelow=false），
并在开始/结束记录 currentDesktop 与 activeWindow，确保没把用户桌面切走。
"""
import importlib.util, json, sys, time
import numpy as np

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

kc = load('kc', '.scratch/gui-perf/probe/kwin_capture.py')
kd = load('kd', '.scratch/gui-perf/probe/kwin_do.py')
H = '{02ef18e8-9e9a-420d-8639-cb530e58b04b}'
XWIN, W, Hh = 0x01400001, 2560, 1440
CLS = 'yuanshen'


def state():
    js = '''
var ord = workspace.stackingOrder, g = null;
for (var i=0;i<ord.length;i++){var w=ord[i];
  if (String(w.resourceClass||"").toLowerCase().indexOf("yuanshen")>=0) g = w; }
var cur = workspace.currentDesktop;
console.info("YS-TAG cur=" + (cur && cur.x11DesktopNumber) + " active=" + (workspace.activeWindow ? String(workspace.activeWindow.resourceClass) : "-") + " game=" + (g ? ("ds=" + (g.desktops.length ? g.desktops[0].x11DesktopNumber : "-") + " min=" + (g.minimized?1:0) + " idx=" + g.stackingOrderIndex) : "none"));
'''
    lines = kd.kwin_js(js, wait=1.0)
    return lines[-1] if lines else 'unknown'


def set_game(js_body):
    return kd.kwin_js('''
var ord = workspace.stackingOrder, g = null;
for (var i=0;i<ord.length;i++){var w=ord[i];
  if (String(w.resourceClass||"").toLowerCase().indexOf("yuanshen")>=0) g = w; }
if (g) { %s }
console.info("YS-TAG done " + (g ? "ok" : "nogame"));
''' % js_body, wait=1.5)


kg = kc.XShmGrab(XWIN, W, Hh)

def cap_x():
    arr, ms, ok = kg.grab(); return arr[:, :, :3], ms

def cap_k():
    arr, meta, ms = kc.kwin_capture(H); return arr, ms

def pair(fn):
    t0 = time.perf_counter(); a, msa = fn(); msa = (time.perf_counter() - t0) * 1000
    time.sleep(0.7)
    t0 = time.perf_counter(); b, msb = fn(); msb = (time.perf_counter() - t0) * 1000
    d = int(np.count_nonzero(np.any(a[:, :, :3] != b[:, :, :3], axis=2)))
    return {'ms': [round(msa, 1), round(msb, 1)], 'diff_px': d, 'live': d > 0,
            'mean': [round(float(a[:, :, :3].mean()), 1), round(float(b[:, :, :3].mean()), 1)]}

out = {'start_state': state()}
try:
    # A) 跨桌面（现状：游戏在 desktop 3，当前 1）
    a = {'xshm': pair(cap_x)}
    try:
        a['kwin'] = pair(cap_k)
    except Exception as e:                                # noqa: BLE001
        a['kwin'] = {'error': f'{type(e).__name__}: {e}'}
    out['A_cross_desktop'] = a
    print(json.dumps({'A_cross_desktop': a}, ensure_ascii=False), flush=True)

    # B) 遮挡：移到当前桌面 + 压到 Firefox 底下
    set_game('g.desktops = [workspace.currentDesktop]; g.keepBelow = true;')
    out['state_B'] = state()
    b = {}
    for name, fn in (('xshm', cap_x), ('kwin', cap_k)):
        try:
            b[name] = pair(fn)
        except Exception as e:                            # noqa: BLE001
            b[name] = {'error': f'{type(e).__name__}: {e}'}
    out['B_occluded'] = b
    print(json.dumps({'B_occluded': b}, ensure_ascii=False), flush=True)

    # C) 最小化（在它自己的桌面上）
    set_game('g.minimized = true;')
    out['state_C'] = state()
    c = {}
    for name, fn in (('xshm', cap_x), ('kwin', cap_k)):
        try:
            c[name] = pair(fn)
        except Exception as e:                            # noqa: BLE001
            c[name] = {'error': f'{type(e).__name__}: {e}'}
    out['C_minimized'] = c
    print(json.dumps({'C_minimized': c}, ensure_ascii=False), flush=True)
finally:
    # 还原：非最小化 + 非 keepBelow + 桌面 3；并核验当前桌面没被切走
    set_game('''
      g.minimized = false; g.keepBelow = false;
      var d3 = null;
      for (var k=0;k<workspace.desktops.length;k++){ if (workspace.desktops[k].x11DesktopNumber === 3) d3 = workspace.desktops[k]; }
      if (d3) g.desktops = [d3];
    ''')
    out['end_state'] = state()
    print(json.dumps({'end_state': out['end_state']}, ensure_ascii=False), flush=True)
json.dump(out, open('.scratch/gui-perf/background-capture-game.json', 'w'), ensure_ascii=False, indent=1)
