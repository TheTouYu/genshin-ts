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

    # ── 2026-10-23 .03/.04 采集零归还事故回归（槽式流程的空闲交还层） ──────────
    # 事故：采集任务从不 begin 会话，claim 对无会话 no-op ⇒ 警卫空闲交还层从未武装，
    # 归还只剩凭据过期（290s 粒度）一条粗路径，屏幕被游戏钉死 58 分钟。
    KITTY = json.dumps({"caption": "π - gui-test", "class": "kitty",
                        "internalId": "{11111111-2222-3333-4444-555555555555}"}, ensure_ascii=False)
    GAMEWIN = json.dumps({"caption": "原神", "class": "yuanshen.exe",
                          "internalId": "{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}"}, ensure_ascii=False)

    # T8 无会话 + --prev-json(用户窗) ⇒ 自动建立 auto-session（空闲交还层被武装）
    if os.path.exists(path):
        os.unlink(path)
    t0 = time.time()
    r = run(["claim", "--hold-seconds", "260", "--reason", "gui-slot",
             "--prev-json", KITTY], env)
    j = json.loads(r.stdout)
    s8 = read_sess(path) if os.path.exists(path) else {}
    ok = (j.get("auto_created") is True and s8.get("state") == "active"
          and (s8.get("prev_active") or {}).get("class") == "kitty"
          and s8.get("holding_until", 0) - t0 >= 258
          and float(s8.get("expires") or 0) > time.time() + 300
          and s8.get("idle_ms") == 10000)
    check("T8 无会话+prev ⇒ auto-session（state=active/prev=kitty/hold≈260s）", ok,
          f"auto={j.get('auto_created')} prev={(s8.get('prev_active') or {}).get('class')}")

    # T9 prev 是游戏类 ⇒ 归一为 None（ALREADY_FOCUSED 场景，交还回退 firefox）
    if os.path.exists(path):
        os.unlink(path)          # 必须从"无会话"起测 auto-create 路径（T8 留下的会话是 active）
    r = run(["claim", "--prev-json", GAMEWIN], env)
    s9 = read_sess(path) if os.path.exists(path) else {}
    ok = json.loads(r.stdout).get("auto_created") is True and s9.get("prev_active") is None
    check("T9 prev=游戏窗 ⇒ prev_active=None（交还回退 firefox）", ok)

    # T10 prev 空串 ⇒ 仍建 auto-session（prev=None）
    if os.path.exists(path):
        os.unlink(path)
    r = run(["claim", "--prev-json", ""], env)
    s10 = read_sess(path) if os.path.exists(path) else {}
    ok = (json.loads(r.stdout).get("auto_created") is True
          and s10.get("prev_active") is None and s10.get("state") == "active")
    check("T10 prev 空串 ⇒ auto-session 且 prev=None", ok)

    # T11 hold-done：解除 hold、空闲从槽结束时刻起算
    write_sess(path, released=False, holding_until=time.time() + 250,
               last_action_ts=time.time() - 250)
    t11 = time.time()
    r = run(["hold-done", "--reason", "slot-end"], env)
    s11 = read_sess(path)
    ok = (json.loads(r.stdout).get("hold_done") is True
          and s11.get("holding_until") == 0
          and float(s11.get("last_action_ts") or 0) >= t11)
    check("T11 hold-done ⇒ holding=0 且 last_action_ts=现在", ok,
          f"holding={s11.get('holding_until')}")

    # T12 hold-done 无会话安全 no-op
    if os.path.exists(path):
        os.unlink(path)
    r = run(["hold-done"], env)
    ok = r.returncode == 0 and json.loads(r.stdout).get("hold_done") is False
    check("T12 hold-done 无会话安全返回", ok)

    # T13 事故链主判据：auto-session + 槽结束(hold-done) + 空闲超阈值 + 画面在游戏
    #      ⇒ 警卫交还，且 --prev-json 带会话记录的用户窗（不再恒走 firefox 回退）
    hb = os.path.join(tmp, "fake-handback.sh")
    with open(hb, "w", encoding="utf-8") as f:
        f.write('#!/bin/bash\necho "$@" >> %s\necho \'{"ok": true}\'\n'
                % os.path.join(tmp, "handback-args.txt"))
    os.chmod(hb, 0o755)
    fake_lease = os.path.join(tmp, "fake-lease.sh")
    with open(fake_lease, "w", encoding="utf-8") as f:
        f.write('#!/bin/bash\ncase "$1" in kwin-state) echo \'{"ok": true, '
                '"active": {"class": "yuanshen.exe", "caption": "原神"}}\' ;; '
                'esac\n')
    os.chmod(fake_lease, 0o755)
    if os.path.exists(path):
        os.unlink(path)
    run(["claim", "--hold-seconds", "5", "--prev-json", KITTY], env)
    s = read_sess(path)
    s["last_action_ts"] = time.time() - 11          # 槽结束 11s 前就 hold-done 过
    s["holding_until"] = 0.0
    with open(path, "w", encoding="utf-8") as f:
        json.dump(s, f)
    genv = dict(os.environ, YS_SESSION_PATH=path, YS_HAND_BACK_BIN=hb,
                YS_LEASE_BIN=fake_lease,
                YS_FOCUS_GUARD_LOG=os.path.join(tmp, "guard.log"))
    # guard 模块在 import 时读环境变量（SESSION/LEASE_BIN/HAND_BACK_BIN），
    # fixture 必须**先写回 os.environ** 再加载模块——只放进 dict 会让 guard 读到
    # 真实 ~/.ys/session.json（实测：真会话 ended → 早退 rc=0，测试假红）。
    for _k in ("YS_SESSION_PATH", "YS_HAND_BACK_BIN", "YS_LEASE_BIN", "YS_FOCUS_GUARD_LOG"):
        os.environ[_k] = genv[_k]
    import importlib.util
    import importlib.machinery
    loader = importlib.machinery.SourceFileLoader(
        "ys_focus_guard_selftest", os.path.join(YS, "ys-focus-guard"))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    guard = importlib.util.module_from_spec(spec)
    loader.exec_module(guard)
    rc13 = guard.enforce_session_idle()
    args_file = os.path.join(tmp, "handback-args.txt")
    got_args = open(args_file, encoding="utf-8").read().strip() if os.path.exists(args_file) else ""
    s13 = read_sess(path)
    ok = (rc13 == 1 and "--prev-json" in got_args and "kitty" in got_args
          and s13.get("released") is True and s13.get("release_reason") == "idle")
    check("T13 警卫空闲交还 auto-session（带 --prev-json 用户窗）", ok,
          f"rc={rc13} args={got_args[:80]!r}")

    # T14 prev=None 的 auto-session ⇒ 交还不带 --prev-json（ys-hand-back 回退 firefox）
    if os.path.exists(args_file):
        os.unlink(args_file)
    if os.path.exists(path):
        os.unlink(path)
    run(["claim", "--prev-json", ""], env)          # ALREADY_FOCUSED 形态
    s = read_sess(path)
    s["last_action_ts"] = time.time() - 11
    s["holding_until"] = 0.0
    with open(path, "w", encoding="utf-8") as f:
        json.dump(s, f)
    rc14 = guard.enforce_session_idle()
    got14 = open(args_file, encoding="utf-8").read().strip() if os.path.exists(args_file) else ""
    ok = rc14 == 1 and "--prev-json" not in got14
    check("T14 prev=None ⇒ 交还不带 --prev-json（firefox 回退）", ok)

    # T15 holding 未到期 ⇒ 警卫不插手（槽运行中不被打断）
    if os.path.exists(args_file):
        os.unlink(args_file)
    write_sess(path, released=False, holding_until=time.time() + 30,
               last_action_ts=time.time() - 60)
    rc15 = guard.enforce_session_idle()
    ok = rc15 == 0 and not os.path.exists(args_file)
    check("T15 holding 未到期 ⇒ 警卫不插手", ok, f"rc={rc15}")

    # T16 槽工具接线：restore() 先 hold-done、claim 带 --prev-json（静态断言，同 T7 形态）
    ok = ("hold-done" in src_gs and "ys-session\" claim --hold-seconds \"$MAX\" --reason gui-slot --prev-json" in src_gs)
    check("T16 ys-gui-slot restore() 先 hold-done 且 claim 带 --prev-json", ok)

    npass = sum(1 for _n, ok, _i in rows if ok)
    total = len(rows)
    verdict = "PASS" if npass == total else "FAIL"
    print(f"SESSION-CLAIM-RESULT pass={npass} total={total} verdict={verdict}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
