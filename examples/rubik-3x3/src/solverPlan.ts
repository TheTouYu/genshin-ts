// solverPlan.ts —— 求解规划图（事件驱动 + 细分计划步：把一个大 replan 拆成 4 个 planTick 小步）
// 与执行图(solver)同挂自动求解实体；解完发 op=7 完成。
// 单信号 rubik3x3_solve(op,val)：op 3=执行一步(执行图发) / op 5=序列播完，重算下一步 /
// op 6=序列就绪(规划→执行) / op 7=全部完成(规划发)
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import {
  solverCrossMask, solverFirstUnsolved, solverEdgeState, solverAppendCode, solverStartPlanTick
} from './composites/solverCore.js'
import { longListGetInt4 } from './composites/list.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3
} from './cfopTables.js'

const graph = g
  .server({
    id: 1073741834,
    variables: {
      sep: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
      seo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
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
      phase: new int(0), // 0 idle / 1 armed / 2 waiting-exec
      pStep: new int(0), // plan tick 小步
      solveMask: new int(0),
      mIdx: new int(0),
      mLen: new int(0),
      mC0: new int(0),
      mC1: new int(0),
      mC2: new int(0),
      tmpA: new int(0),
      crossHomes: [4n, 5n, 6n, 7n],
      dbgTag: new str(''),
      dbgVal: new str(''),

      CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
      CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
      CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('rubik3x3-solver-plan-ready')
  })
  .on('whenTabIsSelected', (_evt, f) => {
    // 自动求解实体选项卡：置 armed 并立即开始重算（状态由主图持续发布到控制器 A）
    f.setNodeGraphVariable('phase', new int(1), false)
    f.setNodeGraphVariable('solveLen', new int(0), false)
    f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
    f.setNodeGraphVariable('dbgVal', new str('tab-start'), false)
    const tick = f.callComposite(solverStartPlanTick, { target: f.getSelfEntity() })
    // 回传 op5 启动重算
    f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 0n)
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'planTick': () => {
        const self = f.getSelfEntity()
        f.multipleBranches(f.getNodeGraphVariable('pStep').asType('int'), {
          // 小步 1：只读主图发布的最新棱状态 → sep/seo
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
            f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
            f.setNodeGraphVariable('dbgVal', new str('step1'), false)
            f.setNodeGraphVariable('pStep', new int(2), false)
            f.callComposite(solverStartPlanTick, { target: self })
          },
          // 小步 2：只算 mask
          2: () => {
            const mask = f.callComposite(solverCrossMask, { h0: 4n, h1: 5n, h2: 6n, h3: 7n }).mask
            f.setNodeGraphVariable('solveMask', mask, false)
            f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
            f.setNodeGraphVariable('dbgVal', f.dataTypeConversion(mask, 'str'), false)
            f.setNodeGraphVariable('pStep', new int(3), false)
            f.callComposite(solverStartPlanTick, { target: self })
          },
          // 小步 3：未完成则策略查表，写入宏 mC0..2
          3: () => {
            const mask = f.getNodeGraphVariable('solveMask').asType('int')
            f.doubleBranch(
              f.equal(mask, 15n),
              () => {
                f.setNodeGraphVariable('phase', new int(0), false)
                f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                f.setNodeGraphVariable('dbgVal', new str('plan-done'), false)
                f.sendSignal(RubikSignal.rubik3x3_solve, 7n, 0n)
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
                f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                f.setNodeGraphVariable('dbgVal', new str('step3'), false)
                f.setNodeGraphVariable('pStep', new int(4), false)
                f.callComposite(solverStartPlanTick, { target: self })
              }
            )
          },
          // 小步 4：每次只追加一个 move code，追加完发 op6
          4: () => {
            const mIdx = f.getNodeGraphVariable('mIdx').asType('int')
            const mLen = f.getNodeGraphVariable('mLen').asType('int')
            f.doubleBranch(
              f.lessThan(mIdx, mLen),
              () => {
                f.multipleBranches(mIdx, {
                  0: () => f.callComposite(solverAppendCode, { code: f.getNodeGraphVariable('mC0').asType('int') }),
                  1: () => f.callComposite(solverAppendCode, { code: f.getNodeGraphVariable('mC1').asType('int') }),
                  2: () => f.callComposite(solverAppendCode, { code: f.getNodeGraphVariable('mC2').asType('int') }),
                  default: () => {}
                })
                f.setNodeGraphVariable('mIdx', f.addition(mIdx, 1n), false)
                f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                f.setNodeGraphVariable('dbgVal', new str('step4-append'), false)
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
        f.setNodeGraphVariable('solveLen', new int(0), false)
        f.setNodeGraphVariable('pStep', new int(1), false)
        f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
        f.setNodeGraphVariable('dbgVal', new str('tab-auto'), false)
        f.callComposite(solverStartPlanTick, { target: f.getSelfEntity() })
      },
      5: () => {
        const phase = f.getNodeGraphVariable('phase').asType('int')
        f.doubleBranch(f.greaterThan(phase, 0n), () => {
          f.setNodeGraphVariable('solveLen', new int(0), false)
          f.setNodeGraphVariable('pStep', new int(1), false)
          f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
          f.setNodeGraphVariable('dbgVal', new str('replan'), false)
          f.callComposite(solverStartPlanTick, { target: f.getSelfEntity() })
        }, () => {})
      },
      default: () => {}
    })
  })

export default graph
