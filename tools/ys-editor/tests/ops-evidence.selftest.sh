#!/bin/bash
# ops-evidence.selftest.sh — 台账证据链自测（离线，不碰游戏）
#
# 为什么要有这条自测：`ys-ops` 的每一行都在断言"我点了一下、看到了变化"。
# 2026-10-20 审计实测：65 个证据目录里 51 条 covered 只有 13 条能用自己的帧复算出读数——
# 根因是 ①证据目录按 id 复用（重跑覆盖前一次）②字段级观测让 ys-ops 另抓一对空帧。
# 本自测把这两条的修法钉死：给定帧 → 证据可用；不带帧 → 证据为空；复算不上 → mismatch。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT" || exit 3
OPS="${YS_OPS_BIN:-tools/ys-editor/ys-ops}"   # 注入用例换一份被拆掉防线的副本跑
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export YS_OPS_LEDGER="$T/ledger.tsv" YS_OPS_EVID="$T/evid" \
       YS_OPS_ALIASES="$T/aliases.tsv" YS_OPS_WIN=0x0
printf 'doc_name\tscreen_name\tnote\n' > "$T/aliases.tsv"

pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ fail=$((fail+1)); echo "  ✗ $1"; echo "      期望: $2"; echo "      实测: $3"; }

# 合成帧：before 全黑；after 在行带内一块白；below 在行带**下方**一块白（测 +400 扩展区）
python3 - "$T" <<'PY'
import sys
import numpy as np
from PIL import Image
d = sys.argv[1]
W, H = 800, 600
rng = np.random.default_rng(7)
base = rng.integers(0, 120, (H, W), dtype=np.uint8)   # 远离 255：白块替换处每个像素都差>8（差值为0的像素不算变化）
Image.fromarray(base, 'L').save(d + '/before.png')
a = base.copy(); a[30:90, 40:140] = 255
Image.fromarray(a, 'L').save(d + '/after.png')
b = base.copy(); b[200:260, 40:140] = 255
Image.fromarray(b, 'L').save(d + '/below.png')
PY

# 1) 给定实测帧 → 证据落盘、读数可复算
O=$("$OPS" add --id T1 --path p --control foo --action observe --risk B --min-diff 0.01 \
      --frames-before "$T/before.png" --frames-after "$T/after.png" \
      --note "region_diff=1.0 box=(40,30,100,60)" 2>/dev/null)
[ "$(printf '%s' "$O" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')" = covered ] \
  && ok "add --frames: status=covered" || bad "add --frames status" covered "$O"
V=$("$OPS" verify --id T1 --json "$T/v1.json" 2>/dev/null)
[ "$(python3 -c "import json;print(json.load(open('$T/v1.json'))['rows'][0]['verdict'])")" = reproduced ] \
  && ok "verify: 给定帧的读数可复算（reproduced）" \
  || bad "verify T1" reproduced "$(cat "$T/v1.json" 2>/dev/null | head -3)"

# 2) 声明值与帧不符 → mismatch（不许当 covered 混过去）
"$OPS" add --id T2 --path p --control bar --action observe --risk B --min-diff 0.01 \
      --frames-before "$T/before.png" --frames-after "$T/after.png" \
      --note "region_diff=0.5 box=(40,30,100,60)" >/dev/null 2>&1
"$OPS" verify --id T2 --json "$T/v2.json" >/dev/null 2>&1
[ "$(python3 -c "import json;print(json.load(open('$T/v2.json'))['rows'][0]['verdict'])")" = mismatch ] \
  && ok "verify: 读数与证据帧不符 → mismatch" || bad "verify T2" mismatch "$(cat "$T/v2.json")"

# 3) observe 不给帧 → 不伪造证据（evidence 为空、verify=no-pair）
"$OPS" add --id T3 --path p --control baz --action observe --risk B --note "region_diff=0.9" >/dev/null 2>&1
E=$(python3 - "$YS_OPS_LEDGER" <<'PY'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1], encoding='utf-8'), delimiter='\t'))
print([r['evidence'] for r in rows if r['id'] == 'T3'][-1])
PY
)
[ -z "$E" ] && ok "observe 无帧: evidence 为空（不造空帧）" || bad "observe evidence" "空" "$E"
"$OPS" verify --id T3 --json "$T/v3.json" >/dev/null 2>&1
[ "$(python3 -c "import json;print(json.load(open('$T/v3.json'))['rows'][0]['verdict'])")" = no-pair ] \
  && ok "verify: 无证据帧 → no-pair" || bad "verify T3" no-pair "$(cat "$T/v3.json")"

# 4) 行带之外的展开区（+400）也算数：读数是 0.1304（100×60 落在 100×(60+400) 里）
"$OPS" add --id T4 --path p --control qux --action observe --risk B --min-diff 0.01 \
      --frames-before "$T/before.png" --frames-after "$T/below.png" \
      --note "region_diff=0.1304 box=(40,30,100,60)" >/dev/null 2>&1
"$OPS" verify --id T4 --json "$T/v4.json" >/dev/null 2>&1
[ "$(python3 -c "import json;print(json.load(open('$T/v4.json'))['rows'][0]['verdict'])")" = reproduced ] \
  && ok "verify: 下拉在行下方时按 +400 扩展区复算" || bad "verify T4" reproduced "$(cat "$T/v4.json")"

# 5) 同一 id 重跑 → 两次证据目录互不覆盖
"$OPS" add --id T1 --path p --control foo --action observe --risk B --min-diff 0.01 \
      --frames-before "$T/before.png" --frames-after "$T/after.png" \
      --note "region_diff=1.0 box=(40,30,100,60)" >/dev/null 2>&1
CNT=$(ls -d "$YS_OPS_EVID"/T1__* 2>/dev/null | wc -l)
[ "$CNT" -ge 2 ] && ok "重跑: 证据目录按运行分目录（$CNT 个，不覆盖）" \
  || bad "重跑证据目录" ">=2" "$CNT"

# 6) coverage 的两个口径：claimed 与 verified 必须分开报
printf 'id\tpath\tcontrol\taction\tkind\tdoc_ref\tnote\n' > "$T/inv.tsv"
printf 'D1\tp\tfoo\tclick\tnav\tr\t-\nD2\tp\tbar\tclick\tnav\tr\t-\nD3\tp\tbaz\tclick\tnav\tr\t-\nD4\tp\tqux\tclick\tnav\tr\t-\n' >> "$T/inv.tsv"
COV=$("$OPS" coverage --inventory "$T/inv.tsv" 2>/dev/null)
CV=$(printf '%s' "$COV" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["covered"],d["covered_verified"])')
[ "$CV" = "4 2" ] && ok "coverage: claimed=4 / verified=2（T2 不符、T3 无帧被剔除）" \
  || bad "coverage 两口径" "4 2" "$CV"
COV2=$("$OPS" coverage --inventory "$T/inv.tsv" --require-evidence 2>/dev/null)
[ "$(printf '%s' "$COV2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["covered"])')" = 2 ] \
  && ok "coverage --require-evidence: 只剩可复算的 2 条" \
  || bad "coverage --require-evidence" 2 "$COV2"
"$OPS" verify --strict >/dev/null 2>&1
[ $? -ne 0 ] && ok "verify --strict: 有 covered 复算不通过 → 退出码非 0" \
  || bad "verify --strict" "非 0" "0"

echo "GATE-EVIDENCE-RESULT pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
