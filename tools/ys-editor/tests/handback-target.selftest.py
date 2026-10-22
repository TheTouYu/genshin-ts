#!/usr/bin/env python3
"""handback-target.selftest.py — 交还目标必须等于授权记录里的窗（F-20261022-77）。

背景（2026-10-22 真机实证）：pi 任务里用户在 kitty 发起，`ys-screen-grant revoke` 却把屏幕
交还给了 firefox，而授权记录里 `active_window_at_grant.class=kitty` 明明是对的。两处把记录丢了：
`ys-screen-grant._hand_back()` 调 ys-hand-back 不传记录、`ys-hand-back` 里写死 `--prev-json ""`。
Lead 已修（commit b22a840f）；本门禁把「交还目标 = 授权记录里的窗」变成有人守的制度。

**全离线、不抢屏**：KWin 状态走 `YS_KWIN_JS_FIXTURE` 夹具；只调 `ys-hand-back --dry-run`
（目标解析函数 `ys_lease._resolve_target` 与真实路径**共用同一函数**，所以注入会同时抓住两边），
并断言 raise 日志为空（证明 dry-run 真的没碰窗口）。

四层判据：
  A 记录优先：prev={"class":"kitty"} 且该窗在夹具里 ⇒ target.class=kitty、source=prev、零 raise
  B 只有记录缺失/窗消失才回退：prev="" ⇒ target.class=firefox、fallback_reason=NO_PREV
  C 接线：ys-screen-grant._hand_back() 必须把授权记录传给 ys-hand-back（拦 argv，不真跑）
  D 一致性：ys-session 的交还期望窗取自 restore 回执（不写死 firefox，否则 kitty 场景会被判失败）

退出码：0 PASS / 1 有失败项
"""
from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
YS = os.path.dirname(HERE)                     # tools/ys-editor
HAND_BACK = os.path.join(YS, "ys-hand-back")
GRANT = os.path.join(YS, "ys-screen-grant")
SESSION = os.path.join(YS, "ys-session")

PASS = 0
FAIL = 0


def ok(msg):
    global PASS
    PASS += 1
    print("  ✓ %s" % msg)


def bad(msg):
    global FAIL
    FAIL += 1
    print("  ✗ %s" % msg)


def load_module(name, path):
    loader = importlib.machinery.SourceFileLoader(name, path)
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def fixture_state():
    """合成 KWin 状态：kitty 是当前活动窗（授权时用户在这），firefox 与游戏在堆叠里。"""
    # 键名必须与 KWin 探针一致：id=internalId / c=caption / cls=class / i=堆叠序（见 ys-lease._PROBE_BODY）
    return {"active": "w-kitty", "desktop": 2, "wins": [
        {"i": 9, "id": "w-kitty", "pid": 101, "c": "π - gui-test", "cls": "kitty",
         "x": 0, "y": 0, "w": 1200, "h": 800, "min": 0, "active": 1},
        {"i": 8, "id": "w-firefox", "pid": 102, "c": "Mozilla Firefox", "cls": "firefox",
         "x": 0, "y": 0, "w": 1600, "h": 900, "min": 0, "active": 0},
        {"i": 7, "id": "w-game", "pid": 103, "c": "原神", "cls": "yuanshen.exe",
         "x": 0, "y": 0, "w": 2560, "h": 1440, "min": 0, "active": 0},
    ]}


def main():
    tmp = tempfile.mkdtemp(prefix="handback-target.")
    fx = os.path.join(tmp, "kwin-fixture.json")
    with open(fx, "w", encoding="utf-8") as fh:
        json.dump({"probe": fixture_state()}, fh, ensure_ascii=False)
    raise_log = os.path.join(tmp, "raises.log")
    env = dict(os.environ)                      # 保留 PATH 等；只覆盖测试缝
    env.update({
        "YS_KWIN_JS_FIXTURE": fx,               # KWin 权威状态走夹具
        "YS_RAISE_LOG": raise_log,              # 真 raise 才写；dry-run 必须为空
        "YS_LEASE": os.path.join(tmp, "lease.json"),
        "YS_SCREEN_GRANT": os.path.join(tmp, "grant.json"),
        "YS_WINS": os.path.join(tmp, "no-such-ys-wins"),
    })

    def dry(prev_json):
        p = subprocess.run([HAND_BACK, "--dry-run", "--prev-json", prev_json],
                           capture_output=True, text=True, timeout=40, env=env)
        lines = [l for l in (p.stdout or "").strip().splitlines() if l.strip().startswith("{")]
        obj = json.loads(lines[-1]) if lines else {}
        return p.returncode, obj, (p.stderr or "")

    # ── A 记录优先 ───────────────────────────────────────────────────────
    rec = json.dumps({"caption": "π - gui-test", "class": "kitty"}, ensure_ascii=False)
    rc, obj, err = dry(rec)
    target = (obj.get("target") or {})
    if rc == 0 and obj.get("ok") and str(target.get("class")).lower() == "kitty":
        ok("A 记录优先：prev=kitty ⇒ 交还目标 %r（source=%s）"
           % (target.get("caption") or target.get("class"), obj.get("source")))
    else:
        bad("A 记录优先：期望 target.class=kitty，实得 rc=%s %s %s"
            % (rc, json.dumps(obj, ensure_ascii=False)[:200], err[-200:]))
    if obj.get("source") == "prev":
        ok("A2 source=prev（没有走回退）")
    else:
        bad("A2 期望 source=prev，实得 %r" % obj.get("source"))
    if not os.path.exists(raise_log) or os.path.getsize(raise_log) == 0:
        ok("A3 dry-run 零 raise（没抢用户屏幕）")
    else:
        bad("A3 dry-run 期间出现 raise 记录：%s" % open(raise_log, encoding="utf-8").read()[:200])

    # ── B 无记录才回退 ──────────────────────────────────────────────────
    rc, obj, err = dry("")
    target = (obj.get("target") or {})
    if rc == 0 and str(target.get("class")).lower() == "firefox" \
            and obj.get("fallback_reason") == "NO_PREV":
        ok("B 无记录 ⇒ 回退 firefox，理由 NO_PREV")
    else:
        bad("B 期望 firefox/NO_PREV，实得 rc=%s %s" % (rc, json.dumps(obj, ensure_ascii=False)[:200]))

    # ── C 接线：ys-screen-grant 必须把记录传下去 ────────────────────────
    try:
        with open(env["YS_SCREEN_GRANT"], "w", encoding="utf-8") as fh:
            json.dump({"granted_at": 4102444800.0, "expires_at": 4102444800.0 + 600,
                       "owner": "selftest",
                       "active_window": {"caption": "π - gui-test", "class": "kitty"}}, fh,
                      ensure_ascii=False)
        os.environ["YS_SCREEN_GRANT"] = env["YS_SCREEN_GRANT"]
        mod = load_module("ys_screen_grant_selftest", GRANT)
        captured = {}

        class _R:
            returncode = 0
            stdout = '{"ok": true, "restored": "π - gui-test [kitty]"}'
            stderr = ""

        real_run = mod.subprocess.run

        def _fake_run(argv, *a, **kw):
            captured["argv"] = list(argv) if isinstance(argv, (list, tuple)) else [argv]
            return _R()

        mod.subprocess.run = _fake_run
        try:
            res = mod._hand_back()
        finally:
            mod.subprocess.run = real_run
        argv = captured.get("argv") or []
        prev_arg = ""
        if "--prev-json" in argv:
            prev_arg = argv[argv.index("--prev-json") + 1]
        parsed = json.loads(prev_arg) if prev_arg.strip() else {}
        if str(parsed.get("class") or "").lower() == "kitty" and res.get("prev"):
            ok("C 接线：ys-screen-grant._hand_back() 把记录传给了 ys-hand-back（class=kitty）")
        else:
            bad("C 接线：_hand_back() 没把授权记录传下去（argv=%r）" % (argv[:4],))
    except Exception as exc:                     # noqa: BLE001
        bad("C 接线：加载/调用 ys-screen-grant 失败：%s: %s" % (type(exc).__name__, exc))

    # ── D 一致性：ys-session 的期望窗取回执，不写死 firefox ─────────────
    try:
        sess = load_module("ys_session_selftest", SESSION)
        f = sess._expected_handback_class
        cases = [
            ({"restored_info": {"class": "kitty"}}, {"prev_active": {"class": "firefox"}}, "kitty"),
            ({"restored_info": {}}, {"prev_active": {"class": "kitty"}}, "kitty"),
            ({}, {}, "firefox"),
        ]
        wrong = [(a, b, want, f(a, b)) for a, b, want in cases if f(a, b) != want]
        if not wrong:
            ok("D 一致性：期望交还窗=回执/prev_active/最后的 firefox（三条都过）")
        else:
            bad("D 一致性：%r" % (wrong,))
    except Exception as exc:                     # noqa: BLE001
        bad("D 一致性：加载 ys-session 失败：%s: %s" % (type(exc).__name__, exc))

    print("HANDBACK-TARGET-RESULT pass=%d fail=%d verdict=%s"
          % (PASS, FAIL, "PASS" if FAIL == 0 else "FAIL"))
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
