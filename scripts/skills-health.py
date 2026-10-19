#!/usr/bin/env python3
"""技能路由完整性体检（2026-09-01 事故催生）。

背景：commit 57d2795 以"全局 ~/.agents/skills 已有同内容副本"为由删除项目技能副本，
但那个"全局副本"是指向项目目录的软链接——删除后 dsh-session-history / dsh-plugin-search
两个技能静默死亡 9 天，AGENTS.md 路由表每天注入死引用，直到用户 09-01 会话中爆发才定位。

本脚本回答四个问题：
  1. AGENTS.md / CLAUDE.md 里反引号引用的技能，是否都能解析到真实 SKILL.md？
  2. 全局 ~/.agents/skills/ 下的软链接是否有悬空？
  3. 项目与全局是否存在同名重复实体（结构漂移预警）？
  4. SKILL.md frontmatter 是否能通过 DSH 加载器的解析（YAML 陷阱/name 一致性）？
     （2026-09-04 事故催生：editor-incremental-gia-investigator 的 description 值内
     含英文冒号+空格 "closed: the"，YAML 单行 plain scalar 被判嵌套映射，frontmatter
     解析失败被 DSH 静默忽略——文件在、体检 PASS，但技能从会话目录消失多日。）

用法：
  python3 scripts/skills-health.py            # 体检，死引用/悬空链接时 exit 1
  python3 scripts/skills-health.py --all      # 额外列出所有健康技能

约定：删除技能、修改 ~/.agents/skills 链接结构前必须先跑本脚本，且属破坏性操作需用户确认。
"""
from __future__ import annotations

import hashlib
import os
import re
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PROJECT_SKILLS = PROJECT / ".agents" / "skills"
GLOBAL_SKILLS = Path.home() / ".agents" / "skills"
DOCS = [PROJECT / "AGENTS.md", PROJECT / "CLAUDE.md"]

# 反引号里形如 kebab-case 的词（≥1 个连字符、全小写字母数字）。
KEBAB = re.compile(r"`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`")

# 已知非技能引用（示例项目名 / npm 包名 / PKC 子命令等），避免误报。
IGNORE = {
    "rubik-2x2", "rubik-3x3", "rubik-3x3-client", "lights-out", "football",
    "cube-replica-c4", "create-genshin-ts", "node-modules", "signal-demo",
    "progressive-query", "knowledge-search",
}


def plugin_skills() -> dict[str, Path]:
    """插件携带的技能：DSH 插件可以把技能放进自己的包内，随插件加载。

    2026-10-19：qxqy-game-studio / qxqy-simulator 明明在会话技能目录里（能自动加载），
    体检却报 DEAD——因为它们既不在 ~/.agents/skills 也不在项目 .agents/skills。
    实测两种插件内载体都要认：
      · 预设内技能： <pkg>/dsh-plugin/presets/*/skills/<name>/SKILL.md
      · 单体技能：   <pkg>/dsh-plugin/skill.md  ← **文件名是小写 skill.md，就在包根**，
                    技能名取自 frontmatter 的 name（实测 qxqy-simulator）
    "只查两个固定目录"是个错误的完备性假设：技能的**载体不止一种**。
    """
    found: dict[str, Path] = {}
    roots = [
        Path.home() / ".dsh" / "profiles" / "web" / "node_modules",
        Path.home() / "dsh-plugins",
    ]
    name_re = re.compile(r"^name:\s*(.+?)\s*$")

    def record(skill_md: Path, fallback: str) -> None:
        nm = fallback
        try:
            head = skill_md.read_text(encoding="utf-8").splitlines()[:40]
            for line in head:
                m = name_re.match(line)
                if m:
                    nm = m.group(1).strip().strip("'\"") or fallback
                    break
        except OSError:
            pass
        found.setdefault(nm, skill_md.parent)

    def record_plugin_decl(skill_md: Path, plugin_dir: Path) -> None:
        """插件把技能名声明在 cordis.patch.yml 的 `id: <skill-name>` 行里。

        实测 dsh-plugin-beyond-simulator：dsh-plugin/skill.md 正文**没有 frontmatter**，
        技能名 `qxqy-simulator` 只出现在 dsh-plugin/cordis.patch.yml 的 `- id: qxqy-simulator`
        （下一行 `name: <pkg>/skill` 才是模块引用）。所以按"文件名/目录名/frontmatter"
        三条去找都会漏，必须读插件声明。
        """
        patch = plugin_dir / "cordis.patch.yml"
        if not patch.is_file():
            record(skill_md, plugin_dir.name)
            return
        try:
            lines = patch.read_text(encoding="utf-8").splitlines()
        except OSError:
            record(skill_md, plugin_dir.name)
            return
        for i, line in enumerate(lines):
            m = re.match(r"\s*-?\s*id:\s*([a-z0-9][a-z0-9-]*)\s*$", line)
            if not m:
                continue
            # 该 id 的下一两行若是 name: <pkg>/skill，则它就是这份 skill.md 的技能名
            window = "\n".join(lines[i + 1:i + 4])
            if re.search(r"name:\s*\S*/(skill|skills?)['\"]?\s*$", window):
                found.setdefault(m.group(1), skill_md.parent)
                return
        record(skill_md, plugin_dir.name)

    for root in roots:
        if not root.is_dir():
            continue
        try:
            for hit in root.glob("**/skills/*/SKILL.md"):
                record(hit, hit.parent.name)
            for hit in root.glob("**/dsh-plugin/skill.md"):
                record_plugin_decl(hit, hit.parent)
        except OSError:
            continue
    return found


_PLUGIN_SKILLS: dict[str, Path] | None = None


def has_skillmd(name: str) -> tuple[bool, str]:
    """返回 (是否可解析到 SKILL.md, 说明)。跟随软链接，但区分悬空。

    载体三种：项目级 .agents/skills、用户级 ~/.agents/skills、插件自带 skills/。
    """
    global _PLUGIN_SKILLS
    for label, base in (("项目", PROJECT_SKILLS), ("全局", GLOBAL_SKILLS)):
        p = base / name
        if p.is_symlink() and not p.exists():
            return False, f"{label}软链接悬空 -> {os.readlink(p)}"
        if (p / "SKILL.md").is_file():
            return True, f"{label}"
    if _PLUGIN_SKILLS is None:
        _PLUGIN_SKILLS = plugin_skills()
    if name in _PLUGIN_SKILLS:
        return True, "插件"
    return False, "项目/全局/插件 均无 SKILL.md"


def lint_frontmatter(name: str) -> str | None:
    """模拟 DSH 加载器（dsh-skill-filesystem parseSkillFile）对 SKILL.md 的解析失败分支。

    返回 None = 通过；返回字符串 = 会被 DSH 静默忽略的原因。
    零依赖启发式：不追求完整 YAML，只覆盖已知致命陷阱：
      - 缺 frontmatter（首行 --- / 闭合 ---）
      - 单行 plain scalar 值内出现 "冒号+空格"（判嵌套映射，2026-09-04 事故）
      - 引号值首尾不配对 / 引号外有多余内容
      - 缺 name 或 description / name 与目录名不一致
    """
    path = None
    for base in (PROJECT_SKILLS, GLOBAL_SKILLS):
        candidate = base / name / "SKILL.md"
        if candidate.is_file():
            path = candidate
            break
    if path is None:
        return None  # 实体缺失由死引用检查负责，不重复报
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return "缺 YAML frontmatter（首行不是 ---）"
    try:
        closing = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return "frontmatter 未闭合（缺 --- 结束行）"
    fields: dict[str, str] = {}
    for line in lines[1:closing]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            return f"frontmatter 行无法按 key: value 解析：{stripped[:60]!r}"
        key, _, value = stripped.partition(":")
        key, value = key.strip(), value.strip()
        if not key:
            return f"frontmatter 键为空：{stripped[:60]!r}"
        if value.startswith(('"', "'")):
            quote = value[0]
            if len(value) < 2 or not value.endswith(quote) or value[-2] == "\\" and quote == '"':
                return f"{key} 引号值未正确闭合（{quote}...{quote}）"
            value = value[1:-1]
        elif value.startswith(("|", ">")):
            fields[key] = "(block scalar)"  # 块标量：内容在后续行，跳过值检查，仅标记非空
            continue
        elif ": " in value:
            return (
                f"{key} 值内含 '冒号+空格'（{value.find(': ')} 字符处）——"
                "YAML 判嵌套映射，DSH 加载器会静默忽略本技能；改全角冒号/破折号或整体加引号"
            )
        fields[key] = value
    if not fields.get("name"):
        return "缺 name 字段"
    if not fields.get("description", "").strip():
        return "缺 description 字段或为空"
    if fields["name"] != name:
        return f"name 字段 {fields['name']!r} 与目录名 {name!r} 不一致"
    return None


def collect_refs() -> dict[str, list[str]]:
    refs: dict[str, list[str]] = {}
    for doc in DOCS:
        if not doc.is_file():
            continue
        for name in KEBAB.findall(doc.read_text(encoding="utf-8")):
            if name not in IGNORE:
                refs.setdefault(name, []).append(doc.name)
    return refs


def skill_digest(root: Path, name: str) -> str | None:
    """技能"实体指纹"：SKILL.md + scripts/ 下全部文件的内容摘要。

    只比 SKILL.md 不够——2026-10-19 实测 dsh-session-history 两份 SKILL.md
    完全相同（md5 65ca8d53），但 scripts/search_dsh_sessions.py 已漂移成
    v3（只认 v0 文件）与 v3.1（认 v4）两个不兼容版本，且项目级 rank 200
    压过用户级 rank 500 ⇒ 加载到的是读不了当前会话的旧版。
    """
    d = root / name
    if not d.is_dir():
        return None
    h = hashlib.sha256()
    files = [d / "SKILL.md"]
    scripts = d / "scripts"
    if scripts.is_dir():
        files.extend(sorted(p for p in scripts.rglob("*") if p.is_file()))
    for p in files:
        if not p.is_file():
            continue
        h.update(str(p.relative_to(d)).encode())
        try:
            h.update(p.read_bytes())
        except OSError:
            pass
    return h.hexdigest()


def check_duplicate_drift() -> list[tuple[str, str, str, str, str]]:
    """项目级与用户级同名技能：返回 [(name, 生效指纹, 另一份指纹, 判定, 说明)]。

    DSH 加载器 rank：项目级 project-agents=200 **压过** 用户级 user-agents=500，
    所以同名时生效的是项目级副本。

    判据要分两种情况，不能"内容不同就报错"：
      · **STALE（真问题）**：生效的项目级副本**比另一份旧**（mtime 落后）。
        这才是"你以为在用新版，实际加载的是旧版"——静默降级。
        2026-10-19 实证的正是这一类：项目级 dsh-session-history 是 09-10 的 v3，
        只认 session.jsonl.zstd（v0），读不了当前 v4 会话；而用户级那份是 v3.1 能读。
      · **AHEAD（正常）**：生效副本比另一份新 —— 项目级就是主副本，另一份是旧快照。
        用户级目录本机是**只读挂载**（/dev/sda4 ro），本来就没法同步，不算故障。
    内容相同 = SAME。
    """
    out = []
    if not (PROJECT_SKILLS.is_dir() and GLOBAL_SKILLS.is_dir()):
        return out
    names = sorted(
        {p.name for p in PROJECT_SKILLS.iterdir() if p.is_dir()}
        & {p.name for p in GLOBAL_SKILLS.iterdir() if p.is_dir()}
    )
    for name in names:
        a = skill_digest(PROJECT_SKILLS, name)
        b = skill_digest(GLOBAL_SKILLS, name)
        if a is None or b is None:
            continue
        if a == b:
            out.append((name, a, b, "SAME", ""))
            continue
        try:
            proj_mt = (PROJECT_SKILLS / name / "SKILL.md").stat().st_mtime
            glob_mt = (GLOBAL_SKILLS / name / "SKILL.md").stat().st_mtime
        except OSError:
            out.append((name, a, b, "DRIFT", "无法比较 mtime"))
            continue
        if proj_mt < glob_mt:
            note = ("生效副本(项目级)比另一份**旧** %s，实际加载的是旧版"
                    % _age(glob_mt - proj_mt))
            out.append((name, a, b, "STALE", note))
        else:
            note = ("生效副本(项目级)比另一份新 %s，用户级是旧快照（只读挂载，无需同步）"
                    % _age(proj_mt - glob_mt))
            out.append((name, a, b, "AHEAD", note))
    return out


def _age(seconds: float) -> str:
    d = int(seconds // 86400)
    h = int(seconds % 86400 // 3600)
    if d:
        return "%d天%d小时" % (d, h)
    return "%d小时" % max(h, 1)


def main() -> int:
    show_all = "--all" in sys.argv
    refs = collect_refs()
    dead: list[tuple[str, str]] = []
    dupes: list[str] = []
    ok: list[str] = []

    for name in sorted(refs):
        fine, where = has_skillmd(name)
        if fine:
            ok.append(name)
            if where == "全局" and (PROJECT_SKILLS / name).exists():
                dupes.append(name)
        else:
            dead.append((name, where))

    drifts = check_duplicate_drift()

    dangling: list[tuple[str, str]] = []
    if GLOBAL_SKILLS.is_dir():
        for entry in sorted(GLOBAL_SKILLS.iterdir()):
            if entry.is_symlink() and not entry.exists():
                dangling.append((entry.name, os.readlink(entry)))

    badfm: list[tuple[str, str]] = []
    for name in ok:
        problem = lint_frontmatter(name)
        if problem:
            badfm.append((name, problem))

    print(f"技能引用体检：AGENTS.md/CLAUDE.md 共 {len(refs)} 个 kebab 引用")
    if show_all:
        for name in ok:
            print(f"  OK   {name}")
    for name, why in dead:
        print(f"  DEAD {name} — {why}")
    for name, why in badfm:
        print(f"  BADFM {name} — {why}")
    for name in dupes:
        print(f"  NOTE {name} — 项目/全局双实体，注意同步")
    for name, a, b, verdict, note in drifts:
        if verdict == "STALE":
            print(f"  STALE {name} — {note}（项目级 {a[:8]} / 用户级 {b[:8]}）")
        elif verdict == "AHEAD":
            print(f"  AHEAD {name} — {note}")
    for name, target in dangling:
        print(f"  DANGLING 全局软链接 {name} -> {target} 目标不存在")

    stale_n = sum(1 for _, _, _, v, _ in drifts if v == "STALE")
    if dead or dangling or badfm or stale_n:
        print(f"\n结果：FAIL（{len(dead)} 死引用，{len(dangling)} 悬空链接，"
              f"{len(badfm)} frontmatter 不可加载，{stale_n} 生效副本落后）")
        print("处理：先确认引用是否仍在用（在用→恢复实体），删除/改链接属破坏性操作须用户确认。")
        print("BADFM = 文件在但 DSH 加载器会静默忽略（YAML 陷阱/字段缺失/name 错位），按提示改 frontmatter。")
        print("STALE = 同名技能项目级(rank 200，生效)内容比用户级(rank 500)旧 ⇒ 实际加载的是旧版；"
              "把新版同步进项目级即可。AHEAD 属正常，不报错。")
        return 1
    same_n = sum(1 for _, _, _, v, _ in drifts if v == "SAME")
    ahead_n = sum(1 for _, _, _, v, _ in drifts if v == "AHEAD")
    print(f"\n结果：PASS（{len(ok)} 技能引用全部可解析，0 悬空链接，0 生效副本落后；"
          f"双副本 {len(drifts)} 个：一致 {same_n} / 生效副本更新 {ahead_n}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
