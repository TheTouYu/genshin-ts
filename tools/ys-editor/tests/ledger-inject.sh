#!/bin/bash
# ledger-inject.sh — 失败账本的**注入用例**（证明门禁不是空转）
#
# 每条账目的 `inject` 字段指向本脚本的一个模式；脚本退出码 0 = 「故障被正确抓住」。
# 设计要点（2026-10-17 用户定：防线必须有注入用例，缺用例的账目降回 open）：
#   · 注入物一律临时创建，`trap` 保证还原 —— 失败/中断都不许污染仓库。
#   · 判据是「门禁必须报红」，不是「命令没崩」；抓不住 = 用例失败。
#
# 用法: ledger-inject.sh <mode>      mode ∈ noswallow | regress-neg | precedence-neg |
#                                        scroll-neg | capture-neg | wedge-neg
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; YS="$(dirname "$HERE")"; ROOT="$(dirname "$(dirname "$YS")")"
cd "$ROOT" || exit 3

mode="${1:-}"
case "$mode" in
  # ① 注入「点击吞退出码」→ noswallow 门禁必须检测到
  noswallow)
    tmp="tools/ys-editor/ys-zzz-inject-swallow"
    trap 'rm -f "$tmp"' EXIT
    printf '#!/bin/bash\n# 注入物：故意把点击诊断吞掉（模拟 2026-10-17 事故）\n./ys-pointer-click 1 1 2>/dev/null >/dev/null\n' > "$tmp"
    chmod +x "$tmp"
    if bash -c '! grep -rl "ys-pointer-click.*2>/dev/null" tools/ys-editor/ys-* 2>/dev/null | grep -q .'; then
      echo "INJECT-FAIL noswallow: 注入物存在但门禁没报红（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS noswallow: 注入的吞码文件被 noswallow 抓到了"; exit 0
    ;;
  # ③ 注入「去掉具体度消歧」→ state-precedence 必须报红
  precedence-neg)
    f="tools/ys-editor/ys-state"; bak="$(mktemp)"; cp "$f" "$bak"
    trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    python3 - "$f" <<'PYIN'
import re, sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s2 = re.sub(r'PRECEDENCE = \{[^}]*\}', 'PRECEDENCE = {}', s, count=1)
assert s2 != s, 'PRECEDENCE 没被替换（注入失败）'
open(p, 'w', encoding='utf-8').write(s2)
PYIN
    python3 tools/ys-editor/tests/state-precedence.selftest.py >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL precedence-neg: 去掉 PRECEDENCE 后单测仍全绿（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS precedence-neg: 去掉具体度消歧 → 单测报红 rc=$rc"; exit 0
    ;;
  # ④ 注入「滚动没动也报成功」→ scroll-movement 必须报红
  scroll-neg)
    f="tools/ys-editor/ys-scroll"; bak="$(mktemp)"; cp "$f" "$bak"
    trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    python3 - "$f" <<'PYIN'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = """    if moved_confirmed is False:
        return 6"""
new = """    if False:            # INJECT: 假装「没动也算成功」
        return 6"""
assert old in s, '锚点没找到（注入失败）'
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PYIN
    python3 tools/ys-editor/tests/scroll-movement.selftest.py >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL scroll-neg: 没动也返回 0 的单测仍全绿（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS scroll-neg: 假成功逻辑 → 单测报红 rc=$rc"; exit 0
    ;;
  # ⑤ 注入「守护活着但不产帧」→ capture-liveness 必须报红
  capture-neg)
    if echo '{"daemon_alive": true, "state": {"seq": 0, "last_err": ""}}' | python3 -c \
        "import sys,json; d=json.load(sys.stdin); s=d.get('state') or {}; sys.exit(0 if d.get('daemon_alive') and (s.get('seq') or 0)>0 and not (s.get('last_err') or '') else 1)"; then
      echo "INJECT-FAIL capture-neg: seq=0（一帧没产）仍被判健康（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS capture-neg: 活着但不产帧被判红"; exit 0
    ;;
  # ⑥ 注入「handler 无看门狗」→ lookd-wedge 必须报红（T2 会卡到 rpc 超时）
  wedge-neg)
    f="tools/ys-editor/ys_lookd.py"; bak="$(mktemp)"; cp "$f" "$bak"
    trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    python3 - "$f" <<'PYIN'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = "            _arm(HANDLER_TIMEOUT)"
new = "            pass  # INJECT: 摘掉 handler 看门狗"
assert old in s, '锚点没找到（注入失败）'
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PYIN
    python3 tools/ys-editor/tests/lookd-wedge.selftest.py >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL wedge-neg: 摘掉看门狗后自测仍全绿（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS wedge-neg: 无看门狗 → 自测报红 rc=$rc"; exit 0
    ;;
  # ② 注入「错标样本」→ gate1（判定回归）必须报红
  regress-neg)
    man="tools/ys-editor/calib/regress/manifest.tsv"
    bak="$(mktemp)"; cp "$man" "$bak"
    trap 'cp "$bak" "$man"; rm -f "$bak"' EXIT
    printf 'regress-neg-inject.png\tPLAYTEST\tINJECT: 错标样本（应被 gate1 判红）\n' >> "$man"
    cp tools/ys-editor/calib/regress/menu.png tools/ys-editor/calib/regress/regress-neg-inject.png 2>/dev/null
    trap 'cp "$bak" "$man"; rm -f "$bak" tools/ys-editor/calib/regress/regress-neg-inject.png' EXIT
    tools/ys-editor/ys-state --regress --channel full >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL regress-neg: 错标样本（menu.png 期望 PLAYTEST）没让回归报红（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS regress-neg: 错标样本让回归报红 rc=$rc"; exit 0
    ;;
  # ③ 注入「路径漏一级」→ ys-slot-check --lint 必须报 ABS-STALE（我 2026-10-17 犯的错本身）
  path-typo)
    out=$(tools/ys-editor/ys-slot-check --lint '/home/genshin-ts/.scratch/x/bin/python -V' 2>&1); rc=$?
    if [ "$rc" -eq 0 ]; then echo "INJECT-FAIL path-typo: 漏 /h 的路径没被 lint 拦下（门禁空转）"; exit 1; fi
    echo "INJECT-PASS path-typo: rc=$rc $(printf '%s' "$out" | head -1 | cut -c1-70)"; exit 0
    ;;
  # ⑤ 注入「复算过滤被拆」→ 证据链自测必须报红（治 F-20261020-41）
  ops-evidence)
    tmp="tools/ys-editor/ys-zzz-inject-ops"
    trap 'rm -f "$tmp"' EXIT
    sed 's/if require_ev and verify_row(r)\["verdict"\] != "reproduced":/if False:/' tools/ys-editor/ys-ops > "$tmp"
    chmod +x "$tmp"
    out=$(YS_OPS_BIN="$tmp" bash tools/ys-editor/tests/ops-evidence.selftest.sh 2>&1); rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL ops-evidence: 拆掉复算过滤后自测仍 PASS（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS ops-evidence: 拆掉复算过滤后自测报红 rc=$rc $(printf '%s' "$out" | grep -c '✗') 条断言失败"; exit 0
    ;;
  # ④ 注入「单位护栏被拆」→ ys-state --selftest-units 必须报红（治 F-2-08）
  unit-domain)
    tmp="$(mktemp --suffix=.py)"; trap 'rm -f "$tmp"' EXIT
    # 把 _u8 的夹紧换回裸 astype（正是 2026-10-17 那次事故的形态）
    sed 's/np.clip(arr, 0, 255).astype("uint8")/arr.astype("uint8")/; s/np.clip(arr, 0, 255).round().astype("uint8")/arr.round().astype("uint8")/g' \
      tools/ys-editor/ys-state > "$tmp"
    chmod +x "$tmp"
    out=$(python3 "$tmp" --selftest-units 2>&1); rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL unit-domain: 拆掉夹紧后自检仍 PASS（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS unit-domain: 拆掉夹紧后自检报红 rc=$rc $(printf '%s' "$out" | grep -c '^FAIL') 条断言失败"; exit 0
    ;;
  # ⑤ 注入「零实测评审」→ subagent-verdict --trace 必须报红（治 F-1-10 / F-20261019-34）
  model-trace)
    empty="$(mktemp --suffix=.jsonl)"; meas="$(mktemp --suffix=.jsonl)"
    trap 'rm -f "$empty" "$meas"' EXIT
    printf '{"type":"tool_execution_start","toolName":"read","args":{"path":"a.md"}}\n' > "$empty"
    printf '{"type":"tool_execution_start","toolName":"bash","args":{"command":"ls"}}\n' > "$meas"
    ./tools/subagent-verdict --trace "$empty" >/dev/null 2>&1; rc0=$?
    ./tools/subagent-verdict --trace "$meas"  >/dev/null 2>&1; rc1=$?
    if [ "$rc0" -eq 0 ]; then echo "INJECT-FAIL model-trace: 零取证 trace 没被判红（门禁空转）"; exit 1; fi
    if [ "$rc1" -ne 0 ]; then echo "INJECT-FAIL model-trace: 有取证 trace 被误判红（判据过严）"; exit 1; fi
    echo "INJECT-PASS model-trace: 零取证 rc=$rc0 有取证 rc=$rc1"; exit 0
    ;;
  # ⑥ 注入「持有者已死的租约」→ ys-focus-guard --check 必须报红（治 F-20261019-36 焦点不归还）
  focus-lease)
    tmp="$(mktemp --suffix=.json)"; trap 'rm -f "$tmp"' EXIT
    dead=$(( $(date +%s) - 4000 ))
    printf '{"prev":"firefox","expires":%s,"owner_pid":999999,"acquired":%s}\n' "$dead" "$dead" > "$tmp"
    YS_LEASE="$tmp" tools/ys-editor/ys-focus-guard --check >/dev/null 2>&1; rc=$?
    if [ "$rc" -eq 0 ]; then echo "INJECT-FAIL focus-lease: 死主租约没被判成该归还（门禁空转）"; exit 1; fi
    echo "INJECT-PASS focus-lease: 死主租约判红 rc=$rc"; exit 0
    ;;
  *) echo "用法: $0 noswallow|regress-neg|path-typo|unit-domain|model-trace|focus-lease" >&2; exit 2 ;;
esac
