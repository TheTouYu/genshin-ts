#!/usr/bin/env python3
"""交付核对表生成器 —— 把 DELIVERY.md 的「专题矩阵」一节按实际文件重算。

为什么要脚本：交付核对如果手写，就等于自述；用脚本重算才能被复核。
脚本把结果写回 DELIVERY.md 的 <!-- AUDIT:START --> ... <!-- AUDIT:END --> 之间。

用法: python3 docs/knowledge-graph/audit.py
退出码: 0 全部达标 / 1 有不达标项（可直接当门禁用）
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DELIVERY = os.path.join(ROOT, 'DELIVERY.md')


def audit_dir(d: str, label: str):
    rows, bad = [], []
    if not os.path.isdir(d):
        return rows, bad
    for f in sorted(os.listdir(d)):
        if not f.endswith('.md'):
            continue
        t = open(os.path.join(d, f), encoding='utf-8').read()
        bvs = set(re.findall(r'BV[0-9A-Za-z]{10}', t))
        tut = set()
        for m in re.finditer(r'(BV[0-9A-Za-z]{10})[^\n]{0,80}?(教程|公开课|讲座|教学)', t):
            tut.add(m.group(1))
        for m in re.finditer(r'(教程|公开课|讲座|教学)[^\n]{0,80}?(BV[0-9A-Za-z]{10})', t):
            tut.add(m.group(2))
        ev = all(k in t for k in ('硬规则', '实测'))
        cap = ('覆盖度' in t) or ('✅' in t and '🔴' in t)
        ok = len(bvs) >= 2 and len(tut) >= 1 and ev and cap
        if not ok:
            bad.append(f)
        rows.append((label, f, len(bvs), len(tut), ev, cap, len(t.splitlines())))
    return rows, bad


def main() -> int:
    rows, bad = [], []
    for d, label in (('k', 'K 轴'), ('d', 'D 轴')):
        r, b = audit_dir(os.path.join(ROOT, d), label)
        rows += r
        bad += b

    md = ["| 轴 | 专题 | 源数 | 教程源 | 证据等级 | 能力覆盖 | 行数 |",
          "|---|---|---|---|---|---|---|"]
    for label, f, nb, nt, ev, cap, ln in rows:
        md.append(f"| {label} | `{f[:-3]}` | {nb} | {nt} | {'✅' if ev else '❌'} | "
                  f"{'✅' if cap else '❌'} | {ln} |")
    total_lines = sum(r[6] for r in rows)
    md += ["", f"**合计 {len(rows)} 篇 / {total_lines:,} 行**；"
               f"不达标 **{len(bad)}** 篇" + ("（" + ", ".join(bad) + "）" if bad else " ✅"),
           "", "判据：① 引用的 BV 去重后 ≥2 ② 至少有 1 个 BV 与「教程/公开课/讲座/教学」同现 "
               "③ 同时出现「硬规则」与「实测」两种等级 ④ 有覆盖度节（或同时有 ✅ 与 🔴 标记）"]

    src = open(DELIVERY, encoding='utf-8').read()
    new = re.sub(r'<!-- AUDIT:START -->.*?<!-- AUDIT:END -->',
                 '<!-- AUDIT:START -->\n' + "\n".join(md) + '\n<!-- AUDIT:END -->',
                 src, flags=re.S)
    if new == src and '<!-- AUDIT:START -->' not in src:
        print('✗ DELIVERY.md 里找不到 AUDIT 锚点', file=sys.stderr)
        return 2
    open(DELIVERY, 'w', encoding='utf-8').write(new)

    print(f"✓ {len(rows)} 篇 / {total_lines:,} 行；不达标 {len(bad)} 篇"
          + (f"：{bad}" if bad else " ✅"))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
