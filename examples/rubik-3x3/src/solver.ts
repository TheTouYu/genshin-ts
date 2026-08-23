// 3×3 魔方自动复原求解器节点图（独立图，id 1073741828）
// 内部状态 = CubeLib 约定：角 0..7=UFR..DBL、棱 0..11=UF..BL；move code 0..17。
// 负载：长循环走 solverTick 定时器分片；每个 move 经 signal solve_move 交主图播放，ack 后推进。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import { longListGetInt4 } from './composites/list.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
  SC_FCORNER_FROM_c0, SC_FCORNER_TO_c0, SC_FCORNER_TWIST_c0,
  SC_FEDGE_FROM_c0, SC_FEDGE_TO_c0, SC_FEDGE_FLIP_c0
} from './cfopTables.js'

type Flow = any

// 纯数据：取 home 块（棱）当前 state = pos*2 + orient
const solverEdgeState = g.defineComposite('solver_edge_state', {
  id: 1610700050,
  inputs: { home: { type: 'int' } },
  outputs: { out: { type: 'int' } },
  build: ({ home }, f) => {
    const sep = f.getNodeGraphVariable('sep').asType('int_list')
    const seo = f.getNodeGraphVariable('seo').asType('int_list')
    let sum: any = f.multiplication(
      f.dataTypeConversion(f.equal(f.getCorrespondingValueFromList(sep as any, 0n), home), 'int'),
      f.getCorrespondingValueFromList(seo as any, 0n)
    )
    for (let s = 1; s < 12; s++) {
      const term = f.multiplication(
        f.dataTypeConversion(f.equal(f.getCorrespondingValueFromList(sep as any, new int(s)), home), 'int'),
        f.addition(f.multiplication(new int(s), 2n), f.getCorrespondingValueFromList(seo as any, new int(s)))
      )
      sum = f.addition(sum, term)
    }
    return { out: sum }
  }
})

// 纯数据：4 个十字棱的 solvedMask（bit i = home*2 已归位）
const solverCrossMask = g.defineComposite('solver_cross_mask', {
  id: 1610700051,
  inputs: { h0: { type: 'int' }, h1: { type: 'int' }, h2: { type: 'int' }, h3: { type: 'int' } },
  outputs: { mask: { type: 'int' } },
  build: ({ h0, h1, h2, h3 }, f) => {
    const bit = (home: any, w: number) => f.multiplication(
      f.dataTypeConversion(
        f.equal(f.callComposite(solverEdgeState, { home }).out, f.multiplication(home, 2n)),
        'int'
      ),
      new int(w)
    )
    return { mask: f.addition(bit(h0, 1), f.addition(bit(h1, 2), f.addition(bit(h2, 4), bit(h3, 8)))) }
  }
})

// 纯数据：首个未解决槽位（0..3；-1 表示全部已解）
const solverFirstUnsolved = g.defineComposite('solver_first_unsolved', {
  id: 1610700052,
  inputs: { mask: { type: 'int' } },
  outputs: { out: { type: 'int' } },
  build: ({ mask }, f) => {
    const b0 = f.equal(f.moduloOperation(mask, 2n), 0n)
    const b1 = f.equal(f.moduloOperation(f.division(mask, 2n), 2n), 0n)
    const b2 = f.equal(f.moduloOperation(f.division(mask, 4n), 2n), 0n)
    const b3 = f.equal(f.moduloOperation(f.division(mask, 8n), 2n), 0n)
    const s0 = f.dataTypeConversion(b0, 'int')
    const s1 = f.dataTypeConversion(f.logicalAndOperation(f.logicalNotOperation(b0), b1), 'int')
    const s2 = f.dataTypeConversion(f.logicalAndOperation(f.logicalAndOperation(f.logicalNotOperation(b0), f.logicalNotOperation(b1)), b2), 'int')
    const s3 = f.dataTypeConversion(f.logicalAndOperation(f.logicalAndOperation(f.logicalAndOperation(f.logicalNotOperation(b0), f.logicalNotOperation(b1)), f.logicalNotOperation(b2)), b3), 'int')
    return { out: f.addition(f.multiplication(s1, 1n), f.addition(f.multiplication(s2, 2n), f.multiplication(s3, 3n))) }
  }
})

// exec：应用一次面转（moveId 1..6 = R L U D F B，CubeLib 面表）
const solverApplyFace = g.defineComposite('solver_apply_face', {
  id: 1610700053,
  inputs: { moveId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId }, f) => {
    const fcFrom = f.getNodeGraphVariable('SC_FCORNER_FROM_c0').asType('int_list')
    const fcTo = f.getNodeGraphVariable('SC_FCORNER_TO_c0').asType('int_list')
    const fcTw = f.getNodeGraphVariable('SC_FCORNER_TWIST_c0').asType('int_list')
    const feFrom = f.getNodeGraphVariable('SC_FEDGE_FROM_c0').asType('int_list')
    const feTo = f.getNodeGraphVariable('SC_FEDGE_TO_c0').asType('int_list')
    const feFl = f.getNodeGraphVariable('SC_FEDGE_FLIP_c0').asType('int_list')
    const scp = f.getNodeGraphVariable('scp').asType('int_list')
    const sco = f.getNodeGraphVariable('sco').asType('int_list')
    const sep = f.getNodeGraphVariable('sep').asType('int_list')
    const seo = f.getNodeGraphVariable('seo').asType('int_list')
    const tcp = f.getNodeGraphVariable('tcp').asType('int_list')
    const tco = f.getNodeGraphVariable('tco').asType('int_list')
    const tep = f.getNodeGraphVariable('tep').asType('int_list')
    const teo = f.getNodeGraphVariable('teo').asType('int_list')
    const m1 = f.subtraction(moveId, 1n)
    const base = f.multiplication(m1, 4n)
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(base, s)
      const from = f.getCorrespondingValueFromList(fcFrom, idx)
      f.registerExecNode('set_list_value', [tcp, s, f.getCorrespondingValueFromList(scp, from)])
      f.registerExecNode('set_list_value', [tco, s, f.getCorrespondingValueFromList(sco, from)])
    })
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(base, s)
      const to = f.getCorrespondingValueFromList(fcTo, idx)
      const tw = f.getCorrespondingValueFromList(fcTw, f.addition(
        f.addition(f.multiplication(m1, 12n), f.multiplication(s, 3n)),
        f.getCorrespondingValueFromList(tco, s)
      ))
      f.registerExecNode('set_list_value', [scp, to, f.getCorrespondingValueFromList(tcp, s)])
      f.registerExecNode('set_list_value', [sco, to, tw])
    })
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(base, s)
      const from = f.getCorrespondingValueFromList(feFrom, idx)
      f.registerExecNode('set_list_value', [tep, s, f.getCorrespondingValueFromList(sep, from)])
      f.registerExecNode('set_list_value', [teo, s, f.getCorrespondingValueFromList(seo, from)])
    })
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(base, s)
      const to = f.getCorrespondingValueFromList(feTo, idx)
      const fl = f.getCorrespondingValueFromList(feFl, f.addition(
        f.addition(f.multiplication(m1, 8n), f.multiplication(s, 2n)),
        f.getCorrespondingValueFromList(teo, s)
      ))
      f.registerExecNode('set_list_value', [sep, to, f.getCorrespondingValueFromList(tep, s)])
      f.registerExecNode('set_list_value', [seo, to, fl])
    })
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpA'), new int(0), new bool(false)])
    f.outflow('done', done, 0)
    return {}
  }
})

// exec：应用一个 move code（0..17）→ 面转 count 次 + 追加 moveId 到 solveBuf
const solverApplyCode = g.defineComposite('solver_apply_code', {
  id: 1610700054,
  inputs: { code: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ code }, f) => {
    const faceVar = f.getNodeGraphVariable('CF_MOVE_CODE_FACE').asType('int_list')
    const cntVar = f.getNodeGraphVariable('CF_MOVE_CODE_CNT').asType('int_list')
    const face = f.getCorrespondingValueFromList(faceVar, code)
    const cnt = f.getCorrespondingValueFromList(cntVar, code)
    const solveBuf = f.getNodeGraphVariable('solveBuf').asType('int_list')
    const sl = f.getNodeGraphVariable('solveLen').asType('int')
    f.finiteLoop(0n, f.subtraction(cnt, 1n), (k) => {
      f.callComposite(solverApplyFace, { moveId: face })
      f.registerExecNode('set_list_value', [solveBuf, f.addition(sl, k), face])
    })
    f.registerExecNode('set_node_graph_variable', [new str('solveLen'), f.addition(sl, cnt), new bool(false)])
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpA'), new int(0), new bool(false)])
    f.outflow('done', done, 0)
    return {}
  }
})

// exec：十字推进一步（读 policy → 应用宏）
const solverCrossStep = g.defineComposite('solver_cross_step', {
  id: 1610700055,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const mask = f.callComposite(solverCrossMask, { h0: 4n, h1: 5n, h2: 6n, h3: 7n }).mask
    const br = f.node('double_branch', [f.equal(mask, 15n)])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {})
    f.connectOutFlow(br, 1, () => {
      const t = f.callComposite(solverFirstUnsolved, { mask }).out
      const home = f.getCorrespondingValueFromList(f.getNodeGraphVariable('crossHomes').asType('int_list'), t)
      const st = f.callComposite(solverEdgeState, { home }).out
      const idx = f.addition(f.multiplication(mask, 24n), st)
      const p = f.callComposite(longListGetInt4, {
        i: idx,
        chunkSize: 96n,
        c0: f.getNodeGraphVariable('CF_X_POLICY_c0').asType('int_list'),
        c1: f.getNodeGraphVariable('CF_X_POLICY_c1').asType('int_list'),
        c2: f.getNodeGraphVariable('CF_X_POLICY_c2').asType('int_list'),
        c3: f.getNodeGraphVariable('CF_X_POLICY_c3').asType('int_list')
      }).out
      const mLen = f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_LEN_c0').asType('int_list'), p)
      const mC0 = f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_C0_c0').asType('int_list'), p)
      const mC1 = f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_C1_c0').asType('int_list'), p)
      const mC2 = f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_C2_c0').asType('int_list'), p)
      f.doubleBranch(f.greaterThan(mLen, 0n), () => {
        f.callComposite(solverApplyCode, { code: mC0 })
        f.doubleBranch(f.greaterThan(mLen, 1n), () => {
          f.callComposite(solverApplyCode, { code: mC1 })
          f.doubleBranch(f.greaterThan(mLen, 2n), () => {
            f.callComposite(solverApplyCode, { code: mC2 })
          }, () => {})
        }, () => {})
      }, () => {})
    })
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpA'), new int(0), new bool(false)])
    f.outflow('done', done, 0)
    return {}
  }
})

// exec：启动下一个 solverTick（0.01s 分片；每 tick 只推一小步）
const solverStartTick = g.defineComposite('solver_start_tick', {
  id: 1610700056,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('solverTick'), new bool(false), f.assemblyList([new float(0.01)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// exec：从 solveBuf 取当前 move 发给主图
const solverSendNext = g.defineComposite('solver_send_next', {
  id: 1610700057,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const mv = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('solveBuf').asType('int_list'),
      f.getNodeGraphVariable('solveIdx').asType('int')
    )
    f.sendSignal(RubikSignal.rubik3x3_solve, 3n, mv)
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpA'), new int(0), new bool(false)])
    f.outflow('done', done, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741828,
    variables: {
      scp: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
      sco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      sep: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
      seo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tcp: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tep: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      teo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      solveLen: new int(0),
      solveIdx: new int(0),
      solveBuf: [
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n
      ],
      phase: new int(0), // 0 idle / 1 init / 2 cross / 7 emit / 8 done
      tmpA: new int(0),
      iter: new int(0),
      crossHomes: [4n, 5n, 6n, 7n],
      cubeLibG: [3n, 2n, 1n, 0n, 7n, 6n, 5n, 4n],

      CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
      CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
      CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
      SC_FCORNER_FROM_c0, SC_FCORNER_TO_c0, SC_FCORNER_TWIST_c0,
      SC_FEDGE_FROM_c0, SC_FEDGE_TO_c0, SC_FEDGE_FLIP_c0
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('rubik3x3-solver-ready')
  })
  .on('whenTabIsSelected', (_evt, f) => {
    // 专用自动求解实体选项卡：请求主图发布状态（op=1）
    f.sendSignal(RubikSignal.rubik3x3_solve, 1n, 0n)
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.multipleBranches(evt.params.op, {
      2: () => {
        f.setNodeGraphVariable('phase', new int(1), false)
        f.setNodeGraphVariable('solveLen', new int(0), false)
        f.setNodeGraphVariable('solveIdx', new int(0), false)
        f.callComposite(solverStartTick, { target: f.getSelfEntity() })
      },
      4: () => {
        // 上一步动画完成，推进到下一条 move 或结束
        const idx = f.addition(f.getNodeGraphVariable('solveIdx').asType('int'), 1n)
        f.setNodeGraphVariable('solveIdx', idx, false)
        f.doubleBranch(f.lessThan(idx, f.getNodeGraphVariable('solveLen').asType('int')), () => {
          f.callComposite(solverSendNext, {})
        }, () => {
          f.setNodeGraphVariable('phase', new int(8), false)
          f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
        })
      },
      default: () => {}
    })
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'solverTick': () => {
        f.multipleBranches(f.getNodeGraphVariable('phase').asType('int'), {
          1: () => {
            const target = entity(1077936201n) // 状态宿主：控制器 A（主图发布处）
            const cp = f.getCustomVariable(target, new str('solver_cp')).asType('int_list')
            const co = f.getCustomVariable(target, new str('solver_co')).asType('int_list')
            const ep = f.getCustomVariable(target, new str('solver_ep')).asType('int_list')
            const eo = f.getCustomVariable(target, new str('solver_eo')).asType('int_list')
            const g2c = f.getNodeGraphVariable('cubeLibG').asType('int_list')
            const scp = f.getNodeGraphVariable('scp').asType('int_list')
            const sco = f.getNodeGraphVariable('sco').asType('int_list')
            const sep = f.getNodeGraphVariable('sep').asType('int_list')
            const seo = f.getNodeGraphVariable('seo').asType('int_list')
            f.finiteLoop(0n, 7n, (c) => {
              const g = f.getCorrespondingValueFromList(g2c, c)
              f.registerExecNode('set_list_value', [sco, c, f.getCorrespondingValueFromList(co, g)])
              f.registerExecNode('set_list_value', [scp, c, f.getCorrespondingValueFromList(g2c, f.getCorrespondingValueFromList(cp, g))])
            })
            f.finiteLoop(0n, 11n, (c) => {
              f.registerExecNode('set_list_value', [sep, c, f.getCorrespondingValueFromList(ep, c)])
              f.registerExecNode('set_list_value', [seo, c, f.getCorrespondingValueFromList(eo, c)])
            })
            f.setNodeGraphVariable('phase', new int(2), false)
            f.callComposite(solverStartTick, { target: f.getSelfEntity() })
          },
          2: () => {
            f.callComposite(solverCrossStep, {})
            f.doubleBranch(
              f.equal(f.callComposite(solverCrossMask, { h0: 4n, h1: 5n, h2: 6n, h3: 7n }).mask, 15n),
              () => {
                f.setNodeGraphVariable('phase', new int(7), false)
                f.setNodeGraphVariable('solveIdx', new int(0), false)
                f.callComposite(solverSendNext, {})
              },
              () => {
                f.callComposite(solverStartTick, { target: f.getSelfEntity() })
              }
            )
          },
          default: () => {}
        })
      },
      default: () => {}
    })
  })

export default graph
