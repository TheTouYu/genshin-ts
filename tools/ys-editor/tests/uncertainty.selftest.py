#!/usr/bin/env python3
"""uncertainty.selftest.py — 离线单测：`ys-screen.compute_uncertainty()`（不确定性规则唯一实现）。

为什么要有这个自测（2026-10-21 用户裁定）：
  AGI 的门槛不是"什么都能识别"，而是"知道自己的把握度"；而**「不适用」必须与「没有」可区分**。
  旧实现把三条规则内联在 find_containers 里、`hud_like` 当开关用 ⇒ 规则不适用时和规则跑了 0 命中时
  输出**完全一样**（都是 `uncertainty: []`）。本自测把这条钉死：
    · 每条规则要么在 `meta.applicable`（跑过，带 hits 条数），要么在 `meta.waived`（没跑，带 reason）；
    · `meta.applicable` 非空 ⇔ 至少有一个对象来源被真正评估过（全缺席 ⇒ UNCERTAINTY_SOURCE_MISMATCH）。

夹具（`fixtures/uncertainty/*.json`，**不是整帧**，离线、不碰屏幕）：
  1. `hud-startup-receipt-20261021.json` —— 游戏启动界面。原帧从未落盘，由录制回执反向构造输入；
     期望 = 那一天真机回的 **30 条（27 possible_false_positive + 3 possible_miss）**，逐条
     region/kind/score/reasons 必须复现（HUD 帧"没被弄坏"的唯一判据）。
  2. `game-login.json` —— 真派蒙菜单帧（GAME_PAIMON），期望 = 改造前 8 条 possible_miss 逐条不变。
  3. `foreign-ui.json` —— Firefox 我方 GUI 页整屏，期望 = 改造前 0 条；**新增** meta 必须说清
     "规则②不适用（富 UI）"，而不是静默 0。

用法：
  python3 tools/ys-editor/tests/uncertainty.selftest.py            # 只跑断言（快，不读帧）
  python3 tools/ys-editor/tests/uncertainty.selftest.py --regen     # 重新录制两张落盘帧的**输入**
                                                                    # （期望值不动；要改期望得 --bless）
退出码：0 PASS / 1 FAIL / 2 夹具缺失或环境错误。
"""
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FIX = os.path.join(HERE, "fixtures", "uncertainty")
FRAMES = os.path.join(HERE, "fixtures", "perception")
YS_SCREEN = os.path.join(REPO, "tools", "ys-screen")

RESULTS = []


def say(tag, ok, info=""):
    RESULTS.append((tag, bool(ok), info))
    print("%-4s %s  %s" % (tag, "PASS" if ok else "FAIL", info), flush=True)
    return ok


def load(name):
    p = os.path.join(FIX, name)
    if not os.path.isfile(p):
        print("UNCERTAINTY-RESULT error=FIXTURE_MISSING path=%s verdict=FAIL" % p)
        raise SystemExit(2)
    return json.load(open(p, encoding="utf-8"))


def load_ys_screen():
    """按需加载 `tools/ys-screen`（无扩展名脚本，与 ys_lookd 同一加载方式）。"""
    import importlib.machinery
    import importlib.util
    loader = importlib.machinery.SourceFileLoader("ys_screen_unc_selftest", YS_SCREEN)
    spec = importlib.util.spec_from_loader("ys_screen_unc_selftest", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def key(u):
    """条目身份：region/kind/score/reasons（hint 是可读文案，单独断言）。"""
    return (tuple(u.get("region") or ()), u.get("kind"), u.get("score"),
            tuple(u.get("reasons") or ()))


def run(M, fx):
    """对一张夹具跑纯函数，返回 (unc, meta)。"""
    return M.compute_uncertainty(
        fx.get("containers"), fx.get("free_glyphs"), fx.get("glyph_icons"), fx.get("dets"),
        fx["W"], fx["H"], hud_like=None, text_n=fx.get("text_n"), scroll_affordances=[])


# ─────────────────────────── 1) 录制回执三张夹具 ───────────────────────────
def check_fixture(M, fname, tag):
    fx = load(fname)
    unc, meta = run(M, fx)
    exp = fx["expected_uncertainty"]
    say("%s.a" % tag, len(unc) == len(exp),
        "%s: 条数 %d（期望 %d）" % (fname, len(unc), len(exp)))
    a = sorted(map(key, unc))
    b = sorted(map(key, exp))
    if a != b:
        for x, y in zip(a, b):
            if x != y:
                say("%s.b" % tag, False, "首条差异 实得=%r 期望=%r" % (x, y))
                break
        else:
            say("%s.b" % tag, False, "集合相同但长度不同")
    else:
        say("%s.b" % tag, True, "逐条 region/kind/score/reasons 与录制回执一致")
    e = fx.get("expected") or {}
    say("%s.c" % tag, meta["scene"] == e.get("scene"),
        "scene=%s（期望 %s）" % (meta["scene"], e.get("scene")))
    checks = [meta.get("applicable") == e["applicable"]] if "applicable" in e else [True]
    if "waived_rules" in e:
        checks.append([w["rule"] for w in meta["waived"]] == e["waived_rules"])
    say("%s.d" % tag, all(checks),
        "applicable=%s waived=%s" % (meta["applicable"],
                                     [(w["rule"], w["reason"]) for w in meta["waived"]]))
    if "counts" in e:
        got = {}
        for u in unc:
            got[u["kind"]] = got.get(u["kind"], 0) + 1
        say("%s.e" % tag, got == e["counts"], "kind 分布=%s（期望 %s）" % (got, e["counts"]))
    # 关键防线（用户令 2026-10-21）：applicable 非空 ⇔ 有来源被真正评估
    any_src = any(meta["sources"].values())
    say("%s.f" % tag, bool(meta["applicable"]) == bool(any_src),
        "applicable=%d 条 / 有来源=%s" % (len(meta["applicable"]), any_src))
    say("%s.g" % tag, meta["hint"].startswith("按 ") and "适用" in meta["hint"],
        "meta.hint=%s" % meta["hint"])
    return unc, meta


def check_hud_hint(M, fx):
    """HUD 帧的 hint 文案修复：旧实现写死 >340，实际阈值 200（事实错误，不是风格）。"""
    unc, _meta = run(M, fx)
    bad = [u["hint"] for u in unc if ">340" in (u.get("hint") or "")]
    ok = not bad and any(">%d" % int(M.UNCERTAIN_BG_EDGE_FULL) in (u.get("hint") or "")
                         for u in unc if u["kind"] == "possible_false_positive")
    say("HUD.h", ok, "possible_false_positive 的 hint 已写实际阈值（>340 残留 %d 条）" % len(bad))


# ─────────────────────────── 2) 语义单测（合成输入） ───────────────────────────
def check_semantics(M):
    # 2.1 场景分档（阈值两侧）
    cases = [((4, None), "ui"), ((0, 13), "hud"), ((0, 48), "hud"),
             ((0, 60), "ui"), ((0, 88), "ui"), ((0, None), "hud")]
    got = [(M.scene_of(r, text_n=t)[0], (r, t)) for (r, t), _e in cases]
    ok = all(g[0] == e for g, (_k, e) in zip(got, cases))
    say("S1", ok, "scene_of: %s" % ", ".join("%r→%s" % (k, g) for g, k in got))

    # 2.2 ambiguous_kind 覆盖**两个来源**（旧实现只遍历 containers ⇒ daemon 用 detections 时必然 0）
    cont = [{"bbox": [10, 10, 110, 60], "kind": "unknown"}]
    dets = [{"bbox": [300, 300, 420, 360], "kind": "unknown"},
            {"bbox": [500, 500, 560, 540], "kind": "button"}]
    unc, meta = M.compute_uncertainty(cont, [], [], dets, 2560, 1440, text_n=10)
    kinds = [u for u in unc if u["kind"] == "ambiguous_kind"]
    hints = " ".join(u["hint"] for u in kinds)
    say("S2", len(kinds) == 2 and "容器" in hints and "检测框" in hints,
        "ambiguous_kind=%d 条（容器 1 + 检测框 1；hint 标明来源=%s）"
        % (len(kinds), ("容器" in hints and "检测框" in hints)))

    # 2.3 检测后端：CV 两条规则必须进 waived（带原因），不是静默 0 条
    unc, meta = M.compute_uncertainty(None, None, None, dets, 2560, 1440, text_n=88)
    wr = {w["rule"]: w["reason"] for w in meta["waived"]}
    say("S3", meta["applicable"] == ["ambiguous_kind"]
        and wr.get("possible_miss") == "no_glyph_channel"
        and wr.get("possible_false_positive") == "no_glyph_channel",
        "检测后端: applicable=%s waived=%s" % (meta["applicable"], wr))
    say("S3.b", not meta["degraded"], "检测后端不算来源冲突（有 dets 来源）degraded=%s"
        % meta["degraded"])

    # 2.4 富 UI：规则② waive 但**不许吞命中**（会把本会命中的条数与区域摆出来）
    gi = [{"bbox": [1200, 700, 1260, 760]}]          # 中心远离四边 ⇒ HUD 判据下会命中
    unc_hud, meta_hud = M.compute_uncertainty([], [], gi, None, 2560, 1440, text_n=13)
    unc_ui, meta_ui = M.compute_uncertainty([], [], gi, None, 2560, 1440, text_n=88)
    w2 = next((w for w in meta_ui["waived"] if w["rule"] == "possible_false_positive"), {})
    say("S4", meta_hud["scene"] == "hud" and len(unc_hud) == 1
        and meta_ui["scene"] == "ui" and len(unc_ui) == 0
        and w2.get("reason") == "scene_ui" and w2.get("suppressed_hits") == 1,
        "同一条命中：hud 输出 1 条 / ui 进 waived（suppressed_hits=%r）"
        % w2.get("suppressed_hits"))

    # 2.5 全来源缺席 ⇒ 明确报"无从判断"，不许冒充"没有可疑处"
    unc, meta = M.compute_uncertainty(None, None, None, None, 2560, 1440)
    codes = [d["code"] for d in meta["degraded"]]
    say("S5", not meta["applicable"] and "UNCERTAINTY_SOURCE_MISMATCH" in codes,
        "全缺席: applicable=%s degraded=%s" % (meta["applicable"], codes))

    # 2.6 无 dets 时**不误报** SOURCE_MISMATCH（那是"没有第二个来源"，不是"两个来源冲突"）
    cont = [{"bbox": [0, 0, 400, 300], "kind": "panel"}]
    unc, meta = M.compute_uncertainty(cont, [], [], None, 2560, 1440, text_n=10)
    say("S6", not meta["degraded"], "CV-only: degraded=%s（不应有 SOURCE_MISMATCH）"
        % meta["degraded"])

    # 2.7 覆盖声明：有检测框、CV 对象 0 个 ⇒ covered=False；无 dets ⇒ 不报
    meta = {"applicable": ["possible_miss"]}
    c_none = M.uncertainty_coverage(meta, [], [])
    c_ok = M.uncertainty_coverage(meta, [{"bbox": [0, 0, 9, 9]}], [{"bbox": [0, 0, 9, 9]}])
    c_bad = M.uncertainty_coverage(meta, [], [{"bbox": [0, 0, 9, 9]}])
    say("S7", c_none["code"] is None and c_ok["code"] is None
        and c_bad["code"] == "UNCERTAINTY_SOURCE_MISMATCH" and c_bad["covered"] is False,
        "coverage: 无dets=%s / 两源都有=%s / 仅dets=%s"
        % (c_none["code"], c_ok["code"], c_bad["code"]))
    # 检测框**永远**不在本层 uncertainty 的覆盖里（哪怕 CV 容器有 1 个）——只说真话，不冒充
    say("S7.b", c_ok["detections_covered"] is False and c_none["detections_covered"] is None
        and "检测框" in c_ok["detail"],
        "detections_covered: 有dets=%r 无dets=%r" % (c_ok["detections_covered"],
                                                    c_none["detections_covered"]))

    # 2.8 滚动指示器后处理（从"假阳性"剔出，并补正向条目）
    fp = [{"bbox": [1200, 700, 1260, 760]}]           # 中心 (1230,730)，落进 scroll 区
    scroll = [{"bbox": [1210, 690, 80, 160]}]
    unc, meta = M.compute_uncertainty([], [], fp, None, 2560, 1440, text_n=13,
                                      scroll_affordances=scroll)
    kinds = [u["kind"] for u in unc]
    say("S8", kinds == ["scroll_affordance"] and meta["post"]["fp_removed_in_scroll"] == 1,
        "滚动条: kinds=%s fp_removed=%d" % (kinds, meta["post"]["fp_removed_in_scroll"]))

    # 2.9 纯函数：不改输入（daemon 会复用同一批 dict，改脏了会污染缓存）
    cont = [{"bbox": [0, 0, 400, 300], "kind": "unknown", "skin": {"rect": 0.9}}]
    fg = [{"bbox": [900, 700, 960, 750], "contrast": 80.0}]
    gi = [{"bbox": [1200, 700, 1260, 760]}]
    dets = [{"bbox": [10, 10, 60, 60], "kind": "unknown"}]
    snap = copy.deepcopy([cont, fg, gi, dets])
    M.compute_uncertainty(cont, fg, gi, dets, 2560, 1440, text_n=88,
                          scroll_affordances=[{"bbox": [1200, 690, 80, 160]}])
    say("S9", [cont, fg, gi, dets] == snap, "compute_uncertainty 未修改入参（纯函数）")


# ─────────────────────────── 3) --regen：只刷新输入 ───────────────────────────
def regen(M):
    """重新录制两张**落盘帧**的输入（期望值不动；要改期望必须再加 --bless）。"""
    bless = "--bless" in sys.argv
    pairs = [("game-login.json", "game-paimon-2560x1440.png"),
             ("foreign-ui.json", "foreign-ui-2560x1440.png")]
    for fname, png in pairs:
        path = os.path.join(FRAMES, png)
        if not os.path.isfile(path):
            print("REGEN skip %s（缺帧 %s）" % (fname, path))
            continue
        r = M.analyze(path, containers_only=True, use_cache=False)
        fx = load(fname)
        fx["containers"] = r["containers"]
        fx["free_glyphs"] = r["free_glyphs"]
        fx["glyph_icons"] = r["glyph_icons"]
        fx["dets"] = None
        if bless:
            fx["expected_uncertainty"] = r["uncertainty"]
            print("REGEN **bless** %s：期望值已被当前实现覆盖（慎用）" % fname)
        with open(os.path.join(FIX, fname), "w", encoding="utf-8") as f:
            json.dump(fx, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("REGEN %s ok（containers=%d free_glyphs=%d glyph_icons=%d）"
              % (fname, len(fx["containers"]), len(fx["free_glyphs"]), len(fx["glyph_icons"])))


def main():
    M = load_ys_screen()
    if "--regen" in sys.argv:
        regen(M)
    check_fixture(M, "hud-startup-receipt-20261021.json", "HUD")
    check_hud_hint(M, load("hud-startup-receipt-20261021.json"))
    check_fixture(M, "game-login.json", "PAIMON")
    check_fixture(M, "foreign-ui.json", "FIREFOX")
    check_semantics(M)
    fails = [r for r in RESULTS if not r[1]]
    print("UNCERTAINTY-RESULT checks=%d pass=%d fail=%d verdict=%s"
          % (len(RESULTS), len(RESULTS) - len(fails), len(fails),
             "PASS" if not fails else "FAIL"), flush=True)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
