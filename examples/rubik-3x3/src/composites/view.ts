// 表现调度（事件流 + 单块动作）
// 命名前缀：view_*
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'
import { motionOrbitSegment, motionOrbitStore, motionOrbitVelocity, motionSpinBlock } from './motion.js'
import { flowAfterTurn, flowDoMove } from './flow.js'
import { viewPrepareVisualOrder } from './visualOrder.js'
import { longListGetVec3 } from './list.js'

const CENTER = { x: 3, y: 3, z: 3 }

// 槽位 → 实际块（纯数据）
const viewTurnLookup = g.defineComposite('view_turn_lookup', {
    id: 1610700026,
  inputs: { slot: { type: 'int' } },
  outputs: { piece: { type: 'int' }, e: { type: 'entity' }, axis: { type: 'vec3' }, orientIdx: { type: 'int' } },
  build: ({ slot }, f) => {
    const piece = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('visualP').asType('int_list'),
      slot
    )
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      piece
    )
    const axis = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('axes').asType('vec3_list'),
      f.getNodeGraphVariable('curMove').asType('int')
    )
    const orientIdx = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blockOrient').asType('int_list'),
      piece
    )
    return { piece, e, axis, orientIdx }
  }
})

// 单块转动（exec）：turnblock 槽位触发
export const viewTurnBlock = g.defineComposite('view_turn_block', {
    id: 1610700027,
  inputs: { slot: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ slot, target }, f) => {
    const t = f.callComposite(viewTurnLookup, { slot })
    const v = f.callComposite(motionOrbitVelocity, {
      e: t.e,
      axis: t.axis,
      center: f.create3dVector(CENTER.x, CENTER.y, CENTER.z),
      kVel: f.getNodeGraphVariable('orbitKVel').asType('float')
    })
    const localIdx = f.addition(
      f.multiplication(f.subtraction(f.getNodeGraphVariable('curMove').asType('int'), 1n), 24n),
      t.orientIdx
    )
    // 长列表资产：内部按 100 元素分块，这里像官方 Get 一样直接取
    const localAxis = f.callComposite(longListGetVec3, {
      i: localIdx,
      chunkSize: 100n,
      c0: f.getNodeGraphVariable('localAxisTable0').asType('vec3_list'),
      c1: f.getNodeGraphVariable('localAxisTable1').asType('vec3_list'),
      c2: f.getNodeGraphVariable('localAxisTable2').asType('vec3_list')
    }).out
    const spin = f.callComposite(motionSpinBlock, {
      e: t.e,
      axis: localAxis,
      duration: f.getNodeGraphVariable('turnDuration').asType('float'),
      angularVelocity: f.getNodeGraphVariable('angularVelocity').asType('float')
    })
    const store = f.callComposite(motionOrbitStore, {
      i: t.piece,
      vel1: v.vel1,
      vel2: v.vel2
    })
    const m1 = f.callComposite(motionOrbitSegment, {
      i: t.piece,
      name: new str('orbit1'),
      vel: v.vel1
    })
    f.connect(spin as never, 0, store as never, 0)
    f.connect(store as never, 0, m1 as never, 0)
    f.outflow('done', m1 as never, 0)
    return {}
  }
})

// orbit2 槽位触发：直接读取 vels2 并添加第二段直线运动
export const viewOrbit2 = g.defineComposite('view_orbit2', {
    id: 1610700028,
  inputs: { slot: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ slot, target }, f) => {
    const piece = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('visualP').asType('int_list'),
      slot
    )
    const vel = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('vels2').asType('vec3_list'),
      piece
    )
    const m = f.callComposite(motionOrbitSegment, {
      i: piece,
      name: new str('orbit2'),
      vel
    })
    f.outflow('done', m as never, 0)
    return {}
  }
})

// 定时器事件总入口（纯事件流）
export const viewOrbitTrigger = g.defineComposite('view_orbit_trigger', {
    id: 1610700029,
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.on('whenTimerIsTriggered', (evt: any, ef: any) => {
      const handleTurn = () => () => {
        const chunk = ef.getNodeGraphVariable('turnChunk').asType('int')
        const base = ef.multiplication(chunk, 7n)
        const slot = ef.addition(base, evt.timerSequenceId as never)
        ef.callComposite(viewTurnBlock, { slot, target: evt.eventSourceEntity })
        const isLast = ef.equal(slot, ef.getNodeGraphVariable('turnLastSlot').asType('int'))
        ef.doubleBranch(isLast, () => {
          ef.registerExecNode('start_timer', [
            evt.eventSourceEntity,
            new str('unlock'),
            new bool(false),
            ef.assemblyList([ef.getNodeGraphVariable('turnCompletionDelay').asType('float')], 'float')
          ])
        }, () => {
          const isChunkEnd = ef.equal(evt.timerSequenceId as never, 6n)
          const isWhole = ef.greaterThan(ef.getNodeGraphVariable('turnLastSlot').asType('int'), 7n)
          const shouldChain = ef.logicalAndOperation(isChunkEnd, isWhole)
          ef.doubleBranch(shouldChain, () => {
            const nextChunk = ef.addition(chunk, 1n)
            ef.setNodeGraphVariable('turnChunk', nextChunk, false)
            ef.multipleBranches(nextChunk, {
              1: () => {
                const list = ef.getNodeGraphVariable('wholeTurnTimes1').asType('float_list')
                ef.registerExecNode('start_timer', [evt.eventSourceEntity, new str('turnblock'), new bool(false), list])
              },
              2: () => {
                const list = ef.getNodeGraphVariable('wholeTurnTimes2').asType('float_list')
                ef.registerExecNode('start_timer', [evt.eventSourceEntity, new str('turnblock'), new bool(false), list])
              },
              3: () => {
                const list = ef.getNodeGraphVariable('wholeTurnTimes3').asType('float_list')
                ef.registerExecNode('start_timer', [evt.eventSourceEntity, new str('turnblock'), new bool(false), list])
              },
              default: () => {}
            })
          }, () => {})
        })
      }
      const handleOrbit = () => () => {
        ef.callComposite(viewOrbit2, { slot: evt.timerSequenceId as never, target: evt.eventSourceEntity })
      }
      ef.multipleBranches(evt.timerName as never, {
        'turnblock': handleTurn(),
        'orbit2': handleOrbit(),
        'execMove': () => {
          const mv = ef.getNodeGraphVariable('pendingMove').asType('int')
          ef.setNodeGraphVariable('curMove', mv, false)
          ef.callComposite(flowDoMove, { moveId: mv, target: evt.eventSourceEntity })
        },
        'unlock': () => {
          ef.setNodeGraphVariable('lock', false, false)
          ef.callComposite(flowAfterTurn, { target: evt.eventSourceEntity })
        },
        default: () => {}
      })
    })
    return {}
  }
})

// ================================================================
// 2026-08-21 重构：视觉根图瘦身 —— 分支只设变量，join 后单次调用统一处理器
// 每个新复合控制在 5 节点以内，超过 5 节点继续拆复合。
// ================================================================

// 同步 blocks + tempP + blockOrient（3 组，6 节点）
export const viewSyncBlocks = g.defineComposite('view_sync_blocks', {
    id: 1610700031,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const s1 = f.registerExecNode('set_node_graph_variable', [
      new str('blocks'),
      f.getCustomVariable(target, new str('blocks')).asType('entity_list'),
      new bool(false)
    ])
    const s2 = f.registerExecNode('set_node_graph_variable', [
      new str('tempP'),
      f.getCustomVariable(target, new str('tempP')).asType('int_list'),
      new bool(false)
    ])
    const s3 = f.registerExecNode('set_node_graph_variable', [
      new str('blockOrient'),
      f.getCustomVariable(target, new str('blockOrient')).asType('int_list'),
      new bool(false)
    ])
    f.connect(s1, 0, s2, 0)
    f.connect(s2, 0, s3, 0)
    f.outflow('done', s3, 0)
    return {}
  }
})

// 同步 centerPos（1 节点）
export const viewSyncCenter = g.defineComposite('view_sync_center', {
    id: 1610700032,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const s1 = f.registerExecNode('set_node_graph_variable', [
      new str('centerPos'),
      f.getCustomVariable(target, new str('centerPos')).asType('int_list'),
      new bool(false)
    ])
    f.outflow('done', s1, 0)
    return {}
  }
})

// 同步 curMove + turnLastSlot + turnCompletionDelay（3 节点）
export const viewSyncTurnParams = g.defineComposite('view_sync_turn_params', {
    id: 1610700033,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const s1 = f.registerExecNode('set_node_graph_variable', [
      new str('curMove'),
      f.getCustomVariable(target, new str('curMove')).asType('int'),
      new bool(false)
    ])
    const s2 = f.registerExecNode('set_node_graph_variable', [
      new str('turnLastSlot'),
      f.getCustomVariable(target, new str('turnLastSlot')).asType('int'),
      new bool(false)
    ])
    const s3 = f.registerExecNode('set_node_graph_variable', [
      new str('turnCompletionDelay'),
      f.getCustomVariable(target, new str('turnCompletionDelay')).asType('float'),
      new bool(false)
    ])
    f.connect(s1, 0, s2, 0)
    f.connect(s2, 0, s3, 0)
    f.outflow('done', s3, 0)
    return {}
  }
})

// 同步 turnDuration + segmentDuration（2 组，4 节点）
export const viewSyncMotionParams = g.defineComposite('view_sync_motion_params', {
    id: 1610700034,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const s1 = f.registerExecNode('set_node_graph_variable', [
      new str('turnDuration'),
      f.getCustomVariable(target, new str('turnDuration')).asType('float'),
      new bool(false)
    ])
    const s2 = f.registerExecNode('set_node_graph_variable', [
      new str('segmentDuration'),
      f.getCustomVariable(target, new str('segmentDuration')).asType('float'),
      new bool(false)
    ])
    f.connect(s1, 0, s2, 0)
    f.outflow('done', s2, 0)
    return {}
  }
})

// 同步 orbitKVel + angularVelocity（2 组，4 节点）
export const viewSyncVelocityParams = g.defineComposite('view_sync_velocity_params', {
    id: 1610700038,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const s1 = f.registerExecNode('set_node_graph_variable', [
      new str('orbitKVel'),
      f.getCustomVariable(target, new str('orbitKVel')).asType('float'),
      new bool(false)
    ])
    const s2 = f.registerExecNode('set_node_graph_variable', [
      new str('angularVelocity'),
      f.getCustomVariable(target, new str('angularVelocity')).asType('float'),
      new bool(false)
    ])
    f.connect(s1, 0, s2, 0)
    f.outflow('done', s2, 0)
    return {}
  }
})

// 汇总同步（5 个复合调用，≤5）
export const viewSyncShared = g.defineComposite('view_sync_shared', {
    id: 1610700035,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const a = f.callComposite(viewSyncBlocks, { target })
    const b = f.callComposite(viewSyncCenter, { target })
    const c = f.callComposite(viewSyncTurnParams, { target })
    const d = f.callComposite(viewSyncMotionParams, { target })
    const e = f.callComposite(viewSyncVelocityParams, { target })
    f.connect(a as never, 0, b as never, 0)
    f.connect(b as never, 0, c as never, 0)
    f.connect(c as never, 0, d as never, 0)
    f.connect(d as never, 0, e as never, 0)
    f.outflow('done', e as never, 0)
    return {}
  }
})

// turn 准备：仅每次转动的第一个事件（base=0 且 seq=0）同步共享状态 + 准备视觉顺序
export const viewTurnPrepare = g.defineComposite('view_turn_prepare', {
    id: 1610700040,
  inputs: { target: { type: 'entity' }, base: { type: 'int' }, seq: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target, base, seq }, f) => {
    const needPrepare = f.logicalAndOperation(f.equal(seq, 0n), f.equal(base, 0n))
    // doubleBranch 自带 join：true/false 分支尾部都会续到后面的 done
    f.doubleBranch(needPrepare, () => {
      f.callComposite(viewSyncShared, { target })
      f.callComposite(viewPrepareVisualOrder, {
        moveId: f.getNodeGraphVariable('curMove').asType('int')
      })
    }, () => {})
    const done = f.registerExecNode('set_node_graph_variable', [
      new str('turnLastSlot'),
      f.getNodeGraphVariable('turnLastSlot').asType('int'),
      new bool(false)
    ])
    // 链：doubleBranch（auto-chain）→ join → done
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

// turn 最后槽：等于 turnLastSlot 时注册 unlock 定时器
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
    const unlock = f.callComposite(viewTurnUnlockIfLast, { slot: slot.slot, target })
    f.connect(slot as never, 0, unlock as never, 0)
    return {}
  }
})

// orbit2 核心：直接 viewOrbit2（共享状态已由首次 turnblock 同步）
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

// 统一定时器事件处理器：按 handlerMode 分派 turn/orbit（unlock 由主图处理）
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
      default: () => {}
    })
    return {}
  }
})
