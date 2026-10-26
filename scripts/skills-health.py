#!/usr/bin/env python3
"""技能路由完整性体检（2026-09-01 事故催生）。

背景：commit 57d2795 以"全局 ~/.agents/skills 已有同内容副本"为由删除项目技能副本，
但那个"全局副本"是指向项目目录的软链接——删除后 dsh-session-history / dsh-plugin-search
两个技能静默死亡 9 天，AGENTS.md 路由表每天注入死引用，直到用户 09-01 会话中爆发才定位。

本脚本回答四个问题：
  1. AGENTS.md / CLAUDE.md 里反引号引用的技能，是否都能解析到真实 SKILL.md？
  2. 全局 ~/.agents/skills/ 下的软链接是否有悬空？
  3. 同名技能是否**只有一份实体**（2026-10-26 用户令：「所有的技能都不准有两份，用链接」）？
     项目级是唯一实体，用户级 ~/.agents/skills/<name> 必须是指向它的软链接。
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
    # 长期任务的「线 id」（CLAUDE.md 说明并行线时用），不是技能名。
    "sim-2d", "gui-agi",
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
        # 只比"生效内容"：__pycache__（rglob 会带上 .pyc）与 *.bak* 备份不属于技能本体。
        # 2026-10-26 实测：两份 SKILL.md 与三个脚本逐字节相同，仅因用户级多了
        # .bak-preV3 与 __pycache__ 就被判 STALE —— 假告警会把真告警淹没。
        files.extend(sorted(
            p for p in scripts.rglob("*")
            if p.is_file()
            and "__pycache__" not in p.parts
            and ".bak" not in p.name
        ))
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
    """同名技能两份副本的**形态**检查，返回 [(name, 项目指纹, 全局指纹, 判定, 说明)]。

    用户令（2026-10-26）：「所有的技能都不准有两份，用链接」。
    ⇒ 判定只剩两种：
      · **LINK（要求形态）**：项目级是唯一实体，用户级是软链接（或反之）。
      · **DUP（违规）**：两侧都是真实目录 —— 两份会各自漂移，且项目级 rank 200
        压过用户级 rank 500（加载到项目级），改到用户级的那次「优化」会静默失效。
        实证：2026-10-26 dsh-session-history 的「先按标题筛」写在用户级，
        本工作区加载的是项目级旧版，该优化从未进入任何会话上下文。

    修法一律是：内容先合并成唯一正确版（放进项目级实体，进 git），
    再把用户级换成本地软链（旧目录 mv 到 ~/.agents/skills-archive/ 保留可回滚）。
    """
    out = []
    if not (PROJECT_SKILLS.is_dir() and GLOBAL_SKILLS.is_dir()):
        return out
    names = sorted(
        {p.name for p in PROJECT_SKILLS.iterdir() if p.is_dir() or p.is_symlink()}
        & {p.name for p in GLOBAL_SKILLS.iterdir() if p.is_dir() or p.is_symlink()}
    )
    for name in names:
        proj = PROJECT_SKILLS / name
        glob_ = GLOBAL_SKILLS / name
        if proj.is_symlink() or glob_.is_symlink():
            side = "用户级" if glob_.is_symlink() else "项目级"
            real = os.path.realpath(glob_ if glob_.is_symlink() else proj)
            out.append((name, "", "", "LINK", f"{side}为软链 -> {real}"))
            continue
        out.append((name, skill_digest(PROJECT_SKILLS, name) or "",
                    skill_digest(GLOBAL_SKILLS, name) or "", "DUP",
                    "同名技能存在**两份实体**（会各自漂移，改到非生效那份等于没改）"))
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
            if (where == "全局" and (PROJECT_SKILLS / name).exists()
                    and not (PROJECT_SKILLS / name).is_symlink()
                    and not (GLOBAL_SKILLS / name).is_symlink()):
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
        if verdict == "DUP":
            print(f"  DUP  {name} — {note}（项目级 {a[:8]} / 用户级 {b[:8]}）")
        elif verdict == "LINK" and show_all:
            print(f"  LINK {name} — {note}")
    for name, target in dangling:
        print(f"  DANGLING 全局软链接 {name} -> {target} 目标不存在")

    dup_n = sum(1 for _, _, _, v, _ in drifts if v == "DUP")
    if dead or dangling or badfm or dup_n:
        print(f"\n结果：FAIL（{len(dead)} 死引用，{len(dangling)} 悬空链接，"
              f"{len(badfm)} frontmatter 不可加载，{dup_n} 同名技能两份实体）")
        print("处理：先确认引用是否仍在用（在用→恢复实体），删除/改链接属破坏性操作须用户确认。")
        print("BADFM = 文件在但 DSH 加载器会静默忽略（YAML 陷阱/字段缺失/name 错位），按提示改 frontmatter。")
        print("DUP = 同名技能在两处各一份真实目录 ⇒ 必然漂移，且生效的是项目级(rank 200)。"
              "修法：内容合并进项目级 → 用户级 mv 到 ~/.agents/skills-archive/ → ln -s 项目级路径。")
        return 1
    link_n = sum(1 for _, _, _, v, _ in drifts if v == "LINK")
    print(f"\n结果：PASS（{len(ok)} 技能引用全部可解析，0 悬空链接，0 同名双实体；"
          f"同名技能 {len(drifts)} 个全部为软链：{link_n}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
