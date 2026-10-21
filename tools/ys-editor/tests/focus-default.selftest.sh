#!/bin/bash
# 自测/门禁用：绕过屏幕占用契约（生产调用路径不许设；真实占用必须先在对话里申请）
export YS_SLOT_TEST=1
# focus-default.selftest.sh — 「交还屏幕 = 切回默认屏（firefox）」回归（用户口径，2026-10-21）。
#
# 用户原话（第 N 次投诉）：「交还屏幕一定要主动切回原屏幕（默认失败或者超时切回 firefox）……
# 而且强调过在底层实现」。定义见记忆 D424/D428：
#   归还 = activeWindow 是用户窗 **且** stacking.index(用户窗) > stacking.index(game)；
#   只 activate 不 raise = 焦点回去了、画面没回去；失败/超时回落 firefox 并**非零退出**。
#
# 本次事故：我占用屏幕时游戏已在焦点 ⇒ 租约是 noop ⇒ 释放时**零窗口操作** ⇒ 用户仍盯着游戏，
# 而回执 ok:true、我还对外报「屏幕已还」。修法：noop/prev 就是游戏 时，release 也必须
# 切回 firefox 并过堆叠验证（ys-lease `_restore(None)` / ys-gui-slot 的 ALREADY_FOCUSED 分支）。
#
# 判据：起手把游戏抬到焦点（复现事故条件）→ 跑一次 ys-gui-slot → 退出后
#       active.class == firefox 且 firefox.index > game.index。
#
# 需要真窗口（原神在跑）。找不到游戏窗时 SKIP（退出码 0，但打印 SKIP 行，不当成通过）。
# 退出码：0 PASS/SKIP｜1 FAIL
set -u
cd "$(dirname "$0")/../../.." || exit 1
YS="tools/ys-editor"
# KWin 权威通道要 DBus；缺了 kwin-state 会静默回空 ⇒ 解析失败被误判成"没有游戏窗"
[ -f "$YS/ys-env.sh" ] && . "$YS/ys-env.sh"
export DISPLAY="${DISPLAY:-:1}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/1000/bus}"

py() { python3 -c "$1"; }
KSTATE() { "$YS/ys-lease" kwin-state 2>/dev/null; }

# 无论如何都要把屏幕留给用户：本测试会把游戏抬到焦点，失败/中断也必须归 firefox。
# （2026-10-21 自己踩过：注入用例故意让归还失败，结果测试结束把用户留在游戏画面上。）
restore_screen() {
  "$YS/ys-lease" restore --prev-json "" --fallback firefox >/dev/null 2>&1 || true
}
trap restore_screen EXIT INT TERM

# 本测试会**把游戏抬到焦点**（为了复现事故条件）⇒ 默认 SKIP，必须显式授权才跑。
# 2026-10-21 用户令：测试可以切游戏 + 响铃（铃声就是"我在操作"的提示），不再默认 SKIP。
"$YS/ys-bell" 2>/dev/null || true

GAME_ID=$(KSTATE | py 'import sys,json;d=json.load(sys.stdin);print(next((w["internalId"] for w in d.get("wins") or [] if "yuanshen" in (w.get("class") or "").lower()), ""))')
if [ -z "$GAME_ID" ]; then
  echo "FOCUS-DEFAULT SKIP 没有原神窗口（class=yuanshen），跳过"
  exit 0
fi

# 1) 复现事故条件：把游戏抬到焦点
"$YS/ys-lease" kwin-raise --id "$GAME_ID" >/dev/null 2>&1
ACT=$(KSTATE | py 'import sys,json;d=json.load(sys.stdin);print((d.get("active") or {}).get("class",""))')
if [ "$ACT" != "yuanshen.exe" ]; then
  echo "FOCUS-DEFAULT SKIP 未能把游戏抬到焦点（active=$ACT），跳过以免误判"
  exit 0
fi

# 2) 占用一次（此时游戏在焦点 ⇒ 走 ALREADY_FOCUSED 分支）
"$YS/ys-gui-slot" "${YS_WIN_TEST:-0x1600001}" 6 true >/tmp/focus-default-slot.log 2>&1
SLOT_RC=$?

# 3) 核验：active=firefox 且 firefox 在游戏之上
read -r OK ACT2 FI GI < <(KSTATE | py '
import sys,json
d=json.load(sys.stdin)
a=(d.get("active") or {}).get("class","")
wins=d.get("wins") or []
fi=next((w["index"] for w in wins if (w.get("class") or "").lower()=="firefox"), None)
gi=next((w["index"] for w in wins if "yuanshen" in (w.get("class") or "").lower()), None)
ok = 1 if (a=="firefox" and fi is not None and gi is not None and fi>gi) else 0
print(ok, a, fi, gi)
')
tail -2 /tmp/focus-default-slot.log
if [ "${OK:-0}" = "1" ] && [ "$SLOT_RC" = "0" ]; then
  echo "FOCUS-DEFAULT-RESULT ok=1 active=$ACT2 firefox_idx=$FI game_idx=$GI slot_rc=$SLOT_RC verdict=PASS"
  exit 0
fi
echo "FOCUS-DEFAULT-RESULT ok=${OK:-0} active=$ACT2 firefox_idx=$FI game_idx=$GI slot_rc=$SLOT_RC verdict=FAIL"
exit 1
