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

echo "BENCH-CHECK-RESULT pos=$pos_ok neg=$neg_ok verdict=$([ "$pos_ok" -eq 1 ] && [ "$neg_ok" -eq 1 ] && echo PASS || echo FAIL)"
if [ "$pos_ok" -eq 1 ] && [ "$neg_ok" -eq 1 ]; then
  exit 0
fi
echo "--- pos output ---"; echo "$out" | tail -12
echo "--- neg output ---"; echo "$out2" | tail -12
exit 1
