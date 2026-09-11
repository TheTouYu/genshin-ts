#!/usr/bin/env python3
"""归档旧的巨型会话：把 ~/.dsh/sessions 里的 IO/扫描地雷整体搬走（文件不动，可一条 mv 还原）。

背景（2026-09-10 事故）：
  · 全库扫描 302 会话 / 1.2GB 差点卡死机器；其中约 60% 是某个早已不活跃项目的陈年会话。
  · **不能靠删事件"瘦身"**：dsh-session-persistence-jsonl 硬校验事件 seq 必须从 0 连续
    （dsh-session-persistence-jsonl/lib/index.js:333 `seq gap in committed region` → 判损坏，
    缺口之后的历史全部作废）；而且 chunk 事件里的 block-end 携带**完整推理正文**（研究素材本身）。
  · 所以唯一安全动作是**整体搬目录**：搬走 = 不再被列表/扫描/重放触碰；搬回 = 完全恢复。

用法：
  python3 archive_old_sessions.py                                  # 干跑：只报告，绝不改文件
  python3 archive_old_sessions.py --project --home-h-genshin-ts-- --idle-hours 720 --apply
  python3 archive_old_sessions.py --restore                        # 全部还原回 ~/.dsh/sessions
  python3 archive_old_sessions.py --restore --match genshin-ts     # 只还原某项目

🔒 **硬闸（2026-09-10 教训）**：`--apply` 必须与 `--project <精确项目目录名>` 同用，一次只搬一个
   项目。此前模型用"用户说了执行"把 64 个会话（含用户最重要的 genshin-ts 全项目）一举搬走——
   数据搬移不得由模型自行扩大范围，哪怕是"闲置陈年"的：**闲置 ≠ 废弃**，长跑任务收尾后本就安静。

安全边界：① 当前会话永不入选（读 $DSH_SESSION_JSONL）② 只搬 idle-hours 内的会话
③ 只搬 ≥ min-size-mb 的会话 ④ 默认干跑 ⑤ **--apply 必须点名项目**。
"""

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

DEFAULT_ROOT = Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser() / "sessions"
DEFAULT_DEST = Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser() / "sessions-archive"


def current_session_id() -> str:
    p = os.environ.get("DSH_SESSION_JSONL", "")
    return Path(p).parent.name if p else ""


def scan(root: Path, idle_hours: float, min_size_mb: float):
    """返回 [(project, session_dir, size_bytes, mtime)] —— 命中归档条件者。"""
    cur = current_session_id()
    cutoff = time.time() - idle_hours * 3600
    hits = []
    for proj in sorted(p for p in root.iterdir() if p.is_dir()):
        for sd in sorted(p for p in proj.glob("session-*") if p.is_dir()):
            f = sd / "session.jsonl.zstd"
            if not f.exists():
                continue
            if cur and sd.name == cur:
                continue  # 当前会话：永不入选
            st = f.stat()
            if st.st_mtime >= cutoff:
                continue  # 还在活跃窗口内
            if st.st_size < min_size_mb * 1e6:
                continue
            hits.append((proj.name, sd, st.st_size, st.st_mtime))
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description="归档旧的巨型 DSH 会话（默认干跑）")
    ap.add_argument("--root", default=str(DEFAULT_ROOT))
    ap.add_argument("--dest", default=str(DEFAULT_DEST))
    ap.add_argument("--idle-hours", type=float, default=12.0, help="闲置超过 N 小时才入选（默认 12）")
    ap.add_argument("--min-size-mb", type=float, default=5.0, help="只搬大于 N MB 的会话（默认 5）")
    ap.add_argument("--apply", action="store_true", help="真正搬运（缺省=干跑）")
    ap.add_argument("--project", default="",
                    help="--apply 时必填：只处理这一个项目（精确目录名，如 --home-h-genshin-ts--）")
    ap.add_argument("--restore", action="store_true", help="把归档还原回 sessions")
    ap.add_argument("--match", default="", help="只处理项目名含此子串的（restore 时常用）")
    a = ap.parse_args(argv)

    root, dest = Path(a.root).expanduser(), Path(a.dest).expanduser()

    if a.restore:
        if not dest.exists():
            print("[warn] 归档目录不存在: " + str(dest))
            return 1
        n, moved = 0, 0
        for proj in sorted(p for p in dest.iterdir() if p.is_dir()):
            if a.match and a.match not in proj.name:
                continue
            for sd in sorted(p for p in proj.glob("session-*") if p.is_dir()):
                target = root / proj.name / sd.name
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    print("  [skip] 已存在: " + str(target))
                    continue
                shutil.move(str(sd), str(target))
                n += 1
                print("  [还原] " + proj.name + "/" + sd.name)
        print("还原 %d 个会话目录" % n)
        return 0

    hits = scan(root, a.idle_hours, a.min_size_mb)
    if a.match:
        hits = [h for h in hits if a.match in h[0]]
    if a.apply:
        # 🔒 硬闸：不许扩大范围。--apply 必须点名一个项目，且只能点名一个。
        if not a.project:
            print("[拒绝] --apply 必须与 --project <项目目录名> 同用——一次只搬一个你明确指定的项目。")
            print("       2026-09-10 教训：模型曾以'用户说了执行'为由，一次搬走 64 个会话")
            print("       （含用户最重要的 genshin-ts 全项目）。数据搬移不得由模型自行扩大范围。")
            print("       先干跑看清影响，再逐项目征得真人点头后逐个执行。")
            return 2
        hits = [h for h in hits if h[0] == a.project]
        if not hits:
            print("[warn] 项目 %s 在条件内无命中（idle>%.1fh 且 ≥%.1fMB）" % (a.project, a.idle_hours, a.min_size_mb))
            return 0
    if not hits:
        print("[scope] 无命中（idle>%.1fh 且 ≥%.1fMB 的会话）" % (a.idle_hours, a.min_size_mb))
        return 0

    per = {}
    for proj, sd, sz, mt in hits:
        per.setdefault(proj, [0, 0])
        per[proj][0] += 1
        per[proj][1] += sz
    total_b = sum(h[2] for h in hits)
    print("[scope] %s | idle>%.1fh 且 ≥%.1fMB | 命中 %d 个会话 / %.0fMB"
          % (root, a.idle_hours, a.min_size_mb, len(hits), total_b / 1e6))
    for proj in sorted(per, key=lambda k: -per[k][1]):
        n, sz = per[proj]
        print("  %7.1fMB  %3d 个  %s" % (sz / 1e6, n, proj))
    print("  —— 合计 %.0fMB（搬后仍可通过 --root %s 检索）" % (total_b / 1e6, dest))

    if not a.apply:
        print("\n[干跑] 未改动任何文件。**请先把上面这份清单交给真人过目并逐个点头**，再执行：")
        print("  python3 %s --project <项目目录名> --idle-hours %g --min-size-mb %g --apply"
              % (Path(__file__).name, a.idle_hours, a.min_size_mb))
        return 0

    for proj, sd, sz, mt in hits:
        target_dir = dest / proj
        target_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(sd), str(target_dir / sd.name))
    print("\n[完成] 已归档 %d 个会话 / %.0fMB → %s" % (len(hits), total_b / 1e6, dest))
    print("还原：python3 %s --restore [--match <项目名子串>]" % Path(__file__).name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
