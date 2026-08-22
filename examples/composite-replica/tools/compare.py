#!/usr/bin/env python3
"""比对「原版复合节点大全」与「DSL 复刻版」的复合节点结构。

用法：
  python3 examples/composite-replica/tools/compare.py

比对维度（每个复合节点）：
  1. 节点类型 multiset（忽略存储顺序，判断逻辑是否等价）
  2. 输入/输出/inflow/outflow pin 数量
  3. 节点数量
"""
import json, re, subprocess
from collections import Counter

ORIG = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/常用复合节点大全v1.7(补充包同步更新中) (2).gia'
REPLICAS = [
    'examples/composite-replica/dist/src/batch1-variable-logic.gia',
    'examples/composite-replica/dist/src/batch2-random-enum-matrix.gia',
]

# 原版复合 ID -> 复刻版复合名 的映射
ID2NAME = {
    # batch1: 变量运算 + 逻辑运算
    1073741832: 'var_add_float',
    1073741857: 'var_sub_float',
    1073741844: 'var_add_int',
    1073741863: 'var_sub_int',
    1073741841: 'custom_add_float',
    1073741859: 'custom_sub_float',
    1073741836: 'custom_add_int',
    1073741847: 'custom_sub_int',
    1073741864: 'in_range_inclusive',
    1073741865: 'in_range_variant',
    1073741869: 'in_range_open',
    1073741871: 'or4',
    1073741868: 'and4',
    1073741870: 'xor2',
    # batch2: 随机 + 矩阵
    1073741826: 'random_judge',
    1073741861: 'weighted_random',
    1610612760: 'mat_add',
    1610612762: 'mat_sub',
    1610612765: 'mat_scale',
    1610612763: 'mat_transpose',
}

def decode(path):
    r = subprocess.run(['npx', 'tsx', 'tools/decode-gia.ts', path],
                       capture_output=True, text=True, cwd='/home/h/genshin-ts')
    return json.loads(r.stdout)

def node_seq(acc):
    g = acc['graph']['inner']['graph']
    return [n['genericId']['nodeId'] for n in g.get('nodes', [])]

def pin_counts(acc):
    g = acc['graph']['inner']['graph']
    pins = g.get('compositePins', [])
    return {
        'in': sum(1 for p in pins if p['outerPin']['kind'] == 3),
        'out': sum(1 for p in pins if p['outerPin']['kind'] == 4),
        'inflow': sum(1 for p in pins if p['outerPin']['kind'] == 1),
        'outflow': sum(1 for p in pins if p['outerPin']['kind'] == 2),
    }

def replica_impl(rep, name):
    graph_id = None
    for acc in rep['accessories']:
        if acc.get('which') == 12 and acc.get('name') == name:
            graph_id = acc['compositeDef']['inner']['def']['id']['graphId']['id']
            break
    if graph_id is None:
        return None
    for acc in rep['accessories']:
        if acc.get('which') == 9 and acc['id']['id'] == graph_id:
            return acc
    return None

def main():
    orig = decode(ORIG)
    reps = [decode(p) for p in REPLICAS]

    orig_by_id = {acc['id']['id']: acc for acc in orig['accessories']}

    src = open('src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts').read()
    id2name = {}
    for m in re.finditer(r"name:\s*'([^']+)',\s*\n\s*id:\s*(\d+)", src):
        id2name[int(m.group(2))] = m.group(1)

    results = []
    for oid, rname in ID2NAME.items():
        oacc = orig_by_id.get(oid)
        racc = None
        for rep in reps:
            racc = replica_impl(rep, rname)
            if racc:
                break
        if not oacc:
            results.append((oid, rname, 'MISSING_ORIG', ''))
            continue
        if not racc:
            results.append((oid, rname, 'MISSING_REPLICA', ''))
            continue

        oseq = node_seq(oacc)
        rseq = node_seq(racc)
        opins = pin_counts(oacc)
        rpins = pin_counts(racc)

        def norm(seq):
            return ['<composite>' if n >= 1073741824 else n for n in seq]

        noseq = norm(oseq)
        nrseq = norm(rseq)

        diffs = []
        if Counter(noseq) != Counter(nrseq):
            diffs.append(f"节点集合: 原版={[id2name.get(n, n) for n in oseq]} vs 复刻={[id2name.get(n, n) for n in rseq]}")
        if opins != rpins:
            diffs.append(f"pin: 原版={opins} vs 复刻={rpins}")
        if len(oseq) != len(rseq):
            diffs.append(f"节点数: 原版={len(oseq)} vs 复刻={len(rseq)}")

        status = 'PASS' if not diffs else 'DIFF'
        results.append((oid, rname, status, '; '.join(diffs)))

    print(f"=== 比对结果（{len(results)} 个复合节点）===\n")
    npass = 0
    for oid, rname, status, detail in results:
        mark = '✅' if status == 'PASS' else ('❌' if status == 'DIFF' else '⚠️')
        print(f"{mark} {oid} -> {rname}: {status}")
        if detail:
            print(f"     {detail}")
        if status == 'PASS':
            npass += 1
    print(f"\n=== 汇总: {npass}/{len(results)} PASS ===")

if __name__ == '__main__':
    main()
