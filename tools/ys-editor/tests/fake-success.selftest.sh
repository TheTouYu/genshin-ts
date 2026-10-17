#!/bin/bash
# fake-success.selftest.sh — 门槛②（假成功注入）执行器级回归
#
# 判据来源：docs/maintenance/gui-gate-contract-2026-10-17.md §3（失败类名/退出码/报告行照它）
# 被测对象：**真实执行器代码路径** `tools/gui run`（不是另写一个模拟器）——
#   断言判定走 tools/gui 的 assert 分支，目标解析走它的 find_target，
#   三类失败分别从 do_step / cmd_run 的失败分支返回 3/4。
#
# 离线怎么做（不碰活体桌面）：
#   · 判据吃离线帧：`--frame <regress.png>`（vision / ys-state 两条通道都不抓屏）
#   · 点击走桩后端：`--click-backend stub --tree fixtures/stub-tree.txt`（只解析不注入）
#   · 全程 `DISPLAY=` 置空：真去抓屏会当场失败，是「没碰桌面」的硬证据；
#     每次运行还断言 run.json 的 budget.frames == 0（活体取帧计数）与 focus == 0
#
# 用法:
#   bash tools/ys-editor/tests/fake-success.selftest.sh [-v]
#   -v  打印每个用例的完整输出
# 退出码: 0 全绿 / 1 有失败项 / 2 环境不全（缺帧或 profile ⇒ 不许静默跳过）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
GUI="$ROOT/tools/gui"
FIX="$HERE/fixtures"
REG="$ROOT/tools/ys-editor/calib/regress"
PROFILE="$ROOT/.scratch/gui-profiles/qianxing.json"
TREE="$FIX/stub-tree.txt"
TMP="$(mktemp -d /tmp/fake-success.XXXXXX)"
LIMIT_MS=10000          # 契约 §3：单步等待上限 ≤10s（含执行器停下来的时间）
VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

PASS=0; FAIL=0
LAST_OUT=""; LAST_CODE=""; LAST_MS=""
ok()   { printf '    ✓ %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '    ✗ %s\n' "$1"; [ -n "${2:-}" ] && printf '      ↳ %s\n' "$2"; FAIL=$((FAIL+1)); }
ms()   { date +%s%3N; }

need() {  # 环境不全 ⇒ 退出 2（明说缺什么，不静默跳过）
  local miss=()
  [ -x "$GUI" ] || miss+=("执行器 $GUI")
  [ -f "$TREE" ] || miss+=("桩树 $TREE")
  [ -f "$PROFILE" ] || miss+=("profile $PROFILE")
  [ -f "$REG/savelist.png" ] || miss+=("离线帧 $REG/savelist.png")
  [ -f "$REG/playtest.png" ] || miss+=("离线帧 $REG/playtest.png")
  if [ ${#miss[@]} -gt 0 ]; then
    printf '✗ 环境不全，无法验证门槛②：缺 %s\n' "${miss[*]}" >&2
    exit 2
  fi
}

run_case() {  # run_case <名称> <期望退出码> <技能文件> <附加参数…>
  local name="$1" want="$2" skill="$3"; shift 3
  local t0 t1
  t0=$(ms)
  LAST_OUT=$(DISPLAY= "$GUI" run "$skill" "$@" 2>&1); LAST_CODE=$?
  t1=$(ms)
  LAST_MS=$((t1 - t0))
  printf '\n── %s ──\n' "$name"
  if [ "$VERBOSE" = 1 ]; then printf '%s\n' "$LAST_OUT" | sed 's/^/    | /'; fi
  printf '%s\n' "$LAST_OUT" | grep -E '^(ASSERT-FALSE|RESOLVE-FAIL|NO-EFFECT|PRE-FALSE|✓ 全部通过)' \
    | sed 's/^/    > /'
  printf '    退出码=%s  耗时=%sms\n' "$LAST_CODE" "$LAST_MS"
  [ "$LAST_CODE" = "$want" ] && ok "退出码=$LAST_CODE（期望 $want）" \
    || bad "退出码=$LAST_CODE（期望 $want）" "$(printf '%s' "$LAST_OUT" | tail -3 | tr '\n' ' ')"
  [ "$LAST_MS" -le "$LIMIT_MS" ] && ok "耗时 ${LAST_MS}ms ≤ ${LIMIT_MS}ms（契约硬上界）" \
    || bad "耗时 ${LAST_MS}ms 超过 ${LIMIT_MS}ms"
}

has_line() {  # has_line <必须出现的子串> [说明]
  case "$LAST_OUT" in
    *"$1"*) ok "报告行含「$1」" ;;
    *) bad "报告行缺「$1」" "$(printf '%s' "$LAST_OUT" | tail -4 | tr '\n' ' ')" ;;
  esac
}

# run.json 契约字段 + 「没碰桌面」证据（每步 {act,target,ok,observed,ms}；budget.frames=0）
jsoncheck() {  # jsoncheck <run.json> <fail|ok> [limits_max]
  local f="$1" mode="$2" want_max="${3:-}"
  if [ ! -s "$f" ]; then bad "run.json 没落盘: $f"; return; fi
  local out rc
  out=$(python3 - "$f" "$mode" "$want_max" <<'PY'
import json, sys
path, mode, want_max = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(path))
problems = []
need = {'act', 'target', 'ok', 'observed', 'ms'}
for s in d.get('steps', []):
    miss = need - set(s)
    if miss:
        problems.append(f'step#{s.get("step")} 缺字段 {sorted(miss)}')
if mode == 'fail':
    if d.get('ok') is not False or d.get('exit') in (None, 0):
        problems.append(f'失败运行却 ok={d.get("ok")} exit={d.get("exit")}')
    if not d.get('failure'):
        problems.append('缺 failure 记录')
    elif set(d['failure']) < {'step', 'class', 'expected', 'observed'}:
        problems.append(f'failure 字段不全: {sorted(d["failure"])}')
b = d.get('budget') or {}
if b.get('frames') != 0:
    problems.append(f'budget.frames={b.get("frames")} ≠ 0（碰了活体桌面！）')
if b.get('focus') != 0:
    problems.append(f'budget.focus={b.get("focus")} ≠ 0（抢了焦点！）')
if want_max and (d.get('limits') or {}).get('step_wait_max_ms') != int(want_max):
    problems.append(f'limits.step_wait_max_ms={(d.get("limits") or {}).get("step_wait_max_ms")}'
                    f' ≠ {want_max}（硬上界未生效）')
print('OK' if not problems else '; '.join(problems))
PY
)
  rc=$?
  if [ $rc -ne 0 ]; then bad "run.json 校验执行失败: $out"; return; fi
  if [ "$out" = "OK" ]; then ok "run.json 合规（每步 {act,target,ok,observed,ms}；frames=0 focus=0${want_max:+；上限=$want_max}）"
  else bad "run.json 不合规" "$out"; fi
}

need
printf '══ 门槛② 假成功注入自测 %s ══\n' "$(date '+%F %T')"
printf '执行器 %s\n离线帧 %s\n桩树   %s\nprofile %s\n' "$GUI" "$REG" "$TREE" "$PROFILE"
printf '单步上界 %sms（契约 §3；进程总耗时含解释器启动 ~60ms）\n' "$LIMIT_MS"

# ── F1 断言为假：期望 state=PLAYTEST，实际 SAVELIST ─────────────────────
# 两条通道各跑一次：vision（离线锚点，快、稳定，回归主通道）
#                  ys-state（契约 §1 唯一判据入口；证明真通道也停得住）
"$GUI" state --frame "$REG/savelist.png" --json "$TMP/warm.json" >/dev/null 2>&1   # 预热判据仪器（不计时）
run_case "F1 断言为假（vision 通道）" 3 "$FIX/f1-assert-false.json" \
  --state-backend vision --profile "$PROFILE" --frame "$REG/savelist.png" --json "$TMP/f1.json"
has_line 'ASSERT-FALSE step#1 expected=state=PLAYTEST observed=SAVELIST'
jsoncheck "$TMP/f1.json" fail
F1V_MS=$LAST_MS; F1V_EXIT=$LAST_CODE

# 契约通道：ys-state --fast 离线帧约 0.4s/次（state-core 2026-10-17 19:39 落地），5s 足够观测到真态
run_case "F1 断言为假（ys-state 契约通道）" 3 "$FIX/f1-assert-false.json" \
  --frame "$REG/savelist.png" --json "$TMP/f1ys.json"
has_line 'ASSERT-FALSE step#1 expected=state=PLAYTEST observed=SAVELIST'
jsoncheck "$TMP/f1ys.json" fail
F1_MS=$LAST_MS; F1_EXIT=$LAST_CODE

# ── F2 目标解析失败：click role=button name=不存在 ───────────────────────
run_case "F2 目标解析失败（桩后端，不碰 AT-SPI）" 4 "$FIX/f2-resolve-fail.json" \
  --click-backend stub --tree "$TREE" --state-backend vision --profile "$PROFILE" \
  --frame "$REG/savelist.png" --json "$TMP/f2.json"
has_line 'RESOLVE-FAIL step#1 target={"role": "button", "name": "不存在的按钮"} 候选=0'
jsoncheck "$TMP/f2.json" fail
F2_MS=$LAST_MS; F2_EXIT=$LAST_CODE

# ── F3 动作无效果：click 成功但后置断言恒假 ─────────────────────────────
run_case "F3 动作无效果（桩后端 + 后置断言恒假）" 3 "$FIX/f3-no-effect.json" \
  --click-backend stub --tree "$TREE" --state-backend vision --profile "$PROFILE" \
  --frame "$REG/savelist.png" --json "$TMP/f3.json"
has_line 'NO-EFFECT step#1 post=state=PLAYTEST observed序列=['
jsoncheck "$TMP/f3.json" fail
F3_MS=$LAST_MS; F3_EXIT=$LAST_CODE

# ── 反例保护：真能过的技能也必须退出 0（防「一律失败」的假绿）────────
run_case "F4 正常路径（必须退出 0）" 0 "$FIX/f4-happy-path.json" \
  --click-backend stub --tree "$TREE" --state-backend vision --profile "$PROFILE" \
  --frame "$REG/playtest.png" --json "$TMP/f4.json"
jsoncheck "$TMP/f4.json" ok
python3 - "$TMP/f4.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['ok'] is True and d['exit'] == 0, d
assert d['steps'][0]['observed'].startswith('[stub] click name=开始游戏'), d['steps'][0]
print('    ✓ 正常路径 ok=true，动作观测值=' + d['steps'][0]['observed'])
PY
[ $? -eq 0 ] && PASS=$((PASS+1)) || bad "正常路径 run.json 断言失败"

# ── `tools/gui state` 薄封装（契约 §1）：只调 ys-state，--fast 必须真生效 ──
echo
echo "── state 薄封装（--frame + --fast，只调 ys-state，不抓屏）──"
t0=$(ms); state_out=$("$GUI" state --frame "$REG/playtest.png" --json "$TMP/state.json" 2>&1)
state_rc=$?; state_ms=$(( $(ms) - t0 ))
printf '%s\n' "$state_out" | sed 's/^/    | /'
printf '    退出码=%s  耗时=%sms\n' "$state_rc" "$state_ms"
[ "$state_rc" = 0 ] && ok "state 退出码 0（透传 ys-state）" || bad "state 退出码 $state_rc"
grep -q '"state": "PLAYTEST"' "$TMP/state.json" && ok "离线帧判出 PLAYTEST" || bad "state 判定值不对"
if grep -q '"fast_ready": true' "$TMP/state.json"; then
  ok "走的是 ys-state --fast 快通道（契约 §1 已就绪）"
else
  bad "fast 通道未生效（ys-state 未返回 channel:fast）"
fi
[ "$state_ms" -le 3000 ] && ok "state 耗时 ${state_ms}ms ≤3000ms（full 通道同帧约 4.5s）" \
  || bad "state 耗时 ${state_ms}ms 偏慢（fast 通道应 <1s）"

# ── 硬上界夹取：技能里写 timeout:999 也不许拖过 10s ─────────────────────
run_case "上界夹取（--max-step-wait 99999 ⇒ 仍夹到 10000）" 4 "$FIX/f2-resolve-fail.json" \
  --click-backend stub --tree "$TREE" --max-step-wait 99999 --default-step-wait 99999 \
  --json "$TMP/clamp1.json"
jsoncheck "$TMP/clamp1.json" fail 10000

run_case "上界夹取（技能 timeout:999 + --max-step-wait 1500 ⇒ 1.5s 停）" 3 "$FIX/f5-timeout-999.json" \
  --state-backend vision --profile "$PROFILE" --frame "$REG/savelist.png" \
  --max-step-wait 1500 --json "$TMP/clamp2.json"
has_line 'ASSERT-FALSE step#1 expected=state=PLAYTEST observed=SAVELIST'
if [ "$LAST_MS" -le 3000 ]; then ok "timeout:999 被夹到 1500ms（实测 ${LAST_MS}ms）"
else bad "timeout:999 未被夹住（实测 ${LAST_MS}ms，应 ≤3000ms）"; fi
jsoncheck "$TMP/clamp2.json" fail 1500

printf '\n────────────────\n'
printf 'F1/F2/F3 耗时: '
for f in f1 f1ys f2 f3; do
  [ -f "$TMP/$f.json" ] && printf '%s=%sms ' "$f" "$(python3 -c "import json;print(json.load(open('$TMP/$f.json')).get('elapsed_ms'))" 2>/dev/null || echo '?')"
done
printf '\n证据目录: %s\n' "$TMP"
GATE2_VERDICT=PASS; [ "$FAIL" -gt 0 ] && GATE2_VERDICT=FAIL
# 契约 §7 机读结果行（tools/ys-gates 门槛② 只认这一行；f1 取生产通道 ys-state 的读数）
printf 'GATE2-RESULT f1=%s:%s f2=%s:%s f3=%s:%s verdict=%s\n' \
  "${F1_MS:-0}" "${F1_EXIT:-9}" "${F2_MS:-0}" "${F2_EXIT:-9}" "${F3_MS:-0}" "${F3_EXIT:-9}" "$GATE2_VERDICT"
printf '（f1 vision 通道读数：%sms:%s）\n' "${F1V_MS:-?}" "${F1V_EXIT:-?}"
if [ "$FAIL" -gt 0 ]; then printf '✗ %d 项失败 / %d 项通过\n' "$FAIL" "$PASS"; exit 1; fi
printf '✓ 全绿（%d 项，三类失败全部 ≤%dms 停下且退出码 3/4）\n' "$PASS" "$LIMIT_MS"
exit 0
