#!/usr/bin/env python3
"""skill-salvage — 找出「记了、但没进生效载体」的知识（2026-10-17 建）

## 为什么需要它
知识写进日记 ≠ 下次会被加载：**生效载体是技能**（按需自动加载）与 AGENTS/CLAUDE（每轮注入）。
实证事故：日志窗三坑早在日记里、`ys-editor-guard` 一族早在技能表里**只有名字没有用法** ⇒ 遇事仍要重摸。
本脚本把"是否落到生效载体"变成**可执行的检查**：扫日记里的工具/命令 token，看它们在载体语料里搜不搜得到。

## 用法
    python3 scripts/skill-salvage.py                     # 最近 40 篇日记
    python3 scripts/skill-salvage.py --limit 120 --top 30
    python3 scripts/skill-salvage.py --bucket genshin-ts # 指定记忆桶
    python3 scripts/skill-salvage.py --token ys-editor-guard   # 只查某个 token

退出码：0=无孤儿；1=发现孤儿（可进 CI/收尾检查）。
"""
import argparse
import collections
import pathlib
import re
import shutil
import sys

HOME = pathlib.Path.home()
RIVER = HOME / ".dsh" / "memo-river"
REPO = pathlib.Path(__file__).resolve().parent.parent

# ── 生效载体：技能（按需加载）+ 每轮注入的指令文件 + 工具 README ──
CARRIER_GLOBS = [
    REPO / ".agents/skills/**/SKILL.md",
    REPO / ".agents/skills/**/*.md",
    HOME / ".agents/skills/**/SKILL.md",
    HOME / ".agents/skills/**/*.md",
    REPO / "AGENTS.md",
    REPO / "CLAUDE.md",
    REPO / "tools/**/README.md",
    REPO / "docs/**/AGENTS.md",
]
# 出现在日记里但**不需要**进载体的常见词（避免噪声）
STOP = {
    "ys-editor", "ys-look", "ys_look", "ys-gui", "ys-pointer", "ys-playtest",
    "assets:ui", "assets:xxx", "image:*", "test:*", "gen:*", "health:*", "docs:*",
}

TOKEN_RES = [
    (re.compile(r"\bys-[a-z0-9][a-z0-9-]{2,}\b"), "工具"),          # ys-orphans / ys-editor-guard
    (re.compile(r"\b(?:assets|client|maps|variables|image|gil|gia)[:](?:[a-z][a-z0-9-]{2,})\b"), "命令"),
]


def carrier_text() -> str:
    parts = []
    for g in CARRIER_GLOBS:
        for p in REPO.glob(str(g).replace(str(REPO) + "/", "")) if str(g).startswith(str(REPO)) \
                else HOME.glob(str(g).replace(str(HOME) + "/", "")):
            try:
                parts.append(p.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                pass
    return "\n".join(parts).lower()


def notes(bucket: str | None, limit: int) -> list[pathlib.Path]:
    bases = [RIVER / bucket / "dailynote" / bucket] if bucket else [p for p in RIVER.glob("*/dailynote/*")]
    files: list[pathlib.Path] = []
    for b in bases:
        if b.is_dir():
            files += [p for p in b.rglob("*.md")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return files[:limit]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", help="记忆桶名（默认全桶）")
    ap.add_argument("--limit", type=int, default=40, help="扫描最近 N 篇日记（默认 40）")
    ap.add_argument("--top", type=int, default=25, help="最多列出的孤儿数")
    ap.add_argument("--token", help="只查这个 token 是否在载体里")
    args = ap.parse_args()

    text = carrier_text()
    if args.token:
        hit = args.token.lower() in text
        print(f"{'✓ 已在载体' if hit else '✗ 未进载体'}: {args.token}")
        return 0 if hit else 1

    files = notes(args.bucket, args.limit)
    if not files:
        print("未找到日记文件（检查 --bucket / 记忆河流路径）", file=sys.stderr)
        return 2

    seen: dict[str, list[str]] = collections.defaultdict(list)
    for f in files:
        try:
            body = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for rx, kind in TOKEN_RES:
            for m in set(rx.findall(body)):
                t = m.lower()
                if t in STOP or t in text:
                    continue
                seen[t].append(f"{kind}|{f.name[:38]}")

    def exists(tok: str) -> bool:
        """**关键分类**：载体里没有的 token，是"该打捞的知识"还是"日记里的过期/计划名字"？
        只有在磁盘上真实存在的东西才值得打捞（实证 2026-10-17：首版把 4 个'计划/事故记录里的名字'
        当孤儿报出来，全是假阳性）。"""
        if shutil.which(tok):
            return True
        # 精确匹配：文件名**就是** token（无后缀可执行），或 token + 已知脚本后缀。
        # ⚠ 不要用 `glob(tok*)` 就判存在——2026-10-17 实证：那样会把 `.scratch/ys-strace.log`
        #   （只含该词的日志）当成工具，报出假孤儿。
        for base in (HOME / ".local/bin", REPO / "tools", REPO / "scripts", REPO / "tools/ys-editor"):
            if not base.is_dir():
                continue
            for hit in base.rglob(f"{tok}*"):
                if hit.is_file() and (hit.name == tok or hit.suffix in (".sh", ".py", ".mjs", ".js", ".ts")):
                    return True
        return False

    print(f"扫描 {len(files)} 篇日记（{files[0].parent.name}）｜载体语料 {len(text)} 字符")
    if not seen:
        print("✓ 没有孤儿：日记里出现的工具/命令 token 都能在技能或注入文件里找到")
        return 0
    real = {t: w for t, w in seen.items() if exists(t)}
    stale = {t: w for t, w in seen.items() if t not in real}
    print(f"\n① 真孤儿（**磁盘上存在**但载体里搜不到）— 该打捞：{len(real)} 个")
    for t, w in sorted(real.items(), key=lambda kv: (-len(kv[1]), kv[0]))[: args.top]:
        print(f"    {t:26s} ×{len(w):<3} 例: {w[0]}")
    if not real:
        print("    （无）")
    print(f"\n② 非现存名字（**磁盘上找不到**）— 多为计划项/已废弃/事故记录里的名字，别当知识打捞：{len(stale)} 个")
    for t, w in sorted(stale.items(), key=lambda kv: (-len(kv[1]), kv[0]))[: args.top]:
        print(f"    {t:26s} ×{len(w):<3} 例: {w[0]}")
    print("\n动作：① 把用法与判据写进技能（只写名字不算落地）；② 逐个核对是否废弃，废弃的在日记/skill 里标注")
    return 1 if real else 0


if __name__ == "__main__":
    raise SystemExit(main())
