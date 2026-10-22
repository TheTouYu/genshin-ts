#!/bin/bash
# daemon-resilience.selftest.sh — 常驻服务「客户端提前断开」不许熄火（2026-10-18 事故回灌）
#
# 事故（真因，不是推断）：
#   2026-10-18 07:56:35 `ys-lookd` 在 `c.sendall(resp)` 抛 **BrokenPipeError** 后整个进程退出
#   （serve() 里那条 sendall 只有 try/finally，没有 except）⇒ 服务重启 + 重新预热 ~3s
#   ⇒ 之后的调用落到「daemon 不可用」回退本地（`YS_STATE_LOCAL=1` 同路径，慢 4 倍）。
#   触发条件 = 客户端在**自己超时**时先关 socket（`tools/gui` 的预算纪律会主动放弃最后一次轮询，
#   `ys-state --wait` 超时同理）。所以它是「负载越高越容易出现」的间歇性假红。
#
# **2026-10-19 判据源修正（Lead 实测纠错）**：
#   旧版用 `systemctl --user show ys-lookd.service -p MainPID` 判"服务在不在"。
#   本机 daemon 是**手工 setsid 起的**，systemd unit 是 inactive、MainPID=0 —— 但进程活着、
#   socket 正常应答。旧判据把「记录」（systemd 的 MainPID）当成了「对象」（socket/进程），
#   于是把健康服务判成"不在"（exit 2）。⇒ 判据改为**探 socket**：
#     · socket 有应答 = 健康（不管是不是 systemd 起的）
#     · socket 无应答 = FAIL，并打印「进程在不在 / 服务态 / MainPID」三个辅助读数
#   对端 pid 也改为从 **SO_PEERCRED** 取（对象自身的身份），不再读 MainPID。
#   顺带教训：**门禁判据必须探对象，不许探记录**（记录永远比对象旧或窄；账本/记忆 D6 同族）。
#
# 本自测**只打 socket，不抓屏、不点、不抢焦点**：三件事
#   ① 客户端提前断开（不读响应就 close）后，服务仍然活着（socket 对端 pid 不变）
#   ② 服务仍然能正确回包（事后 warm 请求通）
#   ③ 服务端有出声（systemd 版读 journal；手工启动版读 stderr 目标文件；都不可读则显式 skipped，
#      不判红也不假装通过）
#
# 用法: bash tools/ys-editor/tests/daemon-resilience.selftest.sh [--only <case>]
#   case ∈ alive（客户端断开不熄火）| served（事后仍回包）| spoke（服务端出声）
#   --only 是给**注入用例**（tests/inject/daemon-resilience-neg.sh）用的：本套件每跑一次
#   要对 daemon 发两发断开 + 等 4s，造一次故障不必重跑三条。无参数 = 照旧跑全部（行为不变）。
# 机读行: DAEMON-RESULT alive=<0|1> served=<0|1> spoke=<0|1|skipped> pid_before=<n> pid_after=<n> verdict=PASS|FAIL
# 退出码: 0 全绿 / 1 有失败项（含 socket 无应答）/ 2 环境未就绪（socket 不存在或取不到对端 pid）
set -u
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    *) echo "DAEMON-SELFTEST-USAGE 未知参数 $1（可用 --only <case>）" >&2; exit 2 ;;
  esac
done
want(){ [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }
# case 名写错必须报错，不能"零用例 ⇒ 全绿"：注入用例里 typo 会变成一条永远绿的门禁
case "$ONLY" in
  ""|alive|served|spoke) ;;
  *) echo "DAEMON-SELFTEST-USAGE 未知 case「$ONLY」（可用: alive|served|spoke）" >&2; exit 3 ;;
esac
SOCK="${YS_LOOKD_SOCK:-/run/user/$(id -u)/ys-lookd.sock}"
declare -i TOTAL=0 PASS=0 FAIL=0

ok()  { PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); echo "  ✓ $*"; }
bad() { FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); echo "  ✗ $*"; }

aux_readings() {
  # $1 = socket 状态：missing | no-answer | checked
  local socket_state="${1:-checked}"
  echo "  辅助读数（**只是辅助**；健康判据是 socket 应答）："
  local procs svc mpid proc_state
  procs="$(pgrep -af '[y]s_lookd.py' 2>/dev/null || true)"
  svc="$(systemctl --user is-active ys-lookd.service 2>/dev/null || true)"
  mpid="$(systemctl --user show ys-lookd.service -p MainPID --value 2>/dev/null || true)"
  if [ -n "$procs" ]; then proc_state=alive; else proc_state=dead; fi
  [ -n "$procs" ] && printf '%s\n' "$procs" | sed 's/^/    proc: /' || echo "    proc: (pgrep 未找到 ys_lookd.py)"
  echo "    service: ${svc:-unknown}   MainPID: ${mpid:-0}"
  [ -S "$SOCK" ] && echo "    socket: $SOCK 存在" || echo "    socket: $SOCK 不存在"
  echo "    health_diag: process=$proc_state  socket=$socket_state  service=${svc:-unknown}  MainPID=${mpid:-0}"
  if [ "$proc_state" = "alive" ] && [ "$socket_state" = "no-answer" ]; then
    local dpid errfile
    dpid="$(printf '%s\n' "$procs" | awk 'NR==1{print $1}')"
    [ -n "${dpid:-}" ] && errfile="$(readlink "/proc/$dpid/fd/2" 2>/dev/null || true)"
    echo "    → 进程活着但对象不应答：修服务内部（看 ${errfile:-/tmp/ys-lookd.log} / 卡死 / 抓帧超时），不是「起服务」能解决的"
  elif [ "$proc_state" = "dead" ] && [ "$socket_state" = "missing" ]; then
    echo "    → 进程不在且 socket 不在：起服务（systemd 或手工 setsid）后复跑"
  elif [ "$proc_state" = "alive" ] && [ "$socket_state" = "missing" ]; then
    echo "    → 进程活着但 socket 不在：检查监听路径/socket 是否被清理（对象层修法）"
  fi
}

# 探 socket：发一个 px 请求，收到 v 即健康。stdout: "ok <v>" / 非零退出
probe_px() {
  python3 - "$SOCK" <<'PY'
import json, socket, sys
sock = sys.argv[1]
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(float(__import__("os").environ.get("YS_LOOKD_PROBE_TIMEOUT", "8")))
    s.connect(sock)
    # 2026-10-22：探针从 cmd=px 改成 cmd=ping —— 本门禁守的是"客户端断开不会掀翻服务"，
    # 与「目标窗口在不在」无关。用 px 会让"原神关掉"被误读成"守护卡死"（实测 alive=0）。
    s.sendall((json.dumps({"cmd": "ping"}) + "\n").encode())
    data = b""
    while not data.endswith(b"\n"):
        ch = s.recv(4096)
        if not ch:
            break
        data += ch
    s.close()
    r = json.loads(data.decode())
    if r.get("ok") or "v" in r:
        print("ok %s" % (r.get("pid") or r.get("v")))
        sys.exit(0)
    sys.exit(1)
except Exception as e:                                  # noqa: BLE001
    print("ERR %s: %s" % (type(e).__name__, e))
    sys.exit(1)
PY
}

# 对端 pid：从 socket 自身取（SO_PEERCRED），不读 systemd 记录
peer_pid() {
  python3 - "$SOCK" <<'PY'
import socket, struct, sys
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect(sys.argv[1])
    creds = s.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
    pid, uid, gid = struct.unpack("3i", creds)
    s.close()
    print(pid)
except Exception:                                       # noqa: BLE001
    sys.exit(1)
PY
}

# ── 0 环境：socket 必须在；**应答才是健康判据**（不看 MainPID） ─────────────
if [ ! -S "$SOCK" ]; then
  echo "✗ 常驻服务不在：$SOCK 不存在" >&2
  aux_readings missing >&2
  echo "  本自测验的是「服务抗客户端断开」，服务不在就无法验证 —— 不静默跳过。" >&2
  exit 2
fi
HEALTH="$(probe_px)" || {
  echo "✗ socket 存在但无应答（判 FAIL）：$HEALTH" >&2
  aux_readings no-answer >&2
  printf 'DAEMON-RESULT alive=0 served=0 spoke=skipped pid_before=0 pid_after=0 verdict=FAIL\n'
  exit 1
}
PID_BEFORE="$(peer_pid || true)"
if [ -z "$PID_BEFORE" ]; then
  echo "✗ 取不到 socket 对端 pid（SO_PEERCRED 不可用）" >&2
  aux_readings checked >&2
  exit 2
fi
echo "══ ys-lookd 抗断开自测  peer_pid=$PID_BEFORE  health=$HEALTH  sock=$SOCK ══"
# MARK 必须取在**断开之前**：断开发生在第 1 步，日志断言在第 3 步。
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
PID_AFTER="$(peer_pid || true)"
alive=0
if want alive; then
if [ -n "$PID_AFTER" ] && [ "$PID_AFTER" = "$PID_BEFORE" ]; then
  ok "服务没被掀翻（socket 对端 pid 仍为 $PID_AFTER）"
  alive=1
else
  bad "服务退出了（socket 对端 pid $PID_BEFORE → ${PID_AFTER:-NONE}）—— 客户端断开把常驻服务杀了"
fi
fi

# ── 2 事后仍能正确回包 ───────────────────────────────────────────────────
served=0
if want served; then
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
fi

# ── 3 服务端必须出声（静默吞掉 = 下一次照样不知道发生了什么）───────────────
# systemd 版读 journal；手工 setsid 版读该进程 stderr 指向的文件；都没有则显式 skipped。
# ⚠️ 窗口必须只覆盖**本次运行**（MARK 在断开之前取），否则会命中上一次运行的日志 ⇒ 假绿。
spoke=skipped
if want spoke; then
if command -v journalctl >/dev/null 2>&1 && systemctl --user is-active --quiet ys-lookd.service; then
  if journalctl --user -u ys-lookd --since "$MARK" --no-pager 2>/dev/null | grep -q '客户端提前断开'; then
    ok "服务端出声了（journal，$MARK 之后含「客户端提前断开」）"; spoke=1
  else
    bad "服务端静默吞掉了断开（journal，$MARK 之后无「客户端提前断开」）"; spoke=0
  fi
else
  ERRFILE="$(readlink "/proc/${PID_AFTER:-0}/fd/2" 2>/dev/null || true)"
  if [ -n "$ERRFILE" ] && [ -f "$ERRFILE" ]; then
    if tail -n 300 "$ERRFILE" 2>/dev/null | grep -q '客户端提前断开'; then
      ok "服务端出声了（stderr 文件 ${ERRFILE}，含「客户端提前断开」）"; spoke=1
    else
      bad "服务端静默吞掉了断开（stderr 文件 ${ERRFILE} 无「客户端提前断开」）"; spoke=0
    fi
  else
    echo "  · spoke=skipped：非 systemd 启动且 stderr 目标不可读（${ERRFILE:-unknown}）—— 不判红、不假装通过"
  fi
fi
fi

VERDICT=PASS
[ "$FAIL" -gt 0 ] && VERDICT=FAIL
printf 'DAEMON-RESULT alive=%d served=%d spoke=%s pid_before=%s pid_after=%s verdict=%s\n' \
  "$alive" "$served" "$spoke" "${PID_BEFORE:-0}" "${PID_AFTER:-0}" "$VERDICT"
if [ "$FAIL" -gt 0 ]; then
  printf '✗ %d 项失败 / %d 项通过\n' "$FAIL" "$PASS"
  aux_readings checked >&2
  exit 1
fi
printf '✓ 全绿（%d 项；socket 健康、客户端断开不熄火、事后可服务）\n' "$PASS"
exit 0
