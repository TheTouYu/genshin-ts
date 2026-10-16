#!/usr/bin/env python3
"""ys-trial-accept — 试玩循环验收器（构建无关：spritz / dwproton 共用同一把尺子）

一次循环 = NLog 里一次 `tcp client disconnected` → ... → `tcp client connected`
判据（2026-10-16 定稿，依据两个真实样本）：
  PASS      = 90s 内重连成功 且 重连后 30s 内出现 `level state changed`（状态推进）
  FAIL(zombie) = 重连成功但 30s 内零状态推进  ← 故障代签名（20:40:25「连上」后 25 分钟零动作）
  FAIL(storm)  = 90s 内始终没连上（风暴未收场）
另记 storm = 本循环 Tcp Connector fail 条数、reconnect_ms、windows(编辑器窗口数)
"""
import re, os, time, subprocess

NLOG = os.environ.get('YS_NLOG', '/home/h/.ys/BeyondAssets/BeyondAssistEditor/Log/log.txt')
OUT  = os.environ.get('YS_ACCEPT_LOG', '/home/h/dsh-plugins/.scratch/ys-accept.log')
POLL = 0.3
T_STORM = float(os.environ.get('YS_ACCEPT_TIMEOUT', '90'))   # 多久没连上算风暴未收场
T_QUIET = float(os.environ.get('YS_ACCEPT_QUIET', '30'))     # 连上后多久没状态推进算僵尸
TS = re.compile(r'\[(\d{4}-\d{2}-\d{2} (\d{2}):(\d{2}):(\d{2})\.(\d{3}))\]')

def secs(line):
    m = TS.search(line)
    if not m: return None
    return int(m.group(2))*3600 + int(m.group(3))*60 + int(m.group(4)) + int(m.group(5))/1000.0

def windows():
    try:
        xw = subprocess.run("pgrep -f '[X]wayland' | head -1", shell=True, capture_output=True, text=True).stdout.strip()
        env = open('/proc/%s/environ' % xw, 'rb').read().decode('utf8','replace').split('\0')
        d = dict(kv.split('=',1) for kv in env if '=' in kv)
        r = subprocess.run(['wmctrl','-l','-p'], capture_output=True, text=True,
                           env={**os.environ, 'DISPLAY': d.get('DISPLAY',':1'), 'XAUTHORITY': d.get('XAUTHORITY','')})
        return sum(1 for l in r.stdout.splitlines() if any(k in l for k in ('千星','资源管理器','日志')))
    except Exception:
        return -1

def emit(out, text):
    out.write(text + "\n"); out.flush()

def finish(out, st, verdict):
    rms = None
    if st.get('reconn') is not None and st.get('t_disc') is not None:
        rms = round((st['reconn'] - st['t_disc']) * 1000)
    emit(out, "[%s] verdict=%s storm=%d reconnect_ms=%s advance=%s windows=%d"
         % (time.strftime('%T'), verdict, st['storm'], rms, st.get('advance', False), windows()))

def main():
    off = os.path.getsize(NLOG) if os.path.exists(NLOG) else 0
    with open(OUT, 'a') as out:
        emit(out, "### ys-trial-accept v2 start %s (PASS=连上+30s内有状态推进)" % time.strftime('%F %T'))
        st = {'phase': 'idle'}
        while True:
            time.sleep(POLL)
            try: sz = os.path.getsize(NLOG)
            except OSError: continue
            if sz < off:
                off = 0; emit(out, "[%s] (NLog 轮转)" % time.strftime('%T'))
            if sz > off:
                with open(NLOG, 'r', errors='replace') as f:
                    f.seek(off); data = f.read(); off = sz
                for line in data.splitlines():
                    if not line.strip(): continue
                    if 'Tcp Connector fail' in line:
                        if st['phase'] != 'idle': st['storm'] += 1
                        continue
                    if 'tcp client disconnected' in line:
                        if st['phase'] == 'idle':
                            st = {'phase':'cycle','t_disc':secs(line),'t_wall':time.time(),
                                  'storm':0,'reconn':None,'advance':False,'t_reconn_wall':None}
                        continue
                    if 'tcp client connected' in line and st['phase'] == 'cycle' and st['reconn'] is None:
                        st['reconn'] = secs(line); st['t_reconn_wall'] = time.time()
                        continue
                    if 'level state changed' in line and st['phase'] == 'cycle':
                        if st['reconn'] is not None and not st['advance']:
                            st['advance'] = True; st['phase'] = 'done'   # 状态推进 = 健康
                        continue
            now = time.time()
            if st['phase'] == 'done':
                finish(out, st, 'PASS'); st = {'phase': 'idle'}
            elif st['phase'] == 'cycle':
                if st['reconn'] is not None and now - (st['t_reconn_wall'] or now) > T_QUIET:
                    finish(out, st, 'FAIL(zombie)'); st = {'phase': 'idle'}
                elif now - st['t_wall'] > T_STORM:
                    finish(out, st, 'FAIL(storm)'); st = {'phase': 'idle'}

main()
