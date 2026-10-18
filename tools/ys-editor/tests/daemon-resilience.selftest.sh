#!/bin/bash
# daemon-resilience.selftest.sh — 常驻服务「客户端提前断开」不许熄火（2026-10-18 事故回灌）
#
# 事故（真因，不是推断）：
#   2026-10-18 07:56:35 `ys-lookd` 在 `c.sendall(resp)` 抛 **BrokenPipeError** 后整个进程退出
#   （serve() 里那条 sendall 只有 try/finally，没有 except）⇒ systemd 重启 + 重新预热 ~3s
#   ⇒ 之后的调用落到「daemon 不可用」回退本地（`YS_STATE_LOCAL=1` 同路径，慢 4 倍）。
#   触发条件 = 客户端在**自己超时**时先关 socket（`tools/gui` 的预算纪律会主动放弃最后一次轮询，
#   `ys-state --wait` 超时同理）。所以它是「负载越高越容易出现」的间歇性假红：
#   `./tools/ys-gates` 首跑 PASS 2/FAIL 2，其中门槛②  自报 verdict=FAIL 而四个 exit 码全对；
#   同时刻 `fake-success.selftest.sh` 单跑连绿三次 —— 真因不在被测对象身上。
#   复活证据（修复前后各一次）：修前同一手法 NRestarts 3→4 且 MainPID 变；修后 MainPID 不变、
#   NRestarts=0、日志出现「客户端提前断开，丢弃本次响应」。
#
# 本自测**只打 socket，不抓屏、不点、不抢焦点**：三件事
#   ① 客户端提前断开（不读响应就 close）后，服务仍然活着（pid 不变）
#   ② 服务仍然能正确回包（事后 warm 请求通）
#   ③ 服务端有出声（日志里出现「客户端提前断开」）—— 静默吞掉和崩溃一样不可接受
# 缺服务时**不静默跳过**：直接 exit 2 并说清怎么起（门槛② 的守门测试不许假装通过）。
#
# 用法: bash tools/ys-editor/tests/daemon-resilience.selftest.sh
# 机读行: DAEMON-RESULT alive=<0|1> served=<0|1> spoke=<0|1> pid_before=<n> pid_after=<n> verdict=PASS|FAIL
# 退出码: 0 全绿 / 1 有失败项 / 2 服务不在（环境未就绪，不判通过）
set -u
SOCK="${YS_LOOKD_SOCK:-/run/user/$(id -u)/ys-lookd.sock}"
declare -i TOTAL=0 PASS=0 FAIL=0

ok()  { PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); echo "  ✓ $*"; }
bad() { FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); echo "  ✗ $*"; }

pid_now() { systemctl --user show ys-lookd.service -p MainPID --value 2>/dev/null || echo 0; }

# ── 0 环境：服务必须在跑，否则拒绝判通过 ─────────────────────────────────
if [ ! -S "$SOCK" ]; then
  echo "✗ 常驻服务不在：$SOCK 不存在" >&2
  echo "  起法：systemctl --user start ys-lookd.service（或 systemctl --user restart）" >&2
  echo "  本自测验的是「服务抗客户端断开」，服务不在就无法验证 —— 不静默跳过。" >&2
  exit 2
fi
PID_BEFORE="$(pid_now)"
if [ -z "$PID_BEFORE" ] || [ "$PID_BEFORE" = "0" ]; then
  echo "✗ 取不到 ys-lookd 的 MainPID（systemctl --user 不可用？）" >&2
  exit 2
fi
echo "══ ys-lookd 抗断开自测  pid=$PID_BEFORE  sock=$SOCK ══"
# MARK 必须取在**断开之前**：断开发生在第 1 步，日志断言在第 3 步。
# （踩过：把 MARK 放在第 3 步 ⇒ 窗口漏掉真正的断开事件 ⇒ 明明每次都出声却判 spoke=0。）
MARK="$(date '+%F %T')"
sleep 1

# ── 1 客户端提前断开：发一个**注定较慢**的请求（px 要走抓帧），不读响应就关 ──
# 触发要**确定**：AF_UNIX 上普通 close() 有时被内核直接吸收（对端仍能写成功），
# 于是「服务端出不出现 EPIPE」变成竞态 —— 实测同一条自测会时而 spoke=1 时而 spoke=0。
# 用 SO_LINGER{on,0} 在关闭时发 RST 才是确定的「对端已死」；再补一发普通 close 覆盖两种形态。
python3 - "$SOCK" <<'PY'
import json, socket, struct, sys, time
sock = sys.argv[1]


def fire(cmd, hard):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(10)
    if hard:                                   # RST：关闭时若还有未读数据 ⇒ 对端 recv/send 立即失败
        s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    s.connect(sock)
    s.sendall((json.dumps(cmd) + "\n").encode())
    s.close()


fire({"cmd": "px", "x": 100, "y": 100}, hard=True)    # 确定性路径（事故形态）
time.sleep(1.0)
fire({"cmd": "px", "x": 101, "y": 100}, hard=False)   # 真实调用方的形态（超时后普通 close）
print("  · 已发两次请求并立即断开（一次 RST 强制、一次普通 close），都不读响应")
PY
sleep 3
PID_AFTER="$(pid_now)"
if [ "$PID_AFTER" = "$PID_BEFORE" ]; then
  ok "服务没被掀翻（pid 仍为 $PID_AFTER）"
else
  bad "服务退出了（pid $PID_BEFORE → $PID_AFTER）—— 客户端断开把常驻服务杀了"
fi
alive=0; [ "$PID_AFTER" = "$PID_BEFORE" ] && alive=1

# ── 2 事后仍能正确回包 ───────────────────────────────────────────────────
served=0
if python3 - "$SOCK" <<'PY'
import json, socket, sys
sock = sys.argv[1]
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(15); s.connect(sock)
    s.sendall((json.dumps({"cmd": "warm"}) + "\n").encode())
    data = b""
    while not data.endswith(b"\n"):
        ch = s.recv(4096)
        if not ch: break
        data += ch
    s.close()
    r = json.loads(data.decode())
    sys.exit(0 if r.get("ok") is True else 1)
except Exception as e:
    print(f"  连接/回包失败: {type(e).__name__}: {e}", file=sys.stderr)
    sys.exit(1)
PY
then
  ok "断开之后仍能正常回包（warm ⇒ ok=true）"
  served=1
else
  bad "断开之后回包失败 —— 服务虽活着但已不可用"
fi

# ── 3 服务端必须出声（静默吞掉 = 下一次照样不知道发生了什么）───────────────
# ⚠️ 窗口必须只覆盖**本次运行**：用 '-2min' 时负向验证踩过假绿 —— 命中的是**上一次**
#    修复版留下的同义日志行，于是「旧代码明明崩了，spoke 却判 ✓」。判据必须绑本次事件。
#    窗口起点 = 上面的 MARK（断开之前取的），不是这里。
spoke=0
if command -v journalctl >/dev/null 2>&1; then
  if journalctl --user -u ys-lookd --since "$MARK" --no-pager 2>/dev/null \
       | grep -q '客户端提前断开'; then
    ok "服务端出声了（$MARK 之后含「客户端提前断开」）"
    spoke=1
  else
    bad "服务端静默吞掉了断开（$MARK 之后无「客户端提前断开」）—— 它会被当成「服务正常」"
  fi
else
  echo "  · 跳过日志断言：本机没有 journalctl"
  spoke=1
fi

VERDICT=PASS
[ "$FAIL" -gt 0 ] && VERDICT=FAIL
printf 'DAEMON-RESULT alive=%d served=%d spoke=%d pid_before=%s pid_after=%s verdict=%s\n' \
  "$alive" "$served" "$spoke" "$PID_BEFORE" "$PID_AFTER" "$VERDICT"
if [ "$FAIL" -gt 0 ]; then
  printf '✗ %d 项失败 / %d 项通过\n' "$FAIL" "$PASS"
  exit 1
fi
printf '✓ 全绿（%d 项；客户端断开不熄火、事后可服务、且出声）\n' "$PASS"
exit 0
