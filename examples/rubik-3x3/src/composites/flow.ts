// 流程层（输入锁/模式/队列/打乱/复原/重置）
// 命名前缀：flow_*
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import { bool, float, int, listLiteral, str } from 'genshin-ts/runtime/value'
import { logicApplyFace, logicApplyMiddle, logicApplyWhole, logicIsSolved, logicReset } from './logic.js'

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
    // 视觉图挂载在独立实体上，定时器/共享状态都发到该实体，避免同一实体节点数合并超限
    const visualHost = entity(1077936203n)

    // 把视觉图需要的共享状态发布到视觉控制器实体自定义变量
    // （2026-08-26 减负：主控制器副本无消费者——视觉图只从事件源实体=visualHost 读，省 30 节点/图）
    const publishShared = (tail: Flow, _target: any, visualHost: any): Flow => {
      const mk = (name: string, value: any) => {
        const n2 = f.node('set_custom_variable', [visualHost, new str(name), value, new bool(false)])
        f.connect(tail, 0, n2, 0)
        tail = n2
      }
      mk('tempP', f.getNodeGraphVariable('tempP').asType('int_list'))
      mk('centerPos', f.getNodeGraphVariable('centerPos').asType('int_list'))
      mk('curMove', f.getNodeGraphVariable('curMove').asType('int'))
      mk('turnLastSlot', f.getNodeGraphVariable('turnLastSlot').asType('int'))
      mk('turnCompletionDelay', f.getNodeGraphVariable('turnCompletionDelay').asType('float'))
      mk('turnDuration', f.getNodeGraphVariable('turnDuration').asType('float'))
      mk('segmentDuration', f.getNodeGraphVariable('segmentDuration').asType('float'))
      mk('orbitKVel', f.getNodeGraphVariable('orbitKVel').asType('float'))
      mk('angularVelocity', f.getNodeGraphVariable('angularVelocity').asType('float'))
      // 视觉层需要“转动前”的朝向：发布 blockOrientPre 快照（blockOrient 已被逻辑层更新为转动后）
      mk('blockOrient', f.getNodeGraphVariable('blockOrientPre').asType('int_list'))
      return tail
    }

    // 2026-08-22 修复（bug2 打乱踢人）：moveId 合法性守卫 ∈ [1,12]。
    // 旧生成器错位产物（-4/16 等非法值）若漏到 logicApplyFace 会越界崩溃，
    // 守卫让非法 moveId 直接跳过逻辑层、安全完成 done（队列生成器已改合法，此为兜底）。
    const isValidMove = f.logicalAndOperation(
      f.greaterThan(base, 0),
      f.logicalNotOperation(f.greaterThan(base, 12))
    )
    f.doubleBranch(isValidMove, () => {
    // 逻辑应用（编译期展开，done 可靠）→ 显式链到参数设置 → 启动 turnblock/orbit2
    f.doubleBranch(isMiddle, () => {
      const logic = f.callComposite(logicApplyMiddle, { moveId: base })
      const s1 = f.node('set_node_graph_variable', [new str('turnLastSlot'), new int(7), new bool(false)])
      f.connect(logic as never, 0, s1, 0)
      const s2 = f.node('set_node_graph_variable', [new str('turnDuration'), new float(0.3), new bool(false)])
      f.connect(s1, 0, s2, 0)
      const s3 = f.node('set_node_graph_variable', [new str('segmentDuration'), new float(0.15), new bool(false)])
      f.connect(s2, 0, s3, 0)
      const s4 = f.node('set_node_graph_variable', [new str('orbitKVel'), new float(6.6667), new bool(false)])
      f.connect(s3, 0, s4, 0)
      const s5 = f.node('set_node_graph_variable', [new str('angularVelocity'), new float(300), new bool(false)])
      f.connect(s4, 0, s5, 0)
      const s6 = f.node('set_node_graph_variable', [new str('turnCompletionDelay'), new float(0.35), new bool(false)])
      f.connect(s5, 0, s6, 0)
      const times = f.getNodeGraphVariable('middleTurnTimes').asType('float_list')
      const orbit2 = f.getNodeGraphVariable('middleOrbit2Times').asType('float_list')
      const ptail = publishShared(s6, target, visualHost)
      const t1 = f.node('start_timer', [visualHost, new str('turnblock'), new bool(false), times])
      f.connect(ptail, 0, t1, 0)
      const t2 = f.node('start_timer', [visualHost, new str('orbit2'), new bool(false), orbit2])
      f.connect(t1, 0, t2, 0)
      f.outflow('done', t2, 0)
    }, () => {
      f.doubleBranch(isWhole, () => {
        const logic = f.callComposite(logicApplyWhole, { moveId: base })
        const s1 = f.node('set_node_graph_variable', [new str('turnLastSlot'), new int(25), new bool(false)])
        f.connect(logic as never, 0, s1, 0)
        const s2 = f.node('set_node_graph_variable', [new str('turnDuration'), new float(1.0), new bool(false)])
        f.connect(s1, 0, s2, 0)
        const s3 = f.node('set_node_graph_variable', [new str('segmentDuration'), new float(0.5), new bool(false)])
        f.connect(s2, 0, s3, 0)
        const s4 = f.node('set_node_graph_variable', [new str('orbitKVel'), new float(2.0), new bool(false)])
        f.connect(s3, 0, s4, 0)
        const s5 = f.node('set_node_graph_variable', [new str('angularVelocity'), new float(90), new bool(false)])
        f.connect(s4, 0, s5, 0)
        const s6 = f.node('set_node_graph_variable', [new str('turnCompletionDelay'), new float(1.15), new bool(false)])
        f.connect(s5, 0, s6, 0)
        const times0 = f.getNodeGraphVariable('wholeTurnTimes0').asType('float_list')
        const times1 = f.getNodeGraphVariable('wholeTurnTimes1').asType('float_list')
        const times2 = f.getNodeGraphVariable('wholeTurnTimes2').asType('float_list')
        const times3 = f.getNodeGraphVariable('wholeTurnTimes3').asType('float_list')
        const orbit0 = f.getNodeGraphVariable('wholeOrbit2Times0').asType('float_list')
        const orbit1 = f.getNodeGraphVariable('wholeOrbit2Times1').asType('float_list')
        const orbit2 = f.getNodeGraphVariable('wholeOrbit2Times2').asType('float_list')
        const orbit3 = f.getNodeGraphVariable('wholeOrbit2Times3').asType('float_list')
        const ptail = publishShared(s6, target, visualHost)
        const t0 = f.node('start_timer', [visualHost, new str('turnblock0'), new bool(false), times0])
        f.connect(ptail, 0, t0, 0)
        const t1 = f.node('start_timer', [visualHost, new str('turnblock1'), new bool(false), times1])
        f.connect(t0, 0, t1, 0)
        const t2 = f.node('start_timer', [visualHost, new str('turnblock2'), new bool(false), times2])
        f.connect(t1, 0, t2, 0)
        const t3 = f.node('start_timer', [visualHost, new str('turnblock3'), new bool(false), times3])
        f.connect(t2, 0, t3, 0)
        const o0 = f.node('start_timer', [visualHost, new str('orbit20'), new bool(false), orbit0])
        f.connect(t3, 0, o0, 0)
        const o1 = f.node('start_timer', [visualHost, new str('orbit21'), new bool(false), orbit1])
        f.connect(o0, 0, o1, 0)
        const o2 = f.node('start_timer', [visualHost, new str('orbit22'), new bool(false), orbit2])
        f.connect(o1, 0, o2, 0)
        const o3 = f.node('start_timer', [visualHost, new str('orbit23'), new bool(false), orbit3])
        f.connect(o2, 0, o3, 0)
        f.outflow('done', o3, 0)
      }, () => {
        // 面转：负 moveId 的逻辑已由执行器 3×op4 预应用，这里跳过逻辑层直接负轴视觉；
        // 正 moveId 照常一次逻辑应用。join 后统一参数/发布/定时器链。
        f.doubleBranch(isInv, () => {
          const nop = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
        }, () => {
          f.callComposite(logicApplyFace, { moveId })
        })
        // 逻辑-only（执行器 op4）：逻辑已应用，跳过视觉/定时器直接 done（复位 logicOnly）
        f.doubleBranch(f.getNodeGraphVariable('logicOnly').asType('bool'), () => {
          const off = f.registerExecNode('set_node_graph_variable', [new str('logicOnly'), new bool(false), new bool(false)])
          f.outflow('done', off, 0)
        }, () => {
          const s1 = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), new int(8), new bool(false)])
          const s2 = f.node('set_node_graph_variable', [new str('turnDuration'), new float(0.3), new bool(false)])
          f.connect(s1, 0, s2, 0)
          const s3 = f.node('set_node_graph_variable', [new str('segmentDuration'), new float(0.15), new bool(false)])
          f.connect(s2, 0, s3, 0)
          const s4 = f.node('set_node_graph_variable', [new str('orbitKVel'), new float(6.6667), new bool(false)])
          f.connect(s3, 0, s4, 0)
          const s5 = f.node('set_node_graph_variable', [new str('angularVelocity'), new float(300), new bool(false)])
          f.connect(s4, 0, s5, 0)
          const s6 = f.node('set_node_graph_variable', [new str('turnCompletionDelay'), new float(0.35), new bool(false)])
          f.connect(s5, 0, s6, 0)
          const ptail = publishShared(s6, target, visualHost)
          const times = f.getNodeGraphVariable('faceTurnTimes').asType('float_list')
          const orbit2 = f.getNodeGraphVariable('faceOrbit2Times').asType('float_list')
          const t1 = f.node('start_timer', [visualHost, new str('turnblock'), new bool(false), times])
          f.connect(ptail, 0, t1, 0)
          const t2 = f.node('start_timer', [visualHost, new str('orbit2'), new bool(false), orbit2])
          f.connect(t1, 0, t2, 0)
          f.outflow('done', t2, 0)
        })
      })
    })
    }, () => {
      // 非法 moveId 兜底：只完成 done，不触碰逻辑层（防 logicApplyFace(-4) 越界）
      // 注意：必须用 f.registerExecNode（非 detached）而非 f.node（detached）——
      //   detached 不在分支回调内设 headNodeId，导致 withExecBranch 弹出时不生成
      //   false→noop 分支边（读图核验 2026-08-23 抓到的兜底失效：非法值漏过时 done 永不触发）。
      const noop = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), new int(0), new bool(false)])
      f.outflow('done', noop, 0)
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
    const isAuto = f.equal(f.getNodeGraphVariable('autoMode').asType('bool'), true)
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
