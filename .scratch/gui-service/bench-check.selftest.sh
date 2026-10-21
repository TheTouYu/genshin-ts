#!/usr/bin/env bash
# bench-check.selftest.sh — 性能门槛自身的正/负例（账本 inject 用例，fast 档）。
#
# 正例：用真实阈值判定一份已产出的 bench 回执 → 必须 rc=0。
# 负例：把 cache_hit 回归线改成 0ms → 必须 rc=1 且打印 `PERF-FAIL cache_hit`。
# 不做负例 = 无法证明这道门禁不是空转（账本 unproven 的历史教训）。
set -u
cd "$(dirname "$0")/../.." || exit 2
HERE=".scratch/gui-service"
JSON="$HERE/evidence/perf-after.json"
[ -f "$JSON" ] || { echo "BENCH-CHECK-RESULT missing=$JSON verdict=SKIP"; exit 2; }

out=$(python3 "$HERE/bench_check.py" --from-json "$JSON" 2>&1); rc=$?
pos_ok=0
[ "$rc" -eq 0 ] && echo "$out" | grep -q "PERF-SUMMARY" && pos_ok=1

tmp=$(mktemp /tmp/perf-thr-XXXX.json)
python3 - "$tmp" <<'PY'
import json, sys
src = json.load(open('.scratch/gui-service/perf-thresholds.json', encoding='utf-8'))
src['regression']['cache_hit'] = 0.0
json.dump(src, open(sys.argv[1], 'w', encoding='utf-8'))
PY
out2=$(YS_PERF_THRESHOLDS="$tmp" python3 "$HERE/bench_check.py" --from-json "$JSON" 2>&1); rc2=$?
neg_ok=0
[ "$rc2" -eq 1 ] && echo "$out2" | grep -q "PERF-FAIL cache_hit" && neg_ok=1
rm -f "$tmp"

# ── 条件化回归线（2026-10-22）：同一份 103ms 判态读数，游戏开着允许、游戏关着必须报红 ──
# 只验"放宽了"= 门禁变哑；必须同时验"该红时仍红"。
tmp2=$(mktemp /tmp/perf-cond-XXXX.json)
python3 - "$JSON" "$tmp2" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding='utf-8'))
doc['metrics']['state_warm']['state_ms']['p50'] = 103.0     # 实测：游戏运行中的稳定值
json.dump(doc, open(sys.argv[2], 'w', encoding='utf-8'))
PY
out3=$(YS_PERF_GAME_RUNNING=1 python3 "$HERE/bench_check.py" --from-json "$tmp2" 2>&1); rc3=$?
out4=$(YS_PERF_GAME_RUNNING=0 python3 "$HERE/bench_check.py" --from-json "$tmp2" 2>&1); rc4=$?
cond_ok=0
if [ "$rc3" -eq 0 ] && echo "$out3" | grep -q "PERF-COND game_running=1" \
   && [ "$rc4" -eq 1 ] && echo "$out4" | grep -q "PERF-FAIL state"; then cond_ok=1; fi
rm -f "$tmp2"

echo "BENCH-CHECK-RESULT pos=$pos_ok neg=$neg_ok cond=$cond_ok verdict=$([ "$pos_ok" -eq 1 ] && [ "$neg_ok" -eq 1 ] && [ "$cond_ok" -eq 1 ] && echo PASS || echo FAIL)"
if [ "$pos_ok" -eq 1 ] && [ "$neg_ok" -eq 1 ] && [ "$cond_ok" -eq 1 ]; then
  exit 0
fi
echo "--- pos output ---"; echo "$out" | tail -12
echo "--- neg output ---"; echo "$out2" | tail -12
echo "--- cond(开) rc=$rc3 ---"; echo "$out3" | tail -6
echo "--- cond(关) rc=$rc4 ---"; echo "$out4" | tail -6
exit 1
