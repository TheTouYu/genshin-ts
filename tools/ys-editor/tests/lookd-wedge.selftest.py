#!/usr/bin/env python3
"""lookd-wedge.selftest.py — ys-lookd「单请求上界」回归（2026-10-21 事故）。

事故形态（F-20261021-LOOKD-WEDGE）
    serve() 单线程串行：accept 有 30s 超时，但
      ① 已连接 socket 的 recv 循环没有超时；
      ② handle(req) 没有看门狗。
    ⇒ 一个不说话/半途断开的客户端，或任何一个卡住的 handler，就能把整台感知服务
      永久钉死；后续所有调用者排队到天荒地老且**零报错**。
    实测证据：accept backlog Recv-Q=4、主线程 wchan=poll_schedule_timeout、
    闲置日志停在卡死时刻、客户端 60s 零输出（rc=124）。

本测试起一个**独立调试实例**（YS_LOOKD_SOCK 指向 /tmp，绝不碰生产 socket），
注入两类故障并断言「有界返回 + 服务存活」：

    T1 不说话的客户端      → 期望 RECV_TIMEOUT（≤ RECV_TIMEOUT+3s），且随后 ping 正常
    T2 卡住的 handler      → 期望 HANDLER_TIMEOUT（≤ HANDLER_TIMEOUT+2s），且随后 ping 正常
    T3 故障之后的服务存活  → 两次故障后 ping 仍返回

退出码：0 全绿 / 1 有断言失败 / 2 起不来
"""
import json
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LOOKD = os.path.join(os.path.dirname(HERE), "ys_lookd.py")
SOCK = "/tmp/ys-lookd-selftest-%d.sock" % os.getpid()
RECV_T = 2.0
HANDLER_T = 3.0
results = []


def say(tag, ok, detail):
    results.append((tag, ok, detail))
    print("%-6s %-4s %s" % (tag, "PASS" if ok else "FAIL", detail), flush=True)


def rpc(req, timeout=10.0):
    t0 = time.time()
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect(SOCK)
        s.sendall((json.dumps(req) + "\n").encode())
        buf = b""
        while not buf.endswith(b"\n"):
            chunk = s.recv(1 << 20)
            if not chunk:
                break
            buf += chunk
    finally:
        s.close()
    dt = time.time() - t0
    try:
        return json.loads(buf.decode() or "{}"), dt
    except ValueError:
        return {"_raw": buf[:120].decode("utf-8", "replace")}, dt


def wait_ready(proc, timeout=40.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if os.path.exists(SOCK):
            try:
                out, _ = rpc({"cmd": "ping"}, timeout=3.0)
                if isinstance(out, dict):
                    return True
            except OSError:
                pass
        if proc.poll() is not None:
            return False
        time.sleep(0.3)
    return False


def main():
    env = dict(os.environ, YS_LOOKD_SOCK=SOCK, YS_LOOKD_TEST_HOOKS="1",
               YS_LOOKD_RECV_TIMEOUT=str(RECV_T), YS_LOOKD_HANDLER_TIMEOUT=str(HANDLER_T),
               DISPLAY=os.environ.get("DISPLAY") or ":1")
    log = open("/tmp/ys-lookd-selftest.log", "w")
    proc = subprocess.Popen([sys.executable, LOOKD], env=env, stdout=log, stderr=subprocess.STDOUT)

    # T0 起得来
    ok = wait_ready(proc)
    say("T0", ok, "调试实例就绪 sock=%s pid=%d" % (SOCK, proc.pid))
    if not ok:
        proc.kill()
        return 2

    # T1 不说话的客户端：连上不发一行 → 服务端 2s 后必须放弃它
    silent = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    silent.connect(SOCK)
    t0 = time.time()
    out, dt = rpc({"cmd": "ping"}, timeout=RECV_T + 8)
    alive_ok = isinstance(out, dict) and "error" in out and out.get("error") == "unknown cmd"
    say("T1", alive_ok and dt <= RECV_T + 4,
        "静默客户端在场时 ping 仍被服务 dt=%.1fs（上界 %.0fs）resp=%s" % (dt, RECV_T + 4, out))
    silent.close()

    # T2 卡住的 handler：_sleep 10s，看门狗 3s 必须打断
    out, dt = rpc({"cmd": "_sleep", "ms": 10000}, timeout=HANDLER_T + 10)
    ok2 = out.get("code") == "HANDLER_TIMEOUT" and dt <= HANDLER_T + 4
    say("T2", ok2, "handler 卡死被看门狗打断 dt=%.1fs（上界 %.0fs）code=%s" %
        (dt, HANDLER_T + 4, out.get("code")))

    # T3 两次故障之后服务仍活着
    out3, dt3 = rpc({"cmd": "ping"}, timeout=8)
    ok3 = isinstance(out3, dict) and out3.get("error") == "unknown cmd"
    say("T3", ok3, "故障后服务存活 dt=%.1fs resp=%s" % (dt3, out3))

    proc.kill()
    try:
        proc.wait(timeout=5)
    except Exception:
        pass
    try:
        os.unlink(SOCK)
    except OSError:
        pass

    fails = [r for r in results if not r[1]]
    print("WEDGE-SELFTEST verdict=%s pass=%d fail=%d" %
          ("PASS" if not fails else "FAIL", len(results) - len(fails), len(fails)), flush=True)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
