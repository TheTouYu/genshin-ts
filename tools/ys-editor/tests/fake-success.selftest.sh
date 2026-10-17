#!/bin/bash
# fake-success.selftest.sh — 门槛②（假成功注入）执行器级回归
#
# 判据来源：docs/maintenance/gui-gate-contract-2026-10-17.md §3（失败类名/退出码/报告行照它）
# 被测对象：**真实执行器代码路径** `tools/gui run`（不是另写一个模拟器）——
#   断言判定走 tools/gui 的 assert 分支，目标解析走它的 find_target，
#   身份协议走它的 read_identity / do_step 包装，
#   四类失败分别从 do_step / cmd_run 的失败分支返回 3/4：
#     F1 断言为假 / F2 目标解析失败 / F3 动作无效果 / F4 对象不符（动作前后身份读回不一致）
#
# 离线怎么做（不碰活体桌面）：
#   · 判据吃离线帧：`--frame <regress.png>`（vision / ys-state 两条通道都不抓屏）
#   · 点击走桩后端：`--click-backend stub --tree fixtures/stub-tree.txt`（只解析不注入）
#   · 全程 `DISPLAY=` 置空：真去抓屏会当场失败，是「没碰桌面」的硬证据；
#     每次运行还断言 run.json 的 budget.frames == 0（活体取帧计数）与 focus == 0
#   · 身份协议技能的夹具**就地生成**到 $TMP/skills（不往共享 fixtures/ 塞新文件）；
#     仓里旧格式夹具（f2/f3/case4-happy-path，写动作无身份协议）现在**必须被拒**——
#     它们本身就是「没有身份的动作不许执行」的反例（lint 2 / 执行 3）。
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
SK="$TMP/skills"        # 身份协议技能夹具（就地生成）
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

mk_skills() {  # 身份协议技能夹具：就地生成（不往共享 fixtures/ 塞新文件）
  mkdir -p "$SK"
  # 写动作三件套 = target.desc（我要动谁）+ target.must_assert（身份断言，文字/判据通道）
  #                + evidence.fresh（证据必须新鲜可校验）
  cat > "$SK/f2-resolve-fail.json" <<'JSON'
{"id": "selftest.identity-f2-resolve-fail", "app": "stub", "steps": [
  {"act": "click", "target": {"desc": "不存在的按钮", "must_assert": {"text": "开始游戏"},
                              "role": "button", "name": "不存在的按钮"},
   "evidence": {"fresh": true}}]}
JSON
  cat > "$SK/f3-no-effect.json" <<'JSON'
{"id": "selftest.identity-f3-no-effect", "app": "stub", "steps": [
  {"act": "click", "target": {"desc": "开始游戏按钮", "must_assert": {"text": "开始游戏"},
                              "role": "button", "name": "开始游戏"},
   "evidence": {"fresh": true}}],
 "post": {"state": "PLAYTEST", "timeout": 5}}
JSON
  cat > "$SK/happy-path.json" <<'JSON'
{"id": "selftest.identity-happy-path", "app": "stub", "steps": [
  {"act": "click", "target": {"desc": "开始游戏按钮", "must_assert": {"text": "开始游戏"},
                              "role": "button", "name": "开始游戏"},
   "evidence": {"fresh": true}},
  {"act": "assert", "text": "开始游戏"},
  {"act": "assert", "state": "PLAYTEST", "timeout": 5}],
 "post": {"state": "PLAYTEST", "timeout": 5}}
JSON
  # F4-a：文字通道——要动的是「存档卡 fighting」，桩树里只有「开始游戏」⇒ 动作前身份不符
  cat > "$SK/f4-wrong-object.json" <<'JSON'
{"id": "selftest.f4-wrong-object", "app": "stub", "steps": [
  {"act": "click", "target": {"desc": "存档卡 fighting（当前存档）",
                              "must_assert": {"text": "存档卡 fighting"},
                              "role": "button", "name": "开始游戏"},
   "evidence": {"fresh": true}}]}
JSON
  # F4-b：判据/模板通道——动作前帧=SAVELIST、动作后帧=PLAYTEST ⇒ 同一对象读回不一致
  cat > "$SK/f4-object-drift.json" <<'JSON'
{"id": "selftest.f4-object-drift", "app": "stub", "steps": [
  {"act": "click", "target": {"desc": "当前存档卡（判据通道）",
                              "must_assert": {"state": "SAVELIST"},
                              "role": "button", "name": "开始游戏"},
   "evidence": {"fresh": true}}]}
JSON
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
  printf '%s\n' "$LAST_OUT" \
    | grep -E '^(ASSERT-FALSE|RESOLVE-FAIL|NO-EFFECT|OBJECT-MISMATCH|IDENTITY-MISSING|EVIDENCE-STALE|PRE-FALSE|✓ 全部通过)' \
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
# 契约 §4 ⑥：run.json 里出现的每张帧都要带 sha256 + captured_at；写动作成功步要带身份读数+证据。
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
# ⑥ 证据新鲜度：帧元数据必须带 sha256 + captured_at（门槛④ replay 只认这个）
def _bad_meta(m):
    return not (isinstance(m, dict) and len(str(m.get('sha256') or '')) == 64
                and str(m.get('captured_at') or '').strip())
for f in d.get('frames_meta') or {}:
    if _bad_meta((d.get('frames_meta') or {})[f]):
        problems.append(f'frames_meta[{f}] 缺 sha256/captured_at')
for s in d.get('steps', []):
    ev = s.get('evidence') or {}
    if ev.get('frame') and _bad_meta(ev.get('frame_meta')):
        problems.append(f'step#{s.get("step")} 的帧证据 {ev.get("frame")} 缺 sha256/captured_at')
    if s.get('act') in ('click', 'key') and s.get('ok') is True:
        ident = ev.get('identity')
        if not isinstance(ident, dict):
            problems.append(f'step#{s.get("step")} 写动作成功却没有身份读数')
        elif not (ident.get('artifacts') or []):
            problems.append(f'step#{s.get("step")} 身份读数没有可校验证据（无 sha）')
print('OK' if not problems else '; '.join(problems))
PY
)
  rc=$?
  if [ $rc -ne 0 ]; then bad "run.json 校验执行失败: $out"; return; fi
  if [ "$out" = "OK" ]; then
    ok "run.json 合规（每步 {act,target,ok,observed,ms}；帧带 sha256+captured_at；frames=0 focus=0${want_max:+；上限=$want_max}）"
  else bad "run.json 不合规" "$out"; fi
}

need
mk_skills
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

# ── F2 目标解析失败：click role=button name=不存在（身份协议齐 ⇒ 才走到解析）────
run_case "F2 目标解析失败（桩后端，不碰 AT-SPI）" 4 "$SK/f2-resolve-fail.json" \
  --click-backend stub --tree "$TREE" --state-backend vision --profile "$PROFILE" \
  --frame "$REG/savelist.png" --json "$TMP/f2.json"
has_line 'RESOLVE-FAIL step#1'
has_line '候选=0'
jsoncheck "$TMP/f2.json" fail
F2_MS=$LAST_MS; F2_EXIT=$LAST_CODE

# ── F3 动作无效果：click 成功但后置断言恒假 ─────────────────────────────
run_case "F3 动作无效果（桩后端 + 后置断言恒假）" 3 "$SK/f3-no-effect.json" \
  --click-backend stub --tree "$TREE" --state-backend vision --profile "$PROFILE" \
  --frame "$REG/savelist.png" --json "$TMP/f3.json"
has_line 'NO-EFFECT step#1 post=state=PLAYTEST observed序列=['
jsoncheck "$TMP/f3.json" fail
F3_MS=$LAST_MS; F3_EXIT=$LAST_CODE

# ── F4 对象不符（文字通道）：要动的对象是「存档卡 fighting」，桩树里只有「开始游戏」
# 期望：动作前身份断言就为假 ⇒ 不点击、exit 4、打印期望/实测对象
run_case "F4 对象不符（文字通道：动作前身份断言为假）" 4 "$SK/f4-wrong-object.json" \
  --click-backend stub --tree "$TREE" --state-backend vision --profile "$PROFILE" \
  --frame "$REG/savelist.png" --json "$TMP/f4-text.json"
has_line 'OBJECT-MISMATCH step#1 期望对象「存档卡 fighting（当前存档）」'
has_line '实测对象「<未命中>」'
jsoncheck "$TMP/f4-text.json" fail
python3 - "$TMP/f4-text.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
s = d['steps'][0]
assert s['observed'] != 'click', s
ident = (s.get('evidence') or {}).get('identity') or {}
assert (ident.get('post') is None), '动作前身份不符却继续读回了后置身份（应立刻停）'
print('    ✓ 身份不符时没有执行动作（后置读回为空）')
PY
[ $? -eq 0 ] && PASS=$((PASS+1)) || bad "F4 文字通道：动作前不符却仍执行了动作"
F4T_MS=$LAST_MS; F4T_EXIT=$LAST_CODE

# ── F4 对象不符（判据/模板通道）：动作前帧 SAVELIST、动作后帧 PLAYTEST ⇒ 同一对象读回不一致
run_case "F4 对象不符（判据通道：动作前后身份读回不一致）" 4 "$SK/f4-object-drift.json" \
  --click-backend stub --tree "$TREE" --frame "$REG/savelist.png" --frame "$REG/playtest.png" \
  --json "$TMP/f4.json"
has_line 'OBJECT-MISMATCH step#1 期望对象「SAVELIST」'
has_line '实测对象「PLAYTEST」'
has_line '时点=动作后'
jsoncheck "$TMP/f4.json" fail
F4_MS=$LAST_MS; F4_EXIT=$LAST_CODE

# ── 反例保护：真能过的技能也必须退出 0（防「一律失败」的假绿）────────
run_case "正常路径（身份协议齐 + 必须退出 0）" 0 "$SK/happy-path.json" \
  --click-backend stub --tree "$TREE" --state-backend vision --profile "$PROFILE" \
  --frame "$REG/playtest.png" --json "$TMP/happy.json"
jsoncheck "$TMP/happy.json" ok
python3 - "$TMP/happy.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['ok'] is True and d['exit'] == 0, d
s = d['steps'][0]
assert s['observed'].startswith('[stub] click name=开始游戏'), s
ident = (s.get('evidence') or {}).get('identity') or {}
assert ident.get('pre', {}).get('identity') == ident.get('post', {}).get('identity'), ident
assert len(ident.get('artifacts') or []) >= 2, ident
print('    ✓ 正常路径 ok=true，身份前后一致=' + ident['pre']['identity']
      + f'，可校验证据 {len(ident["artifacts"])} 条')
PY
[ $? -eq 0 ] && PASS=$((PASS+1)) || bad "正常路径 run.json 断言失败"

# ── 身份闸门反例：**旧格式**写动作（无 target.desc/must_assert/evidence.fresh）必须被拒
#     lint ⇒ 退出码 2（不许进库）；执行 ⇒ 退出码 3（不许落到桌面）
#     注：仓里旧夹具 case4-happy-path.json 的 "f4" 是「第 4 个用例」（F1/F2/F3 之后），
#         与本次新增的失败类 F4「对象不符」无关 —— 它现在作为旧格式反例被 lint 拒。
echo
echo "── 身份闸门：旧格式写动作必须被拒（lint 2 / 执行 3）──"
for old in f2-resolve-fail f3-no-effect case4-happy-path; do
  lint_out=$("$GUI" lint "$FIX/$old.json" 2>&1); lint_rc=$?
  if [ "$lint_rc" = 2 ] && printf '%s' "$lint_out" | grep -q '缺身份协议'; then
    ok "lint $old.json ⇒ 2（缺身份协议）"
  else
    bad "lint $old.json 没拒绝（rc=$lint_rc）" "$(printf '%s' "$lint_out" | tail -2 | tr '\n' ' ')"
  fi
done
run_case "旧格式写动作执行期拒绝（退出码 3）" 3 "$FIX/f2-resolve-fail.json" \
  --click-backend stub --tree "$TREE" --json "$TMP/legacy.json"
has_line 'IDENTITY-MISSING step#1'
has_line '没有身份的动作不执行'
jsoncheck "$TMP/legacy.json" fail

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
run_case "上界夹取（--max-step-wait 99999 ⇒ 仍夹到 10000）" 4 "$SK/f2-resolve-fail.json" \
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
printf 'F1/F2/F3/F4 耗时: '
for f in f1 f1ys f2 f3 f4-text f4 happy; do
  [ -f "$TMP/$f.json" ] && printf '%s=%sms ' "$f" "$(python3 -c "import json;print(json.load(open('$TMP/$f.json')).get('elapsed_ms'))" 2>/dev/null || echo '?')"
done
printf '\n证据目录: %s\n' "$TMP"
GATE2_VERDICT=PASS; [ "$FAIL" -gt 0 ] && GATE2_VERDICT=FAIL
# 契约 §7 机读结果行（tools/ys-gates 门槛② 只认这一行；f1 取生产通道 ys-state 的读数）
# 向后兼容：f1/f2/f3/verdict 键名与格式不变，f4 追加在 verdict 之前（旧解析器忽略未知键）
printf 'GATE2-RESULT f1=%s:%s f2=%s:%s f3=%s:%s f4=%s:%s verdict=%s\n' \
  "${F1_MS:-0}" "${F1_EXIT:-9}" "${F2_MS:-0}" "${F2_EXIT:-9}" "${F3_MS:-0}" "${F3_EXIT:-9}" \
  "${F4_MS:-0}" "${F4_EXIT:-9}" "$GATE2_VERDICT"
printf '（f1 vision 通道读数：%sms:%s）\n' "${F1V_MS:-?}" "${F1V_EXIT:-?}"
printf '（f4 文字通道前面拦截读数：%sms:%s）\n' "${F4T_MS:-?}" "${F4T_EXIT:-?}"
if [ "$FAIL" -gt 0 ]; then printf '✗ %d 项失败 / %d 项通过\n' "$FAIL" "$PASS"; exit 1; fi
printf '✓ 全绿（%d 项，F1-F4 四类失败全部 ≤%dms 停下且退出码 3/4；旧格式写动作被 lint2/执行3 拒）\n' \
  "$PASS" "$LIMIT_MS"
exit 0
