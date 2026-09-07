// 流程层（输入锁/模式/队列/打乱/复原/重置）
// 命名前缀：flow_*
import { g } from 'genshin-ts/runtime/core'
import { FollowCoordinateSystem, FollowLocationType, SettlementStatus } from 'genshin-ts/definitions/enum'
import { bool, float, int, listLiteral, str } from 'genshin-ts/runtime/value'
import { logicApplyFace, logicApplyMiddle, logicApplyWholeA, logicApplyWholeB, logicIsSolved, logicReset } from './logic.js'

const SCRAMBLE_LEN = 20n
type Flow = any


// 创建单个块（exec）
const flowCreateBlock = g.defineComposite('flow_create_block', {
    id: 1610700005,
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

// 生成 26 个块（exec），输出 c0..c25
export const flowSpawnRubik = g.defineComposite('flow_spawn_rubik', {
    id: 1610700006,
  inputs: { stage: { type: 'entity' } },
  outputs: {
    c0: { type: 'entity' }, c1: { type: 'entity' }, c2: { type: 'entity' }, c3: { type: 'entity' },
    c4: { type: 'entity' }, c5: { type: 'entity' }, c6: { type: 'entity' }, c7: { type: 'entity' },
    c8: { type: 'entity' }, c9: { type: 'entity' }, c10: { type: 'entity' }, c11: { type: 'entity' },
    c12: { type: 'entity' }, c13: { type: 'entity' }, c14: { type: 'entity' }, c15: { type: 'entity' },
    c16: { type: 'entity' }, c17: { type: 'entity' }, c18: { type: 'entity' }, c19: { type: 'entity' },
    c20: { type: 'entity' }, c21: { type: 'entity' }, c22: { type: 'entity' }, c23: { type: 'entity' },
    c24: { type: 'entity' }, c25: { type: 'entity' }
  },
  outflows: ['done'],
  build: ({ stage }, f) => {
    let tail: Flow = f.entry()
    const outs: any = {}
    const call0 = f.callComposite(flowCreateBlock, { pid: 1077936210n, stage, x: 2, y: 4, z: 2 })
    outs.c0 = call0.e
    // 首个复合调用靠 auto-chain 从入口进入；后续用 f.connect 显式链
    tail = call0 as never
    const call1 = f.callComposite(flowCreateBlock, { pid: 1077936212n, stage, x: 4, y: 4, z: 2 })
    outs.c1 = call1.e
    f.connect(tail, 0, call1 as never, 0)
    tail = call1 as never
    const call2 = f.callComposite(flowCreateBlock, { pid: 1077936204n, stage, x: 2, y: 4, z: 4 })
    outs.c2 = call2.e
    f.connect(tail, 0, call2 as never, 0)
    tail = call2 as never
    const call3 = f.callComposite(flowCreateBlock, { pid: 1077936206n, stage, x: 4, y: 4, z: 4 })
    outs.c3 = call3.e
    f.connect(tail, 0, call3 as never, 0)
    tail = call3 as never
    const call4 = f.callComposite(flowCreateBlock, { pid: 1077936227n, stage, x: 2, y: 2, z: 2 })
    outs.c4 = call4.e
    f.connect(tail, 0, call4 as never, 0)
    tail = call4 as never
    const call5 = f.callComposite(flowCreateBlock, { pid: 1077936229n, stage, x: 4, y: 2, z: 2 })
    outs.c5 = call5.e
    f.connect(tail, 0, call5 as never, 0)
    tail = call5 as never
    const call6 = f.callComposite(flowCreateBlock, { pid: 1077936221n, stage, x: 2, y: 2, z: 4 })
    outs.c6 = call6.e
    f.connect(tail, 0, call6 as never, 0)
    tail = call6 as never
    const call7 = f.callComposite(flowCreateBlock, { pid: 1077936223n, stage, x: 4, y: 2, z: 4 })
    outs.c7 = call7.e
    f.connect(tail, 0, call7 as never, 0)
    tail = call7 as never
    const call8 = f.callComposite(flowCreateBlock, { pid: 1077936205n, stage, x: 3, y: 4, z: 4 })
    outs.c8 = call8.e
    f.connect(tail, 0, call8 as never, 0)
    tail = call8 as never
    const call9 = f.callComposite(flowCreateBlock, { pid: 1077936209n, stage, x: 4, y: 4, z: 3 })
    outs.c9 = call9.e
    f.connect(tail, 0, call9 as never, 0)
    tail = call9 as never
    const call10 = f.callComposite(flowCreateBlock, { pid: 1077936211n, stage, x: 3, y: 4, z: 2 })
    outs.c10 = call10.e
    f.connect(tail, 0, call10 as never, 0)
    tail = call10 as never
    const call11 = f.callComposite(flowCreateBlock, { pid: 1077936207n, stage, x: 2, y: 4, z: 3 })
    outs.c11 = call11.e
    f.connect(tail, 0, call11 as never, 0)
    tail = call11 as never
    const call12 = f.callComposite(flowCreateBlock, { pid: 1077936222n, stage, x: 3, y: 2, z: 4 })
    outs.c12 = call12.e
    f.connect(tail, 0, call12 as never, 0)
    tail = call12 as never
    const call13 = f.callComposite(flowCreateBlock, { pid: 1077936226n, stage, x: 4, y: 2, z: 3 })
    outs.c13 = call13.e
    f.connect(tail, 0, call13 as never, 0)
    tail = call13 as never
    const call14 = f.callComposite(flowCreateBlock, { pid: 1077936228n, stage, x: 3, y: 2, z: 2 })
    outs.c14 = call14.e
    f.connect(tail, 0, call14 as never, 0)
    tail = call14 as never
    const call15 = f.callComposite(flowCreateBlock, { pid: 1077936224n, stage, x: 2, y: 2, z: 3 })
    outs.c15 = call15.e
    f.connect(tail, 0, call15 as never, 0)
    tail = call15 as never
    const call16 = f.callComposite(flowCreateBlock, { pid: 1077936215n, stage, x: 4, y: 3, z: 4 })
    outs.c16 = call16.e
    f.connect(tail, 0, call16 as never, 0)
    tail = call16 as never
    const call17 = f.callComposite(flowCreateBlock, { pid: 1077936213n, stage, x: 2, y: 3, z: 4 })
    outs.c17 = call17.e
    f.connect(tail, 0, call17 as never, 0)
    tail = call17 as never
    const call18 = f.callComposite(flowCreateBlock, { pid: 1077936220n, stage, x: 4, y: 3, z: 2 })
    outs.c18 = call18.e
    f.connect(tail, 0, call18 as never, 0)
    tail = call18 as never
    const call19 = f.callComposite(flowCreateBlock, { pid: 1077936218n, stage, x: 2, y: 3, z: 2 })
    outs.c19 = call19.e
    f.connect(tail, 0, call19 as never, 0)
    tail = call19 as never
    const call20 = f.callComposite(flowCreateBlock, { pid: 1077936208n, stage, x: 3, y: 4, z: 3 })
    outs.c20 = call20.e
    f.connect(tail, 0, call20 as never, 0)
    tail = call20 as never
    const call21 = f.callComposite(flowCreateBlock, { pid: 1077936225n, stage, x: 3, y: 2, z: 3 })
    outs.c21 = call21.e
    f.connect(tail, 0, call21 as never, 0)
    tail = call21 as never
    const call22 = f.callComposite(flowCreateBlock, { pid: 1077936214n, stage, x: 3, y: 3, z: 4 })
    outs.c22 = call22.e
    f.connect(tail, 0, call22 as never, 0)
    tail = call22 as never
    const call23 = f.callComposite(flowCreateBlock, { pid: 1077936219n, stage, x: 3, y: 3, z: 2 })
    outs.c23 = call23.e
    f.connect(tail, 0, call23 as never, 0)
    tail = call23 as never
    const call24 = f.callComposite(flowCreateBlock, { pid: 1077936217n, stage, x: 4, y: 3, z: 3 })
    outs.c24 = call24.e
    f.connect(tail, 0, call24 as never, 0)
    tail = call24 as never
    const call25 = f.callComposite(flowCreateBlock, { pid: 1077936216n, stage, x: 2, y: 3, z: 3 })
    outs.c25 = call25.e
    f.connect(tail, 0, call25 as never, 0)
    tail = call25 as never
    f.outflow('done', tail, 0)
    return outs
  }
})

// 锁门（exec）
export const flowTabLock = g.defineComposite('flow_tab_lock', {
    id: 1610700007,
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

// 请求执行一步（exec）：只写 pendingMove + 启动 0.01s execMove 定时器，
// 让所有入口（手动/打乱/队列）统一汇聚到 viewOrbitTrigger 的 execMove case，减少 flowDoMove 重复展开。
export const flowRequestMove = g.defineComposite('flow_request_move', {
    id: 1610700008,
  inputs: { moveId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId, target }, f) => {
    const setPending = f.node('set_node_graph_variable', [new str('pendingMove'), moveId, new bool(false)])
    f.link(f.entry(), 0, setPending, 0)
    const t = f.registerExecNode('start_timer', [
      target,
      new str('execMove'),
      new bool(false),
      f.assemblyList([new float(0.01)], 'float')
    ])
    f.connect(setPending, 0, t, 0)
    f.outflow('done', t, 0)
    return {}
  }
})

// 单步转动（exec）：逻辑状态 + 表现调度
export const flowDoMove = g.defineComposite('flow_do_move', {
    id: 1610700009,
  inputs: { moveId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId, target }, f) => {
    // 负 moveId = 折叠的 U3 类面转（face*dir=-1）。逻辑由执行器用 3 条独立 op4 事件预应用，
    // 这里负向分支只做负轴视觉单转；正 moveId 分支照常一次逻辑 + 正轴视觉。
    // （2026-08-26 教训：3 次逻辑挤一条链会超 3000 帧截断锁死，必须拆事件。）
    const isInv = f.lessThan(moveId, 0n)
    const base = f.absoluteValueOperation(moveId)
    const isMiddle = f.logicalAndOperation(
      f.greaterThan(base, 6),
      f.logicalNotOperation(f.greaterThan(base, 9))
    )
    const isWhole = f.greaterThan(base, 9)
    // 视觉图挂载在独立实体上（票 06：设备壳事件仍走 visualHost 1077936203；共享参数由 rbRenderPost 发布）

    // 2026-08-26：移除 moveId 合法性守卫（所有来源——求解折叠面转/手动 1..12/打乱 1..6——均构造安全；
    // 腾出的节点预算用于整体转单事件拆分，防 2889 帧事件超引擎单次执行数上限被静默截断）
    f.doubleBranch(isMiddle, () => {
      const logic = f.callComposite(logicApplyMiddle, { moveId: base })
      // 票 06：图变量参数 set 收敛为单锚（turnLastSlot 字面量），设备参数由 rbRenderPost 入参直传；
      // 全链走 auto-chain（registerExecNode/callComposite 依序自动串），杜绝 f.node 孤立链
      f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), new int(7), new bool(false)])
      const post = f.callComposite(rbRenderPost, {
        moveId: base, n: new int(8), target,
        lastSlot: new int(7), dur: new float(0.3), seg: new float(0.15), completion: new float(0.35), av: new float(300),
        nA: new int(8), nB: new int(0)
      })
      f.outflow('done', post as never, 0)
    }, () => {
      f.doubleBranch(isWhole, () => {
        // 2026-08-26 单事件执行数拆分：整转逻辑 A 段在本事件，B 段+参数+发布+8 定时器
        // 由 0.02s 后的 wholeTail 事件承载（原单事件 2889 帧超引擎单次执行数上限，
        // 后半段被静默截断 → 后排块只转一半卡住，日志 2910）
        const logicA = f.callComposite(logicApplyWholeA, { moveId: base })
        const t0a = f.node('start_timer', [target, new str('wholeTail'), new bool(false), f.assemblyList([new float(0.02)], 'float')])
        f.connect(logicA as never, 0, t0a, 0)
        f.outflow('done', t0a, 0)
      }, () => {
        // 面转：负 moveId 的逻辑已由执行器 3×op4 预应用，这里跳过逻辑层直接负轴视觉；
        // 正 moveId 照常一次逻辑应用。join 后统一参数/发布/定时器链。
        f.doubleBranch(isInv, () => {
          const nop = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), new int(0), new bool(false)])
        }, () => {
          f.callComposite(logicApplyFace, { moveId })
        })
        // 逻辑-only（负 moveId 拆分的第 N 次逻辑应用）：逻辑已应用，复位 logicOnly 并启 negDone 0.02s 步进
        f.doubleBranch(f.getNodeGraphVariable('logicOnly').asType('bool'), () => {
          const off = f.registerExecNode('set_node_graph_variable', [new str('logicOnly'), new bool(false), new bool(false)])
          const t = f.node('start_timer', [target, new str('negDone'), new bool(false), f.assemblyList([new float(0.02)], 'float')])
          f.connect(off, 0, t, 0)
          f.outflow('done', t, 0)
        }, () => {
          // 票 06：面转动画 0.2s（dur 0.2 / seg 0.1×2 / 90°→450°/s / kVel 客户端 10）——
          // 参数由 rbRenderPost 入参直传（图变量 set 只留 turnLastSlot 锚，全链 auto-chain）
          f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), new int(8), new bool(false)])
          const post = f.callComposite(rbRenderPost, {
            moveId, n: new int(9), target,
            lastSlot: new int(8), dur: new float(0.2), seg: new float(0.1), completion: new float(0.25), av: new float(450),
            nA: new int(5), nB: new int(4)
          })
          f.outflow('done', post as never, 0)
        })
      })
    })
    return {}
  }
})
// 结算（exec）
export const flowCheckWin = g.defineComposite('flow_check_win', {
    id: 1610700010,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    f.callComposite(logicIsSolved, {})
    const solved = f.getNodeGraphVariable('solvedFlag').asType('bool')
    const already = f.equal(f.getNodeGraphVariable('settled').asType('bool'), true)
    const win = f.logicalAndOperation(solved, f.logicalNotOperation(already))
    const br = f.node('double_branch', [win])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {
      const setSettled = f.node('set_node_graph_variable', [new str('settled'), new bool(true), new bool(false)])
      f.link(br, 0, setSettled, 0)
      const players = f.getListOfPlayerEntitiesOnTheField()
      const player = f.getCorrespondingValueFromList(players, 0n)
      const winNode = f.node('set_player_settlement_success_status', [player, SettlementStatus.Victory])
      f.link(setSettled, 0, winNode, 0)
      const settleNode = f.node('settle_stage', [])
      f.link(winNode, 0, settleNode, 0)
      f.printString('rubik3x3-solved-win')
    })
    f.connectOutFlow(br, 1, () => {})
    return {}
  }
})

// 转动完成钩子（exec）：AUTO → 队列推进；MANUAL → 胜利检查
export const flowAfterTurn = g.defineComposite('flow_after_turn', {
    id: 1610700011,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    // AUTO 队列推进只属于打乱流程：autoMode && rubik3x3_scrambling 同时为真才推进
    // （2026-08-26 修复：求解/手动期间的 unlock 曾误推进打乱队列，队列串台导致状态循环）
    const isAuto = f.logicalAndOperation(
      f.equal(f.getNodeGraphVariable('autoMode').asType('bool'), true),
      f.equal(f.getCustomVariable(target, new str('rubik3x3_scrambling')).asType('bool'), true)
    )
    const brAuto = f.node('double_branch', [isAuto])
    // 2026-08-21 性能优化：blockOrient 已由逻辑层增量维护，不再读物理回写
    f.link(f.entry(), 0, brAuto, 0)
    f.connectOutFlow(brAuto, 0, () => {
      const nextIdx = f.addition(f.getNodeGraphVariable('qIdx').asType('int'), 1n)
      const setIdx = f.node('set_node_graph_variable', [new str('qIdx'), nextIdx, new bool(false)])
      f.link(brAuto, 0, setIdx, 0)
      const afterIdx = f.getNodeGraphVariable('qIdx').asType('int')
      const more = f.lessThan(afterIdx, f.getNodeGraphVariable('qLen').asType('int'))
      const brMore = f.node('double_branch', [more])
      f.link(setIdx, 0, brMore, 0)
      f.connectOutFlow(brMore, 0, () => {
        const mv = f.queryDictionaryValueByKey(f.getNodeGraphVariable('queue').asDict('int', 'int'), afterIdx)
        const setLock = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
        f.link(brMore, 0, setLock, 0)
        f.callComposite(flowRequestMove, { moveId: mv, target })
      })
      f.connectOutFlow(brMore, 1, () => {
        const offAuto = f.node('set_node_graph_variable', [new str('autoMode'), new bool(false), new bool(false)])
        f.link(brMore, 1, offAuto, 0)
        const offScr = f.node('set_custom_variable', [target, new str('rubik3x3_scrambling'), new bool(false), new bool(false)])
        f.link(offAuto, 0, offScr, 0)
      })
    })
    f.connectOutFlow(brAuto, 1, () => {
      // MANUAL：无额外动作，统一走下方 flowCheckWin
    })
    // 无论 AUTO 是否结束，统一做一次胜利检查（减少 flowCheckWin 在分支内重复展开）
    // 转动完成：blockOrient 已更新为“转动后”，同步到 blockOrientPre 供下一次转动发布
    f.registerExecNode('set_node_graph_variable', [
      new str('blockOrientPre'),
      f.getNodeGraphVariable('blockOrient').asType('int_list'),
      new bool(false)
    ])
    // 求解状态持续发布（每步后）：供求解器随时直接读取，省去请求回发信号
    // 2026-08-25：solver_eo 追加第 13 位哨兵 1，避免 edgeOrient 全 0 时被引擎物化成 [0,0,0]。
    const eoVar = f.getNodeGraphVariable('edgeOrient').asType('int_list')
    const eo13 = f.assemblyList([
      f.getCorrespondingValueFromList(eoVar, 0n),
      f.getCorrespondingValueFromList(eoVar, 1n),
      f.getCorrespondingValueFromList(eoVar, 2n),
      f.getCorrespondingValueFromList(eoVar, 3n),
      f.getCorrespondingValueFromList(eoVar, 4n),
      f.getCorrespondingValueFromList(eoVar, 5n),
      f.getCorrespondingValueFromList(eoVar, 6n),
      f.getCorrespondingValueFromList(eoVar, 7n),
      f.getCorrespondingValueFromList(eoVar, 8n),
      f.getCorrespondingValueFromList(eoVar, 9n),
      f.getCorrespondingValueFromList(eoVar, 10n),
      f.getCorrespondingValueFromList(eoVar, 11n),
      new int(1)
    ], 'int')
    // solver_co 同样追加第 9 位哨兵 1：cornerOrient 全 0（第一层完成）时防短物化。
    // 求解器只读前 8 位，哨兵位不参与角状态计算。
    const coVar = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const co9 = f.assemblyList([
      f.getCorrespondingValueFromList(coVar, 0n),
      f.getCorrespondingValueFromList(coVar, 1n),
      f.getCorrespondingValueFromList(coVar, 2n),
      f.getCorrespondingValueFromList(coVar, 3n),
      f.getCorrespondingValueFromList(coVar, 4n),
      f.getCorrespondingValueFromList(coVar, 5n),
      f.getCorrespondingValueFromList(coVar, 6n),
      f.getCorrespondingValueFromList(coVar, 7n),
      new int(1)
    ], 'int')
    f.registerExecNode('set_custom_variable', [target, new str('solver_cp'), f.getNodeGraphVariable('cornerPos').asType('int_list'), new bool(false)])
    f.registerExecNode('set_custom_variable', [target, new str('solver_co'), co9, new bool(false)])
    f.registerExecNode('set_custom_variable', [target, new str('solver_ep'), f.getNodeGraphVariable('edgePos').asType('int_list'), new bool(false)])
    f.registerExecNode('set_custom_variable', [target, new str('solver_eo'), eo13, new bool(false)])
    f.registerExecNode('set_custom_variable', [target, new str('solver_ct'), f.getNodeGraphVariable('centerPos').asType('int_list'), new bool(false)])
    // 2026-08-24 拆图：胜利结算 flowCheckWin 暂从 flowAfterTurn 移除（避免 turn 图 engineExpanded 超 2000）。
    // 视觉/逻辑复原仍可通过自动求解验证；手动静置胜利后续再单独择机恢复。
    return {}
  }
})

// 打乱（exec）：生成随机队列 → 队列播放
export const flowScramble = g.defineComposite('flow_scramble', {
    id: 1610700012,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const setLen = f.node('set_node_graph_variable', [new str('qLen'), new int(SCRAMBLE_LEN), new bool(false)])
    f.link(f.entry(), 0, setLen, 0)
    // 2026-08-22 修复（bug2 打乱踢人重构）：每项独立 getRandomInteger 直写 queue[i]。
    // 2026-08-26 修复：自动打乱只用面转 1..6，不打乱中心（求解器当前按固定中心配色求解）。
    f.finiteLoop(0n, SCRAMBLE_LEN - 1n, (i, _br) => {
      const mv = f.getRandomInteger(1n, 6n)
      f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
        f.getNodeGraphVariable('queue').asDict('int', 'int'), i, mv
      ])
    })
    // 2026-08-21 修复：f.node 是 detached 注册（入口悬空），必须用 f.registerExecNode
    // 自动串接到 finiteLoop 的 Loop Complete 出口（markLinkNextExecFrom 已设 tail），
    // 保证 autoMode/qIdx/lock 在队列生成后、第 1 步执行前依次写入。
    f.registerExecNode('set_node_graph_variable', [new str('autoMode'), new bool(true), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('qIdx'), new int(0), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
    // 标记打乱进行中，主图在打乱期间忽略自动复原请求（防并发）
    f.registerExecNode('set_custom_variable', [target, new str('rubik3x3_scrambling'), new bool(true), new bool(false)])
    const mv0 = f.queryDictionaryValueByKey(f.getNodeGraphVariable('queue').asDict('int', 'int'), new int(0))
    f.callComposite(flowRequestMove, { moveId: mv0, target })
    return {}
  }
})

// 二层测试打乱（exec）：只动 U/E（moveId 3/8），保持第一层（D 面十字+角块）完整
// 打乱完成后检查 rubik3x3_layer2_test 标志 → 自动触发 op12（自动还原）
export const flowScrambleLayer2 = g.defineComposite('flow_scramble_layer2', {
    id: 1610700082,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const L2_LEN = 14n
    const setLen = f.node('set_node_graph_variable', [new str('qLen'), new int(L2_LEN), new bool(false)])
    f.link(f.entry(), 0, setLen, 0)
    f.finiteLoop(0n, L2_LEN - 1n, (i, _br) => {
      const rnd = f.getRandomInteger(0n, 1n)
      const mv = f.addition(3n, f.multiplication(5n, rnd)) // 0→3(U), 1→8(E)
      f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
        f.getNodeGraphVariable('queue').asDict('int', 'int'), i, mv
      ])
    })
    f.registerExecNode('set_node_graph_variable', [new str('autoMode'), new bool(true), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('qIdx'), new int(0), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
    f.registerExecNode('set_custom_variable', [target, new str('rubik3x3_scrambling'), new bool(true), new bool(false)])
    const mv0 = f.queryDictionaryValueByKey(f.getNodeGraphVariable('queue').asDict('int', 'int'), new int(0))
    f.callComposite(flowRequestMove, { moveId: mv0, target })
    return {}
  }
})

// 重置发布（exec）：flowResetCore + 把 26 块列表写回图变量与两个视觉宿主的自定义变量
// 把游戏主图里两处重复内联的 reset 尾块合并成一个复合，只物化一次（节点预算减负）
export const flowResetPublish = g.defineComposite('flow_reset_publish', {
    id: 1610700059,
  inputs: { stage: { type: 'entity' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ stage, target }, f) => {
    const r = f.callComposite(flowResetCore, { stage })
    const blocks = f.assemblyList([
      r.c0, r.c1, r.c2, r.c3, r.c4, r.c5, r.c6, r.c7,
      r.c8, r.c9, r.c10, r.c11, r.c12, r.c13, r.c14, r.c15,
      r.c16, r.c17, r.c18, r.c19, r.c20, r.c21, r.c22, r.c23,
      r.c24, r.c25
    ], 'entity')
    f.registerExecNode('set_node_graph_variable', [new str('blocks'), blocks, new bool(false)])
    f.registerExecNode('set_custom_variable', [target, new str('blocks'), blocks, new bool(false)])
    f.registerExecNode('set_custom_variable', [entity(1077936203n), new str('blocks'), blocks, new bool(false)])
    // 球跟随（2026-09-07）：重置销毁重建 26 块 → 新实体须重新绑定到中心球（球不重建，绑定关系随块实体销毁）
    f.callComposite(flowBindBalls, {})
    const done = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
    f.outflow('done', done, 0)
    return {}
  }
})

// 自动复原（exec）：占位——真正求解由 solver 图承担，tab14 仅兜底不锁
export const flowSolve = g.defineComposite('flow_solve', {
    id: 1610700013,
  inputs: { _target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    f.printString('rubik3x3-solve-placeholder')
    const doneNode = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
    f.outflow('done', doneNode, 0)
    return {}
  }
})

// 手动检查（exec）：跑逻辑胜利判定，打印是否已还原
export const flowManualCheck = g.defineComposite('flow_manual_check', {
    id: 1610700043,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    const solvedCheck = f.callComposite(logicIsSolved, {})
    const solved = f.getNodeGraphVariable('solvedFlag').asType('bool')
    f.doubleBranch(solved, () => {
      f.printString('rubik3x3-manual-check-solved')
    }, () => {
      f.printString('rubik3x3-manual-check-not-solved')
    })
    // doubleBranch join 后统一 done（solvedCheck → doubleBranch → join → doneNode 由 auto-chain 负责）
    const doneNode = f.registerExecNode('set_node_graph_variable', [
      new str('turnLastSlot'),
      f.getNodeGraphVariable('turnLastSlot').asType('int'),
      new bool(false)
    ])
    f.outflow('done', doneNode, 0)
    return {}
  }
})

// 更新每块朝向索引：转动完成后读取实际旋转，写 blockOrient 并发布到视觉宿主
export const flowUpdateOrient = g.defineComposite('flow_update_orient', {
    id: 1610700044,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const blocksVar = f.getNodeGraphVariable('blocks').asType('entity_list')
    const orientVar = f.getNodeGraphVariable('blockOrient').asType('int_list')
    const eulerVar = f.getNodeGraphVariable('orientIndexByEuler').asType('int_list')
    const visualHost = entity(1077936203n)
    f.finiteLoop(0n, 25n, (i) => {
      const e = f.getCorrespondingValueFromList(blocksVar, i)
      const rot = f.getEntityLocationAndRotation(e).rotate
      const qy = f.division(f.dataTypeConversion(rot.y, 'int'), 90n)
      const qx = f.division(f.dataTypeConversion(rot.x, 'int'), 90n)
      const qz = f.division(f.dataTypeConversion(rot.z, 'int'), 90n)
      const key = f.addition(
        f.addition(f.multiplication(qy, 16n), f.multiplication(qx, 4n)),
        qz
      )
      const orient = f.getCorrespondingValueFromList(eulerVar, key)
      f.registerExecNode('set_list_value', [orientVar, i, orient])
    })
    const pub1 = f.registerExecNode('set_custom_variable', [target, new str('blockOrient'), orientVar, new bool(false)])
    const pub2 = f.registerExecNode('set_custom_variable', [visualHost, new str('blockOrient'), orientVar, new bool(false)])
    f.connect(pub1, 0, pub2, 0)
    f.outflow('done', pub2, 0)
    return {}
  }
})

// 重置核心（exec）：销毁 26 块 → 重建 → 逻辑/流程复位
export const flowResetCore = g.defineComposite('flow_reset_core', {
    id: 1610700014,
  inputs: { stage: { type: 'entity' } },
  outputs: {
    c0: { type: 'entity' }, c1: { type: 'entity' }, c2: { type: 'entity' }, c3: { type: 'entity' },
    c4: { type: 'entity' }, c5: { type: 'entity' }, c6: { type: 'entity' }, c7: { type: 'entity' },
    c8: { type: 'entity' }, c9: { type: 'entity' }, c10: { type: 'entity' }, c11: { type: 'entity' },
    c12: { type: 'entity' }, c13: { type: 'entity' }, c14: { type: 'entity' }, c15: { type: 'entity' },
    c16: { type: 'entity' }, c17: { type: 'entity' }, c18: { type: 'entity' }, c19: { type: 'entity' },
    c20: { type: 'entity' }, c21: { type: 'entity' }, c22: { type: 'entity' }, c23: { type: 'entity' },
    c24: { type: 'entity' }, c25: { type: 'entity' }
  },
  outflows: ['done'],
  build: ({ stage }, f) => {
    const blocksVar = f.getNodeGraphVariable('blocks').asType('entity_list')
    // 2026-08-22 节点预算回归（游戏拒载 3150）：26 迭代 stop+destroy 展开 ≈52 节点 → 循环化
    // 省 ~44 节点/def（主图 2 实例 → Δformula ≈ -192）；reset 记录帧 2138→~2627 仍 <3000。
    // 循环体内先停掉/删除该块上的运动器（spin/orbit1/orbit2），再销毁实体，避免旧模型残留。
    f.finiteLoop(0n, 25n, (i) => {
      const e = f.getCorrespondingValueFromList(blocksVar, i)
      const stop = f.registerExecNode('stop_and_delete_basic_motion_device', [e, new str('spin'), new bool(true)])
      const d = f.registerExecNode('destroy_entity', [e])
      f.connect(stop, 0, d, 0)
    })
    // 循环后节点由 registerExecNode/callComposite 自动串接 Loop Complete 出口
    const cubes = f.callComposite(flowSpawnRubik, { stage })
    f.callComposite(logicReset, {})
    f.registerExecNode('set_node_graph_variable', [new str('autoMode'), new bool(false), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('settled'), new bool(false), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('qLen'), new int(0), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('qIdx'), new int(0), new bool(false)])
    f.registerExecNode('set_node_graph_variable', [new str('lastMove'), new int(0), new bool(false)])
    const offLock = f.registerExecNode('set_node_graph_variable', [new str('lock'), new bool(false), new bool(false)])
    f.outflow('done', offLock, 0)
    return {
      c0: cubes.c0, c1: cubes.c1, c2: cubes.c2, c3: cubes.c3,
      c4: cubes.c4, c5: cubes.c5, c6: cubes.c6, c7: cubes.c7,
      c8: cubes.c8, c9: cubes.c9, c10: cubes.c10, c11: cubes.c11,
      c12: cubes.c12, c13: cubes.c13, c14: cubes.c14, c15: cubes.c15,
      c16: cubes.c16, c17: cubes.c17, c18: cubes.c18, c19: cubes.c19,
      c20: cubes.c20, c21: cubes.c21, c22: cubes.c22, c23: cubes.c23,
      c24: cubes.c24, c25: cubes.c25
    }
  }
})

// 选项分派（exec）：1-12 转动 / 13 打乱 / 14 复原（15 重置由宿主处理）
export const flowTabDispatch = g.defineComposite('flow_tab_dispatch', {
    id: 1610700015,
  inputs: { tabId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ tabId, target }, f) => {
    const isLocked = f.equal(f.getNodeGraphVariable('lock').asType('bool'), true)
    const brLock = f.node('double_branch', [isLocked])
    f.link(f.entry(), 0, brLock, 0)
    f.connectOutFlow(brLock, 0, () => {})
    f.connectOutFlow(brLock, 1, () => {
      const isMove = f.logicalAndOperation(
        f.greaterThan(tabId, 0),
        f.logicalNotOperation(f.greaterThan(tabId, 12))
      )
      const brMove = f.node('double_branch', [isMove])
      f.link(brLock, 1, brMove, 0)
      f.connectOutFlow(brMove, 0, () => {
        f.callComposite(flowTabLock, {})
        f.callComposite(flowRequestMove, { moveId: tabId, target })
      })
      f.connectOutFlow(brMove, 1, () => {
        f.multipleBranches(tabId, {
          13: () => f.callComposite(flowScramble, { target }),
          14: () => f.callComposite(flowSolve, { _target: target }),
          16: () => f.callComposite(flowManualCheck, {}),
          default: () => {}
        })
      })
    })
    return {}
  }
})

// 整转尾部事件（exec）：逻辑 B 段 + 参数 + 发布 + 8 个视觉定时器。
// 2026-08-26 拆分：整转单事件原 2889 帧超引擎单次执行数上限被静默截断（后排块只转一半，2910），
// A 段在 flowDoMove 事件、B 段经 0.02s wholeTail 定时器到本事件，单事件压到 ~1500 帧内。
export const flowWholeTail = g.defineComposite('flow_whole_tail', {
    id: 1610700073,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const visualHost = entity(1077936203n)
    const logic = f.callComposite(logicApplyWholeB, { moveId: f.getNodeGraphVariable('curMove').asType('int') })
    // 票 06：整转动画 1.0s（dur 1.0 / seg 0.5×2 / 90°→90°/s）——参数由 rbRenderPost 入参直传
    f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), new int(25), new bool(false)])
    const post = f.callComposite(rbRenderPost, {
      moveId: f.getNodeGraphVariable('curMove').asType('int'),
      n: new int(26),
      target,
      lastSlot: new int(25), dur: new float(1.0), seg: new float(0.5), completion: new float(1.15), av: new float(90),
      nA: new int(0), nB: new int(0)
    })
    f.outflow('done', post as never, 0)
    return {}
  }
})

// ================================================================
// 票 06（2026-09-05）：渲染负载分载——服务端只留「添加运动器」。
//   rbRenderPost：把渲染任务投到宿主/玩家寄存器（客户端 rbRenderSkill 20008 算执行包）；
//   rbRenderStartTimers：收到 visual 图 rbv_go(e)（执行包收齐）后按 curMove 类型起既有定时器。
//   旧的「execMove 内直接起定时器」全部移除（数学已搬迁客户端，起表必须等执行包）。
// ================================================================

// 面/中/整 各运动参数发布（只保留 visual 设备壳需要的 5 个量）。
// 2026-09-03 修复（3162 帧序铁证）：参数以复合入参直传——此前读图变量会因参数链被
// auto-chain 孤立裁掉而发布陈旧默认值（face 拿到 0.3/0.15 超调错乱）。
// 首节点用 registerExecNode 挂到本复合入口，其后显式 connect 串链。
const publishVisualParams = (f: any, visualHost: any, p: any): Flow => {
  const s1 = f.registerExecNode('set_custom_variable', [visualHost, new str('turnLastSlot'), p.lastSlot, new bool(false)])
  const mk = (prev: Flow, name: string, value: any): Flow => {
    const n2 = f.node('set_custom_variable', [visualHost, new str(name), value, new bool(false)])
    f.connect(prev, 0, n2, 0)
    return n2
  }
  const s2 = mk(s1, 'turnCompletionDelay', p.completion)
  const s3 = mk(s2, 'turnDuration', p.dur)
  const s4 = mk(s3, 'segmentDuration', p.seg)
  const s5 = mk(s4, 'angularVelocity', p.av)
  return s5
}

// 渲染任务投递（exec）：宿主 rbv_move/orient + visualHost rbv_n + 玩家 rbv_epoch++
// 输入 moveId 已含符号（负=折叠面转）；n=执行包槽数（面 9/中 8/整 26）。
export const rbRenderPost = g.defineComposite('rb_render_post', {
    id: 1610700091,
  inputs: {
    moveId: { type: 'int' },
    n: { type: 'int' },
    target: { type: 'entity' },
    lastSlot: { type: 'int' },
    dur: { type: 'float' },
    seg: { type: 'float' },
    completion: { type: 'float' },
    av: { type: 'float' },
    nA: { type: 'int' },
    nB: { type: 'int' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId, n, target, lastSlot, dur, seg, completion, av, nA, nB }, f) => {
    const host = entity(1077936201n)
    const visualHost = entity(1077936203n)
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const cur = f.getCustomVariable(owner, new str('rbv_epoch')).asType('int')
    const next = f.addition(cur, 1n)
    const ptail = publishVisualParams(f, visualHost, { lastSlot, dur, seg, completion, av })
    const m1 = f.node('set_custom_variable', [host, new str('rbv_move'), moveId, new bool(false)])
    f.connect(ptail, 0, m1, 0)
    const m2 = f.node('set_custom_variable', [host, new str('rbv_orient'), f.getNodeGraphVariable('blockOrientPre').asType('int_list'), new bool(false)])
    f.connect(m1, 0, m2, 0)
    const m3 = f.node('set_custom_variable', [visualHost, new str('rbv_n'), n, new bool(false)])
    f.connect(m2, 0, m3, 0)
    // 06-R7: 批量通道槽数（设备事件批量化：turnblock/orbit2 每通道 1 事件串行处理）
    const m3a = f.node('set_custom_variable', [visualHost, new str('rbv_nA'), nA, new bool(false)])
    f.connect(m3, 0, m3a, 0)
    const m3b = f.node('set_custom_variable', [visualHost, new str('rbv_nB'), nB, new bool(false)])
    f.connect(m3a, 0, m3b, 0)
    // 票 06 修复（3148 实证）：rbv 链独立宿主引用——rb_host 只由 rbx 十字任务写，空 host 会让
    // 客户端读到空表并回传空包（piece=None、vel 全 0）
    const m4 = f.node('set_custom_variable', [owner, new str('rbv_host'), host, new bool(false)])
    f.connect(m3b, 0, m4, 0)
    // 06-R7：分片窗口起点归零（客户端每拍只发 [rbv_c, rbv_c+2] 三槽）
    const m4b = f.node('set_custom_variable', [owner, new str('rbv_c'), new int(0), new bool(false)])
    f.connect(m4, 0, m4b, 0)
    const m5 = f.node('set_custom_variable', [owner, new str('rbv_epoch'), next, new bool(false)])
    f.connect(m4b, 0, m5, 0)
    f.outflow('done', m5, 0)
    return {}
  }
})

// 按 curMove 类型起定时器（exec；curMove=有符号 moveId）。
// 球跟随（2026-09-07）：面/中/整统一为单一 ballturn 定时器——执行包收齐后 0.01s
// 由 ballvisual 图逐槽给中心球加旋转型基础运动器；旧 turnblock/orbit2 双段编排退役。
export const rbRenderStartTimers = g.defineComposite('rb_render_start_timers', {
    id: 1610700092,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const visualHost = entity(1077936203n)
    const t1 = f.registerExecNode('start_timer', [
      visualHost,
      new str('ballturn'),
      new bool(false),
      f.assemblyList([new float(0.01)], 'float')
    ])
    f.outflow('done', t1, 0)
    return {}
  }
})

// ================================================================
// 球跟随负载优化（2026-09-07）：27 个中心球 + 一次性跟随绑定。
//   运行时块为 createPrefab 动态实体（组件从 def 复制；块 def 已配 type 9 跟随）；
//   球同样 createPrefab 生成（def 1077936233..259 已配 type 4），全部摆魔方中心
//   spawn 坐标 (3,3,3)（UBL(2,4,2)=中心+(-1,1,-1) 逐轴核实，与 gen-rbv-vars off 表一致）。
//   绑定一次终身有效：偏移在球局部系恒定，球累积旋转自动带块到新格位。
// ================================================================

// 生成 27 球（exec）：b0..b25 按块索引序（ARCHITECTURE 角0..7/棱8..19/心20..25 配同标签球），
// b26=CORE（核心球，整体转/备用）。球 def ID 由 gen 侧球-块标签配对表换算。
export const flowSpawnBalls = g.defineComposite('flow_spawn_balls', {
    id: 1610700093,
  inputs: { stage: { type: 'entity' } },
  outputs: {
    b0: { type: 'entity' }, b1: { type: 'entity' }, b2: { type: 'entity' }, b3: { type: 'entity' },
    b4: { type: 'entity' }, b5: { type: 'entity' }, b6: { type: 'entity' }, b7: { type: 'entity' },
    b8: { type: 'entity' }, b9: { type: 'entity' }, b10: { type: 'entity' }, b11: { type: 'entity' },
    b12: { type: 'entity' }, b13: { type: 'entity' }, b14: { type: 'entity' }, b15: { type: 'entity' },
    b16: { type: 'entity' }, b17: { type: 'entity' }, b18: { type: 'entity' }, b19: { type: 'entity' },
    b20: { type: 'entity' }, b21: { type: 'entity' }, b22: { type: 'entity' }, b23: { type: 'entity' },
    b24: { type: 'entity' }, b25: { type: 'entity' }, b26: { type: 'entity' }
  },
  outflows: ['done'],
  build: ({ stage }, f) => {
    // 块索引序球 def（标签配对）：UBL UBR UFL UFR DBL DBR DFL DFR / 棱 UF UR UB UL DF DR DB DL
    // FR FL BR BL / 心 U D F B R L / CORE；全部摆在魔方中心 (3,3,3)。
    const pids = [
      1077936239n, 1077936241n, 1077936233n, 1077936235n, 1077936256n, 1077936258n, 1077936250n,
      1077936252n, 1077936234n, 1077936238n, 1077936240n, 1077936236n, 1077936251n, 1077936255n,
      1077936257n, 1077936253n, 1077936244n, 1077936242n, 1077936249n, 1077936247n, 1077936237n,
      1077936254n, 1077936243n, 1077936248n, 1077936246n, 1077936245n, 1077936259n
    ]
    let tail: Flow = f.entry()
    const outs: any = {}
    const names = [
      'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10', 'b11', 'b12', 'b13',
      'b14', 'b15', 'b16', 'b17', 'b18', 'b19', 'b20', 'b21', 'b22', 'b23', 'b24', 'b25', 'b26'
    ]
    for (let k = 0; k < 27; k++) {
      const call = f.callComposite(flowCreateBlock, {
        pid: pids[k], stage, x: 3, y: 3, z: 3
      })
      outs[names[k]] = call.e
      if (k === 0) tail = call as never
      else f.connect(tail, 0, call as never, 0)
      tail = call as never
    }
    // 显式收尾：链尾接到本复合 done 出口（caller 侧 auto-chain 依赖 OutFlow[0]）
    f.outflow('done', tail as never, 0)
    return outs
  }
})

// 一次性跟随绑定（exec）：块 i → 球 i（完全跟随/相对坐标系/挂接点 GI_RootNode），
// 位置偏移=初始格位向量（图变量 ballOff，26 项 vec3），旋转偏移 0。绑定后不再变更。
export const flowBindBalls = g.defineComposite('flow_bind_balls', {
    id: 1610700094,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const blocks = f.getNodeGraphVariable('blocks').asType('entity_list')
    const balls = f.getNodeGraphVariable('balls').asType('entity_list')
    const offs = f.getNodeGraphVariable('ballOff').asType('vec3_list')
    f.finiteLoop(0n, 25n, (i: any) => {
      const blk = f.getCorrespondingValueFromList(blocks, i)
      const bal = f.getCorrespondingValueFromList(balls, i)
      const off = f.getCorrespondingValueFromList(offs, i)
      f.registerExecNode('switch_follow_motion_device_target_by_entity', [
        blk,
        bal,
        new str('GI_RootNode'),
        off,
        f.create3dVector(0, 0, 0),
        FollowCoordinateSystem.RelativeCoordinateSystem,
        FollowLocationType.CompletelyFollow
      ])
    })
    const done = f.registerExecNode('set_node_graph_variable', [
      new str('turnLastSlot'),
      f.getNodeGraphVariable('turnLastSlot').asType('int'),
      new bool(false)
    ])
    f.outflow('done', done, 0)
    return {}
  }
})
