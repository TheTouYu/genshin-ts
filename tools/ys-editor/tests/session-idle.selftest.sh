#!/bin/bash
# session-idle.selftest.sh — 层 2「空闲自动交还 + 动作前自动重取」回归（**全离线，不碰屏幕**）。
#
# 用户令（2026-10-21）：
#   「我希望模型在思考的时候，不要白白等待，会自动切换回来；模型思考结束了、
#     执行下一个动作的时候，自动切到游戏，不干扰模型的执行，不给模型增加额外负担。」
#
# 判据（都可机检，靠假 ys-lease / 假 ys-hand-back 注入，不动真实窗口）：
#   T1 静默 > idle_ms        → 守护交还一次，会话标 released
#   T2 再跑一次              → 幂等：不重复交还
#   T3 静默 < idle_ms        → 不动
#   T4 holding_until 未到期  → 不动（动作正在窗口内）
#   T5 dry_run 会话          → 不动
#   T6 用户自己切走了        → 不抢，但标记 released
#   T7 focus 快路径          → 未 released 时零窗口操作
#   T8 focus 重取            → 取回并清 released，reacquires+1
#   T9 focus 取不回          → rc=4，且 released 保持（**fail-closed：绝不带病注入**）
#   T10 会话已过期           → focus rc=3（调用方回落 slot 路径）
# 退出码：0 PASS / 1 FAIL
set -u
cd "$(dirname "$0")/../../.." || exit 1
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export YS_SESSION_PATH="$TMP/session.json"
export YS_SCREEN_GRANT_PATH="$TMP/absent-grant.json"
export YS_LEASE_BIN="$TMP/fake-lease"
export YS_HAND_BACK_BIN="$TMP/fake-handback"
export YS_FOCUS_GUARD_LOG="$TMP/guard.log"
export HB_COUNT="$TMP/handback.count"
export FAKE_ACTIVE_CLASS="${FAKE_ACTIVE_CLASS:-yuanshen.exe}"
export FAKE_RAISE_OK="${FAKE_RAISE_OK:-1}"
: > "$HB_COUNT"

cat > "$TMP/fake-lease" <<'EOF'
#!/usr/bin/env python3
# 必须两种方式都能跑：守护是 `subprocess.run([LEASE_BIN, ...])` 直接执行；
# ys-session 是 `subprocess.run([sys.executable, LEASES, ...])`。
# （2026-10-21 踩过：写成 bash 会被 python 解释 ⇒ SyntaxError ⇒ 误判成 RAISE_FAILED）
import json, os, sys
cmd = sys.argv[1] if len(sys.argv) > 1 else ""
cls = os.environ.get("FAKE_ACTIVE_CLASS", "yuanshen.exe")
if cmd == "kwin-state":
    print(json.dumps({"active": {"class": cls, "internalId": cls.startswith("yuanshen") and "W1" or "F1"},
                      "desktop": 3,
                      "wins": [{"class": "yuanshen.exe", "internalId": "W1", "desktop": 3},
                               {"class": "firefox", "internalId": "F1", "desktop": 2}]}))
elif cmd == "kwin-raise":
    if os.environ.get("FAKE_RAISE_OK", "1") == "1":
        print(json.dumps({"ok": True, "raised": "W1"}))
    else:
        print(json.dumps({"ok": False, "error": "RAISE_FAILED"}))
        sys.exit(1)
else:
    print(json.dumps({"ok": True}))
EOF
cat > "$TMP/fake-handback" <<'EOF'
#!/bin/bash
echo x >> "$HB_COUNT"
echo '{"ok":true,"restored":"firefox"}'
EOF
chmod +x "$TMP/fake-lease" "$TMP/fake-handback"

fails=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fails=$((fails+1)); }
count() { wc -l < "$HB_COUNT" | tr -d ' '; }
guard() { tools/ys-editor/ys-focus-guard --check >/dev/null 2>&1; }

# mksess <静默秒> <idle_ms> [released] [holding_s] [dry_run] [state] [expires_delta]
mksess() {
  python3 - "$@" <<'PY'
import json, os, sys, time
a = sys.argv[1:]
now = time.time()
d = {"schema": "ys.session/2", "session_id": "s-test", "created": now - 600,
     "expires": now + float(a[6]) if len(a) > 6 else now + 300,
     "state": a[5] if len(a) > 5 else "active",
     "dry_run": bool(int(a[4])) if len(a) > 4 else False,
     "last_action_ts": now - float(a[0]), "idle_ms": int(a[1]),
     "holding_until": now + float(a[3]) if len(a) > 3 and float(a[3]) else 0.0,
     "released": bool(int(a[2])) if len(a) > 2 else False,
     "reacquires": 0, "actions": 0,
     "target": {"class": "yuanshen.exe", "internalId": "W1"}, "win": "W1"}
json.dump(d, open(os.environ["YS_SESSION_PATH"], "w"))
PY
}
sess_get() { python3 -c "import json,os;d=json.load(open(os.environ['YS_SESSION_PATH']));print(d.get('$1'))"; }

mksess 60 8000; guard; c=$(count)
[ "$c" = "1" ] && ok "T1 静默 > idle → 交还一次" || bad "T1 未交还（count=$c）"
[ "$(sess_get released)" = "True" ] && ok "T1 会话标 released" || bad "T1 未标 released"
[ "$(sess_get release_reason)" = "idle" ] && ok "T1 交还原因 = idle" || bad "T1 原因=$(sess_get release_reason)"

guard; guard; c=$(count)
[ "$c" = "1" ] && ok "T2 幂等：重复轮询不再交还" || bad "T2 重复交还（count=$c）"

mksess 1 8000; guard; c=$(count)
[ "$c" = "1" ] && ok "T3 静默 < idle → 不动" || bad "T3 误交还（count=$c）"

mksess 60 8000 0 5; guard; c=$(count)
[ "$c" = "1" ] && ok "T4 holding 未到期 → 不动" || bad "T4 误交还（count=$c）"

mksess 60 8000 0 0 1; guard; c=$(count)
[ "$c" = "1" ] && ok "T5 dry_run → 不动" || bad "T5 误交还（count=$c）"

mksess 60 8000 >/dev/null 2>&1
FAKE_ACTIVE_CLASS="firefox" guard; c=$(count)
[ "$c" = "1" ] && ok "T6 用户自己切走了 → 不抢" || bad "T6 抢了用户屏幕（count=$c）"
[ "$(sess_get released)" = "True" ] && ok "T6 仍标 released（不会重复判定）" || bad "T6 未标 released"

# ── focus（动作前自动重取）──
mksess 1 8000 0; out=$(tools/ys-editor/ys-session focus 2>&1); rc=$?
[ "$rc" = "0" ] && ok "T7 focus 快路径 rc=0" || bad "T7 focus rc=$rc out=$out"
echo "$out" | grep -q '"fast": true' && ok "T7 快路径零窗口操作" || bad "T7 不是快路径：$out"

mksess 60 8000 1; out=$(tools/ys-editor/ys-session focus 2>&1); rc=$?
[ "$rc" = "0" ] && ok "T8 focus 重取 rc=0" || bad "T8 focus rc=$rc out=$out"
[ "$(sess_get released)" = "False" ] && ok "T8 重取后清 released" || bad "T8 released 未清"
[ "$(sess_get reacquires)" = "1" ] && ok "T8 reacquires 计数 +1" || bad "T8 计数=$(sess_get reacquires)"

FAKE_ACTIVE_CLASS=firefox mksess 60 8000 1 >/dev/null 2>&1
FAKE_ACTIVE_CLASS=firefox FAKE_RAISE_OK=0 tools/ys-editor/ys-session focus >/dev/null 2>&1; rc=$?
[ "$rc" = "4" ] && ok "T9 取不回焦点 → rc=4" || bad "T9 rc=$rc（应 4）"
[ "$(sess_get released)" = "True" ] && ok "T9 fail-closed：released 保持" || bad "T9 released 被清（会带病注入）"

mksess 1 8000 0 0 0 active -10; tools/ys-editor/ys-session focus >/dev/null 2>&1; rc=$?
[ "$rc" = "3" ] && ok "T10 会话过期 → rc=3（调用方回落 slot）" || bad "T10 rc=$rc（应 3）"

[ "$fails" -eq 0 ] && { echo "SESSION-IDLE-RESULT pass=13 fail=0 verdict=PASS"; exit 0; }
echo "SESSION-IDLE-RESULT pass=$((13-fails)) fail=$fails verdict=FAIL"; exit 1
