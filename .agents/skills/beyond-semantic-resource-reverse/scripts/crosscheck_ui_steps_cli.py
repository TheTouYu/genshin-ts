#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
crosscheck_ui_steps_cli.py — 用项目 CLI 语义 list 交叉核对 ui_steps.md 的每一步是否可解释。

背景（票04 Round3 收轮后核对，2026-09-05）:
  ui_steps.md 的“成员追加/文本变化/字段变化”等步骤来自 type1017 IPC 逐帧差分；
  本脚本调用仓库自带只读语义 reader：
    node bin/gsts.mjs assets:ui list --flat --gil <after.gil> --format json
  用 CLI 终态语义树（kind/name/path/成员树）对每个步骤组做判定：
    - MEM 组（布局/容器 f503 成员追加）：被追加 id 是否在终态存在、
      名称是否与 IPC 显示名一致、终态是否仍挂在同一容器（ancestor 链）；
    - OTHER 组（文本/字段/增删槽等）：给出资产级 CLI 语义（kind/name/path）与
      叶子形态统计；字段级叶子语义未闭合的保持 fail-closed 说明。

用法:
  python3 crosscheck_ui_steps_cli.py \
    --steps .scratch/.../ui_steps.md \
    --gil .scratch/.../after/1073741918.gil \
    --output .scratch/.../ui_steps_cli_crosscheck.md

只读：CLI 只读命令 + 输入文件；只写 --output 报告。
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
GSTS = REPO / 'bin' / 'gsts.mjs'


def cli_flat(gil: Path) -> dict:
    r = subprocess.run(
        ['node', str(GSTS), 'assets:ui', 'list', '--flat', '--gil', str(gil), '--format', 'json'],
        capture_output=True, text=True, cwd=REPO, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f'CLI 失败 rc={r.returncode}: {r.stderr[-800:]}')
    out = json.loads(r.stdout)
    if not isinstance(out.get('flat'), list):
        raise RuntimeError(f'意外的 CLI 输出（kind={out.get("kind")}），缺少 flat 列表')
    return out


def index_tree(nodes, anc, by_id):
    """flat 列表把叶子重复平铺在顶层：首次（嵌套容器内）出现才记录归属链。"""
    for n in nodes:
        i = n['id']
        if i in by_id:
            continue
        meta = {k: n.get(k) for k in ('id', 'kind', 'name', 'path', 'role', 'props') if k in n}
        meta['anc'] = list(anc)
        by_id[i] = meta
        index_tree(n.get('children') or [], anc + [i], by_id)


def parse_steps(text: str):
    groups = []
    cur = None
    for line in text.splitlines():
        m = re.match(r'^## \$(\d+) (.*)$', line)
        if m:
            cur = {'id': int(m.group(1)), 'label': m.group(2).strip(), 'bullets': [], 'pair': None}
            groups.append(cur)
            continue
        if cur is None:
            continue
        fm = re.match(r'^- (\S+) → (\S+)$', line)
        if fm:
            cur['pair'] = (fm.group(1), fm.group(2))
        elif line.startswith('  - '):
            cur['bullets'].append(line[4:])
    return groups


def leaf_kinds(bullets):
    c = collections.Counter()
    for b in bullets:
        head = re.sub(r' @ .*', '', b).split('：')[0].split('(')[0].strip()
        c[head or '其他'] += 1
    return dict(c)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--steps', type=Path, required=True)
    ap.add_argument('--gil', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    cli = cli_flat(args.gil)
    by_id: dict[int, dict] = {}
    index_tree(cli.get('flat') or [], [], by_id)

    groups = parse_steps(args.steps.read_text(encoding='utf-8'))

    L = []
    L.append('# ui_steps ↔ assets:ui list 交叉核对报告（票04 Round3 核对轮）\n')
    L.append('> 方法：ui_steps 每组 = IPC 帧对步骤；CLI = `assets:ui list --flat` 对 after GIL 的终态语义树。')
    L.append(f'- steps 文件: `{args.steps}`')
    L.append(f'- GIL(终态): `{args.gil}`')
    L.append(f'- CLI 命令: `node bin/gsts.mjs assets:ui list --flat --gil <after.gil> --format json`')
    L.append(f'- CLI 记录数: {len(by_id)}\n')

    stat = collections.Counter()
    mem_rows = []
    other_rows = []
    name_mismatch = []
    missing = []
    remounted = []
    twins = []

    for g in groups:
        member_entries = []
        for b in g['bullets']:
            mm = re.search(r'成员追加: \+([^\n]*)', b)
            if mm:
                member_entries.extend((int(i), n) for i, n in re.findall(r'(\d+)(?:\(([^)]*)\))?', mm.group(1)))
        if member_entries:
            stat['member_groups'] += 1
            stat['member_ids'] += len(member_entries)
            det = []
            all_ok = True
            for i, dn in member_entries:
                meta = by_id.get(i)
                if meta is None:
                    # 终态缺失：按同名义找孪生（模板化/同步重映射常见：官方单条 → 模板+实例 换 ID）
                    twin = None
                    if dn:
                        cands = [m for m in by_id.values() if m.get('name') == dn and m['id'] != i]
                        twin = cands[0] if cands else None
                    if twin is not None:
                        stat['twin_remap'] += 1
                        all_ok = False
                        twins.append((g['id'], i, dn, twin['id']))
                        det.append(f'- {i}({dn})：终态缺失，但存在同名孪生 {twin["id"]}'
                                   f'（CLI kind={twin.get("kind")} @ `{twin.get("path")}`）→ 疑似模板化/同步 ID 重映射')
                    else:
                        stat['missing_in_final'] += 1
                        all_ok = False
                        missing.append((g['id'], i, dn))
                        det.append(f'- {i}({dn or "?"})：**终态缺失且无同名孪生**')
                    continue
                fname = meta.get('name') or ''
                name_ok = (not dn) or dn == fname
                anchored = g['id'] in meta['anc']
                if anchored and name_ok:
                    stat['explained_same_mount'] += 1
                    det.append(f'- {i}({fname})：终态同容器（{g["id"]} 下，路径 `{meta.get("path")}`）')
                else:
                    all_ok = False
                    if not name_ok:
                        stat['name_mismatch'] += 1
                        name_mismatch.append((g['id'], i, dn, fname))
                        det.append(f'- {i}：名称不一致 IPC={dn!r} CLI={fname!r}')
                    if not anchored:
                        stat['remounted'] += 1
                        remounted.append((g['id'], i, meta.get('path')))
                        det.append(f'- {i}({fname})：终态已不在 {g["id"]} 容器下 → `{meta.get("path")}`')
            verdict = '全部一致' if all_ok else '部分/不一致'
            mem_rows.append((g['id'], g['label'], ' → '.join(g['pair'] or ('?', '?')),
                             verdict, '\n'.join(det)))
        else:
            stat['other_groups'] += 1
            kinds = leaf_kinds(g['bullets'])
            meta = by_id.get(g['id'])
            if meta is None:
                cli_note = 'CLI 终态无此 id（仅 IPC 可见/终态已删除）'
                meta_path = '-'
            else:
                cli_note = f"CLI={meta.get('kind')}/{meta.get('name') or '·'}"
                meta_path = meta.get('path') or '-'
            stat['other_leaves'] += len(g['bullets'])
            other_rows.append((g['id'], g['label'], ' → '.join(g['pair'] or ('?', '?')),
                               kinds, meta_path, cli_note))

    # 汇总表
    L.append('## 汇总\n')
    L.append('| 维度 | 数值 |')
    L.append('| --- | --- |')
    L.append(f'| ui_steps 步骤组 | {len(groups)} |')
    L.append(f'| 成员追加组（布局/容器 f503） | {stat["member_groups"]} |')
    L.append(f'| 成员追加组逐条核对 id | {stat["member_ids"]} |')
    L.append(f'| 其中：终态同容器且名称一致（可解释） | {stat["explained_same_mount"]} |')
    L.append(f'| 名称不一致 | {stat["name_mismatch"]} |')
    L.append(f'| 终态已迁出原容器（移动/再布局） | {stat["remounted"]} |')
    L.append(f'| 终态缺失但有同名孪生（疑似模板化/同步重映射） | {stat["twin_remap"]} |')
    L.append(f'| 终态缺失且无孪生 | {stat["missing_in_final"]} |')
    L.append(f'| 非成员步骤组（文本/字段/槽增删） | {stat["other_groups"]}（叶子 {stat["other_leaves"]} 条） |')
    L.append(f'| CLI 语义树记录数 | {len(by_id)} |\n')

    L.append('## 成员追加组明细（MEM）\n')
    for rid, label, pair, verdict, det in mem_rows:
        L.append(f'### {rid} {label}（{pair}）→ {verdict}\n')
        L.append(det + '\n')

    L.append('## 非成员组明细（OTHER，资产级解释）\n')
    for rid, label, pair, kinds, path, cli_note in other_rows:
        L.append(f'- **{rid} {label}** {pair}\n'
                 f'  - 叶子形态: {kinds}\n'
                 f'  - 终态: {cli_note} @ `{path}`\n'
                 f'  - 判定: 资产级可解释（CLI 提供 kind/name/归属）；'
                 f'字段级叶子逐条语义需该控件类型单操作差分（fail-closed）')

    L.append('## 未解释/存疑清单\n')
    if name_mismatch:
        L.append('- 名称不一致：' + '; '.join(f'{a} 步骤 {i}(IPC {x}) vs CLI {y}' for a, i, x, y in name_mismatch))
    if missing:
        L.append('- 终态缺失：' + '; '.join(f'{a} 追加 {i}({x or "?"})' for a, i, x in missing))
    if remounted:
        L.append(f'- 终态重挂 {len(remounted)} 条（IPC 时刻语义仍成立，终态已移动；'
                 f'示例：' + '; '.join(f'{a}+{i}→{p}' for a, i, p in remounted[:6]) + ')')
    for a, i, dn, t in twins:
        L.append(f'- {a} 追加的 {i}({dn}) 终态缺失 → 同名孪生 {t}（疑似模板化/同步 ID 重映射；'
                 f'需模板化探针确认，未当作已闭合规则）')
    L.append('- 其它组的字段级叶子（文本/字号/颜色/几何/显隐等）逐条语义未闭合：'
             '需要各控件类型的编辑器单操作差分（1875/1877/1881 等为候选样本）。\n')

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text('\n'.join(L), encoding='utf-8')
    print(f'groups={len(groups)} mem_groups={stat["member_groups"]} member_ids={stat["member_ids"]} '
          f'explained={stat["explained_same_mount"]} name_mismatch={stat["name_mismatch"]} '
          f'remounted={stat["remounted"]} twin_remap={stat["twin_remap"]} missing={stat["missing_in_final"]} '
          f'other_groups={stat["other_groups"]} other_leaves={stat["other_leaves"]}')
    print(f'wrote {args.output}')


if __name__ == '__main__':
    main()
