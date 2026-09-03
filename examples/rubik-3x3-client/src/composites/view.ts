// 表现调度（票 06 重写版，2026-09-05）：设备壳——只读执行包缓冲 + 添加运动器。
// 命名前缀：view_*
// 已删除（搬客户端 rbRenderSkill）：view_turn_lookup 槽位查表、motion_orbit_prep/step/velocity
// 数学与 C1/S1/C2/S2、localAxis 长表查询与符号、自旋换算、视觉顺序准备（visualP/tempP 依赖）。
// 保留：定时器事件分派（turnblock/orbit2/整转批量）、unlock/last-slot 链、设备添加语义。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'

// 设备壳参数同步：turn 图 rbRenderPost 已发布到视觉宿主自定义变量，首个事件同步进图变量
export const viewSyncParams = g.defineComposite('view_sync_params', {
    id: 1610700031,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const s1 = f.registerExecNode('set_node_graph_variable', [
      new str('turnLastSlot'),
      f.getCustomVariable(target, new str('turnLastSlot')).asType('int'),
      new bool(false)
    ])
    const s2 = f.registerExecNode('set_node_graph_variable', [
      new str('turnCompletionDelay'),
      f.getCustomVariable(target, new str('turnCompletionDelay')).asType('float'),
      new bool(false)
    ])
    f.connect(s1, 0, s2, 0)
    const s3 = f.registerExecNode('set_node_graph_variable', [
      new str('turnDuration'),
      f.getCustomVariable(target, new str('turnDuration')).asType('float'),
      new bool(false)
    ])
    f.connect(s2, 0, s3, 0)
    const s4 = f.registerExecNode('set_node_graph_variable', [
      new str('segmentDuration'),
      f.getCustomVariable(target, new str('segmentDuration')).asType('float'),
      new bool(false)
    ])
    f.connect(s3, 0, s4, 0)
    const s5 = f.registerExecNode('set_node_graph_variable', [
      new str('angularVelocity'),
      f.getCustomVariable(target, new str('angularVelocity')).asType('float'),
      new bool(false)
    ])
    f.connect(s4, 0, s5, 0)
    f.outflow('done', s5, 0)
    return {}
  }
})

// 槽位设备执行（exec）：读缓冲（piece/spin 轴/vel1）→ spin + orbit1 两设备按序添加
export const viewTurnBlock = g.defineComposite('view_turn_block', {
    id: 1610700027,
  inputs: { slot: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ slot, target }, f) => {
    const piece = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('rbvPiece').asType('int_list'), slot
    )
    const e = f.getCorrespondingValueFromList(
      f.getCustomVariable(target, new str('blocks')).asType('entity_list'), piece
    )
    const spin1 = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      e,
      new str('spin'),
      f.getNodeGraphVariable('turnDuration').asType('float'),
      f.getNodeGraphVariable('angularVelocity').asType('float'),
      f.getCorrespondingValueFromList(f.getNodeGraphVariable('rbvAxis').asType('vec3_list'), slot)
    ])
    const orbit1 = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e,
      new str('orbit1'),
      f.getNodeGraphVariable('segmentDuration').asType('float'),
      f.getCorrespondingValueFromList(f.getNodeGraphVariable('rbvVel1').asType('vec3_list'), slot)
    ])
    f.connect(spin1, 0, orbit1, 0)
    f.outflow('done', orbit1, 0)
    return {}
  }
})

// orbit2 槽位执行：读缓冲 vel2 添加第二段直线运动
export const viewOrbit2 = g.defineComposite('view_orbit2', {
    id: 1610700028,
  inputs: { slot: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ slot, target }, f) => {
    const piece = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('rbvPiece').asType('int_list'), slot
    )
    const e = f.getCorrespondingValueFromList(
      f.getCustomVariable(target, new str('blocks')).asType('entity_list'), piece
    )
    const m = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e,
      new str('orbit2'),
      f.getNodeGraphVariable('segmentDuration').asType('float'),
      f.getCorrespondingValueFromList(f.getNodeGraphVariable('rbvVel2').asType('vec3_list'), slot)
    ])
    f.outflow('done', m, 0)
    return {}
  }
})

// turn 准备：仅每次转动的第一个事件（base=0 且 seq=0）同步设备壳参数
export const viewTurnPrepare = g.defineComposite('view_turn_prepare', {
    id: 1610700040,
  inputs: { target: { type: 'entity' }, base: { type: 'int' }, seq: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target, base, seq }, f) => {
    const needPrepare = f.logicalAndOperation(f.equal(seq, 0n), f.equal(base, 0n))
    f.doubleBranch(needPrepare, () => {
      f.callComposite(viewSyncParams, { target })
    }, () => {})
    const done = f.registerExecNode('set_node_graph_variable', [
      new str('turnLastSlot'),
      f.getNodeGraphVariable('turnLastSlot').asType('int'),
      new bool(false)
    ])
    f.outflow('done', done, 0)
    return {}
  }
})

// turn 单槽：计算 slot 并执行 viewTurnBlock（输出 slot 供 isLast 判断）
export const viewTurnSlot = g.defineComposite('view_turn_slot', {
    id: 1610700041,
  inputs: { target: { type: 'entity' }, base: { type: 'int' }, seq: { type: 'int' } },
  outputs: { slot: { type: 'int' } },
  outflows: ['done'],
  build: ({ target, base, seq }, f) => {
    const slot = f.addition(base, seq)
    const turn = f.callComposite(viewTurnBlock, { slot, target })
    f.outflow('done', turn as never, 0)
    return { slot }
  }
})

// turn 最后槽：等于 turnLastSlot 时注册 unlock 定时器（回 turn 图做逻辑发布）
export const viewTurnUnlockIfLast = g.defineComposite('view_turn_unlock_if_last', {
    id: 1610700042,
  inputs: { slot: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  build: ({ slot, target }, f) => {
    const isLast = f.equal(slot, f.getNodeGraphVariable('turnLastSlot').asType('int'))
    const br = f.node('double_branch', [isLast])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {
      f.registerExecNode('start_timer', [
        entity(1077936201n),
        new str('unlock'),
        new bool(false),
        f.assemblyList([f.getNodeGraphVariable('turnCompletionDelay').asType('float')], 'float')
      ])
    })
    f.connectOutFlow(br, 1, () => {})
    return {}
  }
})

// turnblock 核心：准备 → 单槽转动 → 最后解锁（3 个复合调用）
export const viewHandleTurnCore = g.defineComposite('view_handle_turn_core', {
    id: 1610700036,
  inputs: { target: { type: 'entity' }, base: { type: 'int' }, seq: { type: 'int' } },
  outputs: {},
  build: ({ target, base, seq }, f) => {
    const prep = f.callComposite(viewTurnPrepare, { target, base, seq })
    const slot = f.callComposite(viewTurnSlot, { target, base, seq })
    f.connect(prep as never, 0, slot as never, 0)
    const slotIdx = f.addition(base, seq)
    const unlock = f.callComposite(viewTurnUnlockIfLast, { slot: slotIdx, target })
    f.connect(slot as never, 0, unlock as never, 0)
    return {}
  }
})

// orbit2 核心：设备壳直接执行
export const viewHandleOrbitCore = g.defineComposite('view_handle_orbit_core', {
    id: 1610700037,
  inputs: { target: { type: 'entity' }, base: { type: 'int' }, seq: { type: 'int' } },
  outputs: {},
  build: ({ target, base, seq }, f) => {
    const slot = f.addition(base, seq)
    f.callComposite(viewOrbit2, { slot, target })
    return {}
  }
})

// 统一定时器事件处理器：按 handlerMode 分派 turn/orbit/整转批量（unlock 由 turn 图处理）
export const viewHandleTimerEvent = g.defineComposite('view_handle_timer_event', {
    id: 1610700039,
  inputs: { target: { type: 'entity' }, seq: { type: 'int' } },
  outputs: {},
  build: ({ target, seq }, f) => {
    const mode = f.getNodeGraphVariable('handlerMode').asType('int')
    const base = f.getNodeGraphVariable('handlerBase').asType('int')
    f.multipleBranches(mode, {
      0: () => f.callComposite(viewHandleTurnCore, { target, base, seq }),
      1: () => f.callComposite(viewHandleOrbitCore, { target, base, seq }),
      3: () => f.callComposite(viewHandleTurnBatch, { target, base, count: f.getNodeGraphVariable('handlerCount').asType('int') }),
      4: () => f.callComposite(viewHandleOrbitBatch, { target, base, count: f.getNodeGraphVariable('handlerCount').asType('int') }),
      default: () => {}
    })
    return {}
  }
})

// 整转 turnblock 批量通道：一个事件内循环执行 count 个槽位（读缓冲+设备）
export const viewHandleTurnBatch = g.defineComposite('view_handle_turn_batch', {
    id: 1610700074,
  inputs: { target: { type: 'entity' }, base: { type: 'int' }, count: { type: 'int' } },
  outputs: {},
  build: ({ target, base, count }, f) => {
    const prep = f.callComposite(viewTurnPrepare, { target, base, seq: 0n })
    f.finiteLoop(0n, f.subtraction(count, 1n), (i) => {
      f.callComposite(viewTurnBlock, { slot: f.addition(base, i), target })
      f.callComposite(viewTurnUnlockIfLast, { slot: f.addition(base, i), target })
    })
    const doneN = f.registerExecNode('set_node_graph_variable', [new str('handlerCount'), f.getNodeGraphVariable('handlerCount').asType('int'), new bool(false)])
    f.outflow('done', doneN, 0)
    return {}
  }
})

// 整转 orbit2 批量通道：一个事件内循环执行 count 个槽位（设备壳）
export const viewHandleOrbitBatch = g.defineComposite('view_handle_orbit_batch', {
    id: 1610700075,
  inputs: { target: { type: 'entity' }, base: { type: 'int' }, count: { type: 'int' } },
  outputs: {},
  build: ({ target, base, count }, f) => {
    f.finiteLoop(0n, f.subtraction(count, 1n), (i) => {
      f.callComposite(viewOrbit2, { slot: f.addition(base, i), target })
    })
    return {}
  }
})



// 票 06：执行包逐槽收包（根图 onSignal 委托；槽位数据经图变量暂存 rbvTmp*）
// 注意：复合内 registerExecNode 数组参数必须是 value 包装字面量（new int(0)），raw bigint 无 toIRLiteral
export const viewRcvPkg = g.defineComposite('view_rcv_pkg', {
    id: 1610700076,
  inputs: { owner: { type: 'entity' }, e: { type: 'int' } },
  outputs: {},
  build: ({ owner, e }, f) => {
    const slot = f.getNodeGraphVariable('rbvTmpSlot').asType('int')
    const piece = f.getNodeGraphVariable('rbvTmpPiece').asType('int')
    const axis = f.getNodeGraphVariable('rbvTmpAxis').asType('vec3')
    const vel1 = f.getNodeGraphVariable('rbvTmpVel1').asType('vec3')
    const vel2 = f.getNodeGraphVariable('rbvTmpVel2').asType('vec3')
    const done = f.getNodeGraphVariable('rbvDone').asType('int')
    const n = f.getCustomVariable(entity(1077936203n), new str('rbv_n')).asType('int')
    // 新任务拍（epoch 变化）：复位计数/窗口与已收标记（只清 0..n-1，不空清 26——06-R7 负载项 4）
    f.doubleBranch(f.logicalNotOperation(f.equal(e, done)), () => {
      f.setNodeGraphVariable('rbvDone', e, false)
      f.setNodeGraphVariable('rbvRcvd', new int(0), false)
      f.registerExecNode('set_custom_variable', [owner, new str('rbv_c'), new int(0), new bool(false)])
      f.finiteLoop(0n, f.subtraction(n, 1n), (i: any) => {
        f.registerExecNode('set_list_value', [f.getNodeGraphVariable('rbvFlags').asType('int_list'), i, new int(0)])
      })
    }, () => {})
    const flag = f.getCorrespondingValueFromList(f.getNodeGraphVariable('rbvFlags').asType('int_list'), slot)
    f.doubleBranch(f.equal(flag, 0n), () => {
      f.registerExecNode('set_list_value', [f.getNodeGraphVariable('rbvFlags').asType('int_list'), slot, new int(1)])
      const rc = f.addition(f.getNodeGraphVariable('rbvRcvd').asType('int'), 1n)
      f.setNodeGraphVariable('rbvRcvd', rc, false)
      f.registerExecNode('set_list_value', [f.getNodeGraphVariable('rbvPiece').asType('int_list'), slot, piece])
      f.registerExecNode('set_list_value', [f.getNodeGraphVariable('rbvAxis').asType('vec3_list'), slot, axis])
      f.registerExecNode('set_list_value', [f.getNodeGraphVariable('rbvVel1').asType('vec3_list'), slot, vel1])
      f.registerExecNode('set_list_value', [f.getNodeGraphVariable('rbvVel2').asType('vec3_list'), slot, vel2])
      // 窗口推进（06-R7 分片协议）：仅当收到当前窗口首槽（slot==rbv_c）且该槽为最后到达时
      // 向前移到下一个未收槽（线性扫描 0..n-1 首缺口）；否则 c 停住→客户端重发该窗口自愈。
      // 近似实现：slot==c 时 c+1；乱序/缺口由客户端补发窗口覆盖（flags 幂等）。
      const cur = f.getCustomVariable(owner, new str('rbv_c')).asType('int')
      f.doubleBranch(f.equal(slot, cur), () => {
        f.registerExecNode('set_custom_variable', [owner, new str('rbv_c'), f.addition(cur, 1n), new bool(false)])
      }, () => {})
      f.doubleBranch(f.equal(rc, n), () => {
        f.registerExecNode('set_custom_variable', [owner, new str('rbv_ack'), e, new bool(false)])
        f.sendSignal(new str('rbv_go'), e)
      }, () => {})
    }, () => {})
    return {}
  }
})
