#!/usr/bin/env python3
"""handback-noop.selftest.py — 「目标已是活动窗 ⇒ 零窗口操作」离线判据（F-20261021-55）。

症状：归还/交还时对**已经是活动窗**的 firefox 再做一次 activate+raise —— 画面看不出变化，
      但用户听到多余的操作提示音（「说完成了却还有声音」）。
根因：判定"目标已是活动窗"时把 KWin 记录当 dict 读 `aw['index']`，而记录字段是 `i`；
      用 `w.get('id')` 匹配 internalId ⇒ 判定恒为假 ⇒ 每次都多一次 activate/raise。

判据（离线、零屏幕操作）：
  用 `YS_KWIN_JS_FIXTURE` 喂一份"firefox 已是活动窗且堆叠在游戏之上"的 KWin 权威状态，
  跑 `ys-lease release --force`，断言：
    ① rc=0；② 回执 attempts==0 且 noop 为真；③ `YS_RAISE_LOG` 一行都没有（真的没碰窗口）；
    ④ 租约文件已清除。
  两种租约都要过：noop（prev_is_target）与旧格式 prev==game。

为什么必须离线：这条判据的失败形态就是"多碰一次窗口"，真机验证等于先把用户的屏幕动一次。

环境：YS_LEASE_TOOL（默认 ../ys-lease，注入用例指副本）、YS_LEASE（租约文件路径）
退出码：0 PASS / 1 FAIL
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.dirname(HERE)
LEASE_TOOL = os.environ.get("YS_LEASE_TOOL") or os.path.join(YS, "ys-lease")

FF_ID = "ff-internal-id"
GAME_ID = "game-internal-id"


def kwin_state():
    """KWin 权威通道的真实形状（_PROBE_BODY 的 JSON：wins 里键是 i/id/c/cls）。

    firefox 已是活动窗，且堆叠序（i）高于游戏 —— 正是「不该再 raise」的那一帧。
    """
    return {
        "active": FF_ID,
        "desktop": 2,
        "wins": [
            {"i": 7, "id": GAME_ID, "pid": 111, "c": "原神", "cls": "yuanshen.exe",
             "x": 0, "y": 0, "w": 1707, "h": 960, "min": 0, "active": 0},
            {"i": 8, "id": FF_ID, "pid": 222, "c": "DeepSeek Harness", "cls": "firefox",
             "x": 21, "y": 13, "w": 1663, "h": 889, "min": 0, "active": 1},
        ],
    }


def main():
    tmp = tempfile.mkdtemp(prefix="handback-noop-")
    lease = os.path.join(tmp, "lease.json")
    raise_log = os.path.join(tmp, "raises.txt")
    fixture = os.path.join(tmp, "kwin.json")
    st = kwin_state()
    with open(fixture, "w", encoding="utf-8") as fh:
        json.dump({"probe": st, "raise": st}, fh)

    env = {**os.environ, "YS_LEASE": lease, "YS_KWIN_JS_FIXTURE": fixture,
           "YS_RAISE_LOG": raise_log}

    fails = 0
    n = 0

    def check(name, cond, detail=""):
        nonlocal fails, n
        n += 1
        if not cond:
            fails += 1
        print("%-4s %s%s" % ("PASS" if cond else "FAIL", name,
                             "" if cond else "  ← " + str(detail)[:160]), flush=True)

    def run_case(label, lease_obj):
        if os.path.exists(raise_log):
            os.unlink(raise_log)
        with open(lease, "w", encoding="utf-8") as fh:
            json.dump(lease_obj, fh)
        p = subprocess.run([LEASE_TOOL, "release", "--force"],
                           capture_output=True, text=True, timeout=60, env=env)
        out = (p.stdout or "").strip().splitlines()
        try:
            d = json.loads(out[-1]) if out else {}
        except Exception:                                  # noqa: BLE001
            d = {}
        raises = 0
        if os.path.exists(raise_log):
            raises = sum(1 for _ in open(raise_log, encoding="utf-8"))
        check("%s: release rc=0" % label, p.returncode == 0,
              "rc=%s err=%s" % (p.returncode, (p.stderr or "")[:120]))
        check("%s: attempts==0（零窗口操作）" % label, d.get("attempts") == 0,
              "attempts=%r out=%s" % (d.get("attempts"), out[-1][:160] if out else ""))
        check("%s: 真的没 raise（YS_RAISE_LOG 空）" % label, raises == 0, "raises=%d" % raises)
        check("%s: 归还目标=firefox" % label,
              ((d.get("restored_info") or {}).get("class") or "") == "firefox",
              "restored_info=%r" % (d.get("restored_info"),))
        check("%s: 租约已清除" % label, not os.path.exists(lease))

    run_case("noop", {"noop": True, "prev_is_target": True, "acquired_at": 3000,
                      "owner_pid": 999999, "expires": 0, "prev": None, "win": GAME_ID})
    run_case("prev==game", {"prev": {"internalId": GAME_ID, "class": "yuanshen.exe",
                                     "caption": "原神", "usable": True},
                            "acquired_at": 4000, "owner_pid": 999999, "expires": 0,
                            "win": GAME_ID})

    verdict = "PASS" if fails == 0 else "FAIL"
    print("HANDBACK-NOOP-RESULT pass=%d fail=%d verdict=%s" % (n - fails, fails, verdict))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
