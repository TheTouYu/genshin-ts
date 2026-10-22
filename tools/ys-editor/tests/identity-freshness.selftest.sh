#!/bin/bash
# identity-freshness.selftest.sh — 证据新鲜度自测（契约 §4 ⑥：无 sha / sha 不符必须 ERROR）
#
# 判据来源：docs/maintenance/retrospective-2026-10-17-gui-capability-layer.md 第七节 #7
#   「`ys-state --json` 返回 frame:null，我仍 cp 共享临时路径 ⇒ 旧帧当切换后画面」
#   ⇒ 只要写进 round.json 的帧没带 sha + 抓取时刻，replay 就得报 ERROR，不许 PASS。
#
# 被测对象（真实代码路径）：
#   · tools/round-report --emit-round <dir>   round.json 的唯一写入口：补算帧 sha/captured_at
#   · tools/round-report --replay <dir>       逐帧重算 sha：无 sha / 无时刻 / sha 不符 ⇒ ERROR(2)
#
# 离线：只读落盘物（帧/日志/.gil 都是仓内夹具），DISPLAY 置空，--no-judge 不启 ys-state。
#
# 用法: bash tools/ys-editor/tests/identity-freshness.selftest.sh [-v] [--only <case>]
#   case ∈ emit | keep-ts | fresh | sha-mismatch | no-sha | no-captured-at
#   --only 是给**注入用例**用的：造一次故障只需要跑受影响的那一条（无参数 = 全跑，行为不变）。
# 退出码: 0 全绿 / 1 有失败项 / 2 环境不全（缺 round-report 或夹具）/ 3 用法错
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
RR="$ROOT/tools/round-report"
FIX="$HERE/fixtures/round"
REG="$ROOT/tools/ys-editor/calib/regress"
TMP="$(mktemp -d /tmp/identity-freshness.XXXXXX)"
VERBOSE=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    -v) VERBOSE=1; shift ;;
    --only) ONLY="${2:-}"; shift 2 ;;
    *) printf 'IDENTITY-SELFTEST-USAGE 未知参数 %s（用法: [-v] [--only <case>]）\n' "$1" >&2; exit 3 ;;
  esac
done
case "$ONLY" in
  ''|emit|keep-ts|fresh|sha-mismatch|no-sha|no-captured-at) ;;
  *) printf 'IDENTITY-SELFTEST-USAGE 未知 --only 用例 %s（可选: emit keep-ts fresh sha-mismatch no-sha no-captured-at）\n' "$ONLY" >&2; exit 3 ;;
esac
PASS=0; FAIL=0
LAST_OUT=""; LAST_CODE=""
ok()  { printf '    ✓ %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '    ✗ %s\n' "$1"; [ -n "${2:-}" ] && printf '      ↳ %s\n' "$2"; FAIL=$((FAIL+1)); }

miss=()
[ -x "$RR" ] || miss+=("round-report $RR")
[ -f "$FIX/round.draft.json" ] || miss+=("夹具 round.draft.json")
[ -f "$FIX/debug-log.gia.bin" ] || miss+=("夹具 debug-log.gia")
[ -f "$FIX/fixture-local-save.gil" ] || miss+=("夹具 fixture-local-save.gil")
[ -f "$REG/savelist.png" ] || miss+=("离线帧 savelist.png")
[ -f "$REG/playtest.png" ] || miss+=("离线帧 playtest.png")
if [ ${#miss[@]} -gt 0 ]; then
  printf '✗ 环境不全，无法验证证据新鲜度：缺 %s\n' "${miss[*]}" >&2
  exit 2
fi

materialize() {   # materialize <目录>：造一份证据齐全的 round 目录
  local d="$1"; rm -rf "$d"; mkdir -p "$d"
  cp "$FIX/round.draft.json" "$FIX/fixture-local-save.gil" "$d/"
  cp "$FIX/debug-log.gia.bin" "$d/debug-log.gia"
  cp "$REG/savelist.png" "$REG/playtest.png" "$d/"
}

run_cmd() {       # run_cmd <名称> <期望退出码> <命令…>（DISPLAY 一律置空 = 不可能抓屏）
  local name="$1" want="$2"; shift 2
  LAST_OUT=$(DISPLAY= "$@" 2>&1); LAST_CODE=$?
  printf '\n── %s ──\n' "$name"
  if [ "$VERBOSE" = 1 ]; then printf '%s\n' "$LAST_OUT" | sed 's/^/    | /'
  else printf '%s\n' "$LAST_OUT" | grep -E '^(  [✓✗·]|结论:|✓ |✗ |  · )' | sed 's/^/    /'; fi
  printf '    退出码=%s\n' "$LAST_CODE"
  [ "$LAST_CODE" = "$want" ] && ok "退出码=$LAST_CODE（期望 $want）" \
    || bad "退出码=$LAST_CODE（期望 $want）" "$(printf '%s' "$LAST_OUT" | tail -3 | tr '\n' ' ')"
}

has() { case "$LAST_OUT" in *"$1"*) ok "输出含「$1」";;
                   *) bad "输出缺「$1」" "$(printf '%s' "$LAST_OUT" | tail -4 | tr '\n' ' ')";; esac; }

want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }   # 无 --only ⇒ 全部 want 都成立（默认行为不变）
prep_ok() {   # ③④⑤⑥ 依赖 ① 的 $D：还没备好就静默备一份（默认模式下 ① 已备好 ⇒ 空操作）
  D="$TMP/ok"
  [ -f "$D/round.json" ] && return 0
  materialize "$D"
  DISPLAY= "$RR" --emit-round "$D" >/dev/null 2>&1
}

printf '══ 证据新鲜度自测 %s ══\n' "$(date '+%F %T')"
printf 'round-report %s\n夹具 %s\n帧 %s\n临时目录 %s\n' "$RR" "$FIX" "$REG" "$TMP"

# ── ① emit-round 必须给每张引用帧补 sha + 抓取时刻 ───────────────────────
if want emit; then
D="$TMP/ok"; materialize "$D"
run_cmd "--emit-round 证据齐全 ⇒ 落盘 round.json" 0 "$RR" --emit-round "$D"
EMIT_EXIT=$LAST_CODE
has "round.json 已落盘"
has "补算帧指纹 2 张"
python3 - "$D/round.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
metas = d.get('frames_meta') or {}
frames = d.get('frames') or []
problems = []
for f in frames:
    m = metas.get(f)
    if not isinstance(m, dict):
        problems.append(f'{f} 无 frames_meta'); continue
    for k in ('sha256', 'captured_at'):
        if not str(m.get(k) or '').strip():
            problems.append(f'{f} 缺 {k}')
    if len(str(m.get('sha256') or '')) != 64:
        problems.append(f'{f} sha256 不是 64 位十六进制')
if not frames:
    problems.append('frames 为空')
assert not problems, problems
print(f'    ✓ round.json 的 {len(frames)} 张帧都带 sha256+captured_at')
PY
[ $? -eq 0 ] && PASS=$((PASS+1)) || bad "round.json 帧元数据不合规"
fi

# ── ② 执行器给了真抓取时刻 ⇒ emit 必须保留，不覆盖 ───────────────────────
if want keep-ts; then
D2="$TMP/keep-ts"; materialize "$D2"
python3 - "$D2/round.draft.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d['frames_meta'] = {'savelist.png': {'path': 'savelist.png', 'sha256': '0' * 63 + '1',
                                     'captured_at': '2026-10-17T19:00:01', 'source': 'runner'}}
json.dump(d, open(p, 'w'), ensure_ascii=False)
PY
run_cmd "--emit-round 保留执行器给的真抓取时刻" 0 "$RR" --emit-round "$D2"
has "补算帧指纹 1 张"        # 只有 playtest.png 需要补算
python3 - "$D2/round.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
m = (d.get('frames_meta') or {}).get('savelist.png') or {}
assert m.get('source') == 'runner', m
assert m.get('captured_at') == '2026-10-17T19:00:01', m
print('    ✓ 执行器给的 captured_at/sha 未被覆盖（source=runner）')
PY
[ $? -eq 0 ] && PASS=$((PASS+1)) || bad "emit-round 覆盖了执行器给的真抓取时刻"
fi

# ── ③ 齐全 ⇒ replay PASS（帧新鲜度项必须真出现，不许沉默跳过）──────────
if want fresh; then
prep_ok
run_cmd "--replay 证据齐全 ⇒ PASS(0)" 0 "$RR" --replay "$D" --no-judge
FRESH_EXIT=$LAST_CODE
has "结论: PASS"
has "帧新鲜度   PASS"
fi

# ── ④ sha 与文件不符 ⇒ ERROR(2)（不是 PASS，也不是 DIFF）────────────────
if want sha-mismatch; then
prep_ok
D3="$TMP/sha-mismatch"; cp -r "$D" "$D3"
printf 'tampered-frame\n' >> "$D3/playtest.png"      # 帧在 emit 之后被换/被改
run_cmd "--replay 帧 sha 与文件不符 ⇒ ERROR(2)" 2 "$RR" --replay "$D3" --no-judge
SHA_EXIT=$LAST_CODE
has "帧新鲜度   ERROR"
has "sha 不符"
has "结论: ERROR"
fi

# ── ⑤ 无 sha ⇒ ERROR(2)（旧帧/共享临时帧被当证据）────────────────────────
if want no-sha; then
prep_ok
D4="$TMP/no-sha"; cp -r "$D" "$D4"
python3 - "$D4/round.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d.pop('frames_meta', None)          # 旧版 round.json：帧没有任何指纹
json.dump(d, open(p, 'w'), ensure_ascii=False)
PY
run_cmd "--replay 帧无 sha ⇒ ERROR(2)" 2 "$RR" --replay "$D4" --no-judge
NOSHA_EXIT=$LAST_CODE
has "无 sha"
has "结论: ERROR"
fi

# ── ⑥ 无抓取时刻 ⇒ ERROR(2)（有 sha 但不知道是不是这一轮抓的）──────────
if want no-captured-at; then
prep_ok
D5="$TMP/no-captured-at"; cp -r "$D" "$D5"
python3 - "$D5/round.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
for m in (d.get('frames_meta') or {}).values():
    m.pop('captured_at', None)
json.dump(d, open(p, 'w'), ensure_ascii=False)
PY
run_cmd "--replay 帧无 captured_at ⇒ ERROR(2)" 2 "$RR" --replay "$D5" --no-judge
NOCAP_EXIT=$LAST_CODE
has "无 captured_at"
has "结论: ERROR"
fi

printf '\n────────────────\n'
printf '用例: emit 补算/保留 + replay PASS + sha 不符/无 sha/无时刻 三例 ERROR\n'
printf '证据目录: %s\n' "$TMP"
VERDICT=PASS; [ "$FAIL" -gt 0 ] && VERDICT=FAIL
# 机读结果行（供 tools/ys-gates / 上层脚本解析；键名固定，新增键只增不改）
printf 'IDENTITY-RESULT emit=%s fresh=%s sha_mismatch=%s no_sha=%s no_captured_at=%s n_pass=%d n_fail=%d verdict=%s\n' \
  "${EMIT_EXIT:-9}" "${FRESH_EXIT:-9}" "${SHA_EXIT:-9}" "${NOSHA_EXIT:-9}" \
  "${NOCAP_EXIT:-9}" "$PASS" "$FAIL" "$VERDICT"
if [ "$FAIL" -gt 0 ]; then printf '✗ %d 项失败 / %d 项通过\n' "$FAIL" "$PASS"; exit 1; fi
printf '✓ 全绿（%d 项；无 sha/无时刻/sha 不符三例全部 ERROR 退出码 2）\n' "$PASS"
exit 0
