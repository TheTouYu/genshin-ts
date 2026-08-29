// solverPlan.ts —— 求解规划图（事件驱动 + 细分计划步：把一个大 replan 拆成 4 个 planTick 小步）
// 与执行图(solver)同挂自动求解实体；解完发 op=7 完成。
// 单信号 rubik3x3_solve(op,val)：op 3=执行一步(执行图发) / op 5=序列播完，重算下一步 /
// op 6=序列就绪(规划→执行) / op 7=全部完成(规划发) / op 13=第一层完成，交棒中二层规划图(solverEPlan)
//
// 阶段 stage：0=整体旋转/中心归一化；1=底层十字；2=第一层(D面)角块。
// 中心归一化用正方向 x/y/z 宏（centerTables），把整体旋转后的 centerPos 转回恒等，
// 之后十字/角块才按固定中心配色求解（不满足 "centerPos 非恒等" 的场景不会漏掉）。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import {
  solverCrossMask, solverFirstUnsolved, solverEdgeState, solverAppendCode, solverStartPlanTick,
  solverCornerState, solverCornerMask, solverCornerFirstUnsolved, solverClearBuf
} from './composites/solverCore.js'
import { longListGetInt4 } from './composites/list.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3
} from './cfopTables.js'
import {
  CF_CORNER_MACRO_LEN_c0,
  CF_CORNER_MACRO_C0_c0, CF_CORNER_MACRO_C1_c0, CF_CORNER_MACRO_C2_c0, CF_CORNER_MACRO_C3_c0,
  CF_CORNER_MACRO_C4_c0, CF_CORNER_MACRO_C5_c0, CF_CORNER_MACRO_C6_c0, CF_CORNER_MACRO_C7_c0,
  CF_CORNER_MACRO_C8_c0, CF_CORNER_MACRO_C9_c0, CF_CORNER_MACRO_C10_c0, CF_CORNER_MACRO_C11_c0,
  CF_CORNER_MACRO_C12_c0, CF_CORNER_MACRO_C13_c0, CF_CORNER_MACRO_C14_c0, CF_CORNER_MACRO_C15_c0,
  CF_CORNER_POLICY_c0, CF_CORNER_POLICY_c1, CF_CORNER_POLICY_c2, CF_CORNER_POLICY_c3
} from './cornerTables.js'
import {
  CF_CENTER_LOOKUP, CF_CENTER_MACRO_LEN,
  CF_CENTER_MACRO_C0, CF_CENTER_MACRO_C1, CF_CENTER_MACRO_C2, CF_CENTER_MACRO_C3
} from './centerTables.js'

const graph = g
  .server({
    id: 1073741834,
    variables: {
      sct: [0n, 1n, 2n, 3n, 4n, 5n],
      sep: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
      // 末尾哨兵 1（下标 12）：防 seo 全 0 时引擎短物化；solver_edge_state 只读前 12 位。
      seo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n],
      scp: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
      // 末尾哨兵 1（下标 8）：防 sco 全 0 时引擎短物化。solver_corner_state 只读前 8 位。
      sco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n],
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
      solveLen: new int(0),
      bufPos: new int(0),
      phase: new int(0), // 0 idle / 1 armed / 2 waiting-exec
      stage: new int(0), // 0 归一化 / 1 十字 / 2 第一层角块
      pStep: new int(0), // plan tick 小步
      solveMask: new int(0),
      mIdx: new int(0),
      mLen: new int(0),
      mP: new int(0),
      mCode: new int(0),
      mC0: new int(0),
      mC1: new int(0),
      mC2: new int(0),
      tmpA: new int(0),
      ctKey: new int(0),
      crossHomes: [4n, 5n, 6n, 7n],
      dbgTag: new str(''),
      dbgVal: new str(''),

      CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS,
      CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
      CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
      CF_CORNER_MACRO_LEN_c0,
      CF_CORNER_MACRO_C0_c0, CF_CORNER_MACRO_C1_c0, CF_CORNER_MACRO_C2_c0, CF_CORNER_MACRO_C3_c0,
      CF_CORNER_MACRO_C4_c0, CF_CORNER_MACRO_C5_c0, CF_CORNER_MACRO_C6_c0, CF_CORNER_MACRO_C7_c0,
      CF_CORNER_MACRO_C8_c0, CF_CORNER_MACRO_C9_c0, CF_CORNER_MACRO_C10_c0, CF_CORNER_MACRO_C11_c0,
      CF_CORNER_MACRO_C12_c0, CF_CORNER_MACRO_C13_c0, CF_CORNER_MACRO_C14_c0, CF_CORNER_MACRO_C15_c0,
      CF_CORNER_POLICY_c0, CF_CORNER_POLICY_c1, CF_CORNER_POLICY_c2, CF_CORNER_POLICY_c3,
      CF_CENTER_LOOKUP, CF_CENTER_MACRO_LEN,
      CF_CENTER_MACRO_C0, CF_CENTER_MACRO_C1, CF_CENTER_MACRO_C2, CF_CENTER_MACRO_C3
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('rubik3x3-solver-plan-ready')
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'planTick': () => {
        const self = f.getSelfEntity()
        f.multipleBranches(f.getNodeGraphVariable('pStep').asType('int'), {
          // 小步 1：只读主图发布的最新状态（stage 0 读中心 / 1 读棱 / 2 读角）
          1: () => {
            const stage = f.getNodeGraphVariable('stage').asType('int')
            f.multipleBranches(stage, {
              0: () => {
                const stHost = entity(1077936201n)
                const ct = f.getCustomVariable(stHost, new str('solver_ct')).asType('int_list')
                const sct = f.getNodeGraphVariable('sct').asType('int_list')
                f.finiteLoop(0n, 5n, (c: any) => {
                  f.registerExecNode('set_list_value', [sct, c, f.getCorrespondingValueFromList(ct, c)])
                })
              },
              1: () => {
                const stHost = entity(1077936201n)
                const ep = f.getCustomVariable(stHost, new str('solver_ep')).asType('int_list')
                const eo = f.getCustomVariable(stHost, new str('solver_eo')).asType('int_list')
                const sep = f.getNodeGraphVariable('sep').asType('int_list')
                const seo = f.getNodeGraphVariable('seo').asType('int_list')
                f.finiteLoop(0n, 11n, (c: any) => {
                  f.registerExecNode('set_list_value', [sep, c, f.getCorrespondingValueFromList(ep, c)])
                  f.registerExecNode('set_list_value', [seo, c, f.getCorrespondingValueFromList(eo, c)])
                })
              },
              2: () => {
                const stHost = entity(1077936201n)
                const cp = f.getCustomVariable(stHost, new str('solver_cp')).asType('int_list')
                const co = f.getCustomVariable(stHost, new str('solver_co')).asType('int_list')
                const scp = f.getNodeGraphVariable('scp').asType('int_list')
                const sco = f.getNodeGraphVariable('sco').asType('int_list')
                f.finiteLoop(0n, 7n, (c: any) => {
                  f.registerExecNode('set_list_value', [scp, c, f.getCorrespondingValueFromList(cp, c)])
                  f.registerExecNode('set_list_value', [sco, c, f.getCorrespondingValueFromList(co, c)])
                })
              },
              default: () => {}
            })
            f.setNodeGraphVariable('pStep', new int(2), false)
            f.callComposite(solverStartPlanTick, { target: self })
          },
          // 小步 2：只算 mask/完成标记（stage 0 中心 / 1 十字 / 2 角块）
          2: () => {
            const stage = f.getNodeGraphVariable('stage').asType('int')
            f.multipleBranches(stage, {
              0: () => {
                const sct = f.getNodeGraphVariable('sct').asType('int_list')
                const u = f.getCorrespondingValueFromList(sct, 0n)
                const fp = f.getCorrespondingValueFromList(sct, 2n)
                f.setNodeGraphVariable('ctKey', f.addition(f.multiplication(u, 6n), fp), false)
                const done = f.logicalAndOperation(f.equal(u, 0n), f.equal(fp, 2n))
                f.setNodeGraphVariable('solveMask', f.dataTypeConversion(done, 'int'), false)
              },
              1: () => {
                const mask = f.callComposite(solverCrossMask, { h0: 4n, h1: 5n, h2: 6n, h3: 7n }).mask
                f.setNodeGraphVariable('solveMask', mask, false)
              },
              2: () => {
                const mask = f.callComposite(solverCornerMask, { c4: 4n, c5: 5n, c6: 6n, c7: 7n }).mask
                f.setNodeGraphVariable('solveMask', mask, false)
              },
              default: () => {}
            })
            f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
            f.setNodeGraphVariable('dbgVal', f.dataTypeConversion(f.getNodeGraphVariable('solveMask').asType('int'), 'str'), false)
            f.setNodeGraphVariable('pStep', new int(3), false)
            f.callComposite(solverStartPlanTick, { target: self })
          },
          // 小步 3：未完成则策略查表，写入宏参数（中心 mP / 十字 mC0..2 / 角块 mP）
          3: () => {
            const stage = f.getNodeGraphVariable('stage').asType('int')
            f.multipleBranches(stage, {
              0: () => {
                const done = f.equal(f.getNodeGraphVariable('solveMask').asType('int'), 1n)
                f.doubleBranch(done, () => {
                  // 中心已归一化：切到十字阶段
                  f.setNodeGraphVariable('stage', new int(1), false)
                  f.setNodeGraphVariable('solveLen', new int(0), false)
                  f.setNodeGraphVariable('bufPos', new int(0), false)
                  f.callComposite(solverClearBuf, {})
                  f.setNodeGraphVariable('pStep', new int(1), false)
                  f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                  f.setNodeGraphVariable('dbgVal', new str('stage-cross'), false)
                  f.callComposite(solverStartPlanTick, { target: self })
                }, () => {
                  const p = f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CENTER_LOOKUP').asType('int_list'), f.getNodeGraphVariable('ctKey').asType('int'))
                  f.setNodeGraphVariable('mLen', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CENTER_MACRO_LEN').asType('int_list'), p), false)
                  f.setNodeGraphVariable('mP', p, false)
                  f.setNodeGraphVariable('mIdx', new int(0), false)
                  f.setNodeGraphVariable('pStep', new int(4), false)
                  f.callComposite(solverStartPlanTick, { target: self })
                })
              },
              1: () => {
                const mask = f.getNodeGraphVariable('solveMask').asType('int')
                f.doubleBranch(
                  f.equal(mask, 15n),
                  () => {
                    // 十字完成：切到第一层角块阶段
                    f.setNodeGraphVariable('stage', new int(2), false)
                    f.setNodeGraphVariable('solveLen', new int(0), false)
                    f.setNodeGraphVariable('bufPos', new int(0), false)
                    f.callComposite(solverClearBuf, {})
                    f.setNodeGraphVariable('pStep', new int(1), false)
                    f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                    f.setNodeGraphVariable('dbgVal', new str('stage-corners'), false)
                    f.callComposite(solverStartPlanTick, { target: self })
                  },
                  () => {
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
                    f.setNodeGraphVariable('mLen', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_LEN_c0').asType('int_list'), p), false)
                    f.setNodeGraphVariable('mC0', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_C0_c0').asType('int_list'), p), false)
                    f.setNodeGraphVariable('mC1', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_C1_c0').asType('int_list'), p), false)
                    f.setNodeGraphVariable('mC2', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_X_MACRO_C2_c0').asType('int_list'), p), false)
                    f.setNodeGraphVariable('mIdx', new int(0), false)
                    f.setNodeGraphVariable('pStep', new int(4), false)
                    f.callComposite(solverStartPlanTick, { target: self })
                  }
                )
              },
              2: () => {
                const mask = f.getNodeGraphVariable('solveMask').asType('int')
                f.doubleBranch(
                  f.equal(mask, 15n),
                  () => {
                    // 第一层角块完成：交棒给中二层规划图 solverEPlan（op=13，op7 保留给最终完成）
                    f.setNodeGraphVariable('phase', new int(0), false)
                    // pStep 归零：solverEPlan 的 planTick 定时器也会触发本图 handler，pStep=0 走 default 不动作
                    f.setNodeGraphVariable('pStep', new int(0), false)
                    f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                    f.setNodeGraphVariable('dbgVal', new str('stage-e-layer'), false)
                    f.sendSignal(RubikSignal.rubik3x3_solve, 13n, 0n)
                  },
                  () => {
                    const t = f.callComposite(solverCornerFirstUnsolved, { mask }).out
                    const home = f.addition(t, 4n)
                    const st = f.callComposite(solverCornerState, { home }).out
                    const idx = f.addition(f.multiplication(mask, 24n), st)
                    const p = f.callComposite(longListGetInt4, {
                      i: idx,
                      chunkSize: 96n,
                      c0: f.getNodeGraphVariable('CF_CORNER_POLICY_c0').asType('int_list'),
                      c1: f.getNodeGraphVariable('CF_CORNER_POLICY_c1').asType('int_list'),
                      c2: f.getNodeGraphVariable('CF_CORNER_POLICY_c2').asType('int_list'),
                      c3: f.getNodeGraphVariable('CF_CORNER_POLICY_c3').asType('int_list')
                    }).out
                    f.setNodeGraphVariable('mLen', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_LEN_c0').asType('int_list'), p), false)
                    f.setNodeGraphVariable('mP', p, false)
                    f.setNodeGraphVariable('mIdx', new int(0), false)
                    f.setNodeGraphVariable('pStep', new int(4), false)
                    f.callComposite(solverStartPlanTick, { target: self })
                  }
                )
              },
              default: () => {}
            })
          },
          // 小步 4：每次只追加一个 move code，追加完发 op6
          4: () => {
            const mIdx = f.getNodeGraphVariable('mIdx').asType('int')
            const mLen = f.getNodeGraphVariable('mLen').asType('int')
            f.doubleBranch(
              f.lessThan(mIdx, mLen),
              () => {
                const stage = f.getNodeGraphVariable('stage').asType('int')
                f.multipleBranches(stage, {
                  0: () => {
                    const p = f.getNodeGraphVariable('mP').asType('int')
                    f.multipleBranches(mIdx, {
                      0: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CENTER_MACRO_C0').asType('int_list'), p), false),
                      1: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CENTER_MACRO_C1').asType('int_list'), p), false),
                      2: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CENTER_MACRO_C2').asType('int_list'), p), false),
                      3: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CENTER_MACRO_C3').asType('int_list'), p), false),
                      default: () => {}
                    })
                  },
                  1: () => {
                    f.multipleBranches(mIdx, {
                      0: () => f.setNodeGraphVariable('mCode', f.getNodeGraphVariable('mC0').asType('int'), false),
                      1: () => f.setNodeGraphVariable('mCode', f.getNodeGraphVariable('mC1').asType('int'), false),
                      2: () => f.setNodeGraphVariable('mCode', f.getNodeGraphVariable('mC2').asType('int'), false),
                      default: () => {}
                    })
                  },
                  2: () => {
                    const p = f.getNodeGraphVariable('mP').asType('int')
                    f.multipleBranches(mIdx, {
                      0: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C0_c0').asType('int_list'), p), false),
                      1: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C1_c0').asType('int_list'), p), false),
                      2: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C2_c0').asType('int_list'), p), false),
                      3: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C3_c0').asType('int_list'), p), false),
                      4: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C4_c0').asType('int_list'), p), false),
                      5: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C5_c0').asType('int_list'), p), false),
                      6: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C6_c0').asType('int_list'), p), false),
                      7: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C7_c0').asType('int_list'), p), false),
                      8: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C8_c0').asType('int_list'), p), false),
                      9: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C9_c0').asType('int_list'), p), false),
                      10: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C10_c0').asType('int_list'), p), false),
                      11: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C11_c0').asType('int_list'), p), false),
                      12: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C12_c0').asType('int_list'), p), false),
                      13: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C13_c0').asType('int_list'), p), false),
                      14: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C14_c0').asType('int_list'), p), false),
                      15: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C15_c0').asType('int_list'), p), false),
                      default: () => {}
                    })
                  },
                  default: () => {}
                })
                // stage 0：中心宏是原始 moveId（10/11/12），用 solverAppendMoveId 逐 id 追加；
                // 其余 stage：face move code 用 solverAppendCode 展开 cnt 次。
                f.callComposite(solverAppendCode, {
                  code: f.getNodeGraphVariable('mCode').asType('int'),
                  raw: f.equal(stage, 0n)
                })
                f.setNodeGraphVariable('mIdx', f.addition(mIdx, 1n), false)
                f.callComposite(solverStartPlanTick, { target: self })
              },
              () => {
                f.setCustomVariable(f.getSelfEntity(), new str('solve_seq'), f.getNodeGraphVariable('solveBuf').asType('int_list'), false)
                f.setCustomVariable(f.getSelfEntity(), new str('solve_len'), f.getNodeGraphVariable('solveLen').asType('int'), false)
                f.setNodeGraphVariable('phase', new int(2), false)
                f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                f.setNodeGraphVariable('dbgVal', new str('seq-ready'), false)
                f.sendSignal(RubikSignal.rubik3x3_solve, 6n, 0n)
              }
            )
          },
          default: () => {}
        })
      },
      default: () => {}
    })
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.multipleBranches(evt.params.op, {
      12: () => {
        // 主图 tab14 自动还原入口：武装并启动 planTick 重算
        f.setNodeGraphVariable('phase', new int(1), false)
        f.setNodeGraphVariable('stage', new int(0), false)
        f.setNodeGraphVariable('solveLen', new int(0), false)
        f.setNodeGraphVariable('bufPos', new int(0), false)
        f.callComposite(solverClearBuf, {})
        f.setNodeGraphVariable('pStep', new int(1), false)
        f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
        f.setNodeGraphVariable('dbgVal', new str('tab-auto'), false)
        f.callComposite(solverStartPlanTick, { target: f.getSelfEntity() })
      },
      5: () => {
        const phase = f.getNodeGraphVariable('phase').asType('int')
        f.doubleBranch(f.greaterThan(phase, 0n), () => {
          f.setNodeGraphVariable('solveLen', new int(0), false)
          f.setNodeGraphVariable('bufPos', new int(0), false)
          f.callComposite(solverClearBuf, {})
          f.setNodeGraphVariable('pStep', new int(1), false)
          f.callComposite(solverStartPlanTick, { target: f.getSelfEntity() })
        }, () => {})
      },
      default: () => {}
    })
  })

export default graph
