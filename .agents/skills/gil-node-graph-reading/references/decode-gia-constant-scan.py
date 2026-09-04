#!/usr/bin/env python3
"""decode-gia 常量/结构对账扫描器（2026-09-03 足球 R2.2 复盘沉淀，免每次手写）。

输入 = `npx tsx tools/decode-gia.ts <file.gia> 2>/dev/null` 的 JSON 输出（先重定向到文件）。
值形态两种（必兼容，2026-09-03 实证首轮单层扫描漏报）：
  ① pins[N].value.bString/bFloat/bInt 直接层
  ② pins[N].value.bConcreteValue.value.bString/bFloat/bInt 嵌套层（带 indexOfConcrete）

用法：
  python3 decode-gia-constant-scan.py <decoded.json>                    # 全量清单+结构统计
  python3 decode-gia-constant-scan.py <decoded.json> --assert \
      str:fb_beat:4 str:fb_phys:2 float:0.2:2 float:52.5:1 int:2250:1   # 对账断言（缺=exit 1）
  python3 decode-gia-constant-scan.py <decoded.json> --assert \
      cfg:1207959581:3 enum:3132:1                                     # config_id / 枚举形态

断言语法 <kind>:<value>:<minCount>；float 用十进制近匹配（容差 2e-4，float32 形态如
0.2→0.20000000298023224 自动命中——禁止字符串 grep，同读图技能 Step 3.6 纪律）。

kind 说明（2026-09-04 票 20 E0 补齐 cfg/enum 两形态，见下"为什么分开计"）：
  str / float / int  = bString / bFloat,bDouble / bInt,bLong
  cfg  = config_id 字面量（bId：技能变量配置 ID、技能配置 ID、单位状态配置 ID 等）
  enum = 枚举字面量（bEnum：技能槽位、释放类型、坐标系…）

**为什么 cfg/enum 必须与 int 分开计**（E0 实证）：技能变量槽位写 `1207959581n` 落 wire 的键是
`bId`（type 18 config_id）而**不是 bInt**——用 `int:` 断言它必然 0 命中，看起来像"常量没落位、
图写坏了"，实际是断言用错了形态。同理枚举参数（CustomSkillSlot12=3132）走 `bEnum`：
装配错槽位=定时触发/施放链**静默失效**（结构层全绿、只有游戏里什么都不发生），
所以槽位这类枚举**值得单独上门禁断言**，而不是混在 int 里数一遍。
"""
import json
import sys
from collections import Counter


VALUE_KEYS = ('bString', 'bFloat', 'bInt', 'bLong', 'bDouble', 'bId', 'bEnum')


def collect(d):
    strs, floats, ints, cfgs, enums = (Counter(), Counter(), Counter(), Counter(), Counter())

    def classify(key, val):
        # 按来源键分类：bFloat 键下 val 即使 JSON 字面无小数点（如 val:4）也是 float 语义
        # ——json.loads 把 "4" 解析成 int，isinstance(val,float) 会漏（2026-09-03 实证）
        if not isinstance(val, (str, int, float)) or isinstance(val, bool):
            return
        if key == 'bString':
            strs[val] += 1
        elif key in ('bFloat', 'bDouble'):
            floats[float(val)] += 1
        elif key in ('bInt', 'bLong'):
            ints[val] += 1
        elif key == 'bId':
            cfgs[val] += 1  # config_id（技能变量/技能配置/单位状态配置 ID）
        elif key == 'bEnum':
            enums[val] += 1  # 枚举字面量（技能槽位/释放类型/坐标系…）

    def scan_unit(inner):
        for n in inner.get('nodes', []):
            for p in n.get('pins', []):
                v = p.get('value')
                if not isinstance(v, dict):
                    continue
                # 只计 alreadySetVal=true 的真实落位值——Assembly List 等泛型节点带大量
                # alreadySet=false 的占位 pin（结构默认值会污染计数，2026-09-03 实证
                # float:4.0 被占位默认值虚报为 2）
                if not v.get('alreadySetVal'):
                    continue
                for key in VALUE_KEYS:
                    if key in v and isinstance(v[key], dict):
                        classify(key, v[key].get('val'))
                bc = v.get('bConcreteValue')  # 嵌套层
                if isinstance(bc, dict):
                    inner_v = bc.get('value')
                    if isinstance(inner_v, dict) and inner_v.get('alreadySetVal'):
                        for key in VALUE_KEYS:
                            if key in inner_v and isinstance(inner_v[key], dict):
                                classify(key, inner_v[key].get('val'))

    scan_unit(d.get('graph', {}).get('graph', {}).get('inner', {}).get('graph', {}))
    for a in d.get('accessories', []):
        scan_unit(a.get('graph', {}).get('inner', {}).get('graph', {}))
    return strs, floats, ints, cfgs, enums


def structure(d):
    inner = d.get('graph', {}).get('graph', {}).get('inner', {}).get('graph', {})
    nodes = inner.get('nodes', [])
    from collections import Counter as C
    gid = C()
    for n in nodes:
        gid[n.get('genericId', {}).get('nodeId')] += 1
    acc = d.get('accessories', [])
    defs = {a['id'].get('id'): a['name'] for a in acc
            if a.get('name') and a.get('which') == 12}
    calls = {}
    for k, v in gid.items():
        if k in defs:
            calls[defs[k]] = v
    impls = []
    for a in acc:
        g = a.get('graph', {}).get('inner', {}).get('graph', {})
        cnt = len(g.get('nodes', []))
        if cnt and not a.get('name'):
            impls.append(cnt)
    return len(nodes), calls, sorted(impls, reverse=True)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    d = json.load(open(sys.argv[1]))
    strs, floats, ints, cfgs, enums = collect(d)
    main_n, calls, impls = structure(d)
    print(f'主图节点数 = {main_n}')
    print(f'复合调用点 = {calls}  (impl 节点数排序 = {impls})')
    if '--assert' not in sys.argv:
        print('str 常量 top:', strs.most_common(30))
        print('float 常量:', sorted(floats.items()))
        print('int 常量 top:', ints.most_common(20))
        print('cfg(config_id) 常量:', sorted(cfgs.items()))
        print('enum 常量:', sorted(enums.items()))
        return
    specs = [a for a in sys.argv[2:] if a != '--assert']
    fail = 0
    for spec in specs:
        kind, val, cnt = spec.rsplit(':', 2)
        cnt = int(cnt)
        if kind == 'str':
            got = strs.get(val, 0)
        elif kind == 'float':
            target = float(val)
            got = sum(v for k, v in floats.items() if abs(k - target) < 2e-4)
        elif kind == 'int':
            got = ints.get(int(val), 0)
        elif kind == 'cfg':
            got = cfgs.get(int(val), 0)
        elif kind == 'enum':
            got = enums.get(int(val), 0)
        else:
            print(f'? 未知 kind {kind}')
            fail += 1
            continue
        ok = got >= cnt
        fail += 0 if ok else 1
        print(('✓' if ok else '✗'), f'{kind}:{val} 期望≥{cnt} 实得={got}')
    sys.exit(1 if fail else 0)


if __name__ == '__main__':
    main()
