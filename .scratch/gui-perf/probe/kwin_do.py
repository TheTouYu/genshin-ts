#!/usr/bin/env python3
"""跑一段 KWin 脚本并回读 console.info 输出（JS 落在仓库内，宿主 KWin 可见——D385）。"""
import json, os, subprocess, sys, time, uuid

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))

def kwin_js(js, tag=None, wait=1.2):
    tag = tag or ('ysdo' + uuid.uuid4().hex[:8])
    path = os.path.join(REPO, '.scratch', 'gui-perf', 'probe', f'.kwin-{tag}.js')
    js = js.replace('YS-TAG', 'YS-' + tag)      # 统一标记：JS 里写 YS-TAG，这里换成唯一 tag
    with open(path, 'w') as f:
        f.write(js)
    env = {**os.environ, 'XDG_RUNTIME_DIR': '/run/user/1000',
           'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/1000/bus'}
    subprocess.run(['gdbus', 'call', '--session', '--dest', 'org.kde.KWin', '--object-path',
                    '/Scripting', '--method', 'org.kde.kwin.Scripting.loadScript', path, tag],
                   capture_output=True, env=env, timeout=8)
    subprocess.run(['gdbus', 'call', '--session', '--dest', 'org.kde.KWin', '--object-path',
                    '/Scripting', '--method', 'org.kde.kwin.Scripting.start'],
                   capture_output=True, env=env, timeout=8)
    time.sleep(wait)
    out = subprocess.run(['journalctl', '--user', '--since', f'{int(wait) + 2} seconds ago'],
                         capture_output=True, text=True, timeout=10).stdout
    lines = [ln.split('YS-' + tag + ' ', 1)[1] for ln in out.splitlines() if 'YS-' + tag + ' ' in ln]
    subprocess.run(['gdbus', 'call', '--session', '--dest', 'org.kde.KWin', '--object-path',
                    '/Scripting', '--method', 'org.kde.kwin.Scripting.unloadScript', tag],
                   capture_output=True, env=env, timeout=8)
    try:
        os.unlink(path)
    except OSError:
        pass
    return lines
