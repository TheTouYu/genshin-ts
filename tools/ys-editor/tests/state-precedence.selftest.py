#!/usr/bin/env python3
"""state-precedence.selftest.py — 面板态压过世界态的消歧回归（F-20261021-STATE-VOCAB）。

事故：站在派蒙菜单的**好友面板**里，`ys-state` / `ys-lookd world` 都报 `GAME_WORLD`。
原因不是判据错，而是**两个态同时成立**：面板满足 GAME_WORLD 的三条（右下 UID 行 +
底部数字 + 左面板无「冒险等阶」），于是 decide() 只能报 AMBIGUOUS，而 daemon 的
`_apply_world_uid` 又把 UNKNOWN/PLAYTEST 兜底成 GAME_WORLD ⇒ 外部看到的就是 GAME_WORLD。
修法：给「具体度」一条明确排序（PRECEDENCE），面板态压过容器态；并列仍报 AMBIGUOUS（不猜）。

本测试不打 OCR、不碰屏幕，只喂**合成 readings** 验证投票与消歧逻辑：
  T1 世界三条成立 + 好友两条成立 → GAME_FRIENDS（resolved_by=precedence）
  T2 只有世界成立 → GAME_WORLD
  T3 好友态只中一条（<MIN_CRITERIA）→ 不成立，仍 GAME_WORLD
  T4 两个同具体度都成立（好友 + 角色）→ AMBIGUOUS（不猜）
  T5 STATES 含新态名（否则 readings 会被 decide 直接丢弃）

退出码：0 全绿 / 1 有失败
"""
import importlib.machinery
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(os.path.dirname(HERE), "ys-state")
results = []


def say(tag, ok, detail):
    results.append((tag, ok, detail))
    print("%-3s %-4s %s" % (tag, "PASS" if ok else "FAIL", detail), flush=True)


def load():
    loader = importlib.machinery.SourceFileLoader("ys_state_mod", STATE)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def rr(prefix, n, passed=True):
    return {"%s/%d" % (prefix, i): {"value": "x", "passed": passed, "kind": "ocr"} for i in range(n)}


def main():
    M = load()
    world = rr("GAME_WORLD", 3, True)
    friends = rr("GAME_FRIENDS", 2, True)
    charac = rr("GAME_CHARACTER", 2, True)

    r1 = M.decide({**world, **friends})
    say("T1", r1["state"] == "GAME_FRIENDS" and r1.get("resolved_by") == "precedence",
        "世界+好友同立 → %s（resolved_by=%s）" % (r1["state"], r1.get("resolved_by")))

    r2 = M.decide(dict(world))
    say("T2", r2["state"] == "GAME_WORLD", "只有世界 → %s" % r2["state"])

    r3 = M.decide({**world, **rr("GAME_FRIENDS", 1, True), **rr("GAME_FRIENDS", 1, False)})
    say("T3", r3["state"] == "GAME_WORLD", "好友只中 1 条（<MIN_CRITERIA）→ %s" % r3["state"])

    r4 = M.decide({**world, **friends, **charac})
    say("T4", r4["state"] == "AMBIGUOUS", "好友+角色同立 → %s（须不猜）" % r4["state"])

    ok5 = "GAME_FRIENDS" in M.STATES and "GAME_CHARACTER" in M.STATES
    say("T5", ok5, "STATES 含 GAME_FRIENDS/GAME_CHARACTER = %s" % ok5)

    fails = [r for r in results if not r[1]]
    print("STATE-PRECEDENCE-SELFTEST verdict=%s pass=%d fail=%d" %
          ("PASS" if not fails else "FAIL", len(results) - len(fails), len(fails)), flush=True)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
