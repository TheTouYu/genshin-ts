#!/bin/bash
# focus-failure.selftest.sh — 焦点归还**失败路径**的收敛判据（2026-10-19 用户投诉后新增）
#
# 事故：守护对"永远恢复不了"的租约每 0.5s 重试，每次重试都 raise ⇒ 用户被反复拖回游戏桌面。
# 本自测用**假 ys-lease**（永远失败）与**假自停命令**，全程不碰焦点、不碰真实服务：
#   ① 同一租约连续失败 3 次 ⇒ abandoned（保留文件），此后不再调用（调用计数不再增长）
#   ② 退避 0.5/1s（日志可查）
#   ③ 连续 5 次无法恢复 ⇒ CRITICAL + 自停命令被调用（假命令 touch 文件）
#   ④ no-op 租约（prev==game / noop 标志）⇒ release **切回默认屏 firefox** 并过堆叠验证
#      （2026-10-21 用户口径：没有"用户窗"可还 ≠ 什么都不做；但绝不 raise 游戏本身）
#
# 参数：`--only abandon|noop` 只跑相关段落（注入用例用；**缺省不传 = 跑全部，输出与旧版逐字节一致**）
#   abandon = ①+②+③（假 lease 永远失败那条链，零窗口操作）
#   noop    = ④（会调 ys-lease 归还 firefox；注入用例跑不到这里，避免动窗口）
# 被测守护可用 YS_FOCUS_GUARD_BIN 指向副本（注入用例改一处判据验它会红），缺省 = 生产文件。
#
# 机读行: FOCUS-FAILURE-RESULT first_calls=<n> no_more=<0|1> abandoned=<0|1> fuse=<0|1> noop_raises=<n> prevgame_raises=<n> verdict=PASS|FAIL
# 退出码: 0 全绿 / 1 有失败
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
YSE="$REPO/tools/ys-editor"
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift || true; [ $# -gt 0 ] && shift || true;;
    --only=*) ONLY="${1#--only=}"; shift;;
    *) echo "用法: $0 [--only abandon|noop]" >&2; exit 2;;
  esac
done
want() { [ -z "$ONLY" ] && return 0; case ",${ONLY}," in *",$1,"*) return 0;; esac; return 1; }
# 段落名写错时**不许静默跑 0 条还判 PASS**
if [ -n "$ONLY" ]; then
  for _c in ${ONLY//,/ }; do
    case "$_c" in abandon|noop) ;; *) echo "未知段落名: $_c（可选 abandon noop）" >&2; exit 2;; esac
  done
fi
# 被测守护：注入用例指一份**同目录副本**（只改一处判据），生产文件一个字节不动。不设 = 测生产工具。
GUARD="${YS_FOCUS_GUARD_BIN:-$YSE/ys-focus-guard}"
TMP="$(mktemp -d)"; GUARD_PID=""
cleanup() { [ -n "$GUARD_PID" ] && kill -9 "$GUARD_PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
LEASE="$TMP/lease.json"; LOG="$TMP/guard.log"; COUNT="$TMP/calls.txt"; STOP="$TMP/stopped"
FAKE="$TMP/fake-lease.py"
cat > "$FAKE" <<'PY'
import json, os, sys
with open(os.environ.get("FAKE_COUNT", "/dev/null"), "a") as fh:
    fh.write("call\n")
print(json.dumps({"ok": False, "error": "RESTORE_FAILED",
                  "problems": ["STACKING_NOT_RESTORED(target_idx=8 game_idx=8)"]}))
sys.exit(1)
PY
: > "$COUNT"

write_lease() {  # $1 = acquired_at
  python3 - "$LEASE" "$1" <<'PY'
import json, sys, time
json.dump({"win": "0x01400001", "name": "原神",
           "prev": {"internalId": "fake-window", "class": "no-such-window",
                    "caption": "__gone__", "geom": "0,0 1x1", "usable": True},
           "acquired_at": float(sys.argv[2]), "expires": time.time() - 10,
           "owner_pid": 999999, "version": 2}, open(sys.argv[1], "w"))
PY
}

fails=0
# --only 时没跑的段落不能让机读行撞上 set -u（ABANDONED 取退出码语义：0=已标记）
FIRST=0; SECOND=0; ABANDONED=1
ok()  { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; fails=$((fails+1)); }

# ── 1+2+3 守护进程：假 lease 永远失败 ────────────────────────────────────────
if want abandon; then
write_lease 1000
FAKE_COUNT="$COUNT" YS_LEASE="$LEASE" YS_LEASE_BIN="$FAKE" YS_FOCUS_GUARD_STOP="touch '$STOP'" \
  YS_FOCUS_GUARD_LOG="$LOG" "$GUARD" --interval 0.1 >"$TMP/guard.out" 2>&1 &
GUARD_PID=$!
sleep 2.6
FIRST=$(wc -l < "$COUNT" 2>/dev/null || echo 0)
python3 - "$LEASE" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: d = {}
sys.exit(0 if isinstance(d.get("abandoned"), dict) else 1)
PY
ABANDONED=$?
[ "$FIRST" -eq 3 ] && ok "同一租约连续失败 3 次后停止（calls=$FIRST）" || bad "期望 3 次调用，实得 $FIRST"
[ "$ABANDONED" -eq 0 ] && ok "租约已标记 abandoned（文件保留）" || bad "租约未标记 abandoned"
sleep 1.5
SECOND=$(wc -l < "$COUNT" 2>/dev/null || echo 0)
[ "$SECOND" -eq "$FIRST" ] && ok "abandoned 后不再调用（calls 仍为 $SECOND）" || bad "abandoned 后仍在调用（$FIRST → $SECOND）"
grep -q "ALERT 租约连续失败" "$LOG" && ok "日志有 ALERT" || bad "日志缺 ALERT"

# 第二条坏租约：全局失败 3+2=5 ⇒ CRITICAL + 自停
write_lease 2000
for _ in $(seq 1 60); do [ -e "$STOP" ] && break; sleep 0.1; done
[ -e "$STOP" ] && ok "连续 5 次失败后自停命令被调用" || bad "自停命令未被调用"
grep -q "CRITICAL 连续 5 次无法恢复" "$LOG" && ok "日志有 CRITICAL" || bad "日志缺 CRITICAL"
kill -9 "$GUARD_PID" 2>/dev/null; GUARD_PID=""
fi

# ── 4 no-op 租约：零 raise ───────────────────────────────────────────────────
if want noop; then
raises_before=$(journalctl --user --since "5 seconds ago" 2>/dev/null | grep -c "YS-FOCUS-raise" || true)
cat > "$LEASE" <<JSON
{"noop": true, "prev_is_target": true, "acquired_at": 3000, "owner_pid": 999999,
 "expires": 0, "prev": null, "win": "0x01400001"}
JSON
out=$(YS_LEASE="$LEASE" "$YSE/ys-lease" release --force 2>&1); rc=$?
raises_after=$(journalctl --user --since "5 seconds ago" 2>/dev/null | grep -c "YS-FOCUS-raise" || true)
NOOP_RAISES=$(( raises_after - raises_before ))
[ "$rc" -eq 0 ] && ok "noop 租约 release 成功（rc=0）" || bad "noop release rc=$rc out=$out"
[ ! -e "$LEASE" ] && ok "noop 租约文件已清除" || bad "noop 租约文件仍在"
echo "$out" | grep -q '"class": "firefox"' && ok "noop 归还目标=firefox（用户口径：没有用户窗可还也要切回默认屏）" || bad "noop 未归 firefox：$out"
_noop_ti=$(printf '%s' "$out" | python3 -c "import sys,json;d=json.loads(sys.stdin.read().strip().splitlines()[-1]);print(d.get('target_index',''))" 2>/dev/null)
_noop_gi=$(printf '%s' "$out" | python3 -c "import sys,json;d=json.loads(sys.stdin.read().strip().splitlines()[-1]);print(d.get('game_index',''))" 2>/dev/null)
{ [ -n "$_noop_ti" ] && [ -n "$_noop_gi" ] && [ "$_noop_ti" -gt "$_noop_gi" ]; } && ok "firefox 在游戏之上（idx $_noop_ti > game $_noop_gi）" || bad "堆叠未过：firefox=$_noop_ti game=$_noop_gi"
[ "$NOOP_RAISES" -le 1 ] && ok "noop 只 raise 了 $NOOP_RAISES 次（不重复抬窗）" || bad "noop raise 了 $NOOP_RAISES 次（应 ≤1）"

# 旧格式 prev==game 租约（这次事故的形态）：也必须零 raise 直接清
cat > "$LEASE" <<JSON
{"prev": {"internalId": "game-id", "class": "yuanshen.exe", "caption": "原神", "usable": true},
 "acquired_at": 4000, "owner_pid": 999999, "expires": 0, "win": "0x01400001"}
JSON
raises_before2=$(journalctl --user --since "5 seconds ago" 2>/dev/null | grep -c "YS-FOCUS-raise" || true)
out2=$(YS_LEASE="$LEASE" "$YSE/ys-lease" release --force 2>&1); rc2=$?
raises_after2=$(journalctl --user --since "5 seconds ago" 2>/dev/null | grep -c "YS-FOCUS-raise" || true)
PREVGAME_RAISES=$(( raises_after2 - raises_before2 ))
[ "$rc2" -eq 0 ] && ok "prev==game 租约 release 成功（rc=0）" || bad "prev==game release rc=$rc2 out=$out2"
echo "$out2" | grep -q '"class": "firefox"' && ok "prev==game 归还目标=firefox" || bad "prev==game 未归 firefox：$out2"
[ "$PREVGAME_RAISES" -le 1 ] && ok "prev==game 只 raise 了 $PREVGAME_RAISES 次" || bad "prev==game raise 了 $PREVGAME_RAISES 次（应 ≤1）"
fi

VERDICT=PASS; [ "$fails" -gt 0 ] && VERDICT=FAIL
printf 'FOCUS-FAILURE-RESULT first_calls=%s no_more=%s abandoned=%s fuse=%s noop_raises=%s prevgame_raises=%s verdict=%s\n' \
  "${FIRST:-0}" "$([ "${SECOND:-0}" = "${FIRST:-0}" ] && echo 1 || echo 0)" \
  "$([ "$ABANDONED" -eq 0 ] && echo 1 || echo 0)" "$([ -e "$STOP" ] && echo 1 || echo 0)" \
  "$(( ${raises_after:-0} - ${raises_before:-0} ))" "$(( ${raises_after2:-0} - ${raises_before2:-0} ))" "$VERDICT"
[ "$fails" -eq 0 ]
