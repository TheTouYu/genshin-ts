#!/bin/bash
# round-replay.selftest.sh — 门槛④（证据可重算）自测
#
# 判据来源：docs/maintenance/gui-gate-contract-2026-10-17.md §4
#   只给 round.json + 引用帧 + .gia ⇒ 能重算出结论；缺证据时必须报错/DIFF，不许猜。
#
# 被测对象（真实代码路径，不另写模拟器）：
#   · tools/round-report --emit-round <dir>   round.json 的唯一 schema 写入口（证据不全拒写）
#   · tools/round-report --replay <dir>       只读落盘物重算，打印 PASS/DIFF
#
# 夹具（tools/ys-editor/tests/fixtures/round/）：
#   round.draft.json        执行器会写出的草稿（步骤/读数/预算/日志标记/gil 指纹）
#   debug-log.gia.bin       真实调试日志（含标记 YJ-BOOT，来自 2026-10-17 的真机轮；
                          后缀 .bin 是因为仓里 *.gia 被 .gitignore 挡住，自测时复制成 debug-log.gia）
#   fixture-local-save.gil  .gil 的 94 字节占位物（重算只验 sha256，不解析内容）
#   帧不随仓提交（全尺寸 PNG 太大）：自测时从 calib/regress 拷进临时目录
#
# 用法: bash tools/ys-editor/tests/round-replay.selftest.sh [-v]
# 退出码: 0 全绿 / 1 有失败项 / 2 环境不全（缺 round-report / 帧 / profile）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
RR="$ROOT/tools/round-report"
FIX="$HERE/fixtures/round"
REG="$ROOT/tools/ys-editor/calib/regress"
TMP="$(mktemp -d /tmp/round-replay.XXXXXX)"
VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1
PASS=0; FAIL=0
G4_PASS=0; G4_DIFF=0; G4_ERROR=0
g4() { case "$1" in pass) G4_PASS=$((G4_PASS+1));; diff) G4_DIFF=$((G4_DIFF+1));;
                   error) G4_ERROR=$((G4_ERROR+1));; esac; }
LAST_OUT=""; LAST_CODE=""; LAST_MS=""
ok()  { printf '    ✓ %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '    ✗ %s\n' "$1"; [ -n "${2:-}" ] && printf '      ↳ %s\n' "$2"; FAIL=$((FAIL+1)); }
ms()  { date +%s%3N; }

miss=()
[ -x "$RR" ] || miss+=("round-report")
[ -f "$FIX/round.draft.json" ] || miss+=("夹具 round.draft.json")
[ -f "$FIX/debug-log.gia.bin" ] || miss+=("夹具 debug-log.gia")
[ -f "$FIX/fixture-local-save.gil" ] || miss+=("夹具 fixture-local-save.gil")
[ -f "$REG/savelist.png" ] || miss+=("离线帧 savelist.png")
[ -f "$REG/playtest.png" ] || miss+=("离线帧 playtest.png")
if [ ${#miss[@]} -gt 0 ]; then printf '✗ 环境不全，无法验证门槛④：缺 %s\n' "${miss[*]}" >&2; exit 2; fi

materialize() {   # materialize <目录>：造一份"证据齐全"的 round 目录
  local d="$1"; rm -rf "$d"; mkdir -p "$d"
  cp "$FIX/round.draft.json" "$FIX/fixture-local-save.gil" "$d/"
  cp "$FIX/debug-log.gia.bin" "$d/debug-log.gia"   # .bin 后缀：仓里 *.gia 被 .gitignore 挡住
  cp "$REG/savelist.png" "$REG/playtest.png" "$d/"
}

run_cmd() {       # run_cmd <名称> <期望退出码> <命令…>
  local name="$1" want="$2"; shift 2
  local t0 t1
  t0=$(ms); LAST_OUT=$("$@" 2>&1); LAST_CODE=$?; t1=$(ms)
  LAST_MS=$((t1 - t0))
  printf '\n── %s ──\n' "$name"
  if [ "$VERBOSE" = 1 ]; then printf '%s\n' "$LAST_OUT" | sed 's/^/    | /'
  else printf '%s\n' "$LAST_OUT" | grep -E '^(  [✓✗·]|结论:|✓ |✗ )' | sed 's/^/    /'; fi
  printf '    退出码=%s  耗时=%sms\n' "$LAST_CODE" "$LAST_MS"
  [ "$LAST_CODE" = "$want" ] && ok "退出码=$LAST_CODE（期望 $want）" \
    || bad "退出码=$LAST_CODE（期望 $want）" "$(printf '%s' "$LAST_OUT" | tail -3 | tr '\n' ' ')"
}
has() { case "$LAST_OUT" in *"$1"*) ok "输出含「$1」";; *) bad "输出缺「$1」" "$(printf '%s' "$LAST_OUT" | tail -4 | tr '\n' ' ')";; esac; }
hasnt() { case "$LAST_OUT" in *"$1"*) bad "输出不该含「$1」";; *) ok "输出不含「$1」";; esac; }

printf '══ 门槛④ 证据重算自测 %s ══\n' "$(date '+%F %T')"
printf 'round-report %s\n夹具 %s\n帧 %s\n临时目录 %s\n' "$RR" "$FIX" "$REG" "$TMP"

# ── ① round.json 的唯一写入口：证据齐 ⇒ 落盘；证据缺 ⇒ 拒写 ─────────────
D="$TMP/ok"; materialize "$D"
run_cmd "--emit-round 证据齐全 ⇒ 落盘 round.json" 0 "$RR" --emit-round "$D"
has "round.json 已落盘"
[ -s "$D/round.json" ] && ok "round.json 真的存在（$(stat -c %s "$D/round.json") 字节）" || bad "round.json 没落盘"

D2="$TMP/missing-on-emit"; materialize "$D2"; rm "$D2/playtest.png"
run_cmd "--emit-round 缺引用帧 ⇒ 拒绝落盘（fail closed）" 2 "$RR" --emit-round "$D2"
has "不写 round.json"
[ -e "$D2/round.json" ] && bad "缺证据却写出了 round.json（会把不可重算的结论当真）" \
  || ok "缺证据时没有 round.json（不会伪造证据）"

# ── ② 齐全证据 ⇒ 重算 PASS ─────────────────────────────────────────────
D="$TMP/ok"
N_BEFORE=$(ls -1 "$D" | wc -l)
run_cmd "--replay 证据齐全 ⇒ PASS" 0 "$RR" --replay "$D" --json "$TMP/verdict.json"
has "结论: PASS"
g4 pass
has "状态重算   PASS  savelist.png → SAVELIST"
has "状态重算   PASS  playtest.png → PLAYTEST"
has "日志标记   PASS"
has "gil 指纹 PASS"
N_AFTER=$(ls -1 "$D" | wc -l)
[ "$N_BEFORE" = "$N_AFTER" ] && ok "replay 不新增落盘物（前后文件数都是 $N_BEFORE）" \
  || bad "replay 往证据目录里写了东西（$N_BEFORE → $N_AFTER）"
python3 - "$TMP/verdict.json" <<'PY' && PASS=$((PASS+1)) || { bad "verdict.json 不合规"; }
import json, sys
d = json.load(open(sys.argv[1]))
assert d['verdict'] == 'PASS' and d['exit'] == 0, d
assert d['checks'], 'checks 为空'
print(f'    ✓ verdict.json 合规（{len(d["checks"])} 项，verdict=PASS）')
PY

# ── ③ 缺证据 ⇒ 退出码 2（不许猜）────────────────────────────────────────
D3="$TMP/no-frame"; materialize "$D3"; "$RR" --emit-round "$D3" >/dev/null 2>&1
rm "$D3/savelist.png"          # 证据帧被删（真实事故：清临时目录时连证据一起删了）
run_cmd "--replay 缺一张引用帧 ⇒ ERROR(2)" 2 "$RR" --replay "$D3" --no-judge
has "缺 引用帧"
has "结论: ERROR"
g4 error

D4="$TMP/no-gia"; materialize "$D4"; "$RR" --emit-round "$D4" >/dev/null 2>&1
rm "$D4/debug-log.gia"
run_cmd "--replay 缺 .gia ⇒ ERROR(2)" 2 "$RR" --replay "$D4" --no-judge
has "缺 日志"
has "结论: ERROR"
g4 error

# ── ④ 证据与结论不一致 ⇒ 退出码 1（DIFF）────────────────────────────────
D5="$TMP/gil-tamper"; materialize "$D5"
"$RR" --emit-round "$D5" >/dev/null 2>&1
printf 'tampered-after-round\n' >> "$D5/fixture-local-save.gil"
run_cmd "--replay .gil 与声明指纹不符 ⇒ DIFF(1)" 1 "$RR" --replay "$D5" --no-judge
has "gil 指纹 DIFF"
has "结论: DIFF"
g4 diff

D6="$TMP/bad-marker"; materialize "$D6"
"$RR" --emit-round "$D6" >/dev/null 2>&1
python3 - "$D6/round.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d['log']['markers'].append({'mark': 'YJ-NOT-IN-LOG', 'hits': 1})
json.dump(d, open(p, 'w'), ensure_ascii=False)
PY
run_cmd "--replay 日志里没有该标记 ⇒ DIFF(1)" 1 "$RR" --replay "$D6" --no-judge
has "「YJ-NOT-IN-LOG」命中 0"
has "结论: DIFF"
g4 diff

D7="$TMP/budget-over"; materialize "$D7"
"$RR" --emit-round "$D7" >/dev/null 2>&1
python3 - "$D7/round.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d['budget'].update({'frames': 19, 'focus': 2, 'sleeps': 3})
json.dump(d, open(p, 'w'), ensure_ascii=False)
PY
run_cmd "--replay 超门槛③ 预算 ⇒ DIFF(1)" 1 "$RR" --replay "$D7" --no-judge
has "超红线"
g4 diff

D8="$TMP/state-wrong"; materialize "$D8"
"$RR" --emit-round "$D8" >/dev/null 2>&1
python3 - "$D8/round.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d['readings']['savelist.png'] = {'state': 'MENU', 'channel': 'fast'}   # 故意写错
json.dump(d, open(p, 'w'), ensure_ascii=False)
PY
run_cmd "--replay 状态读数写错 ⇒ 重判 DIFF(1)" 1 "$RR" --replay "$D8"
has "期望 MENU 实测 SAVELIST"
has "结论: DIFF"
g4 diff

printf '\n────────────────\n'
printf '重算用例: PASS=1 齐全 / DIFF=4（gil/标记/预算/状态）/ ERROR=2（缺帧/缺日志）\n'
printf '关键读数: 齐全证据重算 PASS 用时 %sms（含 ys-state 离线重判 2 帧）\n' \
  "$(python3 -c "import json;print(json.load(open('$TMP/verdict.json'))['ms'])" 2>/dev/null || echo '?')"
printf '证据目录: %s\n' "$TMP"
GATE4_VERDICT=PASS; [ "$FAIL" -gt 0 ] && GATE4_VERDICT=FAIL
# 契约 §7 机读结果行（tools/ys-gates 门槛④ 只认这一行）
printf 'GATE4-RESULT pass=%d diff=%d error=%d verdict=%s\n' \
  "$G4_PASS" "$G4_DIFF" "$G4_ERROR" "$GATE4_VERDICT"
if [ "$FAIL" -gt 0 ]; then printf '✗ %d 项失败 / %d 项通过\n' "$FAIL" "$PASS"; exit 1; fi
printf '✓ 全绿（%d 项）\n' "$PASS"
exit 0
