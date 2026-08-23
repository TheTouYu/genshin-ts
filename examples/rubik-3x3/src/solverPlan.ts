// solverPlan.ts —— 求解规划图（重计算：状态转换 + 十字策略 + 未来角块/第二层/OLL/PLL）
// 与执行图(solver)同挂自动求解实体；解完写 solve_seq/solve_len 到实体自定义变量，发 op=6 交执行图。
// 单信号 rubik3x3_solve(op,val)：op 1=请求状态(实体 tab)；op 2=状态已发布(主图回)。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import { solverCrossStep, solverCrossMask, solverStartTick } from './composites/solverCore.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
  SC_FCORNER_FROM_c0, SC_FCORNER_TO_c0, SC_FCORNER_TWIST_c0,
  SC_FEDGE_FROM_c0, SC_FEDGE_TO_c0, SC_FEDGE_FLIP_c0
} from './cfopTables.js'

const graph = g
  .server({
    id: 1073741829,
    variables: {
      scp: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
      sco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      sep: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
      seo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tcp: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tep: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      teo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
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
      phase: new int(0), // 0 idle / 1 init / 2 cross / 3 publish
      tmpA: new int(0),
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
    f.printString('rubik3x3-solver-plan-ready')
  })
  .on('whenTabIsSelected', (_evt, f) => {
    // 自动求解实体选项卡：请求主图发布状态（op=1）
    f.sendSignal(RubikSignal.rubik3x3_solve, 1n, 0n)
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.multipleBranches(evt.params.op, {
      2: () => {
        f.setNodeGraphVariable('phase', new int(1), false)
        f.setNodeGraphVariable('solveLen', new int(0), false)
        f.callComposite(solverStartTick, { target: f.getSelfEntity() })
      },
      default: () => {}
    })
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'solverTick': () => {
        f.multipleBranches(f.getNodeGraphVariable('phase').asType('int'), {
          1: () => {
            // 状态转换：读主图发布到控制器 A 的自定义变量（游戏约定 → CubeLib 约定）
            const stHost = entity(1077936201n)
            const cp = f.getCustomVariable(stHost, new str('solver_cp')).asType('int_list')
            const co = f.getCustomVariable(stHost, new str('solver_co')).asType('int_list')
            const ep = f.getCustomVariable(stHost, new str('solver_ep')).asType('int_list')
            const eo = f.getCustomVariable(stHost, new str('solver_eo')).asType('int_list')
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
                f.setNodeGraphVariable('phase', new int(3), false)
                // 解序列写入控制器 A（主图读同一实体自定义变量），再发 op=3 交主图自动播放
                f.setCustomVariable(entity(1077936201n), new str('solve_seq'), f.getNodeGraphVariable('solveBuf').asType('int_list'), false)
                f.setCustomVariable(entity(1077936201n), new str('solve_len'), f.getNodeGraphVariable('solveLen').asType('int'), false)
                f.sendSignal(RubikSignal.rubik3x3_solve, 3n, 0n)
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
