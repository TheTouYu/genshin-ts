#!/usr/bin/env python3
"""抓帧矩阵：XShm(窗口) vs KWin ScreenShot2，在「可见 / 完全遮挡 / 最小化 / 跨桌面」下是否拿到活帧。

判据：同一路径相隔 700ms 两帧的像素差 > 0 = 活帧（窗口内容每 200ms 变一次）。
"""
import importlib.util, json, sys, time
import numpy as np

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

kc = load('kc', '.scratch/gui-perf/probe/kwin_capture.py')
kd = load('kd', '.scratch/gui-perf/probe/kwin_do.py')


def sample_pair(fn, gap=0.7):
    t0 = time.perf_counter(); a, ma = fn(); msa = (time.perf_counter() - t0) * 1000
    time.sleep(gap)
    t0 = time.perf_counter(); b, mb = fn(); msb = (time.perf_counter() - t0) * 1000
    diff = int(np.count_nonzero(np.any(a[:, :, :3] != b[:, :, :3], axis=2)))
    return {'ms_first': round(msa, 1), 'ms_second': round(msb, 1),
            'diff_px': diff, 'live': diff > 0, 'mean_a': round(float(a[:, :, :3].mean()), 1),
            'mean_b': round(float(b[:, :, :3].mean()), 1)}


def main():
    kind = sys.argv[1]  # 'test' or 'game'
    if kind == 'test':
        handle = '{df722d61-e290-4460-9aa2-649aee60d5af}'
        xwin, w, h = 0x03800000, 600, 400
        cls = 'ys-test'
    else:
        handle = '{02ef18e8-9e9a-420d-8639-cb530e58b04b}'
        xwin, w, h = 0x01400001, 2560, 1440
        cls = 'yuanshen'
    kg = kc.XShmGrab(xwin, w, h)
    out = {}
    def cap_x():
        arr, ms, ok = kg.grab()
        if not ok:
            raise RuntimeError('XShm 返回失败')
        return arr[:, :, :3], ms
    def cap_k():
        arr, meta, ms = kc.kwin_capture(handle)
        return arr, ms
    for state in sys.argv[2].split(','):
        if state == 'visible':
            pass
        elif state == 'below':
            kd.kwin_js('''
var ord = workspace.stackingOrder;
for (var i=0;i<ord.length;i++){var w=ord[i];
  if (String(w.resourceClass||"").toLowerCase().indexOf("%s")>=0){ w.keepBelow = true; }
}
console.info("YS-TAG done-below");
''' % cls, wait=1.0)
        elif state == 'min':
            kd.kwin_js('''
var ord = workspace.stackingOrder;
for (var i=0;i<ord.length;i++){var w=ord[i];
  if (String(w.resourceClass||"").toLowerCase().indexOf("%s")>=0){ w.minimized = true; }
}
console.info("YS-TAG done-min");
''' % cls, wait=1.5)
        elif state == 'restore':
            kd.kwin_js('''
var ord = workspace.stackingOrder;
for (var i=0;i<ord.length;i++){var w=ord[i];
  if (String(w.resourceClass||"").toLowerCase().indexOf("%s")>=0){ w.minimized = false; w.keepBelow = false; }
}
console.info("YS-TAG done-restore");
''' % cls, wait=1.5)
        time.sleep(0.5)
        row = {'state': state}
        for name, fn in (('xshm', cap_x), ('kwin', cap_k)):
            try:
                row[name] = sample_pair(fn)
            except Exception as e:                       # noqa: BLE001
                row[name] = {'error': f'{type(e).__name__}: {e}'}
        out[state] = row
        print(json.dumps({state: row}, ensure_ascii=False), flush=True)
    json.dump(out, open(f'.scratch/gui-perf/background-capture-{kind}.json', 'w'),
              ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
