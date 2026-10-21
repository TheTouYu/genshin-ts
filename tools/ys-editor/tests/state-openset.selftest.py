#!/usr/bin/env python3
"""state-openset.selftest.py — 开集判据契约 v1 回归（P0：字段齐、旧键逐字不变、台账可复算）。

事故（2026-10-21 用户实测）：同一台仪器跑两张**陌生**画面——游戏启动界面判 `UNKNOWN`（诚实），
Firefox 整屏判 `PLAYTEST conf 0.5`（**自信地判错**）。用户否决「先判断是不是目标应用」，
要求**通用开集识别**：交匹配强度分布 + 显式拒答。判据层因此新增
`support / criteria / novel / novel_reason / accept_support`（接口契约 v1，旧键一个不改）。

本测试只喂**合成 readings**（不读帧、不碰屏幕、不注入），钉住七件事：
  T1 旧键逐字不变：state/confidence/ambiguous/margin/verdicts 与硬编码期望一致
  T2 support 形状：每态 {passed,total,ratio,ok,rule}；ratio==passed/total；ok==verdicts[态]；
     rule==RULE.get(态,"all")；四个返回分支（单候选/消歧/AMBIGUOUS/UNKNOWN）都带新键
  T3 criteria 台账：每条 {name,state,passed,value(str)}，按 state 分组可**逐条复算** support
  T4 novel 语义：UNKNOWN → True（无任何态判据=no_criteria / 有判据但不足=low_support）；
     判出去或 AMBIGUOUS → False + None
  T5 accept_support == 模块常量（改阈值必须让这里跟着改，防「阈值悄悄变了」）
  T8 两道门（P1）：关键证据类（有锚点类证据 ⇒ 至少一条锚点通过）与 any2 强度地板，
     match 里必须能逐条复核（candidate/critical_ok/ratio_pass/accepted）
  T6 边界：单条判据（<MIN_CRITERIA）不成立但 total/ratio 如实；非 STATES 前缀的 readings
     不进台账也不算判据
  T7 decide 是纯函数：不修改入参

退出码：0 全绿 / 1 有失败
"""
import copy
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
    return {"%s/c%d" % (prefix, i): {"value": "v%d" % i, "passed": passed, "kind": "ocr"}
            for i in range(n)}


NEW_KEYS = ("support", "criteria", "novel", "novel_reason", "accept_support")
OLD_KEYS = ("state", "confidence", "ambiguous", "margin", "verdicts")


def has_new_keys(res):
    return all(k in res for k in NEW_KEYS)


def main():
    M = load()
    world = rr("GAME_WORLD", 3, True)
    friends = rr("GAME_FRIENDS", 2, True)
    charac = rr("GAME_CHARACTER", 2, True)
    play = rr("PLAYTEST", 3, True)

    # T1 旧键不变（硬编码期望，不拿实现自己算自己）
    r1 = M.decide(dict(play))
    want1 = {"state": "PLAYTEST", "confidence": 1.0, "ambiguous": False, "margin": 1.0}
    got1 = {k: r1[k] for k in want1}
    say("T1", got1 == want1 and r1["verdicts"]["PLAYTEST"] is True,
        "全中 PLAYTEST → state/conf/margin=%s（期望 %s）" % (got1, want1))

    r1b = M.decide({**rr("MENU", 2, False)})
    say("T1b", (r1b["state"], r1b["confidence"], r1b["margin"]) == ("UNKNOWN", 0.0, 0.0)
        and r1b["verdicts"]["MENU"] is False,
        "全不中 → %s conf=%s margin=%s" % (r1b["state"], r1b["confidence"], r1b["margin"]))

    r1c = M.decide({**world, **friends, **charac})
    say("T1c", r1c["state"] == "AMBIGUOUS" and r1c["ambiguous"] is True
        and sorted(r1c["candidates"]) == ["GAME_CHARACTER", "GAME_FRIENDS", "GAME_WORLD"],
        "三态同立 → %s（不猜，candidates=%s）" % (r1c["state"], r1c.get("candidates")))

    # candidates 语义（Lead 定死）：只表示「同时成立的多个态」；UNKNOWN 下是显式 []，不是缺省/None
    r1d = M.decide(dict(play))
    r1e = M.decide({**rr("MENU", 2, False)})
    ok1d = (r1d["state"] == "PLAYTEST" and r1d.get("candidates") is None)
    ok1e = (r1e["state"] == "UNKNOWN" and "candidates" in r1e and r1e["candidates"] == [])
    say("T1d", ok1d and ok1e,
        "candidates: 判出去=%r（不出现）/ UNKNOWN=%r（显式空列表）" % (
            r1d.get("candidates"), r1e.get("candidates")))

    # T2 support 形状与旧键自洽（四个分支都要带新键）
    mixed = M.decide({**world, **friends, **play})
    ok2 = has_new_keys(mixed) and mixed["support"] and all(
        set(v) == {"passed", "total", "ratio", "ok", "rule"} for v in mixed["support"].values())
    for st, v in mixed["support"].items():
        ok2 = ok2 and isinstance(v["passed"], int) and isinstance(v["total"], int)
        ok2 = ok2 and v["total"] > 0 and abs(v["ratio"] - v["passed"] / v["total"]) < 1e-9
        ok2 = ok2 and isinstance(v["ok"], bool) and v["ok"] == bool(mixed["verdicts"][st])
        ok2 = ok2 and v["rule"] == M.RULE.get(st, "all")
    say("T2", ok2, "support 形状/ratio/ok/rule 自洽（判为 %s）" % mixed["state"])

    branches = [("单候选", M.decide(dict(play))), ("消歧", M.decide({**world, **friends})),
                ("AMBIGUOUS", r1c), ("UNKNOWN", M.decide({})), ("低支持", r1b)]
    miss = [n for n, res in branches if not has_new_keys(res)]
    say("T2b", not miss, "四个返回分支全带新键（缺: %s）" % (miss or "无"))

    mkeys = {"candidate", "ratio", "has_critical", "critical_ok", "ratio_pass",
             "accept_support", "accepted"}
    bad_m = [n for n, res in branches if set(res.get("match") or {}) != mkeys]
    say("T2c", not bad_m, "match 七键齐全（%s）" % (bad_m or "四个分支全齐"))

    # T3 criteria 台账可逐条复算 support
    ok3 = True
    detail3 = []
    for name, res in branches:
        sup, crit = res["support"], res["criteria"]
        for st, v in sup.items():
            got = [c for c in crit if c["state"] == st]
            good = (len(got) == v["total"]
                    and sum(1 for c in got if c["passed"]) == v["passed"])
            ok3 = ok3 and good
            if not good:
                detail3.append("%s/%s 台账%d≠%d/%d" % (name, st, len(got), v["passed"], v["total"]))
        for c in crit:
            ok3 = ok3 and (set(c) == {"name", "state", "passed", "value"}
                           and isinstance(c["value"], str) and c["state"] in M.STATES)
    say("T3", ok3, "criteria 可复算 support（%s）" % ("; ".join(detail3) or "无差异"))

    # T4 novel 语义
    unknown_none = M.decide({})
    unknown_geom = M.decide({"GEOM/frame 尺寸 2560x1440": {"value": "实际 1024x576", "passed": False,
                                                          "kind": "pixel"}})
    unknown_low = M.decide({**rr("PLAYTEST", 3, False)})
    ok4 = (unknown_none["novel"] is True and unknown_none["novel_reason"] == "no_criteria"
           and unknown_none["criteria"] == [] and unknown_none["support"] == {})
    ok4 = ok4 and (unknown_geom["novel"] is True and unknown_geom["novel_reason"] == "no_criteria")
    ok4 = ok4 and (unknown_low["novel"] is True and unknown_low["novel_reason"] == "low_support"
                   and unknown_low["criteria"])
    ok4 = ok4 and (r1["novel"] is False and r1["novel_reason"] is None)
    ok4 = ok4 and (r1c["novel"] is False and r1c["novel_reason"] is None)
    say("T4", ok4, "novel: 空=%s/几何=%s/全不中=%s/判出去=%s/AMBIGUOUS=%s" % (
        unknown_none["novel_reason"], unknown_geom["novel_reason"], unknown_low["novel_reason"],
        r1["novel_reason"], r1c["novel_reason"]))

    # T5 accept_support 与模块常量一致（阈值改动必须在测试里显式承认）
    ok5 = all(res["accept_support"] == M.ACCEPT_SUPPORT for _, res in branches)
    say("T5", ok5, "accept_support 各分支 = 模块常量 %.3f" % M.ACCEPT_SUPPORT)

    # T6 边界：单条判据 <MIN_CRITERIA 不成立，但 total/ratio 如实；非 STATES 前缀不入账
    r6 = M.decide({"PLAYTEST/only": {"value": "v", "passed": True, "kind": "ocr"}})
    v6 = r6["support"].get("PLAYTEST", {})
    ok6 = (v6.get("passed") == 1 and v6.get("total") == 1 and v6.get("ratio") == 1.0
           and v6.get("ok") is False and r6["state"] == "UNKNOWN"
           and [c["name"] for c in r6["criteria"]] == ["PLAYTEST/only"])
    r6b = M.decide({"FOO/bar": {"value": "v", "passed": True, "kind": "ocr"}})
    ok6 = ok6 and r6b["support"] == {} and r6b["criteria"] == [] \
        and r6b["novel_reason"] == "no_criteria"
    say("T6", ok6, "单条判据 ratio=%s ok=%s → %s；非 STATES 前缀被丢弃=%s" % (
        v6.get("ratio"), v6.get("ok"), r6["state"], r6b["support"] == {}))

    # T7 纯函数：不修改入参
    src = {**world, **play}
    before = copy.deepcopy(src)
    M.decide(src)
    say("T7", src == before, "decide 不修改入参（%d 条 readings）" % len(src))

    # T8 两道门：证据性质决定，与状态名无关
    def px(prefix, flags):
        return {"%s/px%d" % (prefix, i): {"value": "v", "passed": bool(f), "kind": "pixel"}
                for i, f in enumerate(flags)}

    def anc(prefix, flags):
        return {"%s/anchor a%d" % (prefix, i): {"value": "score=%.3f" % (0.95 if f else 0.42),
                                                "passed": bool(f), "kind": "anchor"}
                for i, f in enumerate(flags)}

    r8a = M.decide({**px("PLAYTEST", [1, 1, 0]), **anc("PLAYTEST", [0, 0])})
    ok8a = (r8a["state"] == "UNKNOWN" and r8a["novel"] is True
            and r8a["novel_reason"] == "no_critical_evidence"
            and r8a["match"]["candidate"] == "PLAYTEST"
            and r8a["match"]["critical_ok"] is False and r8a["match"]["accepted"] is False)
    say("T8a", ok8a, "锚点类证据全灭 ⇒ %s/%s（match=%s）" % (
        r8a["state"], r8a["novel_reason"], r8a["match"]))

    r8b = M.decide({**px("PLAYTEST", [1, 1, 0]), **anc("PLAYTEST", [1, 0])})
    ok8b = (r8b["state"] == "PLAYTEST" and r8b["match"]["critical_ok"] is True
            and r8b["match"]["ratio_pass"] is True and r8b["match"]["accepted"] is True
            and abs(r8b["match"]["ratio"] - 0.6) < 1e-9)
    say("T8b", ok8b, "锚点过一条 + 3/5=0.60 正好压地板 ⇒ %s" % r8b["state"])

    # 强度地板：锚点全过但总证据多、ratio 低（any2 只数够，地板补质量）
    many = {**px("PLAYTEST", [1, 1] + [0] * 6), **anc("PLAYTEST", [1, 1])}
    r8c = M.decide(many)
    ok8c = (r8c["state"] == "UNKNOWN" and r8c["novel_reason"] == "low_support"
            and r8c["match"]["critical_ok"] is True and r8c["match"]["ratio_pass"] is False
            and abs(r8c["match"]["ratio"] - 0.4) < 1e-9)
    say("T8c", ok8c, "锚点过但 ratio=%.2f<%.2f ⇒ %s/%s" % (
        r8c["match"]["ratio"], M.ACCEPT_SUPPORT, r8c["state"], r8c["novel_reason"]))

    r8d = M.decide(px("MENU", [1, 1]))
    ok8d = (r8d["state"] == "MENU" and r8d["match"]["has_critical"] is False
            and r8d["match"]["accepted"] is True)
    say("T8d", ok8d, "无锚点类证据的态不受门①影响（MENU 2/2 ⇒ %s）" % r8d["state"])

    r8e = M.decide(px("MENU", [1, 0]))
    ok8e = (r8e["state"] == "UNKNOWN" and r8e["novel_reason"] == "low_support")
    say("T8e", ok8e, "无锚点但判据不够（1/2）⇒ %s/%s" % (r8e["state"], r8e["novel_reason"]))

    fails = [r for r in results if not r[1]]
    print("STATE-OPENSET-SELFTEST verdict=%s pass=%d fail=%d" %
          ("PASS" if not fails else "FAIL", len(results) - len(fails), len(fails)), flush=True)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
