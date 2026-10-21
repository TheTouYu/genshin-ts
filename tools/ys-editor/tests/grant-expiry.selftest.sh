#!/bin/bash
# grant-expiry.selftest.sh — 「租期到期由机制归还」回归（用户令 2026-10-21）。
#
# 用户原话：「我苦苦等了它几分钟，也没看到它把屏幕归还给我。这个我反复强调，
# 不能靠模型自觉，要做成机制。」
# 旧设计：到期只在有人调 status/revoke 时才交还 ⇒ 没人调就永久占屏。
# 现设计：常驻 ys-focus-guard（0.5s 轮询）自己发现过期 → ys-hand-back → 清凭据。
#
# 判据：写一份 2s 后过期的凭据 → 守护应在 ≤15s 内清掉它，且 ACTIVE 回到 firefox。
# 退出码：0 PASS / 1 FAIL / 2 环境缺（守护没在跑）
set -u
cd "$(dirname "$0")/../../.." || exit 1
export DISPLAY="${DISPLAY:-:1}"
G=$(python3 -c "import os;print(os.path.expanduser('~/.ys/screen-grant.json'))")
systemctl --user is-active --quiet ys-focus-guard || { echo "GRANT-EXPIRY SKIP 守护没在跑"; exit 2; }

"$PWD/tools/ys-editor/ys-screen-grant" revoke >/dev/null 2>&1
python3 - "$G" <<'PY'
import json, os, sys, time
p = sys.argv[1]; os.makedirs(os.path.dirname(p), exist_ok=True)
json.dump({"created": time.time(), "expires": time.time() + 2, "reason": "selftest",
           "user_said": "自测", "active_window": {}}, open(p, "w"))
PY
t0=$(date +%s)
while [ $(( $(date +%s) - t0 )) -lt 15 ]; do
  [ -e "$G" ] || break
  sleep 0.5
done
if [ -e "$G" ]; then
  echo "GRANT-EXPIRY-RESULT cleared=0 verdict=FAIL（15s 内守护没清凭据 ⇒ 屏幕可能仍被占）"
  exit 1
fi
act=$("$PWD/tools/ys-editor/ys-wins" --attrib 2>/dev/null | grep ACTIVE | awk -F'|' '{print $2}' | tr -d ' ')
if [ "$act" = "firefox" ]; then
  echo "GRANT-EXPIRY-RESULT cleared=1 active=$act dt=$(( $(date +%s) - t0 ))s verdict=PASS"
  exit 0
fi
echo "GRANT-EXPIRY-RESULT cleared=1 active=$act verdict=FAIL（清了凭据但画面没回 firefox）"
exit 1
