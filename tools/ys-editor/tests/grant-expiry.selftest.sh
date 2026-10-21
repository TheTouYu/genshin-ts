#!/bin/bash
# grant-expiry.selftest.sh — 「租期到期由机制归还」的全离线回归（用户令 2026-10-21；账本 F-20261021-60）。
#
# 用户原话：「我苦苦等了它几分钟，也没看到它把屏幕归还给我。这个我反复强调，
# 不能靠模型自觉，要做成机制。」
# 旧设计：到期只在有人调 status/revoke 时才交还 ⇒ 没人调就永久占屏。
# 现设计：常驻 ys-focus-guard（0.5s 轮询）自己发现过期 → 调 `HAND_BACK_BIN` 交还 → 清凭据。
#
# 为什么判据整体重写（2026-10-21 二修）：
#   上一版依赖真实环境——要求守护**正在跑**（跑不到就 SKIP，退出码 2）、直接写真实的
#   `~/.ys/screen-grant.json`、并且真的把画面切回 firefox。后果有两个：
#     ① 没有可重复的离线判据（守护没跑=SKIP）⇒ 账本里这条修复常年 unproven；
#     ② 一条"回归测试"擅自搬动用户屏幕 ⇒ 正是用户投诉过的那类副作用。
#   现在三条缝全走环境变量：`YS_SCREEN_GRANT_PATH`（凭据）、`YS_HAND_BACK_BIN`（交还）、
#   `YS_SESSION_PATH` / `YS_LEASE`（把另外两条交还路径指向不存在的文件，杜绝误触真窗口）。
#   驱动方式是 `--check`（单发模式）——不需要 systemd、不需要常驻守护、不需要真实窗口。
#
# 判据（三条，缺一不可；T2 是防「永远归还」的负样本）：
#   T1 过期即归还：expires = now - 1s  → --check 后凭据被删除，假交还**恰好调用 1 次**
#   T2 未过期不动：expires = now + 60s → --check 后凭据**仍在**，假交还调用 0 次
#   T3 无凭据无动作：凭据文件不存在    → --check 退出码 0，假交还调用 0 次
# 判据之外还有一条离线自保：假 ys-lease 一旦被调用，说明环境变量没盖住真实路径、
# 本套件已经开始碰窗口了 ⇒ 立即可见（不静默）。
#
# 环境变量（测试缝）：
#   YS_FOCUS_GUARD_BIN  覆盖被测守护脚本（注入用例指向打过补丁的副本，生产文件不动）
# 输出：每条断言一行 `T<判据号>  PASS|FAIL <读数>`，末行机读
#       `GRANT-EXPIRY-RESULT pass=N fail=M verdict=PASS|FAIL`
# 退出码：0 PASS / 1 FAIL（没有 2=SKIP：本套件不依赖任何环境）
set -u
cd "$(dirname "$0")/../../.." || exit 1
ROOT="$PWD"
GUARD="${YS_FOCUS_GUARD_BIN:-$ROOT/tools/ys-editor/ys-focus-guard}"
if [ ! -f "$GUARD" ]; then
  echo "GRANT-EXPIRY-RESULT pass=0 fail=1 verdict=FAIL error=GUARD_MISSING guard=$GUARD"
  exit 1
fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/grant-expiry-XXXXXX") || exit 1
trap 'rm -rf "$TMP"' EXIT

# 全部指向临时目录：凭据、交还、会话、租约、日志一个都不许落到真实路径。
export YS_SCREEN_GRANT_PATH="$TMP/screen-grant.json"   # 绝不写 ~/.ys/screen-grant.json
export YS_HAND_BACK_BIN="$TMP/fake-handback"           # 假交还：只记账，绝不切真实窗口
export YS_HAND_BACK_COUNT="$TMP/handback.count"
export YS_SESSION_PATH="$TMP/absent-session.json"      # 会话空闲交还路径：指向不存在
export YS_LEASE="$TMP/absent-lease.json"               # 租约归还路径：指向不存在
export YS_LEASE_BIN="$TMP/fake-lease"                  # 万一被调到，也只碰假 ys-lease
export YS_LEASE_CALLS="$TMP/lease.calls"
export YS_FOCUS_GUARD_LOG="$TMP/guard.log"

cat > "$YS_HAND_BACK_BIN" <<'EOF'
#!/bin/bash
# 假交还脚本：只把"被调用了一次"记进计数文件，一个窗口都不碰。
# 真正的 ys-hand-back 会切回 firefox 并验证堆叠 —— 那条路径只能在用户授权下真机验。
echo x >> "${YS_HAND_BACK_COUNT:?YS_HAND_BACK_COUNT 未设置}"
exit 0
EOF
cat > "$YS_LEASE_BIN" <<'EOF'
#!/bin/bash
# 假 ys-lease：本套件结构上不该走到这里。走到 = 某个环境变量没盖住真实路径，
# 测试已经开始有碰真实窗口的风险 ⇒ 记一笔，由末尾的离线自保断言报红。
echo "called: $*" >> "${YS_LEASE_CALLS:?YS_LEASE_CALLS 未设置}"
exit 1
EOF
chmod +x "$YS_HAND_BACK_BIN" "$YS_LEASE_BIN"

pass=0
fails=0
ok()  { echo "T$1  PASS $2"; pass=$((pass+1)); }
bad() { echo "T$1  FAIL $2"; fails=$((fails+1)); }
count() { if [ -f "$YS_HAND_BACK_COUNT" ]; then wc -l < "$YS_HAND_BACK_COUNT" | tr -d ' '; else echo 0; fi; }
reset_count() { : > "$YS_HAND_BACK_COUNT"; }

# mk_grant <距过期的秒数>：负=已过期，正=还没过期。字段形状与 ys-screen-grant 写的一致。
mk_grant() {
  python3 - "$YS_SCREEN_GRANT_PATH" "$1" <<'PY'
import json, sys, time
p, delta = sys.argv[1], float(sys.argv[2])
json.dump({"created": time.time(), "expires": time.time() + delta,
           "reason": "grant-expiry-selftest", "user_said": "离线自测",
           "active_window": {}}, open(p, "w"))
PY
}

# run_check：驱动**单发模式**（--check），回显退出码。用 python3 显式解释，
# 这样注入用例可以指向 /tmp 里没有执行位的副本。
run_check() { python3 "$GUARD" --check >/dev/null 2>&1; echo $?; }

# ── T1 过期即归还 ────────────────────────────────────────────────────────────
# 负 1 秒过期：`--check` 必须自己发现并交还，然后删掉凭据（幂等的"交还并清除"）。
mk_grant -1
reset_count
rc=$(run_check)
c=$(count)
if [ ! -e "$YS_SCREEN_GRANT_PATH" ]; then
  ok 1 "过期凭据被删除（expires=now-1s ⇒ 凭据文件已不存在）"
else
  bad 1 "过期凭据仍在（expires=now-1s 却没人归还 ⇒ 屏幕会被永久占着）"
fi
if [ "$c" = "1" ]; then
  ok 1 "假 hand-back 被调用 1 次（计数=$c）"
else
  bad 1 "假 hand-back 调用 $c 次（应 1：到期必须交还且只交还一次）"
fi
if grep -q "GRANT_EXPIRED" "$YS_FOCUS_GUARD_LOG" 2>/dev/null; then
  ok 1 "守护日志记录了 GRANT_EXPIRED（确认走的是到期归还这条路径）"
else
  bad 1 "守护日志没有 GRANT_EXPIRED（凭据消失不是到期归还造成的？）"
fi
if [ "$rc" = "1" ]; then
  ok 1 "--check 退出码 1（= 本次有该归还的租约/已处理）"
else
  bad 1 "--check 退出码 $rc（应 1：本次做了交还动作）"
fi

# ── T2 未过期不动（负样本：防「永远归还」把用户刚批的授权当场撤掉）────────────
mk_grant 60
reset_count
rc=$(run_check)
c=$(count)
if [ -e "$YS_SCREEN_GRANT_PATH" ]; then
  ok 2 "未过期凭据仍存在（expires=now+60s ⇒ 守护没动它）"
else
  bad 2 "未过期凭据被删了（守护提前归还 ⇒ 会误伤用户刚给的授权）"
fi
if [ "$c" = "0" ]; then
  ok 2 "假 hand-back 调用 0 次（计数=$c）"
else
  bad 2 "假 hand-back 调用 $c 次（应 0：租期内一条窗口操作都不许有）"
fi
if [ "$rc" = "0" ]; then
  ok 2 "--check 退出码 0（无该归还的租约）"
else
  bad 2 "--check 退出码 $rc（应 0）"
fi

# ── T3 无凭据无动作 ──────────────────────────────────────────────────────────
rm -f "$YS_SCREEN_GRANT_PATH"
reset_count
rc=$(run_check)
c=$(count)
if [ "$rc" = "0" ]; then
  ok 3 "无凭据 ⇒ --check 退出码 0（干净环境不该报有活要干）"
else
  bad 3 "无凭据 ⇒ --check 退出码 $rc（应 0）"
fi
if [ "$c" = "0" ]; then
  ok 3 "假 hand-back 调用 0 次（计数=$c）"
else
  bad 3 "假 hand-back 调用 $c 次（应 0：没有凭据就没有可归还的东西）"
fi
if [ ! -e "$YS_SCREEN_GRANT_PATH" ]; then
  ok 3 "未凭空创建凭据文件"
else
  bad 3 "凭据文件被创建了（守护不该写凭据）"
fi

# ── 离线自保（不是判据，是防"测试自己动了屏幕"）──────────────────────────────
if [ -s "$YS_LEASE_CALLS" ]; then
  bad 0 "离线自保：守卫调用了 ys-lease $(wc -l < "$YS_LEASE_CALLS" | tr -d ' ') 次（环境变量没盖住真实路径）"
fi

verdict=PASS
[ "$fails" -eq 0 ] || verdict=FAIL
echo "GRANT-EXPIRY-RESULT pass=$pass fail=$fails verdict=$verdict"
[ "$fails" -eq 0 ] && exit 0
exit 1
