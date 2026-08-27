// solverEPlan.ts —— 中二层(E层棱块)规划图（stage 3 专用独立图）
// 由 solverPlan 完成第一层（十字+角块）后发 op=13 交棒；完成后发 op=7（plan-done）。
// 单信号 rubik3x3_solve(op,val)：op 13=武装启动 / op 5=序列播完重算 / op 6=序列就绪(→solver) / op 7=完成
// 与 solver/solverPlan 同挂实体（1077936230）；定时器用独立名字 ePlanTick，避免与 solverPlan 的 planTick 互相触发。
// E 层棱 = ep 索引 8..11（FR/FL/BR/BL）；state = pos*2 + eo；home 8..11。
// E 层 mask 用直接判 sep[h]==h && seo[h]==0（与 edgeState==home*2 等价，避免重复实例化 solverCrossMask）。
// 2026-08-27 用户指示：单图节点预算 ≤2000，solverPlan 塞不下了，新增独立图承载 stage 3。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import {
  solverFirstUnsolved, solverEdgeState, solverAppendCode, solverStartPlanTick, solverClearBuf
} from './composites/solverCore.js'
import { longListGetInt4 } from './composites/list.js'
import {
  CF_E_MACRO_LEN_c0,
  CF_E_MACRO_C0_c0, CF_E_MACRO_C1_c0, CF_E_MACRO_C2_c0, CF_E_MACRO_C3_c0,
  CF_E_MACRO_C4_c0, CF_E_MACRO_C5_c0, CF_E_MACRO_C6_c0, CF_E_MACRO_C7_c0,
  CF_E_POLICY_c0, CF_E_POLICY_c1, CF_E_POLICY_c2, CF_E_POLICY_c3
} from './eLayerTables.js'
import { CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS } from './cfopTables.js'

// 中二层专用 planTick（独立 timer 名，避免与 solverPlan 的 planTick 互触）
const solverStartEPlanTick = g.defineComposite('solver_start_eplan_tick', {
  id: 1610700081,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('ePlanTick'), new bool(false), f.assemblyList([new float(0.15)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741836,
    variables: {
      sep: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
      // 末尾哨兵 1（下标 12）：防 seo 全 0 时引擎短物化
      seo: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n],
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
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        1n  // 哨兵：防全 0 时引擎短物化（solveBuf 100 项被物化成 25 项 → 越界写丢失）
      ],
      solveLen: new int(0),
      phase: new int(0), // 0 idle / 1 armed / 2 waiting-exec
      pStep: new int(0), // plan tick 小步
      solveMask: new int(0),
      mIdx: new int(0),
      mLen: new int(0),
      mP: new int(0),
      mCode: new int(0),
      tmpA: new int(0),
      dbgTag: new str(''),
      dbgVal: new str(''),
      CF_E_MACRO_LEN_c0,
      CF_E_MACRO_C0_c0, CF_E_MACRO_C1_c0, CF_E_MACRO_C2_c0, CF_E_MACRO_C3_c0,
      CF_E_MACRO_C4_c0, CF_E_MACRO_C5_c0, CF_E_MACRO_C6_c0, CF_E_MACRO_C7_c0,
      CF_E_POLICY_c0, CF_E_POLICY_c1, CF_E_POLICY_c2, CF_E_POLICY_c3,
      // solverAppendCode 复合需要读这三个表来把宏 code 转为 moveId（face×dir 折叠），
      // 缺失导致「变量名字对不上」+ 追加全失败 → solveBuf 恒空 → 死循环（2026-08-27 日志 2944 实证）
      CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('rubik3x3-eplan-ready')
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'ePlanTick': () => {
        const self = f.getSelfEntity()
        f.multipleBranches(f.getNodeGraphVariable('pStep').asType('int'), {
          // 小步 1：读主图发布的最新棱状态
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
            f.setNodeGraphVariable('pStep', new int(2), false)
            f.callComposite(solverStartEPlanTick, { target: self })
          },
          // 小步 2：E 层 mask（直接判 sep[h]==h && seo[h]==0，等价 edgeState==home*2）
          2: () => {
            const sep = f.getNodeGraphVariable('sep').asType('int_list')
            const seo = f.getNodeGraphVariable('seo').asType('int_list')
            const ebit = (h: number, w: number) => f.multiplication(
              f.dataTypeConversion(f.logicalAndOperation(
                f.equal(f.getCorrespondingValueFromList(sep as any, new int(h)), new int(h)),
                f.equal(f.getCorrespondingValueFromList(seo as any, new int(h)), 0n)
              ), 'int'),
              new int(w)
            )
            const mask = f.addition(ebit(8, 1), f.addition(ebit(9, 2), f.addition(ebit(10, 4), ebit(11, 8))))
            f.setNodeGraphVariable('solveMask', mask, false)
            f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
            f.setNodeGraphVariable('dbgVal', f.dataTypeConversion(f.getNodeGraphVariable('solveMask').asType('int'), 'str'), false)
            f.setNodeGraphVariable('pStep', new int(3), false)
            f.callComposite(solverStartEPlanTick, { target: self })
          },
          // 小步 3：完成则发 op7；否则查 E 层策略
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
                const home = f.addition(t, 8n)
                const st = f.callComposite(solverEdgeState, { home }).out
                const idx = f.addition(f.multiplication(mask, 24n), st)
                const p = f.callComposite(longListGetInt4, {
                  i: idx,
                  chunkSize: 96n,
                  c0: f.getNodeGraphVariable('CF_E_POLICY_c0').asType('int_list'),
                  c1: f.getNodeGraphVariable('CF_E_POLICY_c1').asType('int_list'),
                  c2: f.getNodeGraphVariable('CF_E_POLICY_c2').asType('int_list'),
                  c3: f.getNodeGraphVariable('CF_E_POLICY_c3').asType('int_list')
                }).out
                f.setNodeGraphVariable('mLen', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_LEN_c0').asType('int_list'), p), false)
                f.setNodeGraphVariable('mP', p, false)
                f.setNodeGraphVariable('mIdx', new int(0), false)
                f.setNodeGraphVariable('pStep', new int(4), false)
                f.callComposite(solverStartEPlanTick, { target: self })
              }
            )
          },
          // 小步 4：逐 code 追加 solveBuf，追加完发 op6
          4: () => {
            const mIdx = f.getNodeGraphVariable('mIdx').asType('int')
            const mLen = f.getNodeGraphVariable('mLen').asType('int')
            f.doubleBranch(
              f.lessThan(mIdx, mLen),
              () => {
                const p = f.getNodeGraphVariable('mP').asType('int')
                f.multipleBranches(mIdx, {
                  0: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C0_c0').asType('int_list'), p), false),
                  1: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C1_c0').asType('int_list'), p), false),
                  2: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C2_c0').asType('int_list'), p), false),
                  3: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C3_c0').asType('int_list'), p), false),
                  4: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C4_c0').asType('int_list'), p), false),
                  5: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C5_c0').asType('int_list'), p), false),
                  6: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C6_c0').asType('int_list'), p), false),
                  7: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_E_MACRO_C7_c0').asType('int_list'), p), false),
                  default: () => {}
                })
                f.callComposite(solverAppendCode, {
                  code: f.getNodeGraphVariable('mCode').asType('int'),
                  raw: new bool(false)
                })
                f.setNodeGraphVariable('mIdx', f.addition(mIdx, 1n), false)
                f.callComposite(solverStartEPlanTick, { target: self })
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
      13: () => {
        // solverPlan 第一层完成交棒：武装并启动
        f.setNodeGraphVariable('phase', new int(1), false)
        f.setNodeGraphVariable('solveLen', new int(0), false)
        f.callComposite(solverClearBuf, {})
        f.setNodeGraphVariable('pStep', new int(1), false)
        f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
        f.setNodeGraphVariable('dbgVal', new str('eplan-arm'), false)
        f.callComposite(solverStartEPlanTick, { target: f.getSelfEntity() })
      },
      5: () => {
        const phase = f.getNodeGraphVariable('phase').asType('int')
        f.doubleBranch(f.greaterThan(phase, 0n), () => {
          f.setNodeGraphVariable('solveLen', new int(0), false)
          f.callComposite(solverClearBuf, {})
          f.setNodeGraphVariable('pStep', new int(1), false)
          f.callComposite(solverStartEPlanTick, { target: f.getSelfEntity() })
        }, () => {})
      },
      12: () => {
        // tab-auto 重新武装：本图让位（solverPlan 会从 stage 0 重启），避免双规划器并发
        f.setNodeGraphVariable('phase', new int(0), false)
        f.setNodeGraphVariable('pStep', new int(0), false)
      },
      8: () => {
        // 重置：本图停摆（solverPlan 同样不处理 op8，保持现状）
        f.setNodeGraphVariable('phase', new int(0), false)
        f.setNodeGraphVariable('pStep', new int(0), false)
      },
      default: () => {}
    })
  })

export default graph
