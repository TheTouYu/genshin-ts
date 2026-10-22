#!/usr/bin/env python3
"""perception-contract.selftest.py — GUI 世界状态感知层 v1 契约门禁（AGI 化改造的验收判据）。

**为什么需要它**（2026-10-21 22:15 D487 事故，本门禁的全部由来）：
同一台仪器（`worldsvc look --backend daemon-world`）、同一个 profile，跑两张陌生画面：

  · 游戏启动界面 → `UNKNOWN` conf 0.25（诚实，degraded 里带 STATE_UNKNOWN）
  · Firefox 整屏 → **`PLAYTEST` conf 0.5（自信地判错）**，而 degraded 里**反而没有** STATE_UNKNOWN
    —— 旧 `worldsvc.py:531-548` 只在 `state_name == "UNKNOWN"` 时才加这条告警。
    **判错会洗白自检：误判越自信，防护越少。**

四条根因（已落到可机检的判据上）：
  1. 判据封闭 + "最像者胜"（`ys-state:684` any2 多数即成立）        ⇒ S3 开集识别
  2. daemon 分支把逐条判据丢掉，只剩 `readings_n`                  ⇒ S2 证据透传
  3. 不确定性带"画面类型"前提（`ys-screen:1450/1519` 富 UI 永不触发）⇒ S4 waived/applicable
  4. 预算判定用**本次调用耗时** ⇒ 同帧冷/热降级项不同                ⇒ S1 + S6

判据
  S1 预算不是观测缺陷：`degraded` 不得含 `BUDGET_EXCEEDED`；`timing_ms.budget{total_ms,budget_ms,exceeded}`
     必须存在，且 `exceeded ⇔ total_ms > budget_ms`（**告警不删，只搬家**——门禁要能区分这两者）
  S2 判定证据透传：`state.evidence[0]` 含非空 `readings`（逐条 `{name,passed,value}`）/`verdicts`/`support`/`criteria`
  S3 开集识别：`foreign-ui` 必须 `state.name == "UNKNOWN"` + `state.novel is True`（bool，不是 None）+
     `match.novel_reason == "no_critical_evidence"` + `state.candidates == []`（**显式空列表**：该字段只表示
     「同时成立的多个态」）+ `match.candidate == "PLAYTEST"` + `match.accepted is False` + `match.critical_ok is False`；
     `degraded` 的 `STATE_UNKNOWN`/`STATE_LOW_SUPPORT` 必须与 `novel`/`low_support` **一致**（而不是无条件要求出现）
  S4 不确定性可解释：`uncertainty_meta{applicable,waived,scene,source}` + `uncertainty_source ∈ {containers,detections}`；
     `foreign-ui`（富 UI 零不确定）的 `waived` 必须非空；每条 waived 带 `{rule,reason}`
  S5 老画面不回归：`fixtures/screen/` 的 4 张既有帧状态必须与 `baseline.json.legacy_fixtures` 一致；
     同时核对夹具 sha256（夹具被换过要报，不许静默换成"新基线"）
  S6 降级项是帧的纯函数：冷跑（`--no-cache`）/热跑（走客户端缓存）`sorted(degraded)` 必须相同；
     离线帧与 live 帧的差异**只允许** `FRAME_PINNED` / `STALE_FRAME`（live 半边需 `--live-json`，默认 SKIP）
     ⚠️ `--live-json` 必须是**同一代码版本**、且画面内容**可比**（同一应用同一界面）的回执；
        拿旧版本回执或别种画面来 diff，差异里会混进 STATE_UNKNOWN/STATE_EVIDENCE_LEGACY 等
        内容性降级项，那不是"帧来源差异"。

纪律：**全离线**。不抓屏、不抬窗、不注入、不产生新帧。夹具缺失 ⇒ `error=FIXTURE_MISSING` + rc=2。

用法:
  python3 tools/ys-editor/tests/perception-contract.selftest.py
  python3 tools/ys-editor/tests/perception-contract.selftest.py --live-json /tmp/look_live.json
退出码: 0 全 PASS / 1 有 FAIL / 2 环境或夹具缺失
机读行: PERCEPTION-CONTRACT-RESULT rc=… pass=N total=M skip=K fail=… verdict=…
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
# 生产路径；`YS_PERCEPTION_WORLDSVC` 只给注入用例用（指向**同目录副本**，绝不碰生产文件）。
# 副本必须放同一层目录：worldsvc 靠 `import schema/instruments` + `from cache import FrameCache`
# （Python 会把脚本所在目录放进 sys.path）。
WORLDSVC = (os.environ.get("YS_PERCEPTION_WORLDSVC")
            or os.path.join(ROOT, ".scratch", "gui-service", "worldsvc.py"))
FIX = os.path.join(HERE, "fixtures", "perception")
BASELINE = os.path.join(FIX, "baseline.json")
LEGACY_DIR = os.path.join(HERE, "fixtures", "screen")

# 两张语料帧：一张**非本应用**的富 UI，一张**已知状态**的游戏帧
FRAMES = [("foreign-ui", os.path.join(FIX, "foreign-ui-2560x1440.png")),
          ("game-paimon", os.path.join(FIX, "game-paimon-2560x1440.png"))]

# ── 契约 v1 字面（Lead 2026-10-21 锁定；改这里 = 改契约，须 Lead 裁决）──
# 2026-10-21 Lead 最终版：**撤回** best/best_ratio/second/second_ratio/margin 五个排序键——
# `support` 表已含每态 passed/total/ratio/rule，下游可自算；两处各排一次 = 第二个真相源
# （本轮三个 bug：顶层 vs match 双写 / accept_support 类型 / best 排序，全是这个形态）。
MATCH_KEYS = ("candidate", "ratio", "has_critical", "critical_ok", "ratio_pass",
              "accept_support", "accepted",
              "novel", "novel_reason", "level",
              "support", "support_ratio", "support_source", "criteria_n")
EVIDENCE_KEYS = ("readings", "verdicts", "support", "criteria")
BUDGET_KEYS = ("total_ms", "budget_ms", "exceeded")
UNCERTAINTY_META_KEYS = ("applicable", "waived", "scene", "source")
UNCERTAINTY_SOURCES = ("containers", "detections")
LIVE_ONLY_CODES = ("FRAME_PINNED", "STALE_FRAME")


# ── 工具 ─────────────────────────────────────────────────────────────────
def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


_ADVICE_DIR = None


def _env():
    """每次 look 都用**同一个**临时 advice 状态目录（不泄漏 mkdtemp，也不污染用户状态）。"""
    global _ADVICE_DIR
    if _ADVICE_DIR is None:
        _ADVICE_DIR = tempfile.mkdtemp(prefix="pc-advice-")
    env = dict(os.environ)
    env["YS_ADVICE_STATE_PATH"] = os.path.join(_ADVICE_DIR, "state.json")
    return env


def run_look(frame, *, no_cache, timeout=120):
    """跑一次 look，返回 (rc, receipt|None, err_tail)。

    no_cache=True → 冷跑（绕开客户端缓存）；False → 热跑（**走缓存路径**，
    这条路径曾因缓存里存着 v0 回执而抛 `SchemaError: 应为 gui-world-state/1`，必须被门禁看见）。
    """
    fd, out = tempfile.mkstemp(prefix="pc-", suffix=".json")
    os.close(fd)
    cmd = [sys.executable, WORLDSVC, "look", "--backend", "daemon-world",
           "--frame", frame, "--json-out", out]
    if no_cache:
        cmd.append("--no-cache")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=_env())
    except Exception as exc:                                   # noqa: BLE001
        return 2, None, "SPAWN_%s: %s" % (type(exc).__name__, exc)
    rc, err = r.returncode, (r.stderr or "").strip()
    rec = None
    if rc == 0 and os.path.isfile(out):
        try:
            rec = json.load(open(out, encoding="utf-8"))
        except Exception as exc:                               # noqa: BLE001
            err = "BAD_JSON: %s" % exc
    try:
        os.unlink(out)
    except OSError:
        pass
    return rc, rec, err[-500:]


def codes(rec):
    return sorted({str(d.get("code")) for d in (rec.get("degraded") or [])
                   if isinstance(d, dict) and d.get("code")})


def budget_block(rec):
    t = rec.get("timing_ms")
    if isinstance(t, dict) and isinstance(t.get("budget"), dict):
        return t["budget"]
    return None


def state_of(rec):
    st = rec.get("state")
    return st if isinstance(st, dict) else {}


def match_of(rec):
    mt = state_of(rec).get("match")
    return mt if isinstance(mt, dict) else {}


def codes_str(cs):
    return ",".join(cs) if cs else "-"


# ── 判据 ─────────────────────────────────────────────────────────────────
def s1_budget_not_defect(ctx):
    """degraded 说"这一帧的观测缺陷"；耗时是性能读数，必须分开且**不许消失**。"""
    bad = []
    for name, pair in ctx["frames"].items():
        rec = pair["cold"]
        if rec is None:
            bad.append("%s:冷跑无回执" % name)
            continue
        cs = codes(rec)
        if "BUDGET_EXCEEDED" in cs:
            bad.append("%s:degraded 仍含 BUDGET_EXCEEDED（耗时被当成画面缺陷）" % name)
        bud = budget_block(rec)
        if bud is None:
            bad.append("%s:缺 timing_ms.budget（告警不是搬家而是丢了）" % name)
            continue
        miss = [k for k in BUDGET_KEYS if k not in bud]
        if miss:
            bad.append("%s:timing_ms.budget 缺 %s" % (name, ",".join(miss)))
            continue
        try:
            over = float(bud["total_ms"]) > float(bud["budget_ms"])
        except (TypeError, ValueError):
            bad.append("%s:timing_ms.budget 的 total_ms/budget_ms 不是数字" % name)
            continue
        if bool(bud["exceeded"]) != over:
            bad.append("%s:budget.exceeded=%r 与 total_ms(%s)>budget_ms(%s) 不自洽"
                       % (name, bud["exceeded"], bud["total_ms"], bud["budget_ms"]))
    return (not bad), ("; ".join(bad) if bad else
                       "耗时读数在 timing_ms.budget，degraded 无耗时派生项")


def s2_evidence_passthrough(ctx):
    """daemon 分支曾把 readings 整包丢弃 ⇒ 判错时回执里无迹可查。"""
    bad = []
    for name, pair in ctx["frames"].items():
        rec = pair["cold"]
        if rec is None:
            bad.append("%s:冷跑无回执" % name)
            continue
        ev_list = state_of(rec).get("evidence") or []
        ev = ev_list[0] if ev_list and isinstance(ev_list[0], dict) else {}
        missing = [k for k in EVIDENCE_KEYS if not ev.get(k)]
        if missing:
            bad.append("%s:evidence[0] 缺/空 %s" % (name, ",".join(missing)))
        rd = ev.get("readings") or []
        if rd:
            broken = [i for i, r in enumerate(rd)
                      if not (isinstance(r, dict) and "name" in r and "passed" in r and "value" in r)]
            if broken:
                bad.append("%s:readings 第 %s 项缺 name/passed/value" % (name, broken[:3]))
        mt_missing = [k for k in MATCH_KEYS if k not in match_of(rec)]
        if mt_missing:
            bad.append("%s:state.match 缺 %s" % (name, ",".join(mt_missing)))
    return (not bad), ("; ".join(bad) if bad else
                       "两张帧的 evidence[0] 逐条判据齐全，state.match %d 键齐全" % len(MATCH_KEYS))


def s3_open_set(ctx):
    """Firefox 整屏：**看到了 PLAYTEST 但明确拒绝它，并说出理由**。

    只断言「名字变成 UNKNOWN」是不够的——随便一个把状态清空的 bug 也能骗过它。
    真正要证的是：判据层看到了候选态（`match.candidate`）、判定它**不成立**（`accepted=false`，
    锚点证据 `critical_ok=false`）、把理由写出来（`novel_reason`），并且 `candidates` 的语义没被滥用
    （它只表示「同时成立的多个态」⇒ novel 路径下必须是**显式空列表**，不是"被拒的态"）。
    """
    bad = []
    rec = ctx["frames"]["foreign-ui"]["cold"]
    if rec is None:
        return False, "foreign-ui:冷跑无回执"
    st, mt, cs = state_of(rec), match_of(rec), codes(rec)

    if st.get("name") != "UNKNOWN":
        bad.append("state.name=%r（应为 UNKNOWN）" % st.get("name"))
    if st.get("novel") is not True:
        bad.append("state.novel=%r（必须是 bool True；None = 判据层没作答，不许冒充 false）"
                   % (st.get("novel"),))
    if mt.get("novel_reason") != "no_critical_evidence":
        bad.append("state.match.novel_reason=%r（应为 'no_critical_evidence'）"
                   % (mt.get("novel_reason"),))

    cands = st.get("candidates")
    if cands is None:
        bad.append("state.candidates=None（判据层没作答；novel 路径必须是显式空列表 []）")
    elif not isinstance(cands, list):
        bad.append("state.candidates=%r（必须是 list）" % (cands,))
    elif cands:
        bad.append("state.candidates=%r（novel 路径必须为空：只有「同时成立的多个态」才进这里）"
                   % (cands,))

    if mt.get("candidate") != "PLAYTEST":
        bad.append("state.match.candidate=%r（被拒的态记在这里，单数，应为 'PLAYTEST'）"
                   % (mt.get("candidate"),))
    if mt.get("accepted") is not False:
        bad.append("state.match.accepted=%r（必须明确 False）" % (mt.get("accepted"),))
    if mt.get("critical_ok") is not False:
        bad.append("state.match.critical_ok=%r（锚点证据不成立必须 False）" % (mt.get("critical_ok"),))

    # 降级项不再是"必须有 STATE_UNKNOWN"，而是**必须与 novel 一致**——
    # 这样"判错洗白"和"随便清空状态"两种退化都会被抓。
    # 2026-10-22 精简：删掉 STATE_LOW_SUPPORT 一致性断言——它依赖 match.low_support，
    # 而那个布尔**恒 False**（判出去的态必然 accepted=True），是死字段 + 死分支。
    want_unknown = st.get("novel") is True
    if ("STATE_UNKNOWN" in cs) != want_unknown:
        bad.append("degraded 的 STATE_UNKNOWN 与 novel 不一致（novel=%r, codes=%s）"
                   % (st.get("novel"), codes_str(cs)))

    return (not bad), ("; ".join(bad) if bad else
                       "foreign-ui: UNKNOWN + novel=True(reason=%s)，拒绝候选 %r（accepted=false/critical_ok=false），"
                       "candidates=[]，降级项与 novel 一致"
                       % (mt.get("novel_reason"), mt.get("candidate")))


def s4_uncertainty_explainable(ctx):
    """`uncertainty=0` 必须能区分「不适用」与「没有」。"""
    bad = []
    for name, pair in ctx["frames"].items():
        rec = pair["cold"]
        if rec is None:
            bad.append("%s:冷跑无回执" % name)
            continue
        um = rec.get("uncertainty_meta")
        if not isinstance(um, dict):
            bad.append("%s:缺顶层 uncertainty_meta" % name)
            continue
        miss = [k for k in UNCERTAINTY_META_KEYS if k not in um]
        if miss:
            bad.append("%s:uncertainty_meta 缺 %s" % (name, ",".join(miss)))
        if not isinstance(um.get("applicable"), list):
            bad.append("%s:uncertainty_meta.applicable 不是 list" % name)
        if not isinstance(um.get("waived"), list):
            bad.append("%s:uncertainty_meta.waived 不是 list" % name)
        for i, w in enumerate(um.get("waived") or []):
            if not (isinstance(w, dict) and w.get("rule") and w.get("reason")):
                bad.append("%s:waived[%d] 缺 {rule,reason}" % (name, i))
                break
        usrc = rec.get("uncertainty_source")
        if usrc not in UNCERTAINTY_SOURCES:
            bad.append("%s:uncertainty_source=%r 不在 %s" % (name, usrc, UNCERTAINTY_SOURCES))
        if name == "foreign-ui" and not (um.get("waived") or []):
            bad.append("foreign-ui:waived 为空（富 UI 零不确定必须解释成「不适用」，不能静默 0 条）")
    return (not bad), ("; ".join(bad) if bad else
                       "两张帧的不确定性来源与 waived/applicable 都可读")


def s5_legacy_no_regression(ctx):
    """老画面不许被新判据搞坏；期望值从 baseline.json 读（不硬编码 = 不自证）。"""
    bad = []
    base = ctx["baseline"].get("legacy_fixtures") or {}
    if not base:
        return False, "baseline.json 没有 legacy_fixtures"
    for name, exp in base.items():
        rec = ctx["legacy"].get(name)
        path = os.path.join(LEGACY_DIR, name)
        if not os.path.isfile(path):
            bad.append("%s:夹具缺失" % name)
            continue
        got_sha = sha256(path)
        if exp.get("sha256") and got_sha != exp["sha256"]:
            bad.append("%s:夹具 sha 变了（%s… ≠ 基线 %s…）" % (name, got_sha[:12], exp["sha256"][:12]))
        if rec is None:
            bad.append("%s:跑不出回执" % name)
            continue
        st = state_of(rec)
        want = (exp.get("readings") or {}).get("state") or {}
        if st.get("name") != want.get("name"):
            bad.append("%s:state %r ≠ 基线 %r" % (name, st.get("name"), want.get("name")))
        elif want.get("confidence") is not None and st.get("confidence") is not None:
            if abs(float(st["confidence"]) - float(want["confidence"])) > 0.01:
                bad.append("%s:confidence %.3f ≠ 基线 %.3f"
                           % (name, st["confidence"], want["confidence"]))
    return (not bad), ("; ".join(bad) if bad else
                       "%d 张老帧状态与基线一致（%s）"
                       % (len(base), ", ".join("%s=%s" % (n, state_of(ctx["legacy"].get(n) or {}).get("name"))
                                               for n in base)))


def s6_pure_function_of_frame(ctx):
    """同一帧 ⇒ 同一 degraded 集合；与「这是第几次调用/走没走缓存/花了多少 ms」无关。"""
    bad = []
    for name, pair in ctx["frames"].items():
        cold, warm = pair["cold"], pair["warm"]
        if cold is None or warm is None:
            bad.append("%s:冷/热有一路没回执（cold=%s warm=%s rc=%s）"
                       % (name, cold is not None, warm is not None, pair.get("warm_rc")))
            continue
        cc, wc = codes(cold), codes(warm)
        if cc != wc:
            bad.append("%s:冷 %s ≠ 热 %s" % (name, codes_str(cc), codes_str(wc)))
        fm = (cold.get("frame") or {})
        if fm.get("source") == "frame":
            if "FRAME_PINNED" not in cc:
                bad.append("%s:离线帧缺 FRAME_PINNED" % name)
            if "STALE_FRAME" in cc:
                bad.append("%s:离线帧不该有 STALE_FRAME" % name)
    live = ctx.get("live")
    if live is not None:
        for name, pair in ctx["frames"].items():
            rec = pair["cold"]
            if rec is None:
                continue
            diff = set(codes(rec)) ^ set(codes(live))
            illegal = sorted(diff - set(LIVE_ONLY_CODES))
            if illegal:
                bad.append("%s:离线 vs live 差异越界 %s（只允许 %s）"
                           % (name, ",".join(illegal), "/".join(LIVE_ONLY_CODES)))
    return (not bad), ("; ".join(bad) if bad else
                       "冷/热 degraded 集合一致%s"
                       % ("；live 差异限定在 FRAME_PINNED/STALE_FRAME"
                          if live is not None else "（live 半边 SKIP）"))


CHECKS = [("S1", "预算不是观测缺陷", s1_budget_not_defect),
          ("S2", "判定证据透传", s2_evidence_passthrough),
          ("S3", "开集识别（foreign-ui 必须说 UNKNOWN）", s3_open_set),
          ("S4", "不确定性可解释", s4_uncertainty_explainable),
          ("S5", "老画面不回归", s5_legacy_no_regression),
          ("S6", "降级项是帧的纯函数", s6_pure_function_of_frame)]


# ── 主流程 ───────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="感知层 v1 契约门禁（全离线）")
    ap.add_argument("--live-json", default=None,
                    help="可选：别人已落盘的 live look 回执（本门禁绝不抓帧）")
    args = ap.parse_args()

    missing = [p for p in [WORLDSVC, BASELINE] + [f for _, f in FRAMES] if not os.path.isfile(p)]
    if not os.path.isdir(LEGACY_DIR):
        missing.append(LEGACY_DIR)
    if missing:
        print("PERCEPTION-CONTRACT-RESULT rc=2 pass=0 total=%d skip=0 error=FIXTURE_MISSING "
              "missing=%s verdict=FAIL" % (len(CHECKS), ",".join(os.path.basename(m) for m in missing)))
        for p in missing:
            print("  FIXTURE_MISSING %s" % p)
        return 2

    baseline = json.load(open(BASELINE, encoding="utf-8"))
    ctx = {"baseline": baseline, "frames": {}, "legacy": {}, "live": None}

    # ① 先跑 4 张老帧：既做回归，又顺手把 daemon 的 4 条 `_WORLD_CACHE` 挤掉，
    #    保证下面两张语料帧的"冷跑"确实是冷路径（daemon 缓存按整帧 sha 命中，无 TTL）。
    for name in (baseline.get("legacy_fixtures") or {}):
        path = os.path.join(LEGACY_DIR, name)
        rc, rec, err = run_look(path, no_cache=True) if os.path.isfile(path) else (2, None, "MISSING")
        ctx["legacy"][name] = rec
        if rec is None:
            print("  look(legacy %s) rc=%s err=%s" % (name, rc, err.splitlines()[-1] if err else ""))

    # ② 两张语料帧：冷跑（--no-cache）→ 热跑（走客户端缓存路径）
    for name, path in FRAMES:
        rc_c, cold, err_c = run_look(path, no_cache=True)
        rc_w, warm, err_w = run_look(path, no_cache=False)
        ctx["frames"][name] = {"cold": cold, "warm": warm, "warm_rc": rc_w,
                               "err_c": err_c, "err_w": err_w}
        if cold is None:
            print("  look(%s, cold) rc=%s err=%s" % (name, rc_c, (err_c or "").splitlines()[-1:] or ""))
        if warm is None:
            print("  look(%s, warm) rc=%s err=%s" % (name, rc_w, (err_w or "").splitlines()[-1:] or ""))

    if args.live_json:
        p = os.path.abspath(args.live_json)
        if os.path.isfile(p):
            try:
                ctx["live"] = json.load(open(p, encoding="utf-8"))
            except Exception as exc:                            # noqa: BLE001
                print("  live-json 读不了：%s" % exc)
        else:
            print("  live-json 不存在：%s（S6 的 live 半边按 SKIP 处理）" % p)

    # ③ 跑判据
    results, fails = [], []
    for sid, title, fn in CHECKS:
        try:
            ok, detail = fn(ctx)
        except Exception as exc:                                # noqa: BLE001
            ok, detail = False, "CHECK_CRASH %s: %s" % (type(exc).__name__, exc)
        results.append((sid, ok, detail))
        print("[%s] %s %s — %s" % ("PASS" if ok else "FAIL", sid, title, detail))
        if not ok:
            fails.append(sid)

    # ④ 读数小结（人看）
    for name, pair in ctx["frames"].items():
        rec = pair["cold"]
        if rec is None:
            continue
        st = state_of(rec)
        bud = budget_block(rec) or {}
        print("  %-12s state=%-14s conf=%s novel=%s degraded=%s budget_exceeded=%s total_ms=%s"
              % (name, st.get("name"), st.get("confidence"), st.get("novel"),
                 codes_str(codes(rec)), bud.get("exceeded"), bud.get("total_ms")))

    if all(pair["cold"] is None and pair["warm"] is None for pair in ctx["frames"].values()) \
            and not any(ctx["legacy"].values()):
        print("PERCEPTION-CONTRACT-RESULT rc=2 pass=0 total=%d skip=0 error=LOOK_FAIL_ALL verdict=FAIL"
              % len(CHECKS))
        return 2

    npass, total = sum(1 for _, ok, _ in results if ok), len(results)
    skip = 0 if ctx.get("live") is not None else 1
    rc = 0 if not fails else 1
    print("PERCEPTION-CONTRACT-RESULT rc=%d pass=%d total=%d skip=%d fail=%s verdict=%s"
          % (rc, npass, total, skip, ",".join(fails) if fails else "-", "PASS" if rc == 0 else "FAIL"))
    return rc


if __name__ == "__main__":
    sys.exit(main())
