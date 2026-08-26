// solverCore.ts —— 求解器共享复合（事件驱动版：规划图不再模拟转动，只算下一步宏）
// 约定：求解状态 = CubeLib 约定；move code 0..17；单信号 rubik3x3_solve(op,val)
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { longListGetInt4 } from './list.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3
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

// exec：追加一步到 solveBuf。raw=true 时 code 是"原始 moveId（1..12）"，raw=false 时是 face move code 表码（0..17）。
export const solverAppendCode = g.defineComposite('solver_append_code', {
  id: 1610700054,
  inputs: { code: { type: 'int' }, raw: { type: 'bool' } },
  outputs: {},
  outflows: ['done'],
  build: ({ code, raw }, f) => {
    const solveBuf = f.getNodeGraphVariable('solveBuf').asType('int_list')
    const sl = f.getNodeGraphVariable('solveLen').asType('int')
    f.doubleBranch(raw, () => {
      const set = f.registerExecNode('set_list_value', [solveBuf, sl, code])
      f.registerExecNode('set_node_graph_variable', [new str('solveLen'), f.addition(sl, 1n), new bool(false)])
    }, () => {
      const faceVar = f.getNodeGraphVariable('CF_MOVE_CODE_FACE').asType('int_list')
      const cntVar = f.getNodeGraphVariable('CF_MOVE_CODE_CNT').asType('int_list')
      const face = f.getCorrespondingValueFromList(faceVar, code)
      const cnt = f.getCorrespondingValueFromList(cntVar, code)
      // 2026-08-26 修复：不使用负 moveId 折叠（U3→U'）。
      // 负 moveId 会让 flowDoMove 在一条 exec 链里连做 3 次逻辑应用（约 3000+ 帧/记录），
      // 超过单记录 3000 帧硬上限被引擎截断 → turnblock/unlock 永不启动 → lock 卡死、接口无响应。
      // 改回正 moveId 展开：每步一条独立记录（约 1387 帧），锁与发布链完整可靠。
      f.finiteLoop(0n, f.subtraction(cnt, 1n), (k) => {
        f.registerExecNode('set_list_value', [solveBuf, f.addition(sl, k), face])
      })
      f.registerExecNode('set_node_graph_variable', [new str('solveLen'), f.addition(sl, cnt), new bool(false)])
    })
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpA'), new int(0), new bool(false)])
    f.outflow('done', done, 0)
    return {}
  }
})

// exec：一步求解规划（只算 mask + 未完成时把宏追加到 solveBuf），输出 mask 供外层判定。
// 不再模拟转动：真实状态由主图每步转动完成后发布（事件驱动）。
export const solverCrossStep = g.defineComposite('solver_cross_step', {
  id: 1610700055,
  inputs: {},
  outputs: { mask: { type: 'int' } },
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
        f.callComposite(solverAppendCode, { code: mC0, raw: new bool(false) })
        f.doubleBranch(f.greaterThan(mLen, 1n), () => {
          f.callComposite(solverAppendCode, { code: mC1, raw: new bool(false) })
          f.doubleBranch(f.greaterThan(mLen, 2n), () => {
            f.callComposite(solverAppendCode, { code: mC2, raw: new bool(false) })
          }, () => {})
        }, () => {})
      }, () => {})
    })
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpA'), new int(0), new bool(false)])
    f.outflow('done', done, 0)
    return { mask }
  }
})

// 纯数据：D 面角块当前 state = slot*3 + twist（游戏角块顺序，读取主图发布的 solver_cp/co）
export const solverCornerState = g.defineComposite('solver_corner_state', {
  id: 1610700066,
  inputs: { home: { type: 'int' } },
  outputs: { out: { type: 'int' } },
  build: ({ home }, f) => {
    const scp = f.getNodeGraphVariable('scp').asType('int_list')
    const sco = f.getNodeGraphVariable('sco').asType('int_list')
    let sum: any = f.multiplication(
      f.dataTypeConversion(f.equal(f.getCorrespondingValueFromList(scp as any, 0n), home), 'int'),
      f.getCorrespondingValueFromList(sco as any, 0n)
    )
    for (let s = 1; s < 8; s++) {
      const term = f.multiplication(
        f.dataTypeConversion(f.equal(f.getCorrespondingValueFromList(scp as any, new int(s)), home), 'int'),
        f.addition(f.multiplication(new int(s), 3n), f.getCorrespondingValueFromList(sco as any, new int(s)))
      )
      sum = f.addition(sum, term)
    }
    return { out: sum }
  }
})

// 纯数据：4 个 D 角 solvedMask（bit=home 4/5/6/7）
export const solverCornerMask = g.defineComposite('solver_corner_mask', {
  id: 1610700067,
  inputs: { c4: { type: 'int' }, c5: { type: 'int' }, c6: { type: 'int' }, c7: { type: 'int' } },
  outputs: { mask: { type: 'int' } },
  build: ({ c4, c5, c6, c7 }, f) => {
    const bit = (home: any, w: number) => f.multiplication(
      f.dataTypeConversion(f.equal(f.callComposite(solverCornerState, { home }).out, f.multiplication(home, 3n)), 'int'),
      new int(w)
    )
    return { mask: f.addition(bit(4n, 1), f.addition(bit(5n, 2), f.addition(bit(6n, 4), bit(7n, 8)))) }
  }
})

// 纯数据：首个未解决 D 角槽位（0..3）
export const solverCornerFirstUnsolved = g.defineComposite('solver_corner_first_unsolved', {
  id: 1610700068,
  inputs: { mask: { type: 'int' } },
  outputs: { out: { type: 'int' } },
  build: ({ mask }, f) => {
    const b0 = f.equal(f.moduloOperation(mask, 2n), 0n)
    const b1 = f.equal(f.moduloOperation(f.division(mask, 2n), 2n), 0n)
    const b2 = f.equal(f.moduloOperation(f.division(mask, 4n), 2n), 0n)
    const b3 = f.equal(f.moduloOperation(f.division(mask, 8n), 2n), 0n)
    const s1 = f.dataTypeConversion(f.logicalAndOperation(f.logicalNotOperation(b0), b1), 'int')
    const s2 = f.dataTypeConversion(f.logicalAndOperation(f.logicalAndOperation(f.logicalNotOperation(b0), f.logicalNotOperation(b1)), b2), 'int')
    const s3 = f.dataTypeConversion(f.logicalAndOperation(f.logicalAndOperation(f.logicalAndOperation(f.logicalNotOperation(b0), f.logicalNotOperation(b1)), f.logicalNotOperation(b2)), b3), 'int')
    return { out: f.addition(f.multiplication(s1, 1n), f.addition(f.multiplication(s2, 2n), f.multiplication(s3, 3n))) }
  }
})

// exec：启动下一个 planTick 小步（0.3s 低频率；每个 planTick 只做一小步重算）
export const solverStartPlanTick = g.defineComposite('solver_start_plan_tick', {
  id: 1610700065,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('planTick'), new bool(false), f.assemblyList([new float(0.7)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})
