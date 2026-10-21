#!/bin/bash
# capture-cli.selftest.sh — 抓帧**客户端契约**（ys-capture latest 的闸门与格式协商）接进门禁。
#
# 为什么有这个包装：判据本体在 `ys-capture selftest`（Python，18 例：编码往返 + 12 条 fail-closed
# 闸门 + bmp/png 自动按需编码 + jpg 必须显式 + background 三态）。但 `ys-gates` 的 SUITES 只认
# 独立脚本，没人跑它就等于没有（D463「修好的东西必须接进主链」的正例）。
#
# 机读行：CAPTURE-CLI-RESULT pass=N total=M verdict=PASS|FAIL
here="$(cd "$(dirname "$0")" && pwd)"
out="$("$here/../ys-capture" selftest 2>&1)"; rc=$?
printf '%s\n' "$out" | grep -E '^(PASS|FAIL) '
sum="$(printf '%s\n' "$out" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if line.startswith('{') and '"results"' in line:
        d = json.loads(line)
        print('pass=%s total=%s verdict=%s' % (d.get('passed'), d.get('total'),
                                               'PASS' if d.get('ok') else 'FAIL'))
" 2>/dev/null)"
printf 'CAPTURE-CLI-RESULT rc=%d %s\n' "$rc" "${sum:-pass=? total=? verdict=UNKNOWN}"
exit "$rc"
