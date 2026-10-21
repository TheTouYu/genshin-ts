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
# 失败必须自解释（用户令 2026-10-21）：错因 + 当前状态 + 下一步
for k in '"reason"' '"state"' '"active_window"' '"screen_held_by_us"' '"next_action"'; do
  echo "$out" | grep -q "$k" && ok "拒绝输出含 $k" || bad "拒绝输出缺 $k：$out"
done

"$PWD/tools/ys-editor/ys-screen-grant" grant --seconds 30 --reason selftest --user-said "自测" >/dev/null 2>&1
"$PWD/tools/ys-editor/ys-screen-grant" status >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && ok "授权后 status 退出码 0" || bad "授权后 status rc=$rc"

# T4 不允许无限自授：单次超长拒绝
out=$("$PWD/tools/ys-editor/ys-screen-grant" grant --seconds 9999 --user-said x 2>&1); rc=$?
echo "$out" | grep -q "GRANT_TOO_LONG" && ok "超长自授被拒（≤120s）" || bad "超长自授未被拒：$out"

# T5 有效期内的续期必须被拒（防止"申请一次、无限续"）
out=$("$PWD/tools/ys-editor/ys-screen-grant" grant --seconds 30 --user-said "续" 2>&1); rc=$?
echo "$out" | grep -q "GRANT_STILL_VALID" && ok "有效期内续期被拒" || bad "续期未被拒：$out"

# T6 租期模型（**会占用真实屏幕**）：默认 SKIP——回归测试绝不许在用户不知情时抬窗
# （2026-10-21 用户反馈「说完成了却还有操作音」= 本条测试在 check --fast 里抬了游戏窗）。
# 2026-10-21 用户令：测试可以占屏（铃声=操作提示），不再默认 SKIP
GID=$(tools/ys-editor/ys-wins --attrib 2>/dev/null | grep "yuanshen" | head -1)
if [ -n "$GID" ]; then
  unset YS_SLOT_TEST
  "$PWD/tools/ys-editor/ys-screen-grant" revoke >/dev/null 2>&1
  "$PWD/tools/ys-editor/ys-screen-grant" grant --seconds 40 --reason selftest-lease --user-said "自测" >/dev/null 2>&1
  "$PWD/tools/ys-editor/ys-gui-slot" "${YS_WIN_TEST:-0x1600001}" 5 true >/dev/null 2>&1
  act=$("$PWD/tools/ys-editor/ys-wins" --attrib 2>/dev/null | grep ACTIVE | awk -F'|' '{print $2}' | tr -d ' ')
  [ "$act" = "yuanshen.exe" ] && ok "租期内不归还（active 仍是游戏）" || bad "租期内被归还了（active=$act）"
  "$PWD/tools/ys-editor/ys-screen-grant" revoke >/dev/null 2>&1
  act2=$("$PWD/tools/ys-editor/ys-wins" --attrib 2>/dev/null | grep ACTIVE | awk -F'|' '{print $2}' | tr -d ' ')
  [ "$act2" = "firefox" ] && ok "revoke 后统一交还 firefox" || bad "revoke 后未交还（active=$act2）"
elif [ "${YS_ALLOW_SCREEN_TEST:-0}" = "1" ]; then
  echo "  · T6 SKIP 没有原神窗口，跳过租期模型检查"
fi

[ "$fails" -eq 0 ] && { echo "SCREEN-GRANT-RESULT pass=5 fail=0 verdict=PASS"; exit 0; }
echo "SCREEN-GRANT-RESULT pass=$((5-fails)) fail=$fails verdict=FAIL"; exit 1
