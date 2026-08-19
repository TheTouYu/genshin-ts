// rubik-2x2 完整游戏关卡基础设施（2026-08-17）
//
// 架构：五层分离（输入/流程/逻辑状态/表现/结算）——见 docs/architecture/rubik-game-level-infrastructure.md
//   - 输入层：tabBar 选项事件（tabId 1-6 = R/L/U/D/F/B 转动；7 = 打乱；8 = 自动复原；9 = 重置）
//   - 流程层：输入锁 + 模式（MANUAL/AUTO 队列播放）+ afterTurn 钩子（胜利检查/队列推进）
//   - 逻辑状态层：cornerPos/cornerOrient = 单一事实源（胜利判定、求解器输入只读它）
//   - 表现层：沿用已验证机制（自旋 + 分段公转，位置+朝向全精确）——逻辑与视觉解耦
//   - 结算层：isSolved → setPlayerSettlementSuccessStatus(Victory)
//
// 受限环境预算：新增逻辑层/流程层/结算层节点估算见架构文档 §7（目标单图 <2000 节点）。
// 2×2 逻辑状态 move 置换表由 tools/gen-2x2-logic-table.mjs 生成（CubeLib 交叉验证通过）——勿手改。
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import type { IntValue } from 'genshin-ts/runtime/value'
import { bool, float, int, listLiteral, str } from 'genshin-ts/runtime/value'
import type { ServerExecutionFlowFunctions } from 'genshin-ts/definitions/nodes'

// 18° 段预计算常量（v5 已验证）：p_k = v0·Ck + (axis×v0)·Sk；vel_k = (p_k − p_{k−1})·K_VEL
const C1 = 0.9510565 // cos18°
const S1 = 0.309017 // sin18°
const C2 = 0.809017 // cos36°
const S2 = 0.587785 // sin36°
const C3 = 0.587785 // cos54°
const S3 = 0.809017 // sin54°
const C4 = 0.309017 // cos72°
const S4 = 0.9510565 // sin72°
const C5 = 0 // cos90°
const S5 = 1 // sin90°
const K_VEL = 5 // 1/0.2s
const DEG2RAD = 0.017453292519943295 // π/180
const SCRAMBLE_LEN = 20n // 打乱步数
const CORNER_COUNT = 8n // 角块数

// ================================================================
// 逻辑状态层（2026-08-17 基础设施新增）
// 角位编号 0..7 = UBL UBR UFL UFR DBL DBR DFL DFR
// twist 编码对齐受限求解原型 cube.js：U/D 色贴纸在角位 slots
//   [U/D面, Z面(F/B), X面(R/L)] 的下标 0/1/2；已还原 = 全 0
// 引擎无列表原地修改节点 → 状态用 dict 读写（set_or_add / query_by_key）
// ================================================================

// 读取角位状态（纯数据）：p → { piece, twist }
// 读取角位状态（纯数据）：p → { piece, twist }（列表读，性能远高于字典）
const gstsLogicReadCorner = g.defineComposite('gsts_logic_read_corner', {
  inputs: { p: { type: 'int' } },
  outputs: { piece: { type: 'int' }, twist: { type: 'int' } },
  build: ({ p }, f) => ({
    piece: f.getCorrespondingValueFromList(f.getNodeGraphVariable('cornerPos').asType('int_list'), p),
    twist: f.getCorrespondingValueFromList(f.getNodeGraphVariable('cornerOrient').asType('int_list'), p)
  })
})

// 单槽表读取（纯数据）：(moveId, slot) → { piece, twist }（tblFrom 列表 index = moveId*4+slot）
const gstsLogicReadSlot = g.defineComposite('gsts_logic_read_slot', {
  inputs: { moveId: { type: 'int' }, slot: { type: 'int' } },
  outputs: { piece: { type: 'int' }, twist: { type: 'int' } },
  build: ({ moveId, slot }, f) => {
    const key = f.addition(f.multiplication(moveId, 4n), slot)
    const p = f.getCorrespondingValueFromList(f.getNodeGraphVariable('tblFrom').asType('int_list'), key)
    return f.callComposite(gstsLogicReadCorner, { p })
  }
})

// 状态变更（exec）：按 moveId 应用 4 槽置换——
// 先全部读取 → 物化到 tempP/tempT（set_list_value，piece/twist 各只消费一次 → 消除惰性重求值），
// 再全部写入（避免环内别名覆盖：q_s 可能与 p_{s+1} 相同）；槽位展开 4 次
const gstsLogicApplyMove = g.defineComposite('gsts_logic_apply_move', {
  inputs: { moveId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId }, f) => {
    // 阶段 1：读取 4 槽 → 暂存
    const r0 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 0n })
    const t0a = f.node('set_list_value', [f.getNodeGraphVariable('tempP').asType('int_list'), new int(0), r0.piece])
    const t0b = f.node('set_list_value', [f.getNodeGraphVariable('tempT').asType('int_list'), new int(0), r0.twist])
    f.link(f.entry(), 0, t0a, 0)
    f.connect(t0a, 0, t0b, 0)
    const r1 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 1n })
    const t1a = f.node('set_list_value', [f.getNodeGraphVariable('tempP').asType('int_list'), new int(1), r1.piece])
    const t1b = f.node('set_list_value', [f.getNodeGraphVariable('tempT').asType('int_list'), new int(1), r1.twist])
    f.connect(t0b, 0, t1a, 0)
    f.connect(t1a, 0, t1b, 0)
    const r2 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 2n })
    const t2a = f.node('set_list_value', [f.getNodeGraphVariable('tempP').asType('int_list'), new int(2), r2.piece])
    const t2b = f.node('set_list_value', [f.getNodeGraphVariable('tempT').asType('int_list'), new int(2), r2.twist])
    f.connect(t1b, 0, t2a, 0)
    f.connect(t2a, 0, t2b, 0)
    const r3 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 3n })
    const t3a = f.node('set_list_value', [f.getNodeGraphVariable('tempP').asType('int_list'), new int(3), r3.piece])
    const t3b = f.node('set_list_value', [f.getNodeGraphVariable('tempT').asType('int_list'), new int(3), r3.twist])
    f.connect(t2b, 0, t3a, 0)
    f.connect(t3a, 0, t3b, 0)
    // 阶段 2：写入 4 槽（q = tblTo[moveId*4+slot]，t' = tblTwist[moveId*12+slot*3+twist]）
    const w0 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 0n })
    f.connect(t3b, 0, w0, 0)
    const w1 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 1n })
    f.connect(w0, 0, w1, 0)
    const w2 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 2n })
    f.connect(w1, 0, w2, 0)
    const w3 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 3n })
    f.connect(w2, 0, w3, 0)
    f.outflow('done', w3, 0)
    return {}
  }
})

// 单槽写入（exec）：从 tempP/tempT 取第 slot 槽，写 cornerPos[q] / cornerOrient[t']
const gstsLogicWriteSlot = g.defineComposite('gsts_logic_write_slot', {
  inputs: { moveId: { type: 'int' }, slot: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId, slot }, f) => {
    // q 被 cornerPos/cornerOrient 两处消费 → 先物化到 tempQ（局部变量，避免重复求值）
    const qv = f.getCorrespondingValueFromList(f.getNodeGraphVariable('tblTo').asType('int_list'),
      f.addition(f.multiplication(moveId, 4n), slot))
    const q1 = f.node('set_list_value', [f.getNodeGraphVariable('tempQ').asType('int_list'), new int(0), qv])
    f.link(f.entry(), 0, q1, 0)
    const q = f.getCorrespondingValueFromList(f.getNodeGraphVariable('tempQ').asType('int_list'), new int(0))
    const tIdx = f.addition(f.addition(f.multiplication(moveId, 12n), f.multiplication(slot, 3n)),
      f.getCorrespondingValueFromList(f.getNodeGraphVariable('tempT').asType('int_list'), slot))
    const tw = f.getCorrespondingValueFromList(f.getNodeGraphVariable('tblTwist').asType('int_list'), tIdx)
    const piece = f.getCorrespondingValueFromList(f.getNodeGraphVariable('tempP').asType('int_list'), slot)
    const s1 = f.node('set_list_value', [f.getNodeGraphVariable('cornerPos').asType('int_list'), q, piece])
    const s2 = f.node('set_list_value', [f.getNodeGraphVariable('cornerOrient').asType('int_list'), q, tw])
    f.connect(q1, 0, s1, 0)
    f.connect(s1, 0, s2, 0)
    f.outflow('done', s2, 0)
    return {}
  }
})

// 胜利判定（纯数据）：AND( pos[i]==i && twist[i]==0 )，8 槽展开（列表读）
const gstsLogicIsSolved = g.defineComposite('gsts_logic_is_solved', {
  inputs: {},
  outputs: { solved: { type: 'bool' } },
  build: (_a, f) => {
    const pos = (i: bigint) => f.getCorrespondingValueFromList(f.getNodeGraphVariable('cornerPos').asType('int_list'), i)
    const tw = (i: bigint) => f.getCorrespondingValueFromList(f.getNodeGraphVariable('cornerOrient').asType('int_list'), i)
    const ok0 = f.logicalAndOperation(f.equal(pos(0n), 0n), f.equal(tw(0n), 0n))
    const ok1 = f.logicalAndOperation(f.equal(pos(1n), 1n), f.equal(tw(1n), 0n))
    const ok2 = f.logicalAndOperation(f.equal(pos(2n), 2n), f.equal(tw(2n), 0n))
    const ok3 = f.logicalAndOperation(f.equal(pos(3n), 3n), f.equal(tw(3n), 0n))
    const ok4 = f.logicalAndOperation(f.equal(pos(4n), 4n), f.equal(tw(4n), 0n))
    const ok5 = f.logicalAndOperation(f.equal(pos(5n), 5n), f.equal(tw(5n), 0n))
    const ok6 = f.logicalAndOperation(f.equal(pos(6n), 6n), f.equal(tw(6n), 0n))
    const ok7 = f.logicalAndOperation(f.equal(pos(7n), 7n), f.equal(tw(7n), 0n))
    const a01 = f.logicalAndOperation(ok0, ok1)
    const a23 = f.logicalAndOperation(ok2, ok3)
    const a45 = f.logicalAndOperation(ok4, ok5)
    const a67 = f.logicalAndOperation(ok6, ok7)
    const a0123 = f.logicalAndOperation(a01, a23)
    const a4567 = f.logicalAndOperation(a45, a67)
    return { solved: f.logicalAndOperation(a0123, a4567) }
  }
})

// 逻辑状态复位（exec）：cornerPos[i]=i, cornerOrient[i]=0（8 槽展开，列表写）
const gstsLogicReset = g.defineComposite('gsts_logic_reset', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const p0 = f.node('set_list_value', [cornerPos, new int(0), new int(0)])
    const t0 = f.node('set_list_value', [cornerOrient, new int(0), new int(0)])
    const p1 = f.node('set_list_value', [cornerPos, new int(1), new int(1)])
    const t1 = f.node('set_list_value', [cornerOrient, new int(1), new int(0)])
    const p2 = f.node('set_list_value', [cornerPos, new int(2), new int(2)])
    const t2 = f.node('set_list_value', [cornerOrient, new int(2), new int(0)])
    const p3 = f.node('set_list_value', [cornerPos, new int(3), new int(3)])
    const t3 = f.node('set_list_value', [cornerOrient, new int(3), new int(0)])
    const p4 = f.node('set_list_value', [cornerPos, new int(4), new int(4)])
    const t4 = f.node('set_list_value', [cornerOrient, new int(4), new int(0)])
    const p5 = f.node('set_list_value', [cornerPos, new int(5), new int(5)])
    const t5 = f.node('set_list_value', [cornerOrient, new int(5), new int(0)])
    const p6 = f.node('set_list_value', [cornerPos, new int(6), new int(6)])
    const t6 = f.node('set_list_value', [cornerOrient, new int(6), new int(0)])
    const p7 = f.node('set_list_value', [cornerPos, new int(7), new int(7)])
    const t7 = f.node('set_list_value', [cornerOrient, new int(7), new int(0)])
    f.link(f.entry(), 0, p0, 0)
    f.connect(p0, 0, t0, 0)
    f.connect(t0, 0, p1, 0)
    f.connect(p1, 0, t1, 0)
    f.connect(t1, 0, p2, 0)
    f.connect(p2, 0, t2, 0)
    f.connect(t2, 0, p3, 0)
    f.connect(p3, 0, t3, 0)
    f.connect(t3, 0, p4, 0)
    f.connect(p4, 0, t4, 0)
    f.connect(t4, 0, p5, 0)
    f.connect(p5, 0, t5, 0)
    f.connect(t5, 0, p6, 0)
    f.connect(p6, 0, t6, 0)
    f.connect(t6, 0, p7, 0)
    f.connect(p7, 0, t7, 0)
    f.outflow('done', t7, 0)
    return {}
  }
})

// ================================================================

// 结算（exec）：isSolved 且未结算过 → 设置玩家结算成功状态
const gstsCheckWin = g.defineComposite('gsts_check_win', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    const solved = f.callComposite(gstsLogicIsSolved, {}).solved
    const already = f.equal(f.getNodeGraphVariable('settled').asType('bool'), true)
    const win = f.logicalAndOperation(solved, f.logicalNotOperation(already))
    const br = f.node('double_branch', [win])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {
      const setSettled = f.node('set_node_graph_variable', [new str('settled'), new bool(true), new bool(false)])
      f.link(br, 0, setSettled, 0)
      // 玩家实体：控制器不是角色实体，getPlayerEntityToWhichTheCharacterBelongs 返回空
      // （2026-08-17 日志 rec241 实证 "没有找到实体"）→ 直接取场上玩家列表的玩家
      const players = f.getListOfPlayerEntitiesOnTheField()
      const player = f.getCorrespondingValueFromList(players, 0n)
      const winNode = f.node('set_player_settlement_success_status', [player, SettlementStatus.Victory])
      f.link(setSettled, 0, winNode, 0)
      // 完整结算流程（官方概念文档「关卡结算」）：① 设结算状态 ② 触发「结算关卡」让关卡真正结束
      const settleNode = f.node('settle_stage', [])
      f.link(winNode, 0, settleNode, 0)
      f.printString('rubik-solved-win')
    })
    f.connectOutFlow(br, 1, () => {})
    return {}
  }
})

// 单步转动（exec，方案 B 定时器驱动，2026-08-18）：
// 复合内 finiteLoop + 调用复合的循环体会重启（引擎限制，日志实证）→ 改用定时器拆分到 1s：
//   ① 逻辑状态变更 ② 存 curMove ③ 注册 8 个块事件定时器（0/0.05/…/0.35s，timerSequenceId=块索引）
//   ④ 注册单一解锁定时器（1.40s，覆盖整个动画）——块事件由 gstsOrbitTrigger 的 'turnblock' 分支分发
const gstsDoMove = g.defineComposite('gsts_do_move', {
  inputs: { moveId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId, target }, f) => {
    // ① 逻辑状态变更
    f.callComposite(gstsLogicApplyMove, { moveId })
    // ② curMove 由调用方（宿主 tabId / afterTurn queue 值）设置——
    //    复合输入 capture 直接设图变量有类型问题（2026-08-18 编辑器实证），数据引脚路径已验证
    // ③ 8 个块事件定时器（0.05s 步进，timerSequenceId = 块索引 0..7）
    f.registerExecNode('start_timer', [
      target, new str('turnblock'), new bool(false),
      // 时间首项不用 0（2026-08-19 实证：start_timer 时间含 0.0 导致定时器不触发），全部正数
      f.assemblyList([
        new float(0.05), new float(0.1), new float(0.15), new float(0.2),
        new float(0.25), new float(0.3), new float(0.35), new float(0.4)
      ], 'float')
    ])
    // ④ 单一解锁定时器（最后块事件 0.40 + orbit5 0.8 + 缓冲 0.2 = 1.40）
    f.registerExecNode('start_timer', [
      target, new str('unlock'), new bool(false),
      f.assemblyList([new float(1.4)], 'float')
    ])
    return {}
  }
})

// 单块转动（exec）：读取 curMove + center → turn_block → 命中则 orbit_scheduler（块事件调用）
const gstsTurnOne = g.defineComposite('gsts_turn_one', {
  inputs: { i: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, target }, f) => {
    const center = f.create3dVector(3, 3, 3)
    const moveId = f.getNodeGraphVariable('curMove').asType('int')
    const hit = f.callComposite(gstsTurnBlock, { i, tabId: moveId, center }).hit
    f.doubleBranch(hit, () => {
      f.callComposite(gstsOrbitScheduler, { i, target })
    }, () => {})
    return {}
  }
})

// 转动完成钩子（exec）：AUTO → 队列推进；MANUAL → 胜利检查
const gstsAfterTurn = g.defineComposite('gsts_after_turn', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const isAuto = f.equal(f.getNodeGraphVariable('autoMode').asType('bool'), true)
    const brAuto = f.node('double_branch', [isAuto])
    f.link(f.entry(), 0, brAuto, 0)
    f.connectOutFlow(brAuto, 0, () => {
      // —— AUTO：推进队列 ——（先写 qIdx，再安全读回：写后再 get 模式）
      const nextIdx = f.addition(f.getNodeGraphVariable('qIdx').asType('int'), 1n)
      const setIdx = f.node('set_node_graph_variable', [new str('qIdx'), nextIdx, new bool(false)])
      f.link(brAuto, 0, setIdx, 0)
      const afterIdx = f.getNodeGraphVariable('qIdx').asType('int')
      const more = f.lessThan(afterIdx, f.getNodeGraphVariable('qLen').asType('int'))
      const brMore = f.node('double_branch', [more])
      f.link(setIdx, 0, brMore, 0)
      f.connectOutFlow(brMore, 0, () => {
        // 还有下一动：lock=true → do_move(queue[afterIdx])
        const mv = f.queryDictionaryValueByKey(f.getNodeGraphVariable('queue').asDict('int', 'int'), afterIdx)
        const setLock = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
        f.link(brMore, 0, setLock, 0)
        const setCur = f.node('set_node_graph_variable', [new str('curMove'), mv, new bool(false)])
        f.link(setLock, 0, setCur, 0)
        f.callComposite(gstsDoMove, { moveId: mv, target })
      })
      f.connectOutFlow(brMore, 1, () => {
        // 队列结束：autoMode=false → 胜利检查
        const offAuto = f.node('set_node_graph_variable', [new str('autoMode'), new bool(false), new bool(false)])
        f.link(brMore, 1, offAuto, 0)
        f.callComposite(gstsCheckWin, {})
      })
    })
    f.connectOutFlow(brAuto, 1, () => {
      // —— MANUAL：胜利检查 ——
      f.callComposite(gstsCheckWin, {})
    })
    return {}
  }
})

// 打乱（exec）：随机生成 SCRAMBLE_LEN 步（避免相邻同层）→ 队列播放
const gstsScramble = g.defineComposite('gsts_scramble', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const setLen = f.node('set_node_graph_variable', [new str('qLen'), new int(SCRAMBLE_LEN), new bool(false)])
    f.link(f.entry(), 0, setLen, 0)
    const setLast = f.node('set_node_graph_variable', [new str('lastMove'), new int(0), new bool(false)])
    f.link(setLen, 0, setLast, 0)
    // cur = last + rand(1..5)，>6 则 −6（保证不等于 last，均匀覆盖其余 5 层）
    f.finiteLoop(0n, SCRAMBLE_LEN, (i, _br) => {
      const last = f.getNodeGraphVariable('lastMove').asType('int')
      const raw = f.addition(last, f.getRandomInteger(1n, 5n))
      const needWrap = f.greaterThan(raw, 6n)
      f.doubleBranch(needWrap, () => {
        const cur = f.subtraction(raw, 6n)
        const setQ = f.node('set_or_add_key_value_pairs_to_dictionary', [f.getNodeGraphVariable('queue').asDict('int', 'int'), i, cur])
        const setM = f.node('set_node_graph_variable', [new str('lastMove'), cur, new bool(false)])
        f.connect(setQ, 0, setM, 0)
      }, () => {
        const setQ = f.node('set_or_add_key_value_pairs_to_dictionary', [f.getNodeGraphVariable('queue').asDict('int', 'int'), i, raw])
        const setM = f.node('set_node_graph_variable', [new str('lastMove'), raw, new bool(false)])
        f.connect(setQ, 0, setM, 0)
      })
    })
    // 启动播放：autoMode=true, qIdx=0, lock=true → do_move(queue[0])
    const setAuto = f.node('set_node_graph_variable', [new str('autoMode'), new bool(true), new bool(false)])
    const setIdx = f.node('set_node_graph_variable', [new str('qIdx'), new int(0), new bool(false)])
    f.connect(setAuto, 0, setIdx, 0)
    const setLock = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
    f.connect(setIdx, 0, setLock, 0)
    const mv0 = f.queryDictionaryValueByKey(f.getNodeGraphVariable('queue').asDict('int', 'int'), new int(0))
    f.callComposite(gstsDoMove, { moveId: mv0, target })
    return {}
  }
})

// 自动复原（exec，占位）：真实求解器（2×2 轮实装，宏库/微型 PDB）——
// 接入点：产出 queue + qLen → 启动队列播放（与 gstsScramble 相同尾部）
const gstsSolve = g.defineComposite('gsts_solve', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    f.printString('rubik-solve-placeholder')
    f.callComposite(gstsCheckWin, {})
    return {}
  }
})

// 重置核心（exec）：销毁 8 角块 → 重建 → 逻辑/流程复位 → READY；
// 输出 8 个新块实体，宿主负责写 blocks（复合内 entity_list 数组字面量有编码缺口，v13 已验证路径）
const gstsResetCore = g.defineComposite('gsts_reset_core', {
  inputs: { stage: { type: 'entity' } },
  outputs: { c0: { type: 'entity' }, c1: { type: 'entity' }, c2: { type: 'entity' }, c3: { type: 'entity' }, c4: { type: 'entity' }, c5: { type: 'entity' }, c6: { type: 'entity' }, c7: { type: 'entity' } },
  outflows: ['done'],
  build: ({ stage }, f) => {
    // ① 销毁 8 角块（展开 + 显式链）
    const blocksVar = f.getNodeGraphVariable('blocks').asType('entity_list')
    const d0 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 0n)])
    const d1 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 1n)])
    const d2 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 2n)])
    const d3 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 3n)])
    const d4 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 4n)])
    const d5 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 5n)])
    const d6 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 6n)])
    const d7 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 7n)])
    f.link(f.entry(), 0, d0, 0)
    f.connect(d0, 0, d1, 0)
    f.connect(d1, 0, d2, 0)
    f.connect(d2, 0, d3, 0)
    f.connect(d3, 0, d4, 0)
    f.connect(d4, 0, d5, 0)
    f.connect(d5, 0, d6, 0)
    f.connect(d6, 0, d7, 0)
    // ② 重建（复用 gstsSpawnRubik，内部写 b0..b7）
    const cubes = f.callComposite(gstsSpawnRubik, { stage })
    f.connect(d7, 0, cubes, 0)
    // ③ 逻辑状态复位
    const logic = f.callComposite(gstsLogicReset, {})
    f.connect(cubes, 0, logic, 0)
    // ④ 流程复位（显式链）
    const offAuto = f.node('set_node_graph_variable', [new str('autoMode'), new bool(false), new bool(false)])
    const offSettled = f.node('set_node_graph_variable', [new str('settled'), new bool(false), new bool(false)])
    const zeroLen = f.node('set_node_graph_variable', [new str('qLen'), new int(0), new bool(false)])
    const zeroIdx = f.node('set_node_graph_variable', [new str('qIdx'), new int(0), new bool(false)])
    const zeroLast = f.node('set_node_graph_variable', [new str('lastMove'), new int(0), new bool(false)])
    const offLock = f.node('set_node_graph_variable', [new str('lock'), new bool(false), new bool(false)])
    f.connect(logic, 0, offAuto, 0)
    f.connect(offAuto, 0, offSettled, 0)
    f.connect(offSettled, 0, zeroLen, 0)
    f.connect(zeroLen, 0, zeroIdx, 0)
    f.connect(zeroIdx, 0, zeroLast, 0)
    f.connect(zeroLast, 0, offLock, 0)
    f.outflow('done', offLock, 0)
    return { c0: cubes.c0, c1: cubes.c1, c2: cubes.c2, c3: cubes.c3, c4: cubes.c4, c5: cubes.c5, c6: cubes.c6, c7: cubes.c7 }
  }
})

// 选项分派（exec）：锁着时忽略一切；tabId 1-6 手动转动 / 7 打乱 / 8 复原
// （9 重置由宿主分支处理：需要宿主写 blocks，见 whenTabIsSelected）
const gstsTabDispatch = g.defineComposite('gsts_tab_dispatch', {
  inputs: { tabId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ tabId, target }, f) => {
    const isLocked = f.equal(f.getNodeGraphVariable('lock').asType('bool'), true)
    const brLock = f.node('double_branch', [isLocked])
    f.link(f.entry(), 0, brLock, 0)
    f.connectOutFlow(brLock, 0, () => {})
    f.connectOutFlow(brLock, 1, () => {
      // 未锁：1-6 转动 or 功能选项（注：connectOutFlow 索引 0=真分支 1=假分支，2026-08-17 日志实证）
      const isMove = f.logicalAndOperation(
        f.greaterThan(tabId, 0),
        f.logicalNotOperation(f.greaterThan(tabId, 6))
      )
      const brMove = f.node('double_branch', [isMove])
      f.link(brLock, 1, brMove, 0)
      f.connectOutFlow(brMove, 0, () => {
        // 手动转动：锁门（done 只在未锁时触发）+ do_move
        f.callComposite(gstsTabLock, {})
        f.callComposite(gstsDoMove, { moveId: tabId, target })
      })
      f.connectOutFlow(brMove, 1, () => {
        f.multipleBranches(tabId, {
          7: () => f.callComposite(gstsScramble, { target }),
          8: () => f.callComposite(gstsSolve, { target }),
          default: () => {}
        })
      })
    })
    return {}
  }
})

// ================================================================
// 既有复合（2026-08-14 已验证，原样保留）
// ================================================================

// 罗德里格斯复合：v 绕单位轴 u 旋转 θ（c=cosθ, s=sinθ）
const gstsRotateVec = g.defineComposite('gsts_rotate_vec', {
  inputs: { v: { type: 'vec3' }, u: { type: 'vec3' }, c: { type: 'float' }, s: { type: 'float' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, u, c, s }, f) => {
    const vp = f._3dVectorZoom(u, f._3dVectorDotProduct(u, v))
    const out = f._3dVectorAddition(
      f._3dVectorAddition(vp, f._3dVectorZoom(f._3dVectorSubtraction(v, vp), c)),
      f._3dVectorZoom(f._3dVectorCrossProduct(u, v), s)
    )
    return { out }
  }
})

// 轨道段位置复合：p_k = vp + vPerp·c + axv·s
const gstsOrbitPoint = g.defineComposite('gsts_orbit_point', {
  inputs: {
    vp: { type: 'vec3' },
    vPerp: { type: 'vec3' },
    axv: { type: 'vec3' },
    c: { type: 'float' },
    s: { type: 'float' }
  },
  outputs: { p: { type: 'vec3' } },
  build: ({ vp, vPerp, axv, c, s }, f) => {
    const p = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, c), f._3dVectorZoom(axv, s)))
    return { p }
  }
})

// 单轴局部旋转复合：v 绕 u 旋转 angle（deg）
const gstsLocalAxisRot = g.defineComposite('gsts_local_axis_rot', {
  inputs: { v: { type: 'vec3' }, angle: { type: 'float' }, u: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, angle, u }, f) => {
    const rad = f.multiplication(angle, DEG2RAD)
    const out = f.callComposite(gstsRotateVec, {
      v, u,
      c: f.cosineFunction(rad),
      s: f.multiplication(f.sineFunction(rad), -1)
    }).out
    return { out }
  }
})

// 三轴局部旋转复合：Y→X→Z 依次把世界轴转进块局部系
const gstsSpinAxisTriple = g.defineComposite('gsts_spin_axis_triple', {
  inputs: { v: { type: 'vec3' }, rot: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, rot }, f) => {
    const v1 = f.callComposite(gstsLocalAxisRot, { v, angle: rot.y, u: f.create3dVector(0, 1, 0) }).out
    const v2 = f.callComposite(gstsLocalAxisRot, { v: v1, angle: rot.x, u: f.create3dVector(1, 0, 0) }).out
    const out = f.callComposite(gstsLocalAxisRot, { v: v2, angle: rot.z, u: f.create3dVector(0, 0, 1) }).out
    return { out }
  }
})

// 自旋块复合（exec）：世界层轴 → 块局部系（罗德里格斯×3）+ 添加自旋运动器
const gstsSpinBlock = g.defineComposite('gsts_spin_block', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, axis }, f) => {
    const rot = f.getEntityLocationAndRotation(e).rotate
    const localAxis = f.callComposite(gstsSpinAxisTriple, { v: axis, rot }).out
    const tail = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      e,
      new str('spin'),
      new float(1),
      new float(90),
      localAxis
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 轨道段运动器复合（exec）：查 blocks[i] + 添加 0.2s 线性运动器
const gstsOrbitSegment = g.defineComposite('gsts_orbit_segment', {
  inputs: { i: { type: 'int' }, name: { type: 'str' }, vel: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, name, vel }, f) => {
    f.on('whenCustomVariableChanges', (evt, ef) => {
      ef.registerExecNode('print_string', [evt.variableName as never])
    })
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      i
    )
    const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e,
      name,
      new float(0.2),
      vel
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 轨道起点分解复合（纯数据）：位置差分解 v0/vp/vPerp/axv
const gstsOrbitPrep = g.defineComposite('gsts_orbit_prep', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' } },
  outputs: { v0: { type: 'vec3' }, vp: { type: 'vec3' }, vPerp: { type: 'vec3' }, axv: { type: 'vec3' } },
  build: ({ e, axis, center }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const v0 = f._3dVectorSubtraction(loc, center)
    const vp = f._3dVectorZoom(axis, f._3dVectorDotProduct(axis, v0))
    const vPerp = f._3dVectorSubtraction(v0, vp)
    const axv = f._3dVectorCrossProduct(axis, vPerp)
    return { v0, vp, vPerp, axv }
  }
})

// 轨道单段复合：p_k 位置 + vel_k 速度
const gstsOrbitStep = g.defineComposite('gsts_orbit_step', {
  inputs: { vp: { type: 'vec3' }, vPerp: { type: 'vec3' }, axv: { type: 'vec3' }, c: { type: 'float' }, s: { type: 'float' }, prev: { type: 'vec3' } },
  outputs: { p: { type: 'vec3' }, vel: { type: 'vec3' } },
  build: ({ vp, vPerp, axv, c, s, prev }, f) => {
    const p = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c, s }).p
    const vel = f._3dVectorZoom(f._3dVectorSubtraction(p, prev), K_VEL)
    return { p, vel }
  }
})

const gstsOrbitVelocity = g.defineComposite('gsts_orbit_velocity', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' } },
  outputs: { vel1: { type: 'vec3' }, vel2: { type: 'vec3' }, vel3: { type: 'vec3' }, vel4: { type: 'vec3' }, vel5: { type: 'vec3' } },
  build: ({ e, axis, center }, f) => {
    const prep = f.callComposite(gstsOrbitPrep, { e, axis, center })
    const s1 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C1, s: S1, prev: prep.v0 })
    const s2 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C2, s: S2, prev: s1.p })
    const s3 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C3, s: S3, prev: s2.p })
    const s4 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C4, s: S4, prev: s3.p })
    const s5 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C5, s: S5, prev: s4.p })
    return { vel1: s1.vel, vel2: s2.vel, vel3: s3.vel, vel4: s4.vel, vel5: s5.vel }
  }
})

const gstsOrbitStore = g.defineComposite('gsts_orbit_store', {
  inputs: { i: { type: 'int' }, vel1: { type: 'vec3' }, vel2: { type: 'vec3' }, vel3: { type: 'vec3' }, vel4: { type: 'vec3' }, vel5: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, vel1, vel2, vel3, vel4, vel5 }, f) => {
    const d1 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels1').asType('vec3_list'), i, vel1
    ])
    const d2 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels2').asType('vec3_list'), i, vel2
    ])
    const d3 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels3').asType('vec3_list'), i, vel3
    ])
    const d4 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels4').asType('vec3_list'), i, vel4
    ])
    const d5 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels5').asType('vec3_list'), i, vel5
    ])
    f.connect(d1, 0, d2, 0)
    f.connect(d2, 0, d3, 0)
    f.connect(d3, 0, d4, 0)
    f.connect(d4, 0, d5, 0)
    f.outflow('done', d5, 0)
    return {}
  }
})

const gstsTabAxisFlags = g.defineComposite('gsts_tab_axis_flags', {
  inputs: { tabId: { type: 'int' } },
  outputs: { isR: { type: 'bool' }, isL: { type: 'bool' }, isU: { type: 'bool' }, isD: { type: 'bool' }, isF: { type: 'bool' }, isB: { type: 'bool' } },
  build: ({ tabId }, f) => {
    return {
      isR: f.equal(tabId, 1),
      isL: f.equal(tabId, 2),
      isU: f.equal(tabId, 3),
      isD: f.equal(tabId, 4),
      isF: f.equal(tabId, 5),
      isB: f.equal(tabId, 6)
    }
  }
})

const gstsTurnCheck = g.defineComposite('gsts_turn_check', {
  inputs: { i: { type: 'int' }, tabId: { type: 'int' } },
  outputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, hit: { type: 'bool' } },
  build: ({ i, tabId }, f) => {
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      i
    )
    const axis = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('axes').asType('vec3_list'),
      tabId
    )
    const flags = f.callComposite(gstsTabAxisFlags, { tabId })
    const hit = f.callComposite(gstsLayerHit, {
      e,
      isR: flags.isR,
      isL: flags.isL,
      isU: flags.isU,
      isD: flags.isD,
      isF: flags.isF,
      isB: flags.isB
    }).hit
    return { e, axis, hit }
  }
})

// 转动一块复合（exec）：数据准备 + 命中分支（命中 → 自旋 + 轨道计算 + orbit1 运动器）
const gstsTurnBlock = g.defineComposite('gsts_turn_block', {
  inputs: { i: { type: 'int' }, tabId: { type: 'int' }, center: { type: 'vec3' } },
  outputs: { hit: { type: 'bool' } },
  outflows: ['done'],
  build: ({ i, tabId, center }, f) => {
    const turn = f.callComposite(gstsTurnCheck, { i, tabId })
    f.doubleBranch(turn.hit, () => {
      f.callComposite(gstsSpinBlock, { e: turn.e, axis: turn.axis })
      const v = f.callComposite(gstsOrbitVelocity, { e: turn.e, axis: turn.axis, center })
      const store = f.callComposite(gstsOrbitStore, {
        i,
        vel1: v.vel1,
        vel2: v.vel2,
        vel3: v.vel3,
        vel4: v.vel4,
        vel5: v.vel5
      })
      const m1 = f.registerExecNode('add_uniform_basic_linear_motion_device', [
        turn.e,
        new str('orbit1'),
        new float(0.2),
        v.vel1
      ])
      f.connect(store, 0, m1, 0)
      f.outflow('done', m1, 0)
    }, () => {})
    return { hit: turn.hit }
  }
})

// 角块创建复合（exec）：createPrefab 动作入复合，8 块共用
const gstsCreateCorner = g.defineComposite('gsts_create_corner', {
  inputs: {
    pid: { type: 'prefab_id' },
    stage: { type: 'entity' },
    x: { type: 'float' },
    y: { type: 'float' },
    z: { type: 'float' }
  },
  outputs: { e: { type: 'entity' } },
  outflows: ['done'],
  build: ({ pid, stage, x, y, z }, f) => {
    const e = f.createPrefab(
      pid,
      f.create3dVector(x, y, z),
      f.create3dVector(0, 0, 0),
      stage,
      false,
      0,
      new listLiteral('int')
    )
    const meta = (e as unknown as { getMetadata?: () => { record?: { id: number } } }).getMetadata?.()
    if (meta?.record) f.outflow('done', meta.record as never, 0)
    return { e }
  }
})

// 魔方生成复合（exec）：8 × create_corner + b0-b7 变量写入
const gstsSpawnRubik = g.defineComposite('gsts_spawn_rubik', {
  inputs: { stage: { type: 'entity' } },
  outputs: { c0: { type: 'entity' }, c1: { type: 'entity' }, c2: { type: 'entity' }, c3: { type: 'entity' }, c4: { type: 'entity' }, c5: { type: 'entity' }, c6: { type: 'entity' }, c7: { type: 'entity' } },
  outflows: ['done'],
  build: ({ stage }, f) => {
    const c0 = f.callComposite(gstsCreateCorner, { pid: 1077936129n, stage, x: 2.5, y: 2.5, z: 2.5 }).e
    f.setNodeGraphVariable('b0', c0, false)
    const c1 = f.callComposite(gstsCreateCorner, { pid: 1077936130n, stage, x: 3.5, y: 2.5, z: 2.5 }).e
    f.setNodeGraphVariable('b1', c1, false)
    const c2 = f.callComposite(gstsCreateCorner, { pid: 1077936131n, stage, x: 2.5, y: 2.5, z: 3.5 }).e
    f.setNodeGraphVariable('b2', c2, false)
    const c3 = f.callComposite(gstsCreateCorner, { pid: 1077936132n, stage, x: 3.5, y: 2.5, z: 3.5 }).e
    f.setNodeGraphVariable('b3', c3, false)
    const c4 = f.callComposite(gstsCreateCorner, { pid: 1077936133n, stage, x: 2.5, y: 3.5, z: 2.5 }).e
    f.setNodeGraphVariable('b4', c4, false)
    const c5 = f.callComposite(gstsCreateCorner, { pid: 1077936134n, stage, x: 3.5, y: 3.5, z: 2.5 }).e
    f.setNodeGraphVariable('b5', c5, false)
    const c6 = f.callComposite(gstsCreateCorner, { pid: 1077936135n, stage, x: 2.5, y: 3.5, z: 3.5 }).e
    f.setNodeGraphVariable('b6', c6, false)
    const c7Call = f.callComposite(gstsCreateCorner, { pid: 1077936136n, stage, x: 3.5, y: 3.5, z: 3.5 })
    const c7 = c7Call.e
    const setB7 = f.node('set_node_graph_variable', [new str('b7'), c7, new bool(false)])
    f.link(c7Call as never, 0, setB7, 0)
    f.outflow('done', setB7, 0)
    return { c0, c1, c2, c3, c4, c5, c6, c7 }
  }
})

// Tab 锁门复合（exec）：done 只在未锁分支触发（set lock 后）
const gstsTabLock = g.defineComposite('gsts_tab_lock', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const isFree = f.equal(f.getNodeGraphVariable('lock').asType('bool'), false)
    const br = f.node('double_branch', [isFree])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {
      const setLock = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
      f.link(br, 0, setLock, 0)
      f.outflow('done', setLock, 0)
    })
    f.connectOutFlow(br, 1, () => {})
    return {}
  }
})

// 坐标轴比较复合：单轴层判断
const gstsAxisCompare = g.defineComposite('gsts_axis_compare', {
  inputs: { coord: { type: 'float' }, isPos: { type: 'bool' }, isNeg: { type: 'bool' } },
  outputs: { hit: { type: 'bool' } },
  build: ({ coord, isPos, isNeg }, f) => ({
    hit: f.logicalOrOperation(
      f.logicalAndOperation(isPos, f.greaterThan(coord, 3)),
      f.logicalAndOperation(isNeg, f.lessThan(coord, 3))
    )
  })
})

// 块层命中复合：位置读取 + 坐标分解 + 层判断
const gstsLayerHit = g.defineComposite('gsts_layer_hit', {
  inputs: {
    e: { type: 'entity' },
    isR: { type: 'bool' },
    isL: { type: 'bool' },
    isU: { type: 'bool' },
    isD: { type: 'bool' },
    isF: { type: 'bool' },
    isB: { type: 'bool' }
  },
  outputs: { hit: { type: 'bool' } },
  build: ({ e, isR, isL, isU, isD, isF, isB }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const hit = f.callComposite(gstsInLayer, {
      x: loc.x,
      y: loc.y,
      z: loc.z,
      isR,
      isL,
      isU,
      isD,
      isF,
      isB
    }).hit
    return { hit }
  }
})

const gstsInLayer = g.defineComposite('gsts_in_layer', {
  inputs: {
    x: { type: 'float' },
    y: { type: 'float' },
    z: { type: 'float' },
    isR: { type: 'bool' },
    isL: { type: 'bool' },
    isU: { type: 'bool' },
    isD: { type: 'bool' },
    isF: { type: 'bool' },
    isB: { type: 'bool' }
  },
  outputs: { hit: { type: 'bool' } },
  build: ({ x, y, z, isR, isL, isU, isD, isF, isB }, f) => {
    const hit = f.logicalOrOperation(
      f.logicalOrOperation(
        f.callComposite(gstsAxisCompare, { coord: x, isPos: isR, isNeg: isL }).hit,
        f.callComposite(gstsAxisCompare, { coord: y, isPos: isU, isNeg: isD }).hit
      ),
      f.callComposite(gstsAxisCompare, { coord: z, isPos: isF, isNeg: isB }).hit
    )
    return { hit }
  }
})

// 轨道段调度复合（exec）：按 seg 分发 → 查 velsN 字典 → orbit_segment；seg=3 后 +250ms 解锁
const gstsOrbitSegmentDispatch = g.defineComposite('gsts_orbit_segment_dispatch', {
  inputs: { i: { type: 'int' }, seg: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, seg, target }, f) => {
    f.multipleBranches(seg, {
      0: () => {
        const vel = f.getCorrespondingValueFromList(
          f.getNodeGraphVariable('vels2').asType('vec3_list'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit2'), vel })
      },
      1: () => {
        const vel = f.getCorrespondingValueFromList(
          f.getNodeGraphVariable('vels3').asType('vec3_list'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit3'), vel })
      },
      2: () => {
        const vel = f.getCorrespondingValueFromList(
          f.getNodeGraphVariable('vels4').asType('vec3_list'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit4'), vel })
      },
      3: () => {
        const vel = f.getCorrespondingValueFromList(
          f.getNodeGraphVariable('vels5').asType('vec3_list'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit5'), vel })
        // 解锁改由 do_move 的单一 'unlock' 定时器触发（2026-08-18 方案 B，避免逐块 4 次解锁）
      },
      default: () => {}
    })
    return {}
  }
})

// 轨道定时器设置复合（exec）：1 个序列定时器 [0.2, 0.4, 0.6, 0.8]
const gstsOrbitScheduler = g.defineComposite('gsts_orbit_scheduler', {
  inputs: { i: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, target }, f) => {
    const tname = f.dataTypeConversion(i, 'str')
    const t = f.registerExecNode('start_timer', [
      target,
      tname,
      new bool(false),
      f.assemblyList([new float(0.2), new float(0.4), new float(0.6), new float(0.8)], 'float')
    ])
    f.outflow('done', t, 0)
    return {}
  }
})

// 轨道定时器触发复合（事件流）：whenTimerIsTriggered 按 timerName 分发；unlock 时解锁 + afterTurn
const gstsOrbitTrigger = g.defineComposite('gsts_orbit_trigger', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.on('whenTimerIsTriggered', (evt: any, ef: any) => {
      f.multipleBranches(evt.timerName as never, {
        // 2026-08-19 变量优化：8 分支保留，但每次先设局部变量 curBlock，调用复合时全用该变量作参数源，
        // 复合不再按常量特化 8 份（引擎不支持 str→int，timerName 无法直接转块索引）
        '0': () => { ef.setNodeGraphVariable('curBlock', new int(0), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '1': () => { ef.setNodeGraphVariable('curBlock', new int(1), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '2': () => { ef.setNodeGraphVariable('curBlock', new int(2), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '3': () => { ef.setNodeGraphVariable('curBlock', new int(3), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '4': () => { ef.setNodeGraphVariable('curBlock', new int(4), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '5': () => { ef.setNodeGraphVariable('curBlock', new int(5), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '6': () => { ef.setNodeGraphVariable('curBlock', new int(6), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '7': () => { ef.setNodeGraphVariable('curBlock', new int(7), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        'turnblock': () => {
          // 块事件：直接用定时器变量 timerSequenceId 作为块索引 i（循环给 i，定时器给 timerSequenceId）
          // —— 无需按条件展开 8 个分支，单次调用即处理对应块（2026-08-19 用户指正）
          ef.callComposite(gstsTurnOne, { i: evt.timerSequenceId as never, target: evt.eventSourceEntity })
        },
        'unlock': () => {
          // 解锁 + 转动完成钩子（胜利检查 / 队列推进）
          ef.setNodeGraphVariable('lock', false, false)
          ef.callComposite(gstsAfterTurn, { target: evt.eventSourceEntity })
        },
        default: () => {}
      })
    })
    return {}
  }
})

const graph = g
  .server({
    id: 1073741825,
    variables: {
      // —— 流程层 ——
      lock: false, // 输入锁（转动期间忽略新输入）
      autoMode: false, // 队列播放模式（打乱/自动复原共用）
      settled: false, // 已结算（防重复胜利结算）
      qLen: new int(0), // 队列长度
      qIdx: new int(0), // 当前播放下标
      lastMove: new int(0), // 打乱生成时上一动（避免相邻同层）
      queue: dict([{ k: 0, v: new int(0) }]), // 播放队列（moveId 序列）
      // —— 逻辑状态层（单一事实源，已还原初始态）——
      cornerPos: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n], // int_list：位置→块编号
      cornerOrient: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n], // int_list：位置→朝向 0/1/2
      tempP: [0n, 0n, 0n, 0n], // int_list：apply 暂存（先读后写防别名覆盖）
      tempT: [0n, 0n, 0n, 0n],
      tempQ: [0n], // int_list：write_slot 暂存 q（避免多消费重复求值）
      curMove: new int(0), // 当前 move（块事件触发时读取）
      curBlock: new int(0), // orbit 分支局部变量（复合参数源，避免按常量特化 8 份）
      // —— 2×2 逻辑状态 move 置换表（tools/gen-2x2-logic-table.mjs 生成，CubeLib 验证）——
      // key = moveId*4+slot（from/to）或 moveId*12+slot*3+twist（twistMap）
      tblFrom: [0n, 0n, 0n, 0n, 7n, 3n, 1n, 5n, 6n, 2n, 0n, 4n, 1n, 3n, 2n, 0n, 5n, 7n, 6n, 4n, 2n, 3n, 7n, 6n, 0n, 1n, 5n, 4n], // index = moveId*4+slot
      tblTo: [0n, 0n, 0n, 0n, 3n, 1n, 5n, 7n, 4n, 6n, 2n, 0n, 3n, 2n, 0n, 1n, 4n, 5n, 7n, 6n, 3n, 7n, 6n, 2n, 4n, 0n, 1n, 5n],
      tblTwist: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n] // index = moveId*12+slot*3+twist
      // —— 表现层（既有）——
      b0: entity(0),
      b1: entity(0),
      b2: entity(0),
      b3: entity(0),
      b4: entity(0),
      b5: entity(0),
      b6: entity(0),
      b7: entity(0),
      // v5.4：块列表（循环遍历）+ 层轴字典 + 5 个速度字典（key=块索引 0..7）
      blocks: [entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0)],
      axes: [
        vec3([0, 0, 0]), // index 0 占位（tabId 从 1 开始）
        vec3([-1, 0, 0]), // 1 R：x+ 层绕 X 负转
        vec3([1, 0, 0]), // 2 L：x− 层绕 X 正转
        vec3([0, -1, 0]), // 3 U：y+ 层绕 Y 负转
        vec3([0, 1, 0]), // 4 D：y− 层绕 Y 正转
        vec3([0, 0, -1]), // 5 F：z+ 层绕 Z 负转
        vec3([0, 0, 1]) // 6 B：z− 层绕 Z 正转
      ],
      vels1: [vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0])],
      vels2: [vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0])],
      vels3: [vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0])],
      vels4: [vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0])],
      vels5: [vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0])]
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // 创建 8 角块 + 写 blocks（v5 已验证路径）；逻辑状态由变量初始值给出（已还原）
    const cubes = f.callComposite(gstsSpawnRubik, { stage })
    f.setNodeGraphVariable('blocks', [cubes.c0, cubes.c1, cubes.c2, cubes.c3, cubes.c4, cubes.c5, cubes.c6, cubes.c7], false)
    // 实例化定时器触发复合（纯事件流）：unlock 事件驱动 afterTurn
    f.callComposite(gstsOrbitTrigger, {})
  })
  .on('whenTabIsSelected', (evt, f) => {
    // 9 重置：宿主分支（需要宿主写 blocks——复合内 entity_list 数组字面量缺口）
    f.doubleBranch(
      f.equal(evt.tabId, 9),
      () => {
        const r = f.callComposite(gstsResetCore, { stage })
        f.setNodeGraphVariable('blocks', [r.c0, r.c1, r.c2, r.c3, r.c4, r.c5, r.c6, r.c7], false)
      },
      () => {
        // 1-6 转动 / 7 打乱 / 8 自动复原（统一分派）
        // curMove 由宿主设置（事件载荷数据引脚路径，复合内 capture 设变量有类型问题）
        f.setNodeGraphVariable('curMove', evt.tabId, false)
        f.callComposite(gstsTabDispatch, {
          tabId: evt.tabId,
          target: evt.eventSourceEntity
        })
      }
    )
  })

export default graph
