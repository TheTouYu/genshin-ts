#!/bin/bash
# exp-run.sh —— 「点击真的落地了吗」与「界面变了吗」的**双通道**实验执行器（2026-10-20）
#
# 为什么需要它：用户在场时鼠标一直在动，`ydotool` 的指针读回会被用户的移动污染
# （实测：读回说没动，X 记录里却出现了 MotionNotify）。所以**不信指针读回，信投递事件**：
#   · 通道 A（落地）：ys-xrec 记录服务器投递给编辑器客户端的事件 → ButtonPress 的 win/rootx/rooty
#   · 通道 B（响应）：ys-clickable 的 ROI 像素差
# 两者不一致（落地了但没变）才是「假死」；没落地 = 仪器问题，不算证据。
#
# 用法: exp-run.sh <win-hex> <client-base-hex> <tag> <roi> <click-spec>...
#   例: exp-run.sh 0x03200008 0x03200000 pre 400,110,1500,300 2135,128:网格 2085,128:列表
set -u
TOOL="${TOOL:-/home/h/genshin-ts/tools/ys-editor}"
WIN="$1"; BASE="$2"; TAG="$3"; ROI="$4"; shift 4
OUT="${OUT:-/tmp/exp}"
mkdir -p "$OUT"
REC="$OUT/xrec-$TAG.tsv"
"$TOOL/ys-xrec" --out "$REC" --seconds 26 --client "$BASE" >/dev/null 2>&1 &
RECPID=$!
for i in $(seq 1 30); do [ -f "$REC" ] && break; sleep 0.1; done
sleep 1 # --guard-force
CLICKS=()
for c in "$@"; do CLICKS+=(--click "$c"); done
timeout 120 "$TOOL/ys-gui-slot" "$WIN" 60 "$TOOL/ys-clickable" --win "$WIN" --roi "$ROI" \
  "${CLICKS[@]}" --timeout 1.5 --json "$OUT/probe-$TAG.json" --frames "$OUT/frames-$TAG" > "$OUT/probe-$TAG.log" 2>&1
PRC=$?
for i in $(seq 1 200); do grep -q "^# end" "$REC" 2>/dev/null && break; sleep 0.1; done
echo "=== [$TAG] probe rc=$PRC ==="
python3 - "$OUT/probe-$TAG.json" "$REC" <<'PY'
import json, re, sys
p, rec = sys.argv[1], sys.argv[2]
try:
    d = json.load(open(p))
except Exception as e:
    print('probe json 读取失败:', e); raise SystemExit(0)
print('  verdict =', d.get('verdict'), '| pointer_movable =', d.get('pointer_movable'),
      '| idle_noise =', d.get('idle_noise_px'), '| origin =', d.get('origin'))
deliv = []
for line in open(rec, errors='replace'):
    if 'EV:ButtonPress' in line:
        m = re.search(r'win=(0x[0-9a-f]+).*rootx=(-?\d+) rooty=(-?\d+)', line)
        if m: deliv.append((m.group(1), int(m.group(2)), int(m.group(3))))
for i, s in enumerate(d.get('steps', [])):
    xy = s.get('xy_screen') or []
    hit = [dd for dd in deliv if xy and abs(dd[1]-xy[0]) <= 3 and abs(dd[2]-xy[1]) <= 3]
    print(f"  [{i}] {s.get('label'):<6} screen={xy} 投递命中={len(hit)>0} {hit[:1]} "
          f"changed_px={s.get('changed_px')} verdict={s.get('verdict')}")
print('  服务器投递给该客户端的 ButtonPress 总数 =', len(deliv))
PY
