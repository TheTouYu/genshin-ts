// solverPlan.ts —— 求解规划图（事件驱动：主图每步转动完成发布状态 → op5 重算 → op6 交执行 → op5 循环）
// 与执行图(solver)同挂自动求解实体；解完发 op=7 完成。
// 单信号 rubik3x3_solve(op,val)：op 2=状态已发布(保留) / op 3=执行一步(执行图发) /
// op 5=序列播完，重算下一步(执行图回) / op 6=序列就绪(规划→执行) / op 7=全部完成(规划发)
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import { solverCrossStep } from './composites/solverCore.js'
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
      phase: new int(0), // 0 idle / 1 armed(等待重算) / 2 waiting-exec
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
    // 自动求解实体选项卡：置 armed 并立即重算（状态已由主图每步后持续发布到控制器 A）
    f.setNodeGraphVariable('phase', new int(1), false)
    f.setNodeGraphVariable('solveLen', new int(0), false)
    f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
    f.setNodeGraphVariable('dbgVal', new str('tab-start'), false)
    f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 0n)
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.multipleBranches(evt.params.op, {
      5: () => {
        // 阶段：读主图发布的最新棱状态 → 重算 mask → 未完成则追加宏并交执行图
        const phase = f.getNodeGraphVariable('phase').asType('int')
        f.doubleBranch(f.greaterThan(phase, 0n), () => {
          // 每一轮宏只应追加到空序列；执行图播完当前宏后 op5 重算会再次清空
          f.setNodeGraphVariable('solveLen', new int(0), false)
          const stHost = entity(1077936201n)
          const ep = f.getCustomVariable(stHost, new str('solver_ep')).asType('int_list')
          const eo = f.getCustomVariable(stHost, new str('solver_eo')).asType('int_list')
          const sep = f.getNodeGraphVariable('sep').asType('int_list')
          const seo = f.getNodeGraphVariable('seo').asType('int_list')
          f.finiteLoop(0n, 11n, (c) => {
            f.registerExecNode('set_list_value', [sep, c, f.getCorrespondingValueFromList(ep, c)])
            f.registerExecNode('set_list_value', [seo, c, f.getCorrespondingValueFromList(eo, c)])
          })
          f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
          f.setNodeGraphVariable('dbgVal', new str('replan'), false)
          const step = f.callComposite(solverCrossStep, {})
          f.doubleBranch(
            f.equal(step.mask, 15n),
            () => {
              // 十字完成：进入 idle，不再触发任何 timer
              f.setNodeGraphVariable('phase', new int(0), false)
              f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
              f.setNodeGraphVariable('dbgVal', new str('plan-done'), false)
              f.sendSignal(RubikSignal.rubik3x3_solve, 7n, 0n)
            },
            () => {
              // 继续：把本轮宏序列交给执行图，等播完回 op5 再算
              f.setCustomVariable(f.getSelfEntity(), new str('solve_seq'), f.getNodeGraphVariable('solveBuf').asType('int_list'), false)
              f.setCustomVariable(f.getSelfEntity(), new str('solve_len'), f.getNodeGraphVariable('solveLen').asType('int'), false)
              f.setNodeGraphVariable('phase', new int(2), false)
              f.sendSignal(RubikSignal.rubik3x3_solve, 6n, 0n)
            }
          )
        }, () => {})
      },
      default: () => {}
    })
  })

export default graph
