#!/bin/bash
# screen-grant.selftest.sh — 屏幕占用契约回归（用户令 2026-10-21）。
#
# 用户原话：「这个系统不是你一个人在用，每次使用要和用户申请……没做到这个，就会遇到
# 用户也操控屏幕，导致的各种不确定的 bug。」
# 契约必须做成设计：没有「用户批准过的时长凭据」时，底层注入必须**拒绝**而不是照做。
#
# 本测试只验**拒绝路径**（不占屏、不动窗口）：
#   T1 无凭据 → ys-screen-grant status 退出码 6
#   T2 无凭据 → ys-gui-slot 退出码 6（且不 acquire）
#   T3 授权后 → status 退出码 0
# 需要真机窗口的放行路径由 focus-default.selftest.sh 覆盖。
# 退出码：0 PASS / 1 FAIL
set -u
cd "$(dirname "$0")/../../.." || exit 1
export YS_SCREEN_GRANT="${TMPDIR:-/tmp}/ys-screen-grant-selftest-$$.json"
trap 'rm -f "$YS_SCREEN_GRANT"' EXIT
fails=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fails=$((fails+1)); }

"$PWD/tools/ys-editor/ys-screen-grant" revoke >/dev/null 2>&1
"$PWD/tools/ys-editor/ys-screen-grant" status >/dev/null 2>&1; rc=$?
[ "$rc" -eq 6 ] && ok "无凭据时 status 退出码 6" || bad "无凭据 status 退出码 $rc（应 6）"

out=$(unset YS_SLOT_TEST; "$PWD/tools/ys-editor/ys-gui-slot" "${YS_WIN_TEST:-0x1600001}" 5 true 2>&1); rc=$?
[ "$rc" -eq 6 ] && ok "无凭据时 slot 拒绝执行（rc=6）" || bad "无凭据 slot rc=$rc（应 6）"
echo "$out" | grep -q "NO_GRANT" && ok "拒绝理由带 NO_GRANT 与申请指引" || bad "拒绝输出缺少 NO_GRANT：$out"

"$PWD/tools/ys-editor/ys-screen-grant" grant --seconds 30 --reason selftest >/dev/null 2>&1
"$PWD/tools/ys-editor/ys-screen-grant" status >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && ok "授权后 status 退出码 0" || bad "授权后 status rc=$rc"

[ "$fails" -eq 0 ] && { echo "SCREEN-GRANT-RESULT pass=3 fail=0 verdict=PASS"; exit 0; }
echo "SCREEN-GRANT-RESULT pass=$((3-fails)) fail=$fails verdict=FAIL"; exit 1
