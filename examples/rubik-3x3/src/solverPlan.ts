// solverPlan.ts —— 求解规划图（重计算：状态转换 + 十字策略 + 未来角块/第二层/OLL/PLL）
// 与执行图(solver)同挂自动求解实体；解完写 solve_seq/solve_len 到实体自定义变量，发 op=6 交执行图。
// 单信号 rubik3x3_solve(op,val)：op 1=请求状态(实体 tab)；op 2=状态已发布(主图回)。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import { solverCrossStep, solverStartTick } from './composites/solverCore.js'
import { dbgTag } from './composites/debuglog.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_CNT,
  CF_X_MACRO_LEN_c0, CF_X_MACRO_C0_c0, CF_X_MACRO_C1_c0, CF_X_MACRO_C2_c0,
  CF_X_POLICY_c0, CF_X_POLICY_c1, CF_X_POLICY_c2, CF_X_POLICY_c3,
  SC_FCORNER_FROM_c0, SC_FCORNER_TO_c0, SC_FCORNER_TWIST_c0,
  SC_FEDGE_FROM_c0, SC_FEDGE_TO_c0, SC_FEDGE_FLIP_c0
} from './cfopTables.js'

const graph = g
  .server({
    id: 1073741834,
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
      dbgTag: new str(''),
      dbgVal: new str(''),
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
    // 自动求解实体选项卡：状态已由主图每步持续发布，直接开始求解
    f.setNodeGraphVariable('phase', new int(1), false)
    f.setNodeGraphVariable('solveLen', new int(0), false)
    // DBG：标记一次有效的自动求解触发（日志帧搜 DBG_RUBIK_SOLVE）
    const tag = f.callComposite(dbgTag, { tag: new str('DBG_RUBIK_SOLVE'), val: new str('tab-start') })
    const tick = f.callComposite(solverStartTick, { target: f.getSelfEntity() })
    f.connect(tag as never, 0, tick as never, 0)
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
            const tag = f.callComposite(dbgTag, { tag: new str('DBG_RUBIK_SOLVE'), val: new str('phase2') })
            const tick = f.callComposite(solverStartTick, { target: f.getSelfEntity() })
            f.connect(tag as never, 0, tick as never, 0)
          },
          2: () => {
            // 2026-08-24 截断修复：mask 只算一次（solverCrossStep 内部算并输出），
            // 外层不再重复调 solverCrossMask，省掉第二次 mask 展开帧。
            const step = f.callComposite(solverCrossStep, {})
            f.doubleBranch(
              f.equal(step.mask, 15n),
              () => {
                f.setNodeGraphVariable('phase', new int(3), false)
                // 解序列写入本实体（执行图同挂本实体读取），发 op=6 交执行图逐条定时播放
                f.setCustomVariable(f.getSelfEntity(), new str('solve_seq'), f.getNodeGraphVariable('solveBuf').asType('int_list'), false)
                f.setCustomVariable(f.getSelfEntity(), new str('solve_len'), f.getNodeGraphVariable('solveLen').asType('int'), false)
                f.sendSignal(RubikSignal.rubik3x3_solve, 6n, 0n)
                const tag = f.callComposite(dbgTag, { tag: new str('DBG_RUBIK_SOLVE'), val: new str('plan-done') })
                // tag 已由 sendSignal 后链路的最后调用挂接；这里不额外 connect 避免重复入边
              },
              () => {
                const tag = f.callComposite(dbgTag, { tag: new str('DBG_RUBIK_SOLVE'), val: f.dataTypeConversion(step.mask, 'str') })
                const tick = f.callComposite(solverStartTick, { target: f.getSelfEntity() })
                f.connect(tag as never, 0, tick as never, 0)
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
