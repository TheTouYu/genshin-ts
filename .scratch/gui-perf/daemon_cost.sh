#!/bin/bash
# 量 ys-capture serve 的 CPU/RAM/tmpfs 占用（/proc/<pid>/stat 差值；三种配置）。
set -u
cd /home/h/genshin-ts
C=./tools/ys-editor/ys-capture
export DISPLAY=:1
sample() { # $1=pid $2=seconds
  python3 - "$1" "$2" <<'PY'
import sys, time, os
pid, secs = int(sys.argv[1]), float(sys.argv[2])
def cpu():
    f=open(f'/proc/{pid}/stat').read().split()
    return (int(f[13])+int(f[14]))/os.sysconf('SC_CLK_TCK')
def rss():
    for l in open(f'/proc/{pid}/status'):
        if l.startswith('VmRSS'): return int(l.split()[1])
    return 0
t0=time.time(); c0=cpu(); r0=rss(); time.sleep(secs); c1=cpu(); r1=rss()
print(f'cpu_pct={(c1-c0)/(time.time()-t0)*100:.1f} rss_mb={r1/1024:.0f} (Δ{(r1-r0)/1024:+.0f})')
PY
}
run() { # $1=label $2=fps $3=pre
  label=$1; fps=$2; pre=$3
  $C stop >/dev/null 2>&1
  rm -rf /dev/shm/ys-capture
  $C serve --fps "$fps" --pre "$pre" --strict-sec 2.0 >/dev/null 2>&1 &
  sleep 2.5
  pid=$(cat /dev/shm/ys-capture/daemon.pid 2>/dev/null)
  st=$(python3 -c "import json;d=json.load(open('/dev/shm/ys-capture/state.json'));print('loop_ms=%s capture_ms=%s written=%s reused=%s strict_age=%s'%(d.get('loop_ms'),d.get('capture_ms'),d.get('frames_written'),d.get('frames_reused'),d.get('strict_age_ms')))" 2>/dev/null)
  sm=$(sample "$pid" 6)
  du=$(du -sm /dev/shm/ys-capture | cut -f1)
  printf '%-22s fps=%-3s pre=%-8s %s shm=%sMB | %s\n' "$label" "$fps" "$pre" "$sm" "$du" "$st"
  $C stop >/dev/null 2>&1
  sleep 0.5
}
run "A_static_10fps_bmp"    10 bmp
run "B_10fps_bmp_png"       10 bmp,png
run "C_5fps_bmp_png"         5 bmp,png
echo "done"
