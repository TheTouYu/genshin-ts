#!/usr/bin/env python3
"""20-e0-assert.py —— 票 20 · E0 轮 decode-gia 断言门禁（2026-09-04）

用法：
  python3 .scratch/football-v2/analysis/20-e0-assert.py \
      examples/football/dist-fb/src-fb/fb20c-loop.gia \
      examples/football/dist-fb/src-fb/fb20c-server.gia

断言口径来源（预注册，实测前不改）：
  · 设计单 §7.1 五问 → 探针载荷必须在图里（tag 常量/时钟引脚/cfg 字面量/预算常量）
  · 设计单 §7.3 风险 1 → finiteLoop 必须**圈数上界 + 时钟预算双闸**
  · 技能〇章前置 1 → 信号节点必须绑定**真实注册表**三元组（1610612783/784/785）
  · 不变量 8 / lint 噪音甄别 → break_loop→finite_loop 的 InFlow[1] 是合法回连
    （对照 verify/inflow-index/inflow-index-repro.ts 已知良好形态），
    除此之外不得有多入边节点。
exit 1 = 有断言失败（可作 CI/收轮门禁）。
"""
import json
import re
import subprocess
import sys

CLIENT_META = 'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts'
SERVER_META = 'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts'

# 真值（2026-09-04 assets:signals register 回读，写死为断言基准）
FB20_ECHO = {'send': 1610612783, 'monitor': 1610612784, 'server': 1610612785}
CFG_R = 1207959581       # 角色侧 L0 技能变量槽
LOOP_CAP = 100           # Q5 圈数上界（日志 3190 实证：500 圈单拍 5031 帧超 3000 红线→降到 100）
BUDGET_MS = 20           # Q5 时钟预算上界（ms；单拍时钟冻结预期不触发=测量载体）
SUB_SAMPLE_EVERY = 4     # Q5 抽样间隔拍数（按 RTAG1 计数，非按秒——3190 实证秒相位门永不命中）
SKILL_CFG = 1098907653   # 6 + 瞬发，body-f5 绑 20002 图
STATUS_CFG = 1077936132  # 单位状态「定时触发技能」（地图已存在资产，实测盘点回填）
SLOT12_ENUM = 3132       # CharacterSkillSlot.CustomSkillSlot12 的枚举字面量
                         # （状态实测 槽3=32 ⇒ 32-20=槽 12；装配错槽=定时触发找不到技能=静默判负）
CLIENT_GRAPH_ID = 1082130439
SERVER_GRAPH_ID = 1073741836

fails = []
oks = []


def check(cond, msg):
    (oks if cond else fails).append(msg)


def decode(path):
    out = subprocess.run(
        ['npx', 'tsx', 'tools/decode-gia.ts', path],
        capture_output=True, text=True).stdout
    d = json.loads(out)

    def walk(o):
        if isinstance(o, dict):
            if 'nodes' in o and isinstance(o['nodes'], list):
                yield o
            for v in o.values():
                yield from walk(v)
        elif isinstance(o, list):
            for v in o:
                yield from walk(v)

    graphs = list(walk(d))
    if not graphs:
        raise SystemExit(f'[error] 未找到 graph.nodes: {path}')
    # 主图 = 节点数最多的容器（impl 子图另计）
    g = max(graphs, key=lambda x: len(x['nodes']))
    return d, g


def load_names(path):
    src = open(path).read()
    names = {}
    for m in re.finditer(
        r"nodeType:\s*'([^']+)',\s*\n\s*displayName:\s*'([^']*)',\s*\n\s*graphType:\s*\d+,\s*\n\s*genericId:\s*(\d+),",
            src):
        names.setdefault(int(m.group(3)), m.group(2))
    return names


def load_server_names(path):
    src = open(path).read()
    names = {}
    for m in re.finditer(r"name:\s*'([^']+)',\s*\n\s*id:\s*(\d+),", src):
        names.setdefault(int(m.group(2)), m.group(1))
    return names


def exec_edges(g):
    """(src pin kind=exec connect) -> adjacency；kind 1=exec, 4=data"""
    adj = {}
    indeg = {}
    for n in g['nodes']:
        i = n['nodeIndex']
        for pi, p in enumerate(n.get('pins', [])):
            for c in (p.get('connects') or []):
                conn = c.get('connect') or {}
                if conn.get('kind') != 1:
                    continue
                adj.setdefault(i, []).append((c['id'], conn.get('index'), pi))
                indeg.setdefault(c['id'], []).append((i, pi))
    return adj, indeg


def data_in(g, idx):
    n = [x for x in g['nodes'] if x['nodeIndex'] == idx][0]
    out = []
    for pi, p in enumerate(n.get('pins', [])):
        for c in (p.get('connects') or []):
            conn = c.get('connect') or {}
            if conn.get('kind') == 4:
                out.append((pi, c['id'], conn.get('index')))
    return out


def node_by_gid(g, gid):
    return [n for n in g['nodes'] if n.get('genericId', {}).get('nodeId') == gid]


def literal_pins(n, upto=8):
    """返回 pin 序号 -> 已落位字面量值"""
    out = {}
    for pi, p in enumerate(n.get('pins', [])[:upto]):
        v = p.get('value') or {}
        if not v.get('alreadySetVal'):
            continue
        src_v = v
        cv = v.get('bConcreteValue')
        if isinstance(cv, dict) and isinstance(cv.get('value'), dict):
            src_v = cv['value']  # 嵌套形态（事件字面量参数走此路，Step 6 速查）
        for k in ('bString', 'bInt', 'bFloat', 'bBool', 'bId', 'bEnum'):
            o = src_v.get(k)
            if isinstance(o, dict) and 'val' in o:
                out[pi] = o['val']
    return out


def main():
    loop_path, sv_path = sys.argv[1], sys.argv[2]
    cnames = load_names(CLIENT_META)
    snames = load_server_names(SERVER_META)

    # ———— 客户端探针图（20002）————
    dcl, gl = decode(loop_path)
    # .gia 内嵌图 ID 必须 = CLI 真实分配值（占位 ID 禁止注入红线；错配会被 gsts 类型守卫拒）
    check((dcl.get('graph', {}).get('id') or {}).get('id') == CLIENT_GRAPH_ID,
          f'客户端 .gia 图 ID = {CLIENT_GRAPH_ID}（实得 {(dcl.get("graph", {}).get("id") or {}).get("id")}）')
    check(len(gl['nodes']) < 60, f'客户端图节点预算 <60（实得 {len(gl["nodes"])}）')

    # 信号三元组绑定真实注册表（发送节点用 serverId 形态，同 20008 先例）
    acc = dcl.get('accessories') or []
    names = {a.get('name'): (a.get('id') or {}).get('id') for a in acc if a.get('name')}
    check(names.get('向服务器节点图发送信号') == FB20_ECHO['server'],
          f'发送信号节点 ID = fb20_echo serverId {FB20_ECHO["server"]}（实得 {names.get("向服务器节点图发送信号")}）')
    sends = [n for n in gl['nodes']
             if n.get('genericId', {}).get('nodeId') == FB20_ECHO['server']]
    check(len(sends) == 3, f'发送节点 3 个（CTIME/RTAG1/SUB_K；SUB_DT 已废弃——单拍时钟冻结 dt 恒 0，实得 {len(sends)}）')

    # 四个 tag 常量各落位一次
    tags = set()
    for n in sends:
        for pi, v in literal_pins(n).items():
            if isinstance(v, str) and v in ('CTIME', 'RTAG1', 'SUB_K', 'SUB_DT'):
                tags.add(v)
    check(tags == {'CTIME', 'RTAG1', 'SUB_K'}, f'三 tag 常量落位（实得 {sorted(tags)}）')

    # cfg 字面量三处（query/set/query）——Q4 探针身份
    cnt = 0
    for n in gl['nodes']:
        for pi, v in literal_pins(n, 4).items():
            if v == CFG_R:
                cnt += 1
    check(cnt == 3, f'技能变量 cfg {CFG_R} 落位 3 次（实得 {cnt}）')

    # Q5 双闸常量
    # 常量落位（bInt/bId/bEnum 三形态，literal_pins 已兼容嵌套层）
    vals = [v for n in gl['nodes'] for v in literal_pins(n).values()]
    check(LOOP_CAP in vals, f'Q5 圈数上界 {LOOP_CAP} 落位')
    check(BUDGET_MS in vals, f'Q5 时钟预算 {BUDGET_MS}ms 落位')
    check(SUB_SAMPLE_EVERY in vals, f'抽样间隔 {SUB_SAMPLE_EVERY} 拍落位')

    # 时钟节点必须取 clientTimeMs（pin index 1，取 0=S 会让 Q3/Q5 差 1000×）
    clocks = node_by_gid(gl, 200270)
    check(len(clocks) == 2, f'高精度时钟节点 2 处（t0/循环内；SUB_DT 废弃后无 t1，实得 {len(clocks)}）')
    # 数据边挂在**目的 pin** 上、connects[].id=来源节点、connect.index=来源引脚
    # （exec 边相反挂源 pin——decode 两种方向，2026-09-04 本图实证）
    clock_idx = {n['nodeIndex'] for n in clocks}
    ms_ok = ms_total = 0
    for n in gl['nodes']:
        for p in n.get('pins', []):
            for c in (p.get('connects') or []):
                conn = c.get('connect') or {}
                if conn.get('kind') == 4 and c['id'] in clock_idx:
                    ms_total += 1
                    if conn.get('index') == 1:
                        ms_ok += 1
    check(ms_total >= 3 and ms_ok == ms_total,
          f'时钟数据边全部取 pin1=clientTimeMs（{ms_ok}/{ms_total}）')

    # finiteLoop 双闸结构：循环体 → 双分支 → 跳出循环 → finite_loop InFlow[1]
    loops = node_by_gid(gl, 200079)
    breaks = node_by_gid(gl, 200080)
    check(len(loops) == 1, f'有限循环 1 个（实得 {len(loops)}）')
    check(len(breaks) == 1, f'跳出循环 1 个（实得 {len(breaks)}）')
    adjl, inegl = exec_edges(gl)
    loop_idx = loops[0]['nodeIndex'] if loops else None
    brk_idx = breaks[0]['nodeIndex'] if breaks else None
    # break 节点出边必须回连 loop 的 InFlow[1]（target_index=1 是引擎 break 语义的载体，
    # verify/inflow-index 修复的回归点）
    ret = adjl.get(brk_idx, []) if brk_idx else []
    check(any(t == loop_idx and ix == 1 for t, ix, _ in ret),
          f'break→finite_loop InFlow[1]（合法回连，实得 {[(t, ix) for t, ix, _ in ret]}）')
    # 循环体内必须有「是否大于等于( spent, budget )」预算比较（双闸之一）
    ge = node_by_gid(gl, 200010)
    check(len(ge) == 1, f'预算比较节点（是否大于等于）1 个（实得 {len(ge)}）')

    # 除/乘/减三件套在（抽样门=整除回乘求余）
    check(len(node_by_gid(gl, 200014)) == 1, '除法（拍整除）1 个')
    check(len(node_by_gid(gl, 200013)) == 1, '乘法（拍回乘）1 个')
    check(len(node_by_gid(gl, 200012)) == 2, '减法 2 个（spent + nResidue，实得 {len(node_by_gid(gl, 200012))}）')

    # 局部变量 fb20_k 三处（init/set body/get），名字必须一致，否则 Q5 读到空
    lv_names = set()
    for gid in (200081, 200082):
        for n in node_by_gid(gl, gid):
            for pi, v in literal_pins(n, 2).items():
                if isinstance(v, str):
                    lv_names.add(v)
    check('fb20_k' in lv_names, f'局部变量名 fb20_k 在位（实得 {sorted(lv_names)}）')

    # 入边纪律：除 finite_loop 外零多入边（finite_loop 双入边=break 回连，已知良好）
    multi = {k: len(v) for k, v in inegl.items() if len(v) > 1}
    check(multi in ({}, {loop_idx: 2}),
          f'多入边节点仅 finite_loop（合法 break 回连）（实得 {multi}）')

    # ———— 服务端装配图（20000）————
    dsv, gsv = decode(sv_path)
    check((dsv.get('graph', {}).get('id') or {}).get('id') == SERVER_GRAPH_ID,
          f'服务端 .gia 图 ID = {SERVER_GRAPH_ID}（实得 {(dsv.get("graph", {}).get("id") or {}).get("id")}）')
    check(len(gsv['nodes']) < 60, f'服务端图节点 <60（实得 {len(gsv["nodes"])}）')
    # 装配链：装配 → 施加状态 → 打印（顺序即判据：状态施加必须在装配之后）
    adds = node_by_gid(gsv, 395)   # Add Character Skill
    aus = node_by_gid(gsv, 297)    # Add Unit Status
    check(len(adds) == 1 and len(aus) == 1, '装配/施加状态各 1 节点')
    adjs, inegs = exec_edges(gsv)
    if adds and aus:
        ai = adds[0]['nodeIndex']
        ui = aus[0]['nodeIndex']
        check(any(t == ui for t, _, _ in adjs.get(ai, [])), '装配 → 施加状态（顺序正确）')
    # 技能配置 ID 落位
    svl = [v for n in gsv['nodes'] for v in literal_pins(n).values()]
    check(SKILL_CFG in svl, f'技能配置 ID {SKILL_CFG} 落位')
    check(STATUS_CFG in svl, f'单位状态 ID {STATUS_CFG} 落位（bId 形态）')
    # 装配槽位必须 = 状态实测指向的 CustomSkillSlot12（3121=槽1，会静默不触发）
    addEnums = [v for n in node_by_gid(gsv, 395) for v in literal_pins(n).values()]
    check(SLOT12_ENUM in addEnums, f'装配槽位 = 3132(槽12)（实得 {addEnums}）')
    check(3121 not in addEnums, '槽位不得是 3121(槽1)')
    # 定时器名单：本图唯一定时器名
    timer_lit = [v for n in node_by_gid(gsv, 79) for v in literal_pins(n).values()
                 if isinstance(v, str)]
    check('fb20c_arm_once' in timer_lit, '定时器名 fb20c_arm_once 落位')
    check(len(node_by_gid(gsv, 79)) == 1, '仅一个 Start Timer（一次性装配）')
    # 角色寻址链：玩家列表 → [0] → 角色列表 → [0]
    check(len(node_by_gid(gsv, 248)) == 1, 'Get List of Player Entities 在位')
    check(len(node_by_gid(gsv, 258)) == 1, 'Get All Character Entities 在位')
    check(len(node_by_gid(gsv, 128)) == 2, '两次取列表[0]（玩家/角色）')
    # Q1 到达面：监听 fb20_echo → 图变量计数
    mons = node_by_gid(gsv, FB20_ECHO['monitor'])
    check(len(mons) == 1, f'服务端监听 fb20_echo（monitor {FB20_ECHO["monitor"]}）1 个')
    if mons:
        mi = mons[0]['nodeIndex']
        set_idx = {n['nodeIndex'] for n in node_by_gid(gsv, 323)}  # 323=Set / 337=Get
        check(any(t in set_idx for t, _, _ in adjs.get(mi, [])),
              '监听 → Set Node Graph Variable（计数落位）')
    # 零多入边（服务端图不得有 fb_render 那类病灶）
    multi_s = {k: len(v) for k, v in inegs.items() if len(v) > 1}
    check(not multi_s, f'服务端图零多入边节点（实得 {multi_s}）')

    # 图变量声明三个
    gv_names = set()
    for n in node_by_gid(gsv, 337) + node_by_gid(gsv, 323):
        for v in literal_pins(n, 2).values():
            if isinstance(v, str):
                gv_names.add(v)
    check({'fb20c_armed', 'fb20c_sig_n', 'fb20c_sig_last'} <= gv_names,
          f'图变量三件套在位（实得 {sorted(gv_names)}）')

    print(f'\n== E0 decode 断言：{len(oks)} 通过 / {len(fails)} 失败 ==')
    for m in oks:
        print('  ✓', m)
    for m in fails:
        print('  ✗', m)
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
