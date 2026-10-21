#!/usr/bin/env python3
"""session-claim.selftest.py — 「抬窗必须登记所有权」回归（用户 2026-10-21 实测事故）。

事故（D485）：`ys-session begin` 后 3 秒警卫按空闲交还（released=True），
代理随后**手工**跑 `ys-follow-win` 把桌面切到游戏——这条路径不经过会话，
`released` 仍为 True；而 `ys-focus-guard.enforce_session_idle()` 开头是
`if s.get("released"): return 0` ⇒ **没有任何角色负责把屏幕收回**，
画面一直停在游戏上，直到用户自己切回。

判据（全部离线，用 YS_SESSION_PATH 指向临时文件，不碰屏幕）：
  T1 无会话时 claim 安全返回 claimed=False（手工抬窗不该报错）
  T2 released=True 的会话 → claim 后 released=False、reacquires+1、holding_until 前移
  T3 claim 幂等（连调两次不炸，reacquires 递增，可追溯 was_released）
  T4 --hold-seconds 生效（槽位占用期间警卫不插手）
  T5 过期会话不认领（claimed=False，别让过期会话"复活"）
  T6 status 暴露 orphan 读数（released + 孤儿屏时有 next_action）
  T7 两条抬窗路径都接了 claim（静态断言：follow-win / ys-gui-slot 源码里出现 claim）

机读行：SESSION-CLAIM-RESULT pass=N total=M verdict=PASS|FAIL
退出码：0 PASS / 1 FAIL
"""
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.abspath(os.path.join(HERE, ".."))
SESSION = os.path.join(YS, "ys-session")

rows = []


def check(name, ok, info=""):
    rows.append((name, ok, info))
    print(("[PASS]" if ok else "[FAIL]") + " " + name + ("  " + info if info else ""))


def run(args, env):
    return subprocess.run([sys.executable, SESSION] + args, capture_output=True,
                          text=True, timeout=30, env=env)


def write_sess(path, **kw):
    now = time.time()
    d = {"schema": "ys.session/2", "session_id": "s-selftest", "created": now,
         "expires": kw.pop("expires", now + 300), "seconds": 300,
         "state": "active", "dry_run": False, "released": True, "released_at": now - 5,
         "idle_ms": 3000, "reacquires": 0, "actions": 0,
         "target": {"caption": "原神", "class": "yuanshen.exe"}}
    d.update(kw)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f)


def read_sess(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    tmp = tempfile.mkdtemp(prefix="ys-claim-selftest-")
    path = os.path.join(tmp, "session.json")
    env = dict(os.environ, YS_SESSION_PATH=path)

    # T1 无会话
    if os.path.exists(path):
        os.unlink(path)
    r = run(["claim"], env)
    ok = r.returncode == 0 and json.loads(r.stdout).get("claimed") is False
    check("T1 无会话 claim 安全返回 claimed=False", ok, f"rc={r.returncode}")

    # T2 released=True → 认领
    write_sess(path)
    before = read_sess(path)
    r = run(["claim", "--reason", "selftest"], env)
    j = json.loads(r.stdout)
    after = read_sess(path)
    ok = (j.get("claimed") is True and after.get("released") is False
          and after.get("reacquires") == before.get("reacquires") + 1
          and after.get("holding_until", 0) > before.get("holding_until", 0))
    check("T2 claim 复位 released 闩锁并刷新持有窗口", ok,
          f"was_released={j.get('was_released')} reacquires={after.get('reacquires')}")

    # T3 幂等
    r2 = run(["claim"], env)
    after2 = read_sess(path)
    ok = (r2.returncode == 0 and json.loads(r2.stdout).get("claimed") is True
          and after2.get("reacquires") == after.get("reacquires") + 1
          and json.loads(r2.stdout).get("was_released") is False)
    check("T3 重复 claim 幂等且可追溯 was_released", ok,
          f"reacquires={after2.get('reacquires')}")

    # T4 --hold-seconds
    write_sess(path, released=False)
    t0 = time.time()
    r = run(["claim", "--hold-seconds", "12"], env)
    after4 = read_sess(path)
    ok = (json.loads(r.stdout).get("claimed") is True
          and after4.get("holding_until", 0) - t0 >= 11.0)
    check("T4 --hold-seconds 生效（槽位占用期间警卫不插手）", ok,
          f"hold={round(after4.get('holding_until', 0) - t0, 1)}s")

    # T5 过期会话不复活
    write_sess(path, expires=time.time() - 10)
    r = run(["claim"], env)
    j = json.loads(r.stdout)
    ok = j.get("claimed") is False and j.get("reason") == "NO_ACTIVE_SESSION"
    check("T5 过期会话不认领（不复活）", ok, f"reason={j.get('reason')}")

    # T6 status 暴露 orphan
    write_sess(path, released=True, orphan_since=time.time() - 30, orphan_active="yuanshen.exe")
    r = run(["status"], env)
    d = json.loads(r.stdout)
    orph = d.get("orphan") or {}
    ok = (orph.get("on_game") is True and (orph.get("seconds") or 0) >= 29
          and bool(orph.get("next_action")))
    check("T6 status 暴露孤儿屏读数 + next_action", ok,
          f"seconds={orph.get('seconds')}")

    # T7 两条抬窗路径都接了 claim
    src_fw = open(os.path.join(YS, "ys-follow-win"), encoding="utf-8").read()
    src_gs = open(os.path.join(YS, "ys-gui-slot"), encoding="utf-8").read()
    ok = ('"claim"' in src_fw and "claim --hold-seconds" in src_gs)
    check("T7 follow-win / ys-gui-slot 抬窗后都登记所有权", ok)

    npass = sum(1 for _n, ok, _i in rows if ok)
    total = len(rows)
    verdict = "PASS" if npass == total else "FAIL"
    print(f"SESSION-CLAIM-RESULT pass={npass} total={total} verdict={verdict}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
