#!/usr/bin/env python3
"""lookd-idle-exit.selftest.py — ys-lookd「闲置自动退出」回归（2026-10-26 用户令）。

背景（用户实测）
    ys_lookd 闲置时是**显存第一大户**：3144 MiB / 空转 20h43m / 0 连接 / 60s CPU 0.04s。
    旧版"闲置释放"只调 `torch.cuda.empty_cache()`，实测只回收 **70~114 MiB**——因为模型权重
    那 ~2.3GB 只在进程活着时占着。⇒ 用户令：「没人用的话，30 分钟后自动退出」。
    生产实现在 `ys_lookd.py`（两段式：`YS_LOOKD_IDLE_SEC` 释放缓存 → `YS_LOOKD_IDLE_EXIT_SEC`
    退出进程）+ systemd socket activation（`ys-lookd.socket` 常驻，进程退出后下一次连接拉起）。

本测试起**独立调试实例**（`YS_LOOKD_SOCK` 指向 /tmp，绝不碰生产 socket），把阈值压到秒级：

    T1 空闲到点 → 进程退出且退出码 0（正常退出，`Restart=on-failure` 不会复活它）
    T2 退出原因出声 → stderr 里有「闲置 Ns ≥ Ns → 退出进程归还显存」+ 峰值 RSS 读数
    T3 **在途请求不被抢占** → 阈值 3s 时发一个 4s 的 handler，回包必须完整，且退出发生在之后
    T4 可关闭 → `YS_LOOKD_IDLE_EXIT_SEC=0` 时同一时长内进程**不**退出（阈值 0 = 关）

退出码：0 全绿 / 1 有断言失败 / 2 环境未就绪（起不来）
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LOOKD = os.path.join(os.path.dirname(HERE), "ys_lookd.py")
results = []


def say(tag, ok, detail):
    results.append((tag, ok, detail))
    print("%-6s %-4s %s" % (tag, "PASS" if ok else "FAIL", detail), flush=True)


def spawn(sock, **env_over):
    env = dict(os.environ)
    for k in ("YS_LOOKD_IDLE_SEC", "YS_LOOKD_IDLE_EXIT_SEC",
              "YS_LOOKD_ACCEPT_TICK", "YS_LOOKD_TEST_HOOKS"):
        env.pop(k, None)
    env.update({
        "YS_LOOKD_SOCK": sock,
        "YS_LOOKD_IDLE_SEC": "0",          # 本测试只验"退出"这一段
        "YS_LOOKD_ACCEPT_TICK": "0.3",     # 秒级判据需要更密的 tick
        "YS_LOOKD_IDLE_EXIT_SEC": "3",
        "YS_LOOKD_TEST_HOOKS": "1",        # 开 _sleep 钩子（T3 用）
    })
    env.update({k: str(v) for k, v in env_over.items()})
    proc = subprocess.Popen([sys.executable, LOOKD], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(400):
        if os.path.exists(sock):
            return proc
        if proc.poll() is not None:
            out = proc.stdout.read() if proc.stdout else ""
            say("ENV", False, "守护没起来即退出 rc=%s\n%s" % (proc.returncode, out[-800:]))
            sys.exit(2)
        time.sleep(0.05)
    say("ENV", False, "socket 未在 20s 内出现：%s" % sock)
    proc.kill()
    sys.exit(2)


def call(sock, req, timeout=30.0):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    s.connect(sock)
    try:
        s.sendall((json.dumps(req) + "\n").encode())
        buf = b""
        while not buf.endswith(b"\n"):
            ch = s.recv(1 << 16)
            if not ch:
                break
            buf += ch
        return json.loads(buf.decode()) if buf.strip() else None
    finally:
        s.close()


def wait_exit(proc, limit):
    t0 = time.time()
    while time.time() - t0 < limit:
        if proc.poll() is not None:
            return time.time() - t0
        time.sleep(0.1)
    return None


def main():
    # ── T1/T2：空闲到点 → 退出（自有 socket 模式：退出时应清掉 socket 文件）
    sock1 = "/tmp/ys-lookd-idle-exit-t1-%d.sock" % os.getpid()
    for p in (sock1,):
        if os.path.exists(p):
            os.unlink(p)
    proc = spawn(sock1)
    r = call(sock1, {"cmd": "ping"})
    say("T0", bool(r and r.get("ok")), "调试实例可应答：%s" % (r or {}).get("pid"))
    t_idle = wait_exit(proc, 20)
    out = proc.stdout.read() if proc.stdout else ""
    say("T1", t_idle is not None and proc.returncode == 0,
        "闲置 %.1fs 后退出、退出码=%s（期望 ≤20s / rc=0）" % (t_idle or -1, proc.returncode))
    say("T1b", not os.path.exists(sock1),
        "自有 socket 退出后已清理（socket 文件 %s）"
        % ("仍在" if os.path.exists(sock1) else "已删"))
    hit = [ln for ln in out.splitlines() if "退出进程归还显存" in ln]
    say("T2", bool(hit) and "峰值" in (hit[0] if hit else ""),
        "退出原因出声：%s" % (hit[0][:160] if hit else "（无该行）"))

    # ── T3：在途请求不被抢占（阈值 3s，handler 睡 4s）
    sock3 = "/tmp/ys-lookd-idle-exit-t3-%d.sock" % os.getpid()
    if os.path.exists(sock3):
        os.unlink(sock3)
    proc = spawn(sock3)
    call(sock3, {"cmd": "ping"})          # 先确认 accept 循环已就绪，别把冷启动时间算进断言
    t0 = time.time()
    r = call(sock3, {"cmd": "_sleep", "ms": 4000}, timeout=20)
    dt = time.time() - t0
    alive_after = proc.poll() is None
    ok3 = bool(r and r.get("slept_ms") == 4000) and dt >= 3.8 and proc.returncode in (None, 0)
    say("T3", ok3,
        "阈值 3s 时 4s handler 仍拿完整回包 dt=%.2fs resp=%s 请求期间存活=%s"
        % (dt, (r or {}).get("slept_ms"), alive_after))
    t_exit = wait_exit(proc, 40)          # 40s：请求结束后还有 3s 阈值 + tick，机器忙时留足余量
    say("T3b", t_exit is not None, "在途请求结束后仍按闲置退出：%.1fs 后退出" % (t_exit or -1))
    try:
        proc.stdout.close()
    except Exception:
        pass

    # ── T4：阈值 0 = 关闭（同一时长内不许退出）
    sock4 = "/tmp/ys-lookd-idle-exit-t4-%d.sock" % os.getpid()
    if os.path.exists(sock4):
        os.unlink(sock4)
    proc = spawn(sock4, YS_LOOKD_IDLE_EXIT_SEC="0")
    call(sock4, {"cmd": "ping"})
    time.sleep(6)
    say("T4", proc.poll() is None, "YS_LOOKD_IDLE_EXIT_SEC=0 ⇒ 6s 后仍存活（rc=%s）" % proc.returncode)
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    fail = [t for t, ok, _ in results if not ok]
    print("IDLE-EXIT-SELFTEST verdict=%s pass=%d fail=%d"
          % ("PASS" if not fail else "FAIL", len(results) - len(fail), len(fail)), flush=True)
    for p in (sock1, sock3, sock4):
        if os.path.exists(p):
            os.unlink(p)
    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
