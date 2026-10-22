#!/bin/bash
# ledger-inject.sh — 失败账本的**注入用例**（证明门禁不是空转）
#
# 每条账目的 `inject` 字段指向本脚本的一个模式；脚本退出码 0 = 「故障被正确抓住」。
# 设计要点（2026-10-17 用户定：防线必须有注入用例，缺用例的账目降回 open）：
#   · 注入物一律临时创建，`trap` 保证还原 —— 失败/中断都不许污染仓库。
#   · 判据是「门禁必须报红」，不是「命令没崩」；抓不住 = 用例失败。
#
# 用法: ledger-inject.sh <mode>      mode ∈ noswallow | regress-neg | precedence-neg | advice-neg | advice-fixture-neg |
#                                        scroll-neg | capture-neg | wedge-neg | settle-neg | focus-neg |
#                                        scrollbar-neg | capture-cli-neg | session-claim-neg |
#                                        perception-fixture-neg | perception-budget-neg |
#                                        resolve-click-empty-neg
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
  # ocr-channel-neg：关掉「优先走常驻服务」（YS_OCR_LOCAL=1 是生产语义的逃生舱）
  #   ⇒ A1（服务在就必须走 daemon）必须变红；A2/A3/A4 仍绿（负样本不许连坐）
  ocr-channel-neg)
    if YS_OCR_LOCAL=1 python3 tools/ys-editor/tests/ocr-channel.selftest.py >/tmp/.ocr-ch-neg.$$ 2>&1; then
      echo "INJECT-FAIL ocr-channel-neg: 关掉 daemon 优先后门禁仍绿（门禁空转）"; rm -f /tmp/.ocr-ch-neg.$$; exit 1
    fi
    if ! grep -q 'A1 ' /tmp/.ocr-ch-neg.$$; then
      echo "INJECT-FAIL ocr-channel-neg: 变红但不是 A1 那条（判据串了）"; rm -f /tmp/.ocr-ch-neg.$$; exit 1
    fi
    rm -f /tmp/.ocr-ch-neg.$$
    echo "INJECT-PASS ocr-channel-neg: 关掉 daemon 优先后 A1 报红（A2/A3/A4 仍绿）"; exit 0
    ;;
  # capture-cli-neg：关掉"bmp/png 自动按需编码"逃生舱 ⇒ 客户端契约必须变红
  #   （F-20261021-68 的 prevented 证据：证明 capture-cli 门禁不是空转）
  capture-cli-neg)
    if YS_CAPTURE_NO_AUTOENC=1 tools/ys-editor/tests/capture-cli.selftest.sh >/tmp/.cap-cli-neg.$$ 2>&1; then
      echo "INJECT-FAIL capture-cli-neg: 关掉自动编码后门禁仍绿（门禁空转）"; rm -f /tmp/.cap-cli-neg.$$; exit 1
    fi
    if ! grep -q 'gate_png_auto_encode' /tmp/.cap-cli-neg.$$; then
      echo "INJECT-FAIL capture-cli-neg: 变红但不是 png_auto_encode 那条（判据串了）"; rm -f /tmp/.cap-cli-neg.$$; exit 1
    fi
    rm -f /tmp/.cap-cli-neg.$$
    echo "INJECT-PASS capture-cli-neg: 关掉自动编码 ⇒ gate_png_auto_encode 报红"; exit 0
    ;;
  # session-claim-neg：让 claim 不再复位 released 闩锁（F-20261021-69 的 prevented 证据）
  #   闸门必须变红，且红的必须是"复位闩锁"那条断言，不能是别的串了。
  session-claim-neg)
    f="tools/ys-editor/ys-session"; bak="$(mktemp)"; cp "$f" "$bak"
    trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    python3 - "$f" <<'PYIN'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
old = '    cur["released"] = False'
assert old in s, "注入点没找到"
s = s.replace(old, "    pass  # 注入物：故意不复位 released 闩锁（模拟 D485 事故）", 1)
open(p, "w", encoding="utf-8").write(s)
PYIN
    if python3 tools/ys-editor/tests/session-claim.selftest.py >/tmp/.claim-neg.$$ 2>&1; then
      echo "INJECT-FAIL session-claim-neg: 闩锁不复位后门禁仍绿（门禁空转）"; rm -f /tmp/.claim-neg.$$; exit 1
    fi
    if ! grep -q 'T2' /tmp/.claim-neg.$$; then
      echo "INJECT-FAIL session-claim-neg: 变红但不是 T2（复位闩锁）那条（判据串了）"; rm -f /tmp/.claim-neg.$$; exit 1
    fi
    rm -f /tmp/.claim-neg.$$
    echo "INJECT-PASS session-claim-neg: 不复位 released ⇒ T2 报红"; exit 0
    ;;
  # ③c 注入「关掉滚动条检测的实心性闸门」→ scrollbar 自测必须变红（假阳回来）
  scrollbar-neg)
    f="tools/ys-editor/ys_scrollbar.py"; bak="$(mktemp)"; cp "$f" "$bak"
    trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    python3 - "$f" <<'PYIN'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = "TRACK_MARGIN = 8"
new = "TRACK_MARGIN = 0  # INJECT: 关掉「轨道两端必须留白」闸门（贴边横条会被当成轨道）"
assert old in s, '锚点没找到（注入失败）'
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PYIN
    out=$(python3 tools/ys-editor/tests/scrollbar.selftest.py 2>&1)
    line=$(echo "$out" | grep -o 'SCROLLBAR-RESULT .*' | tail -1)
    if echo "$out" | grep -q 'verdict=FAIL'; then
      echo "INJECT-PASS scrollbar-neg: 关掉「轨道两端留白」闸门后自测变红（${line:-无读数}）"; exit 0
    fi
    echo "INJECT-FAIL scrollbar-neg: 关掉闸门后自测仍 PASS（门禁空转）"; echo "$out" | tail -3; exit 1
    ;;
  # ③b 注入「退回逐字相等」→ world-settle 必须报红
  settle-neg)
    f="tools/ys-editor/ys_settle.py"; bak="$(mktemp)"; cp "$f" "$bak"
    trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    python3 - "$f" <<'PYIN'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = "    same = (n_unmatched == 0) and (max_shift <= tol_px)"
new = "    same = (n_unmatched == 0) and (max_shift <= 0.0) and (n_text_changed == 0)  # INJECT: 退回逐字相等"
assert old in s, '锚点没找到（注入失败）'
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PYIN
    python3 tools/ys-editor/tests/world-settle.selftest.py >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL settle-neg: 退回逐字相等后自测仍全绿（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS settle-neg: 退回逐字相等 → 自测报红 rc=$rc"; exit 0
    ;;
  # ③c 注入「归还假装成功」→ focus-default 必须报红
  focus-neg)
    f="tools/ys-editor/ys-lease"; bak="$(mktemp)"; cp "$f" "$bak"
    # 注意：本用例 patch 的正是"用来收尾"的工具 ⇒ trap 必须先还原再收尾，
    # 否则屏幕会被留在游戏上（2026-10-21 自己踩到）。
    trap 'cp "$bak" "$f"; rm -f "$bak"; "$f" restore --prev-json "" --fallback firefox >/dev/null 2>&1 || true' EXIT
    python3 - "$f" <<'PYIN'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = """    state0 = kwin_state()"""
new = """    if prev is None:               # INJECT: 假装已切回，其实一个窗口都没动
        return {"ok": True, "restored": "(INJECT: 未真正切窗)"}
    state0 = kwin_state()"""
assert old in s, '锚点没找到（注入失败）'
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PYIN
    # 2026-10-21 改：门禁换成 handback-noop（**全离线**，用 YS_KWIN_JS_FIXTURE 喂 KWin 状态）。
    # 原先是跑 focus-default——那套件要抬真实窗口；F-20261021-54 给它加了可执行闸门后，
    # 不带 YS_ALLOW_SCREEN_TEST 就直接 SKIP（rc=0），注入用例于是误报"门禁空转"。
    python3 tools/ys-editor/tests/handback-noop.selftest.py >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL focus-neg: 归还假装成功时自测仍绿（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS focus-neg: 归还假装成功 → 自测报红 rc=$rc"; exit 0
    ;;
  # ③d 注入「关掉列表检测」→ advice 自测必须报红
  advice-neg)
    f="tools/ys-editor/ys_advice.py"; bak="$(mktemp)"; cp "$f" "$bak"
    trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    python3 - "$f" <<'PYIN'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = "    return rows if len(rows) >= 3 else []"
new = "    return []  # INJECT: 关掉列表检测"
assert old in s, '锚点没找到（注入失败）'
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PYIN
    python3 tools/ys-editor/tests/advice.selftest.py >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL advice-neg: 关掉列表检测后自测仍绿（门禁空转）"; exit 1
    fi
    echo "INJECT-PASS advice-neg: 关掉列表检测 → 自测报红 rc=$rc"; exit 0
    ;;
  # ③e 注入「夹具被删」→ advice 自测必须显式 FIXTURE_MISSING（不是静默 FAIL）
  advice-fixture-neg)
    f="tools/ys-editor/tests/fixtures/advice/screens.json"; bak="$(mktemp)"
    cp "$f" "$bak"; trap 'cp "$bak" "$f"; rm -f "$bak"' EXIT
    rm -f "$f"
    out=$(python3 tools/ys-editor/tests/advice.selftest.py 2>&1); rc=$?
    if [ "$rc" -ne 2 ] || ! printf '%s' "$out" | grep -q "FIXTURE_MISSING"; then
      echo "INJECT-FAIL advice-fixture-neg: 夹具缺失时没有显式报错（rc=$rc out=$out）"; exit 1
    fi
    echo "INJECT-PASS advice-fixture-neg: 夹具缺失 → FIXTURE_MISSING rc=$rc"; exit 0
    ;;
  # ③f 注入「CLI 兜底被摘」→ advice 自测必须报红（cli=s03/None）
  advice-cli-neg)
    out=$(YS_ADVICE_CLI_DISABLE=1 python3 tools/ys-editor/tests/advice.selftest.py 2>&1); rc=$?
    if [ "$rc" -eq 0 ] || ! printf '%s' "$out" | grep -q "cli=s03/None"; then
      echo "INJECT-FAIL advice-cli-neg: 摘掉 CLI 兜底后自测仍绿（rc=$rc out=$out）"; exit 1
    fi
    echo "INJECT-PASS advice-cli-neg: CLI 兜底被摘 → 自测报红 rc=$rc"; exit 0
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
  # ⑨ 注入「语料夹具被删」→ perception 契约门禁必须 rc=2 且 error=FIXTURE_MISSING（技能 §11 夹具纪律）
  #    为什么不用"改判据"来注入：夹具缺失是**任何实现**都必须报的错，注入物与被测实现解耦，
  #    所以这条用例在契约迁移**进行中**也能证明门禁不是空转（不会因 S2/S3 本来就红而误判）。
  perception-fixture-neg)
    f="tools/ys-editor/tests/fixtures/perception/foreign-ui-2560x1440.png"
    hid="$f.__inject_hidden"
    trap 'mv -f "$hid" "$f" 2>/dev/null || true' EXIT
    if [ ! -f "$f" ]; then echo "INJECT-FAIL perception-fixture-neg: 夹具不存在，无法注入（先修夹具）"; exit 1; fi
    mv "$f" "$hid"
    out=$(python3 tools/ys-editor/tests/perception-contract.selftest.py 2>&1); rc=$?
    mv -f "$hid" "$f"
    if [ "$rc" -ne 2 ]; then
      echo "INJECT-FAIL perception-fixture-neg: 夹具被删后 rc=$rc（应为 2 环境/夹具缺失）"; echo "$out" | tail -3; exit 1
    fi
    if ! printf '%s' "$out" | grep -q 'error=FIXTURE_MISSING'; then
      echo "INJECT-FAIL perception-fixture-neg: 没报 error=FIXTURE_MISSING（静默 FAIL = 分不清夹具没了还是逻辑坏了）"; exit 1
    fi
    if ! printf '%s' "$out" | grep -q 'foreign-ui-2560x1440.png'; then
      echo "INJECT-FAIL perception-fixture-neg: 报了缺失但没点名是哪个文件（下一个人无从修）"; exit 1
    fi
    echo "INJECT-PASS perception-fixture-neg: 删掉 foreign-ui 夹具 ⇒ rc=2 error=FIXTURE_MISSING 点名该文件"; exit 0
    ;;
  # ⑩ 注入「把耗时重新塞回观测缺陷」→ perception 契约门禁的 **S1** 必须报红
  #    （F-20261021-70 的 prevented 证据之二：实现无关的夹具用例证明门禁活着，
  #      这一条证明**具体那条判据真的在判**）
  #    做法：把 worldsvc.py 复制成**同目录副本**再打补丁，用 YS_PERCEPTION_WORLDSVC 指过去——
  #    生产文件一个字节都不动（owner 可能正在编辑，备份-还原有互相覆盖的风险）。
  perception-budget-neg)
    src=".scratch/gui-service/worldsvc.py"
    tmp=".scratch/gui-service/worldsvc.__inject_tmp.py"
    trap 'rm -f "$tmp"' EXIT
    base=$(python3 tools/ys-editor/tests/perception-contract.selftest.py 2>&1)
    if ! printf '%s' "$base" | grep -q '^\[PASS\] S1'; then
      echo "INJECT-FAIL perception-budget-neg: 基线 S1 本来就不绿，注入证明不了任何事（先修实现）"; exit 1
    fi
    cp "$src" "$tmp"
    python3 - "$tmp" <<'PYIN'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = "    items = []\n    sm = state_match or {}"
new = ("    items = []\n"
       "    items.append(_degraded(\"BUDGET_EXCEEDED\", \"INJECT: 把耗时重新塞回观测缺陷\"))\n"
       "    sm = state_match or {}")
assert old in s, "注入点没找到（degraded_items 首行变了）"
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PYIN
    out=$(YS_PERCEPTION_WORLDSVC="$tmp" python3 tools/ys-editor/tests/perception-contract.selftest.py 2>&1); rc=$?
    rm -f "$tmp"
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL perception-budget-neg: BUDGET_EXCEEDED 回到 degraded 后门禁仍绿（S1 空转）"; exit 1
    fi
    if ! printf '%s' "$out" | grep -q '^\[FAIL\] S1'; then
      echo "INJECT-FAIL perception-budget-neg: 变红但不是 S1 那条（判据串了）"; printf '%s' "$out" | grep '^\[FAIL\]' | head -3; exit 1
    fi
    echo "INJECT-PASS perception-budget-neg: BUDGET_EXCEEDED 塞回 degraded ⇒ S1 报红（生产文件未动）"; exit 0
    ;;
  # ⑪ 注入「子进程空 stdout」→ resolve-click 套件必须报 rc=4/3 + error=EMPTY_STDOUT，
  #    而**不是**抛 json.JSONDecodeError traceback（2026-10-21 负载高峰假红回灌）。
  #    做法：YS_RESOLVE_SIM_EMPTY 让 jf() 每次当"读到空输出"——不改生产工具。
  resolve-click-empty-neg)
    out=$(YS_RESOLVE_SIM_EMPTY=1 bash tools/ys-editor/tests/resolve-click.selftest.sh 2>&1); rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "INJECT-FAIL resolve-click-empty-neg: 空 stdout 下套件仍报绿（门禁空转）"; exit 1
    fi
    if [ "$rc" -ne 3 ] && [ "$rc" -ne 4 ]; then
      echo "INJECT-FAIL resolve-click-empty-neg: rc=$rc（应为 3 环境/4 混合；1 = 被当成回归了）"; exit 1
    fi
    if ! printf '%s' "$out" | grep -q 'error=EMPTY_STDOUT'; then
      echo "INJECT-FAIL resolve-click-empty-neg: 没把空输出单列成 error=EMPTY_STDOUT（分不清负载与回归）"; exit 1
    fi
    if printf '%s' "$out" | grep -q 'Traceback'; then
      echo "INJECT-FAIL resolve-click-empty-neg: 仍然抛 Python traceback（这正是要治的假红形态）"; exit 1
    fi
    echo "INJECT-PASS resolve-click-empty-neg: 空 stdout ⇒ rc=$rc + error=EMPTY_STDOUT，无 traceback"; exit 0
    ;;
  # ⑫ 注入「裸 import -window」→ no-xbell 静态门禁必须报红（F-20261021-56 的 prevented 证据）
  #   为什么要静态注入而不是真抓一帧：裸 import 的**效果**就是敲铃，抓帧去验会真的响给用户听。
  #   这条证明的是「扫描器真的在扫」，与有没有人真犯错无关。
  no-xbell-neg)
    tmp="tools/ys-editor/inject-noxbell.py"
    trap 'rm -f "$tmp"' EXIT
    printf '# 注入物：裸 import -window（每次调用敲一次 X11 铃）\nimport -window 0x1 /tmp/x.png\n' > "$tmp"
    if bash tools/ys-editor/tests/no-xbell.sh >/tmp/.noxbell.$$ 2>&1; then
      echo "INJECT-FAIL no-xbell-neg: 注入裸 import 后门禁仍绿（门禁空转）"; rm -f /tmp/.noxbell.$$; exit 1
    fi
    if ! grep -q 'NO-XBELL FAIL' /tmp/.noxbell.$$; then
      echo "INJECT-FAIL no-xbell-neg: 变红了但不是 no-xbell 报的（判据串了）"; cat /tmp/.noxbell.$$ | tail -3; rm -f /tmp/.noxbell.$$; exit 1
    fi
    if ! grep -q 'inject-noxbell' /tmp/.noxbell.$$; then
      echo "INJECT-FAIL no-xbell-neg: 报红但没点名违规文件（下一个人无从修）"; rm -f /tmp/.noxbell.$$; exit 1
    fi
    rm -f /tmp/.noxbell.$$
    echo "INJECT-PASS no-xbell-neg: 注入裸 import ⇒ NO-XBELL FAIL 并点名该文件"; exit 0
    ;;
  # ⑬ 注入「失败只说 TARGET_NOT_FOUND，不带 reason」→ cross-desktop 必须报红（F-20261021-61 的证据）
  #   做法：ys-lease 复制成**同目录副本**再改一个键名，用 YS_LEASE_BIN 指过去——生产文件不动。
  cross-desktop-neg)
    src="tools/ys-editor/ys-lease"
    tmp="tools/ys-editor/ys-lease.__inject_tmp__"
    trap 'rm -f "$tmp"' EXIT
    cp "$src" "$tmp"; chmod +x "$tmp"
    python3 - "$tmp" <<'PYIN'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = ('    return {"ok": False, "error": "TARGET_NOT_FOUND",\n'
       '            "reason": (')
new = ('    return {"ok": False, "error": "TARGET_NOT_FOUND",\n'
       '            "reason_injected_away": (')
assert old in s, "注入点没找到（TARGET_NOT_FOUND 回执结构变了）"
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PYIN
    if YS_LEASE_BIN="$tmp" python3 tools/ys-editor/tests/cross-desktop.selftest.py >/tmp/.xd.$$ 2>&1; then
      echo "INJECT-FAIL cross-desktop-neg: 丢掉 reason 后门禁仍绿（门禁空转）"; rm -f /tmp/.xd.$$; exit 1
    fi
    if ! grep -qE '^T2 +FAIL' /tmp/.xd.$$; then
      echo "INJECT-FAIL cross-desktop-neg: 变红但不是 T2（reason 必填）那条（判据串了）"; grep -E '^T[0-9]' /tmp/.xd.$$ | head -5; rm -f /tmp/.xd.$$; exit 1
    fi
    rm -f /tmp/.xd.$$
    echo "INJECT-PASS cross-desktop-neg: 丢掉 reason ⇒ T2 报红（生产 ys-lease 未动）"; exit 0
    ;;
  # ⑭ 注入「测试里裸调 ys-gui-slot」→ screen-gated 静态门禁必须报红（F-20261021-54 的证据）
  #   注入物是**新建的测试文件**，不动任何生产/测试代码；扫描器只要真在扫就必须抓住它。
  screen-gated-neg)
    tmp="tools/ys-editor/tests/inject-screen-touch.sh"
    trap 'rm -f "$tmp"' EXIT
    printf '#!/bin/bash\n# 注入物：测试里裸调 ys-gui-slot（会抬真实窗口）\ntools/ys-editor/ys-gui-slot 0x1 1 true\n' > "$tmp"
    if python3 tools/ys-editor/tests/screen-gated-scan.py >/tmp/.sgated.$$ 2>&1; then
      echo "INJECT-FAIL screen-gated-neg: 注入裸 ys-gui-slot 后门禁仍绿（门禁空转）"; rm -f /tmp/.sgated.$$; exit 1
    fi
    if ! grep -q 'inject-screen-touch.sh' /tmp/.sgated.$$; then
      echo "INJECT-FAIL screen-gated-neg: 报红但没点名注入文件（下一个人无从修）"; rm -f /tmp/.sgated.$$; exit 1
    fi
    rm -f /tmp/.sgated.$$
    echo "INJECT-PASS screen-gated-neg: 注入裸 ys-gui-slot ⇒ 门禁点名该文件"; exit 0
    ;;
  # ⑮ 注入「关掉整帧 OCR 兜底」→ worldsvc-selftest 必须报红（F-20261021-58 的证据）
  #   做法：worldsvc.py 复制成**同目录副本**再插一行 return None，用 YS_WORLDSVC_PATH 指过去；
  #   生产文件不动（owner 可能正在编辑，备份-还原有互相覆盖的风险）。
  worldsvc-selftest-neg)
    src=".scratch/gui-service/worldsvc.py"
    tmp=".scratch/gui-service/worldsvc.__inject_tmp.py"
    trap 'rm -f "$tmp"' EXIT
    cp "$src" "$tmp"
    python3 - "$tmp" <<'PYIN'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = '        """整帧 OCR 兜底：给"只在 free_text、无归属容器"的目标补坐标（F-20261021-57）。"""'
new = (old + "\n"
       "        return None  # INJECT: 关掉整帧 OCR 兜底（F-20261021-58 的故障形态）")
assert old in s, "注入点没找到（_ocr_frame_for_text 的 docstring 变了）"
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PYIN
    # 2026-10-22：只跑受影响的那一条（--only）。此前为证 1 条断言要重跑整份 123 条（~24s）；
    # 现在套件会把未命中用例的**计算**也跳过（`maybe`/`_Skipped`），实测 24s → ~2.4s。
    # 证明力不降：注入要证的就是"OCRF 兜底那条会红"，其它用例在不在都改变不了这一点。
    if YS_WORLDSVC_PATH="$tmp" python3 .scratch/gui-service/selftest.py \
         --only '整帧 OCR 兜底' >/tmp/.wsvc-neg.$$ 2>&1; then
      echo "INJECT-FAIL worldsvc-selftest-neg: 关掉 OCR 兜底后门禁仍绿（门禁空转）"; rm -f /tmp/.wsvc-neg.$$; exit 1
    fi
    if ! grep -q '整帧 OCR 兜底' /tmp/.wsvc-neg.$$; then
      echo "INJECT-FAIL worldsvc-selftest-neg: 变红但不是 OCR 兜底那条（判据串了）"; grep 'FAIL' /tmp/.wsvc-neg.$$ | head -3; rm -f /tmp/.wsvc-neg.$$; exit 1
    fi
    rm -f /tmp/.wsvc-neg.$$
    echo "INJECT-PASS worldsvc-selftest-neg: 关掉整帧 OCR 兜底 ⇒ 对应判据报红（生产 worldsvc.py 未动）"; exit 0
    ;;
  # ⑯ 注入「关掉零操作检查」→ handback-noop 必须报红（F-20261021-55 的证据）
  #   做法：ys-lease 复制成同目录副本，把 `if _already:` 改成 `if False:`（等于旧 bug 的行为：
  #   已活动窗也照 raise），用 YS_LEASE_TOOL 指过去。KWin 用 fixture，全程不碰真窗口。
  handback-noop-neg)
    src="tools/ys-editor/ys-lease"
    tmp="tools/ys-editor/ys-lease.__inject_tmp__"
    trap 'rm -f "$tmp"' EXIT
    cp "$src" "$tmp"; chmod +x "$tmp"
    python3 - "$tmp" <<'PYIN'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = "    if _already:"
assert old in s, "注入点没找到（零操作检查变了）"
open(p, "w", encoding="utf-8").write(s.replace(old, "    if False:  # INJECT: 关掉零操作检查", 1))
PYIN
    if YS_LEASE_TOOL="$tmp" python3 tools/ys-editor/tests/handback-noop.selftest.py >/tmp/.hbnoop.$$ 2>&1; then
      echo "INJECT-FAIL handback-noop-neg: 关掉零操作检查后门禁仍绿（门禁空转）"; rm -f /tmp/.hbnoop.$$; exit 1
    fi
    if ! grep -q 'attempts==0' /tmp/.hbnoop.$$; then
      echo "INJECT-FAIL handback-noop-neg: 变红但不是「attempts==0」那条（判据串了）"; grep FAIL /tmp/.hbnoop.$$ | head -3; rm -f /tmp/.hbnoop.$$; exit 1
    fi
    rm -f /tmp/.hbnoop.$$
    echo "INJECT-PASS handback-noop-neg: 关掉零操作检查 ⇒ attempts!=0 报红（生产 ys-lease 未动）"; exit 0
    ;;
  # ② 注入「关掉租期模型」→ screen-grant 门禁必须变红（F-20261021-53）
  # 症状原样复现：租期内照样把画面还回去 ⇒ 紧接着的 look --live 必然 NOT_ATOP。
  # 锚点必须打在**判据唯一源** lease_hold_active()：--plan 与真实 restore() 共用它，
  # 所以注入后 plan 的 hold 与真实归还行为同时翻回旧语义（打在 plan 自己那份判据上 = 空转）。
  lease-model-off)
    src="tools/ys-editor/ys-gui-slot"
    tmp="tools/ys-editor/ys-gui-slot.__inject_tmp__"
    trap 'rm -f "$tmp"' EXIT
    cp "$src" "$tmp"; chmod +x "$tmp"
    python3 - "$tmp" <<'PYIN'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = ('lease_hold_active() {\n'
       '  [ "${YS_SLOT_TEST:-0}" != "1" ] || return 1\n'
       '  grant_status\n'
       '}')
assert old in s, "注入点没找到（lease_hold_active 函数体变了）"
new = 'lease_hold_active() {\n  return 1   # INJECT: 关掉租期模型（租期内也归还）\n}'
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PYIN
    if YS_SLOT_BIN="$tmp" bash tools/ys-editor/tests/screen-grant.selftest.sh >/tmp/.leasemodel.$$ 2>&1; then
      echo "INJECT-FAIL lease-model-off: 关掉租期模型后门禁仍绿（门禁空转）"; rm -f /tmp/.leasemodel.$$; exit 1
    fi
    if ! grep -q 'T13' /tmp/.leasemodel.$$; then
      echo "INJECT-FAIL lease-model-off: 变红但不是 T13（租期模型）那条（判据串了）"
      grep -E '✗|FAIL' /tmp/.leasemodel.$$ | head -3; rm -f /tmp/.leasemodel.$$; exit 1
    fi
    rm -f /tmp/.leasemodel.$$
    echo "INJECT-PASS lease-model-off: 关掉租期模型 ⇒ T13 报红（生产 ys-gui-slot 未动）"; exit 0
    ;;
  # ② 注入「到期也不归还」→ grant-expiry 门禁必须变红（F-20261021-60）
  # 症状原样复现：凭据过期了，但守护仍然什么都不做 ⇒ 屏幕被永久占着。
  grant-expiry-neg)
    src="tools/ys-editor/ys-focus-guard"
    tmp="tools/ys-editor/ys-focus-guard.__inject_tmp__"
    trap 'rm -f "$tmp"' EXIT
    cp "$src" "$tmp"
    python3 - "$tmp" <<'PYIN'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = "    if left > 0:\n        return 0\n"
assert old in s, "注入点没找到（enforce_grant_expiry 的提前返回变了）"
new = "    if True:  # INJECT: 关掉「未过期才跳过」——过期也不归还\n        return 0\n"
open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
PYIN
    if YS_FOCUS_GUARD_BIN="$tmp" bash tools/ys-editor/tests/grant-expiry.selftest.sh >/tmp/.gexp.$$ 2>&1; then
      echo "INJECT-FAIL grant-expiry-neg: 关掉到期归还后门禁仍绿（门禁空转）"; rm -f /tmp/.gexp.$$; exit 1
    fi
    if ! grep -q 'T1  FAIL' /tmp/.gexp.$$; then
      echo "INJECT-FAIL grant-expiry-neg: 变红但不是 T1（到期归还）那条（判据串了）"
      grep FAIL /tmp/.gexp.$$ | head -3; rm -f /tmp/.gexp.$$; exit 1
    fi
    rm -f /tmp/.gexp.$$
    echo "INJECT-PASS grant-expiry-neg: 关掉到期归还 ⇒ T1 报红（生产 ys-focus-guard 未动）"; exit 0
    ;;
  *) echo "用法: $0 noswallow|regress-neg|path-typo|unit-domain|model-trace|focus-lease|advice-neg|advice-fixture-neg|advice-cli-neg|perception-fixture-neg|perception-budget-neg|resolve-click-empty-neg|no-xbell-neg|cross-desktop-neg|screen-gated-neg|worldsvc-selftest-neg|handback-noop-neg" >&2; exit 2 ;;
esac
