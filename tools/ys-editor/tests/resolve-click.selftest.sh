#!/bin/bash
# resolve-click.selftest.sh — 「按名字解析后点击 + 回读断言」的离线自测
#
# 判据来源：tools/ys-editor/ys-pointer-click 头注释 + tools/ys-find 的 --resolve 口径。
# 被测对象是**真实工具**（不另写模拟器）：解析走 tools/ys-find --resolve，点击走
# ys-pointer-click 的 click_loop，断言走它的 assert 分支。
#
# 为什么要有这个测试（2026-10-17 用户当场看出的错）：
#   同一块屏、同一批存档，列表顺序一变，同一物理点 (1681,387) 在去程属于「输入探针v2」的
#   【编辑】、回程属于「未分类页签_存档_1」的【编辑】。跨帧复用坐标的失效方式是**静默点错
#   对象**，所以坐标必须**在动作那一刻**由名字算出来，并且动作后要回读同一位置。
#   两帧都是真机帧：A=calib/regress/live-savelist-20261017.png（19:54 去程）、
#                B=tests/fixtures/savelist-orderB.png（20:19 回程，源 /tmp/back2.png）。
#
# 离线怎么做（不碰活体桌面，零注入）：
#   · 解析只吃离线帧（--frame，ys-pointer-click 里 --frame ⇒ 隐含 --dry-run，不进槽不抓屏）；
#   · 旧坐标用法（必须逐字节不变）用 PATH 桩跑真循环：xdotool/ydotool 是桩，
#     DISPLAY=:99 指向不存在的显示、YS_SLOT_ACTIVE=1 禁止进槽 ⇒ 真碰桌面会当场失败；
#   · 每轮结束断言 ydotool 日志：离线用例**一条注入都没有**（不是"应该没点"，是没调用）。
#
# 用法: bash tools/ys-editor/tests/resolve-click.selftest.sh [-v] [--only <case>]
#   case ∈ d1 | d2 | d3 | d4 | f | u（默认无参数 = 全跑）
#   --only 是给**注入用例**用的（tests/inject/resolve-click-neg.sh）：造一次故障只需要跑
#   受影响的那些断言，不必重跑整份套件；不带 --only 时行为与输出逐字节不变。
# 退出码: 0 全绿 / 1 有失败项 / 2 环境不全或用法错（缺帧/缺 venv/未知参数 ⇒ 明说，不静默跳过）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
YS="$ROOT/tools/ys-editor"
CLICK="$YS/ys-pointer-click"
FIND="$ROOT/tools/ys-find"
A="$YS/calib/regress/live-savelist-20261017.png"
B="$HERE/fixtures/savelist-orderB.png"
TMP="$(mktemp -d /tmp/resolve-click.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
VERBOSE=0; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    -v) VERBOSE=1; shift ;;
    --only) ONLY="${2:-}"; shift 2 ;;
    *) echo "用法: $0 [-v] [--only d1|d2|d3|d4|f|u]" >&2; exit 2 ;;
  esac
done
# 用例分段（--only 用）：默认 ONLY 为空 ⇒ want 恒真 ⇒ 全部按原顺序跑
case "$ONLY" in ''|d1|d2|d3|d4|f|u) ;; *) echo "--only 未知用例「$ONLY」（可选 d1 d2 d3 d4 f u）" >&2; exit 2 ;; esac
want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }
PASS=0; FAIL=0; EMPTY=0   # EMPTY=子进程空 stdout 次数（环境/负载，不是回归）
# jf 几乎都在 $(...) 子 shell 里调用 ⇒ 变量加不上父进程，改用**文件计数**（2026-10-21 自己踩到：
# 先写成 EMPTY=$((EMPTY+1))，注入用例跑出 rc=1「被当成回归」，真因就是子 shell 丢计数）。
EMPTY_LOG="$TMP/empty.log"; : > "$EMPTY_LOG"
OUT=""; ERR=""; RC=""; INJ=""

ok()  { printf '    ✓ %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '    ✗ %s\n' "$1"; [ -n "${2:-}" ] && printf '      ↳ %s\n' "$2"; FAIL=$((FAIL+1)); }
# jf: 从 JSON 里取值。**空 stdout 不许抛栈**——2026-10-21 负载高峰下并发跑本套件，
# 子进程被压到空输出，旧实现直接 json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)，
# 整个套件以 traceback 收尾 ⇒ 整条门槛②假红，且看不出"是负载还是回归"。现在：
#   空输出/坏 JSON ⇒ 计 EMPTY（或给 __BAD_JSON__ 哨兵），由文末把 rc 分成 1(回归) / 3(环境) / 4(混合)。
jf()  {
  if [ -n "${YS_RESOLVE_SIM_EMPTY:-}" ]; then printf 'x\n' >> "$EMPTY_LOG"; return 0; fi   # 注入用例专用
  local raw; raw="$(printf '%s' "$1")"
  if [ -z "${raw//[[:space:]]/}" ]; then printf 'x\n' >> "$EMPTY_LOG"; return 0; fi
  printf '%s' "$raw" | python3 -c 'import json,sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print("__BAD_JSON__"); sys.exit(0)
v = d
for k in sys.argv[1].split("."):
    v = (v or {}).get(k) if isinstance(v, dict) else None
print("" if v is None else v)' "$2"
}
has() { [[ "$1" == *"$2"* ]]; }   # 字面匹配：$2 里的 [ ] * 不当通配符

need() {
  local miss=() py="${YS_RAPIDOCR_PY:-$ROOT/.scratch/gui-grounding/venv-rapidocr/bin/python}"
  [ -x "$CLICK" ] || miss+=("$CLICK")
  [ -x "$FIND" ]  || miss+=("$FIND")
  [ -f "$A" ]     || miss+=("离线帧 A $A")
  [ -f "$B" ]     || miss+=("离线帧 B $B")
  [ -x "$py" ]    || miss+=("RapidOCR venv $py（YS_RAPIDOCR_PY 可覆盖）")
  command -v python3 >/dev/null || miss+=("python3")
  if [ ${#miss[@]} -gt 0 ]; then
    printf '✗ 环境不全，无法验证解析/点击契约：缺 %s\n' "${miss[*]}" >&2
    exit 2
  fi
}

# ── 桩：xdotool 读位置 / ydotool 移动+点击（只模拟"注入层的可观测效果"，位置来自文件）
mk_stubs() {
  STUB="$TMP/bin"; mkdir -p "$STUB"
  cat > "$STUB/xdotool" <<'EOF'
#!/bin/bash
[ "${1:-}" = "getmouselocation" ] || { echo "stub xdotool: unsupported: $*" >&2; exit 9; }
read -r x y < "$YS_STUB_POS" 2>/dev/null || { x=0; y=0; }
printf 'X=%s\nY=%s\nSCREEN=0\nWINDOW=1\n' "$x" "$y"
EOF
  cat > "$STUB/ydotool" <<'EOF'
#!/bin/bash
echo "ydotool $*" >> "$YS_STUB_LOG"
case "${1:-}" in
  mousemove)
    shift; dx=0; dy=0
    while [ $# -gt 0 ]; do case "$1" in -x) shift; dx=$1;; -y) shift; dy=$1;; esac; shift; done
    [ -f "$YS_STUB_POS.stuck" ] && exit 0
    read -r x y < "$YS_STUB_POS" 2>/dev/null || { x=0; y=0; }
    echo "$((x + dx)) $((y + dy))" > "$YS_STUB_POS" ;;
  click) : ;;
esac
exit 0
EOF
  chmod +x "$STUB/xdotool" "$STUB/ydotool"
  YS_STUB_POS="$TMP/pos"; YS_STUB_LOG="$TMP/ydotool.log"; export YS_STUB_POS YS_STUB_LOG
}

# 统一执行外壳：桩优先、DISPLAY 指向不存在的显示、禁止进槽（⇒ 不可能抢焦点）
OFF() { env PATH="$STUB:/usr/bin:/bin" DISPLAY=:99 YS_SLOT_ACTIVE=1 \
            YS_STUB_POS="$YS_STUB_POS" YS_STUB_LOG="$YS_STUB_LOG" "$@"; }

try() {  # try <期望rc> <标签> -- cmd...（输出落 OUT/ERR/RC，注入日志落 INJ）
  local want="$1" label="$2"; shift 2; [ "${1:-}" = "--" ] && shift
  : > "$YS_STUB_LOG"
  OUT="$(OFF "$@" 2>"$TMP/err")"; RC=$?; ERR="$(cat "$TMP/err")"
  INJ="$(cat "$YS_STUB_LOG" 2>/dev/null)"
  [ "$VERBOSE" = 1 ] && printf '      $ %s\n      rc=%s out=%s\n      err=%s\n' \
      "$*" "$RC" "${OUT:0:300}" "${ERR:0:300}"
  if [ "$RC" = "$want" ]; then ok "$label（rc=$RC）"
  else bad "$label" "期望 rc=$want 实测 rc=$RC；stderr=${ERR:0:400}"; fi
}

expect_eq() {  # expect_eq <标签> <实际> <期望>
  if [ "$2" = "$3" ]; then ok "$1=「$3」"; else bad "$1" "期望「$3」实测「$2」"; fi
}
expect_near() {  # expect_near <标签> <实际> <期望> [tol] —— OCR 框中心随模型版本有 ±4px 漂移，绝对值只做粗定位回归
  local tol="${4:-4}" dx
  dx=$(( $2 - $3 )); [ "$dx" -lt 0 ] && dx=$(( -dx ))
  if [ "$dx" -le "$tol" ]; then ok "$1=「$2」（期望 $3±$tol）"; else bad "$1" "期望 $3±$tol 实测「$2」"; fi
}
expect_has() {  # expect_has <标签> <文本> <子串>
  if has "$2" "$3"; then ok "$1（含「$3」）"; else bad "$1" "「$2」里没有「$3」"; fi
}
expect_no_inject() {  # 离线用例的硬判据：一条注入都没有
  if [ -z "$1" ]; then ok "离线用例零注入（ydotool 日志为空）"
  else bad "离线用例出现注入调用" "$1"; fi
}

# ── 旧坐标用法：真循环 + 桩后端（验"行为逐字节不变"）
legacy() {  # legacy <期望rc> <标签> <起始指针 "x y"> <参数...>
  local want="$1" label="$2" pos="$3"; shift 3
  printf '%s\n' "$pos" > "$YS_STUB_POS"; rm -f "$YS_STUB_POS.stuck"
  try "$want" "$label" -- "$CLICK" "$@"
}

need
mk_stubs

echo "══ resolve-click ══"

if want d1; then
echo "[D1] 同一标签、两种布局 → 坐标不同、matched_text 相同"
try 0 "A 帧解析「输入探针v2」" -- "$CLICK" --text 输入探针v2 --frame "$A"
XA="$(jf "$OUT" x)"; YA="$(jf "$OUT" y)"; MA="$(jf "$OUT" matched_text)"
expect_eq "A.x" "$XA" "1440"; expect_near "A.y" "$YA" "192"
expect_eq "A.matched_text" "$MA" "输入探针v2"
expect_no_inject "$INJ"
try 0 "B 帧解析「输入探针v2」" -- "$CLICK" --text 输入探针v2 --frame "$B"
XB="$(jf "$OUT" x)"; YB="$(jf "$OUT" y)"; MB="$(jf "$OUT" matched_text)"
expect_eq "B.x" "$XB" "816"; expect_near "B.y" "$YB" "192"
expect_eq "B.matched_text" "$MB" "输入探针v2"
expect_no_inject "$INJ"
if [ "$XA" != "$XB" ] && [ "$MA" = "$MB" ]; then
  ok "同名字在两种布局下换了坐标（A=($XA,$YA) B=($XB,$YB)），身份一致"
else bad "同名字应解析到不同坐标" "A=($XA,$YA) B=($XB,$YB) match=$MA/$MB"; fi
fi

if want d2; then
echo "[D2] 身份 vs 坐标：同一物理点在两帧上属于不同对象"
try 0 "A 帧：「输入探针v2」的【编辑】" -- "$CLICK" --anchor 输入探针v2 --offset 241,195 --frame "$A"
EXA="$(jf "$OUT" x)"; EYA="$(jf "$OUT" y)"; EMA="$(jf "$OUT" matched_text)"
try 0 "B 帧：「未分类页签_存档_1」的【编辑】" -- "$CLICK" --anchor 未分类页签_存档_1 --offset 200,195 --frame "$B"
EXB="$(jf "$OUT" x)"; EYB="$(jf "$OUT" y)"; EMB="$(jf "$OUT" matched_text)"
expect_near "A 目标点.x" "$EXA" "1681"; expect_near "A 目标点.y" "$EYA" "387"
expect_near "B 目标点.x" "$EXB" "1681"; expect_near "B 目标点.y" "$EYB" "387"
expect_eq "A 身份" "$EMA" "输入探针v2"
expect_eq "B 身份" "$EMB" "未分类页签_存档_1"
_dx=$(( EXA - EXB )); [ "$_dx" -lt 0 ] && _dx=$(( -_dx ))
_dy=$(( EYA - EYB )); [ "$_dy" -lt 0 ] && _dy=$(( -_dy ))
if [ "$_dx" -le 4 ] && [ "$_dy" -le 4 ] && [ "$EMA" != "$EMB" ]; then
  ok "同一坐标 (1681,387) 两帧上属于不同对象（$EMA / $EMB）——坐标不携带身份"
else bad "身份/坐标解耦判据不成立" "A=($EXA,$EYA,$EMA) B=($EXB,$EYB,$EMB)"; fi
expect_no_inject "$INJ"
fi

if want d3; then
echo "[D3] 回读断言能抓住「点错对象」（用户 2026-10-17 当场发现的错法）"
try 5 "A 帧解析点 + B 帧观测 → 断言不符" -- \
  "$CLICK" --text 输入探针v2 --frame "$A" --after-frame "$B" --assert-name 输入探针v2 --assert-pad 300
expect_has "诊断行" "$ERR" "ASSERT-FALSE"
expect_has "打印期望" "$ERR" '期望="输入探针v2"'
expect_has "打印实测（该位置实际是另一张存档）" "$ERR" "未分类页签_存档_1"
expect_no_inject "$INJ"
fi

if want d4; then
echo "[D4] 回读断言通过 / 弱断言 / 严格断言"
try 0 "B 帧解析 + B 帧观测 → 断言通过" -- \
  "$CLICK" --text 未分类页签_存档_1 --frame "$B" --after-frame "$B" --assert-name 未分类页签_存档_1 --assert-pad 300
expect_has "通过行" "$OUT" "断言通过"
expect_has "弱断言警告（点前已有同名文字）" "$ERR" "只证明「名字在位」"
try 5 "--assert-strict：点前已有 ⇒ 不能证明状态变化" -- \
  "$CLICK" --text 未分类页签_存档_1 --frame "$B" --after-frame "$B" --assert-name 未分类页签_存档_1 \
  --assert-pad 300 --assert-strict
expect_has "严格断言诊断" "$ERR" "ASSERT-FALSE"
expect_no_inject "$INJ"
fi

if want f; then
echo "[F] 三种失败各有退出码与诊断行"
try 4 "解析不到（候选=0）" -- "$CLICK" --text 不存在的存档名 --frame "$A"
expect_has "诊断行" "$ERR" "候选=0"
try 4 "候选不唯一（编辑 ×6）" -- "$CLICK" --text 编辑 --frame "$A"
expect_has "诊断行" "$ERR" "候选不唯一"
expect_has "列出候选数" "$ERR" "6 个「编辑」"
try 5 "回读不符（期望位置没有该名字）" -- \
  "$CLICK" --text 输入探针v2 --frame "$A" --after-frame "$B" --assert-name 从未存在过的名字 --assert-roi 0,0,400,400
expect_has "诊断行" "$ERR" "ASSERT-FALSE"
try 2 "断言环境错：--assert-roi 非法 → 2（不是断言失败）" -- \
  "$CLICK" --text 输入探针v2 --frame "$A" --after-frame "$B" --assert-name 输入探针v2 --assert-roi abc
expect_has "诊断行" "$ERR" "断言环境错"
try 5 "--assert-anywhere：整帧没有该名字 → 5" -- \
  "$CLICK" --text 输入探针v2 --frame "$A" --after-frame "$B" --assert-name 从未存在过的名字 --assert-anywhere
expect_has "诊断行" "$ERR" "ASSERT-FALSE"
expect_has "整帧弱断言要说明" "$ERR" "整帧未见"
try 2 "用法错：没有给目标" -- "$CLICK" --dry-run
expect_has "诊断行" "$ERR" "--text / --target / --anchor"
try 2 "用法错：--text 与 --target 互斥" -- "$CLICK" --text a --target '{"name":"b"}' --frame "$A"
try 2 "用法错：离线断言缺 --after-frame" -- "$CLICK" --text a --frame "$A" --assert-name b
expect_has "诊断行" "$ERR" "--after-frame"
try 2 "用法错：--frame 与 --live 互斥" -- "$CLICK" --text a --frame "$A" --live
try 0 "target JSON（role+name）" -- "$CLICK" --target '{"role":"button","name":"新建存档"}' --frame "$B"
expect_eq "matched_text" "$(jf "$OUT" matched_text)" "新建存档"
expect_eq "target.role" "$(jf "$OUT" target.role)" "button"
try 2 "坏 target JSON" -- "$CLICK" --target '{"role":' --frame "$B"
expect_no_inject "$INJ"
fi

if want u; then
echo "[U] 旧坐标用法行为不变（PATH 桩跑真循环：位置读回 + 相对移动 + 点击）"
legacy 0 "① 闭环命中并点击" "0 0" 1681 387
expect_has "命中行" "$OUT" "→ 已点击（第"
case "$OUT" in
  "[ys-pointer-click] 命中 ("*" → 已点击（第 "*" 轮）") ok "命中行格式与改动前一致" ;;
  *) bad "命中行格式变了" "$OUT" ;;
esac
expect_has "确实发生了按下" "$INJ" "ydotool click 0x40"
expect_has "确实发生了抬起" "$INJ" "ydotool click 0x80"
legacy 4 "② 步进过小 → 4" "0 0" 3000 2000 0 100000
expect_has "诊断行" "$ERR" "步进过小（剩 3000,2000），中止"
if has "$INJ" "click"; then bad "步进过小却发生了点击" "$INJ"; else ok "步进过小时零点击"; fi
: > "$YS_STUB_POS.stuck"; printf '0 0\n' > "$YS_STUB_POS"
try 5 "③ 12 轮未命中 → 5" -- "$CLICK" 1681 387
expect_has "诊断行" "$ERR" "12 轮未命中（目标 1681,387，当前 0,0）"
if has "$INJ" "click"; then bad "未命中却发生了点击" "$INJ"; else ok "未命中时零点击"; fi
: > "$YS_STUB_LOG"
OUT="$(OFF "$CLICK" 2>"$TMP/err")"; RC=$?; ERR="$(cat "$TMP/err")"
if [ "$RC" = 1 ]; then ok "④ 缺参数 → 1（与改动前一致）"; else bad "缺参数退出码变了" "rc=$RC"; fi
expect_has "用法行与改动前一致" "$ERR" "用法: ys-pointer-click <x> <y> [tol] [ratio]"
fi

echo "────────────────────────────────"
EMPTY=$(wc -l < "$EMPTY_LOG" 2>/dev/null || echo 0); EMPTY=${EMPTY:-0}
printf '通过 %d / 失败 %d\n' "$PASS" "$FAIL"
# 退出码分三态（2026-10-21 假红回灌）：1=断言失败(回归) / 3=环境(空 stdout，不可判定) / 4=两者混杂。
# 为什么要分开：负载高峰下并发跑时，空 stdout 会被报成 traceback ⇒ 看着像回归，实际单跑 68/0 全绿。
if [ "$FAIL" -gt 0 ] && [ "$EMPTY" -gt 0 ]; then
  echo "✗ 有失败项，且出现 $EMPTY 次子进程空输出（先排除负载再判回归）"
  printf 'RESOLVE-RESULT pass=%d fail=%d empty=%d error=EMPTY_STDOUT verdict=MIXED\n' "$PASS" "$FAIL" "$EMPTY"
  exit 4
fi
if [ "$FAIL" -gt 0 ]; then
  echo "✗ 有失败项"
  printf 'RESOLVE-RESULT pass=%d fail=%d empty=0 verdict=FAIL\n' "$PASS" "$FAIL"
  exit 1
fi
if [ "$EMPTY" -gt 0 ]; then
  echo "… 有 $EMPTY 次子进程空输出：环境/负载问题，**不是**回归（重跑或用 EXCLUSIVE 档）"
  printf 'RESOLVE-RESULT pass=%d fail=0 empty=%d error=EMPTY_STDOUT verdict=ENV\n' "$PASS" "$EMPTY"
  exit 3
fi
echo "✓ 全绿"
printf 'RESOLVE-RESULT pass=%d fail=0 empty=0 verdict=PASS\n' "$PASS"
exit 0
