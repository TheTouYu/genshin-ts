#!/bin/bash
# daemon-gate-inject.sh — 证明 daemon-resilience 门禁「探对象」：socket 存在但不应答必须判 FAIL。
#
# 背景（2026-10-19 Lead 纠错）：旧门禁读 systemd MainPID（记录），手工 setsid 起的健康 daemon
# 被判「不在」（exit 2）。新门禁探 socket：有应答=健康；**存在但无应答=FAIL 并打印辅助读数**。
# 本注入在临时目录造一个 accept-but-never-reply 的 socket，断言门禁退出码 1 且带辅助读数。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"
LISTENER=""
cleanup() { [ -n "$LISTENER" ] && kill -9 "$LISTENER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

python3 - "$TMP/sock" <<'PY' &
import socket, sys, time
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.bind(sys.argv[1]); s.listen(4)
while True:
    c, _ = s.accept()
    time.sleep(60)          # 接住但不回包：模拟「进程活着但对象不可用」
PY
LISTENER=$!
for _ in $(seq 1 50); do [ -S "$TMP/sock" ] && break; sleep 0.05; done
[ -S "$TMP/sock" ] || { echo "INJECT-FAIL 造不出 socket"; exit 1; }

out="$(YS_LOOKD_PROBE_TIMEOUT=1 YS_LOOKD_SOCK="$TMP/sock" \
       bash "$ROOT/tools/ys-editor/tests/daemon-resilience.selftest.sh" 2>&1)"; rc=$?
if [ "$rc" -ne 1 ]; then
  echo "INJECT-FAIL 不应答 socket 期望 rc=1，实得 rc=$rc"; printf '%s\n' "$out" | head -6; exit 1
fi
if ! printf '%s' "$out" | grep -q "辅助读数"; then
  echo "INJECT-FAIL 判 FAIL 但没打印辅助读数（进程/服务态/MainPID 至少要有）"; exit 1
fi
echo "INJECT-PASS daemon-resilience: 存在但不应答的 socket 被判 FAIL rc=$rc（含辅助读数）"
exit 0
