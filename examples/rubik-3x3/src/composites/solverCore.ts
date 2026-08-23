// solverCore.ts —— 求解器共享复合（规划图/执行图共用，显式 ID 稳定）
// 约定：求解状态 = CubeLib 约定；move code 0..17；单信号 rubik3x3_solve(op,val)
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from '../signals.js'
import { longListGetInt4 } from './list.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
  SC_FCORNER_FROM_c0, SC_FCORNER_TO_c0, SC_FCORNER_TWIST_c0,
  SC_FEDGE_FROM_c0, SC_FEDGE_TO_c0, SC_FEDGE_FLIP_c0
} from '../cfopTables.js'

// 纯数据：home 块（棱）当前 state = pos*2 + orient
export const solverEdgeState = g.defineComposite('solver_edge_state', {
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

// 纯数据：4 个十字棱 solvedMask
export const solverCrossMask = g.defineComposite('solver_cross_mask', {
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

// 纯数据：首个未解决槽位（0..3）
export const solverFirstUnsolved = g.defineComposite('solver_first_unsolved', {
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

// exec：应用一次面转（moveId 1..6）
export const solverApplyFace = g.defineComposite('solver_apply_face', {
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

// exec：应用一个 move code → 面转 count 次 + 追加 moveId 到 solveBuf
export const solverApplyCode = g.defineComposite('solver_apply_code', {
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
export const solverCrossStep = g.defineComposite('solver_cross_step', {
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

// exec：启动下一个 solverTick（0.01s 分片）
export const solverStartTick = g.defineComposite('solver_start_tick', {
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

// exec：从 solveSeq 取当前 move 发给主图（op=3）
export const solverSendNext = g.defineComposite('solver_send_next', {
  id: 1610700057,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const mv = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('solveSeq').asType('int_list'),
      f.getNodeGraphVariable('solveIdx').asType('int')
    )
    f.sendSignal(RubikSignal.rubik3x3_solve, 3n, mv)
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpA'), new int(0), new bool(false)])
    f.outflow('done', done, 0)
    return {}
  }
})
