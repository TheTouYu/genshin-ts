#!/usr/bin/env python3
"""skill-coverage.selftest.py — 「能力必须挂在技能上」的机械校验（用户令 2026-10-21）。

用户原话：「配套的技能也是 AGI 实现的一部分」。能力 = 工具 + 判据 + **技能**；
只做进代码、没进技能 ⇒ 下一个会话就没有这项能力（技能是生效载体）。

判据（全部可机检）：
  T1 `worldsvc capabilities` 的每个 verb 名，必须能在 skills.entry 指向的技能文件里找到；
  T2 capabilities.skills.entry / methodology / injection 三个文件都存在；
  T3 技能文件里必须写出这条规则本身（"能力缺口与技能缺口同账"）——防止规则被删了没人发现。

退出码：0 PASS / 1 FAIL / 2 环境缺（worldsvc 或技能文件缺失）
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
WORLDSVC = os.path.join(ROOT, ".scratch", "gui-service", "worldsvc.py")
fails = []


def ok(t, d):
    print("  ✓ %-4s %s" % (t, d))


def bad(t, d):
    print("  ✗ %-4s %s" % (t, d))
    fails.append(t)


def main():
    if not os.path.exists(WORLDSVC):
        print("SKILL-COVERAGE SKIP 没有 worldsvc（不在本仓工作区）")
        return 0
    p = subprocess.run([sys.executable, WORLDSVC, "capabilities"], capture_output=True, text=True)
    if p.returncode != 0:
        print("SKILL-COVERAGE FAIL worldsvc capabilities rc=%d %s" % (p.returncode, (p.stderr or "")[:200]))
        return 1
    caps = json.loads(p.stdout)
    skills = caps.get("skills") or {}
    entry = skills.get("entry") or ""
    def _p(v):
        return os.path.expanduser(v) if v.startswith("~") else os.path.join(ROOT, v)
    files = {k: _p(v) for k, v in skills.items()
             if k in ("entry", "methodology", "injection") and isinstance(v, str)}
    missing = [k for k, f in files.items() if not os.path.exists(f)]
    (bad if missing else ok)("T2", "技能文件存在 = %s%s" %
                             ({k: os.path.basename(os.path.dirname(f)) for k, f in files.items()},
                              "" if not missing else "；缺 %s" % missing))
    if entry:
        _ep = _p(entry)
        txt = open(_ep, encoding="utf-8").read() if os.path.exists(_ep) else ""
        undoc = [v for v in (caps.get("verbs") or {}) if v not in txt]
        (bad if undoc else ok)("T1", "每个 verb 都在技能里 = %s%s" %
                               (sorted(caps.get("verbs") or {}), "" if not undoc else "；未写进技能：%s" % undoc))
        rule_ok = "技能缺口" in txt or "能力缺口" in txt
        (ok if rule_ok else bad)("T3", "技能里写了「能力缺口/技能缺口同账」规则 = %s" % rule_ok)
    else:
        bad("T1", "capabilities.skills.entry 缺失")
    print("SKILL-COVERAGE-RESULT pass=%d fail=%d verdict=%s" %
          (3 - len(fails), len(fails), "PASS" if not fails else "FAIL"))
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
