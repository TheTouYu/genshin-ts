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
#   T13 租期模型（离线）→ 凭据有效时 `ys-gui-slot --plan` 判 hold=true（= 不归还）
#   T14 无凭据（离线）  → `--plan` 判 contract_ok=false，且**恒退出 0**
# 需要真机窗口的放行路径由 focus-default.selftest.sh 覆盖；T6 是唯一会抬窗的一条（默认 SKIP）。
# 退出码：0 PASS / 1 FAIL
# 参数：`--only t1,t2,...` 只跑指定判据（注入用例用；**缺省不传 = 跑全部，输出与旧版逐字节一致**）。
#   t1=无凭据 status / t2=无凭据 slot 拒绝 / t3=授权后 status / t4=超长自授 / t5=同任务续期
#   t5b=换任务无原话 / t6=租期模型（会占屏，需 YS_ALLOW_SCREEN_TEST=1）/ t13,t14=离线 --plan 两例
# YS_SLOT_BIN / YS_GRANT_BIN 只服务**注入用例**（tests/inject/*）：把 ys-gui-slot / ys-screen-grant
# 复制成同目录副本、各改一处判据，再用它指过去验收对应断言真的会变红——生产文件一个字节不动。
# 不设 = 测生产工具。
set -u
cd "$(dirname "$0")/../../.." || exit 1
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift || true; [ $# -gt 0 ] && shift || true;;
    --only=*) ONLY="${1#--only=}"; shift;;
    *) echo "用法: $0 [--only t1,t2,...]" >&2; exit 2;;
  esac
done
want() { [ -z "$ONLY" ] && return 0; case ",${ONLY}," in *",$1,"*) return 0;; esac; return 1; }
# 判据名写错时**不许静默跑 0 条还判 PASS**（本仓库的"空转断言"就是这么来的）
if [ -n "$ONLY" ]; then
  for _c in ${ONLY//,/ }; do
    case "$_c" in t1|t2|t3|t4|t5|t5b|t6|t13|t14) ;; *)
      echo "未知判据名: $_c（可选 t1 t2 t3 t4 t5 t5b t6 t13 t14）" >&2; exit 2;; esac
  done
fi
export YS_SCREEN_GRANT="${TMPDIR:-/tmp}/ys-screen-grant-selftest-$$.json"
GRANT_BIN="${YS_GRANT_BIN:-$PWD/tools/ys-editor/ys-screen-grant}"
YS_SLOT_BIN="${YS_SLOT_BIN:-$PWD/tools/ys-editor/ys-gui-slot}"
trap 'rm -f "$YS_SCREEN_GRANT"' EXIT
fails=0
ran=0
ok() { ran=$((ran+1)); echo "  ✓ $1"; }
bad() { ran=$((ran+1)); fails=$((fails+1)); echo "  ✗ $1"; }
# jget <文本> <字段>：从 --plan 的输出里取一个字段。
# 不用 grep 直接匹配字段：一旦 JSON 缩进/分隔符变了，grep 会**假绿**（本仓库踩过空转断言）；
# 这里只解析「最后一行以 { 开头」的那行，stdout/stderr 混流也不会误判。
jget() {
  printf '%s\n' "$1" | grep -o '^{.*}$' | tail -1 | \
    python3 -c "import json,sys;print(json.load(sys.stdin).get('$2'))" 2>/dev/null
}

"$GRANT_BIN" revoke >/dev/null 2>&1

# ── T1 无凭据时 status 必须拒（rc=6）─────────────────────────────────────────
if want t1; then
  "$GRANT_BIN" status >/dev/null 2>&1; rc=$?
  [ "$rc" -eq 6 ] && ok "无凭据时 status 退出码 6" || bad "无凭据 status 退出码 $rc（应 6）"
fi

# ── T2 无凭据时底层注入必须拒绝，且理由自解释 ────────────────────────────────
if want t2; then
  out=$(unset YS_SLOT_TEST; "$YS_SLOT_BIN" "${YS_WIN_TEST:-0x1600001}" 5 true 2>&1); rc=$?
  [ "$rc" -eq 6 ] && ok "无凭据时 slot 拒绝执行（rc=6）" || bad "无凭据 slot rc=$rc（应 6）"
  echo "$out" | grep -q "NO_GRANT" && ok "拒绝理由带 NO_GRANT 与申请指引" || bad "拒绝输出缺少 NO_GRANT：$out"
  # 失败必须自解释（用户令 2026-10-21）：错因 + 当前状态 + 下一步
  for k in '"reason"' '"state"' '"active_window"' '"screen_held_by_us"' '"next_action"'; do
    echo "$out" | grep -q "$k" && ok "拒绝输出含 $k" || bad "拒绝输出缺 $k：$out"
  done
fi

# ── T3/T4/T5/T5b 共用前置：先拿一份 30s 凭据（同一任务）──────────────────────
need_grant=0
for c in t3 t4 t5 t5b; do want "$c" && need_grant=1; done
[ "$need_grant" = "1" ] && "$GRANT_BIN" grant --seconds 30 --reason selftest --user-said "自测" >/dev/null 2>&1

if want t3; then
  "$GRANT_BIN" status >/dev/null 2>&1; rc=$?
  [ "$rc" -eq 0 ] && ok "授权后 status 退出码 0" || bad "授权后 status rc=$rc"
fi

# T4 不允许无限自授：单次超长拒绝
if want t4; then
  out=$("$GRANT_BIN" grant --seconds 9999 --user-said x 2>&1); rc=$?
  echo "$out" | grep -q "GRANT_TOO_LONG" && ok "超长自授被拒（≤120s）" || bad "超长自授未被拒：$out"
fi

# T5 同任务续期**允许**（2026-10-21 重设计：一次知情 = 一个任务，不再打断用户）
if want t5; then
  out=$("$GRANT_BIN" grant --seconds 30 --task default --user-said "续" 2>&1); rc=$?
  echo "$out" | grep -q '"renewed": true' && ok "同任务续期允许（不打断用户）" || bad "同任务续期被拒：$out"
fi

# T5b 换任务且没给用户原话 ⇒ 必须拒（防自授扩张到别的任务）
if want t5b; then
  out=$("$GRANT_BIN" grant --seconds 30 --task other 2>&1); rc=$?
  echo "$out" | grep -q "TASK_MISMATCH" && ok "换任务无用户原话被拒" || bad "换任务未被拒：$out"
fi

# T6 租期模型（**会占用真实屏幕**）：默认 SKIP——回归测试绝不许在用户不知情时抬窗
# （2026-10-21 用户反馈「说完成了却还有操作音」= 本条测试在 check --fast 里抬了游戏窗）。
# 2026-10-21 用户令：测试可以占屏（铃声=操作提示），不再默认 SKIP
if want t6; then
  GID=$(tools/ys-editor/ys-wins --attrib 2>/dev/null | grep "yuanshen" | head -1)
  # 2026-10-21 用户令：回归测试默认**不许碰屏幕**（"说完成了却还有操作音"的第二次投诉）。
  # 抬窗必须显式开门：YS_ALLOW_SCREEN_TEST=1。
  if [ "${YS_ALLOW_SCREEN_TEST:-0}" != "1" ]; then
    echo "  · T6 SKIP 会占用真实屏幕（设 YS_ALLOW_SCREEN_TEST=1 才跑）"
  elif [ -n "$GID" ]; then
    unset YS_SLOT_TEST
    "$GRANT_BIN" revoke >/dev/null 2>&1
    "$GRANT_BIN" grant --seconds 40 --reason selftest-lease --user-said "自测" >/dev/null 2>&1
    "$PWD/tools/ys-editor/ys-gui-slot" "${YS_WIN_TEST:-0x1600001}" 5 true >/dev/null 2>&1
    act=$("$PWD/tools/ys-editor/ys-wins" --attrib 2>/dev/null | grep ACTIVE | awk -F'|' '{print $2}' | tr -d ' ')
    [ "$act" = "yuanshen.exe" ] && ok "租期内不归还（active 仍是游戏）" || bad "租期内被归还了（active=$act）"
    "$GRANT_BIN" revoke >/dev/null 2>&1
    act2=$("$PWD/tools/ys-editor/ys-wins" --attrib 2>/dev/null | grep ACTIVE | awk -F'|' '{print $2}' | tr -d ' ')
    [ "$act2" = "firefox" ] && ok "revoke 后统一交还 firefox" || bad "revoke 后未交还（active=$act2）"
  elif true; then
    echo "  · T6 SKIP 没有原神窗口，跳过租期模型检查"
  fi
fi

# T13 租期模型（**离线**）：凭据有效 ⇒ `--plan` 必须判「租期内不归还」。
# 这是 F-20261021-53（每次动作后自动还 firefox ⇒ 紧接着的 look --live 必然 NOT_ATOP）的离线判据：
# 原先只有 T6 能验这件事，而 T6 要 YS_ALLOW_SCREEN_TEST=1 且真抬窗 ⇒ 修复没有默认回归判据。
# 这里**不用 revoke**：revoke 会 _hand_back()（真的 activate+raise firefox）⇒ 那就不是离线了；
# 直接删临时凭据文件即可——「凭据不存在」正是 --plan 唯一看到的输入。
if want t13; then
  rm -f "$YS_SCREEN_GRANT"
  "$GRANT_BIN" grant --seconds 30 --reason selftest-plan --user-said "自测" >/dev/null 2>&1
  gout=$(unset YS_SLOT_TEST; "$YS_SLOT_BIN" --plan 2>&1); grc=$?
  g_lease=$(jget "$gout" lease_active); g_hold=$(jget "$gout" hold); g_would=$(jget "$gout" would_restore)
  [ "$grc" -eq 0 ] && [ "$g_lease" = "True" ] && [ "$g_hold" = "True" ] && [ "$g_would" = "False" ] \
    && ok "T13 租期模型（离线）：凭据有效 ⇒ 租期内不归还（lease_active=$g_lease hold=$g_hold would_restore=$g_would）" \
    || bad "T13 租期模型不符：rc=$grc lease_active=$g_lease hold=$g_hold would_restore=$g_would（应 0/True/True/False）｜plan=$gout"
fi

# T14 无凭据拒绝（**离线**）：凭据没了 ⇒ `--plan` 必须如实报契约不通过（且不归还、不执行）。
# 断言的是 contract_ok 而不是退出码：plan 不是执行，退出码恒 0（拒绝路径的 6 只在真执行时出现，
# 那正是 T2 覆盖的东西——两者不能混成一条）。
if want t14; then
  rm -f "$YS_SCREEN_GRANT"
  gout=$(unset YS_SLOT_TEST; "$YS_SLOT_BIN" --plan 2>&1); grc=$?
  g_ok=$(jget "$gout" contract_ok); g_hold=$(jget "$gout" hold)
  [ "$grc" -eq 0 ] && [ "$g_ok" = "False" ] && [ "$g_hold" = "False" ] \
    && ok "T14 无凭据拒绝（离线）：plan 报 contract_ok=false 且恒退出 0（hold=$g_hold）" \
    || bad "T14 无凭据 plan 不符：rc=$grc contract_ok=$g_ok hold=$g_hold（应 0/False/False）｜plan=$gout"
fi

# 全量跑时 ran 必须等于 14（T1 1 + T2 7 + T3 1 + T4 1 + T5 1 + T5b 1 + T13 1 + T14 1）；
# 不含 T6（需显式 YS_ALLOW_SCREEN_TEST=1）。
[ "$fails" -eq 0 ] && { echo "SCREEN-GRANT-RESULT pass=$ran fail=0 verdict=PASS"; exit 0; }
echo "SCREEN-GRANT-RESULT pass=$((ran-fails)) fail=$fails verdict=FAIL"; exit 1
