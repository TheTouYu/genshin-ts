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
  solverAppendCode, solverStartPlanTick,
  solverCornerState, solverCornerMask, solverCornerFirstUnsolved, solverClearBuf
} from './composites/solverCore.js'
import { longListGetInt4 } from './composites/list.js'
import {
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS
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

// —— 客户端算力通道投递（票 03，fb E1 模式）：写玩家实体寄存器 rbx_* ——
// 任务 = 十字下一宏；状态不复制（客户端直接读宿主 1077936201 的 solver_ep/eo），
// 撕裂/陈旧检测 = 加权和 rbx_sum（与 rbCrossSkill.ts 同式，权重错开）。
// 客户端 15Hz 轮询门：epoch≠ack 即算；回传 c0/c1/c2（表码）+ xd（epoch，完成加 32768）。
// 丢失/撕裂自愈：客户端下拍自动重试同 epoch，服务端零重发逻辑。
const rbLanePost = g.defineComposite('rb_lane_post', {
  id: 1610700090,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const host = entity(1077936201n)
    const ep = f.getCustomVariable(host, new str('solver_ep')).asType('int_list')
    const eo = f.getCustomVariable(host, new str('solver_eo')).asType('int_list')
    let h: any = f.addition(
      f.multiplication(f.getCorrespondingValueFromList(ep, 0n), 1n),
      f.multiplication(f.getCorrespondingValueFromList(eo, 0n), 7n)
    )
    for (let s = 1; s < 12; s++) {
      h = f.addition(h, f.addition(
        f.multiplication(f.getCorrespondingValueFromList(ep, new int(s)), BigInt(s + 1)),
        f.multiplication(f.getCorrespondingValueFromList(eo, new int(s)), BigInt(s + 7))
      ))
    }
    const nextEp = f.addition(f.getNodeGraphVariable('rbxEpoch').asType('int'), 1n)
    const m1 = f.registerExecNode('set_custom_variable', [owner, new str('rbx_t1'), new int(1), new bool(false)])
    const m2 = f.registerExecNode('set_custom_variable', [owner, new str('rbx_sum'), h, new bool(false)])
    const m3 = f.registerExecNode('set_custom_variable', [owner, new str('rb_host'), host, new bool(false)])
    const m4 = f.registerExecNode('set_custom_variable', [owner, new str('rbx_epoch'), nextEp, new bool(false)])
    const m5 = f.registerExecNode('set_node_graph_variable', [new str('rbxEpoch'), nextEp, new bool(false)])
    const m6 = f.registerExecNode('set_node_graph_variable', [new str('rcvC0'), new int(-1), new bool(false)])
    const m7 = f.registerExecNode('set_node_graph_variable', [new str('rcvC1'), new int(-1), new bool(false)])
    const m8 = f.registerExecNode('set_node_graph_variable', [new str('rcvC2'), new int(-1), new bool(false)])
    const m9 = f.registerExecNode('set_node_graph_variable', [new str('pStep'), new int(0), new bool(false)])
    const m10 = f.registerExecNode('set_node_graph_variable', [new str('laneOpen'), new int(1), new bool(false)])
    f.connect(m1, 0, m2, 0)
    f.connect(m2, 0, m3, 0)
    f.connect(m3, 0, m4, 0)
    f.connect(m4, 0, m5, 0)
    f.connect(m5, 0, m6, 0)
    f.connect(m6, 0, m7, 0)
    f.connect(m7, 0, m8, 0)
    f.connect(m8, 0, m9, 0)
    f.connect(m9, 0, m10, 0)
    f.outflow('done', m10, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741834,
    variables: {
      sct: [0n, 1n, 2n, 3n, 4n, 5n],
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
      // 客户端算力通道（票 03）：任务代数 + 回传码收集（-1=未收到）+ 回合门（first-wins）
      rbxEpoch: new int(0),
      laneOpen: new int(0),
      rcvC0: new int(-1),
      rcvC1: new int(-1),
      rcvC2: new int(-1),
      tmpA: new int(0),
      ctKey: new int(0),
      dbgTag: new str(''),
      dbgVal: new str(''),

      CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS,
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
                // 十字阶段（票 03）改走客户端算力通道：投递任务后 pStep=0 挂起等回传，
                // pStep2/3/4 的 stage-1 分支自此不可达（票 05 角块搬迁时一并清理）。
                f.callComposite(rbLanePost, {})
                f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                f.setNodeGraphVariable('dbgVal', new str('lane-post'), false)
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
            // 票 03：stage 1 已由 rbLanePost 置 pStep=0 挂起（等客户端回传），跳过小步推进
            const stAfter = f.getNodeGraphVariable('stage').asType('int')
            f.doubleBranch(f.equal(stAfter, 1n), () => {}, () => {
              f.setNodeGraphVariable('pStep', new int(2), false)
              f.callComposite(solverStartPlanTick, { target: self })
            })
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
                // 票 03：十字 mask 由客户端单元计算（回传 xd 完成/码序列），本分支不可达
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
                // 票 03：十字策略查表已搬客户端单元（rbCrossSkill），本分支不可达；
                // 完成切 stage=2 由 onSignal(rbx_echo) 'xd' 分支处理。
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
                    // 票 03：十字宏码由 onSignal(rbx_echo) 收集后直接 appendCode，本分支不可达
                  },
                  2: () => {
                    const p = f.getNodeGraphVariable('mP').asType('int')
                    // 引擎 Multiple Branches 命名 case 上限 10（fcc7663 实证：>10 的 case 成孤立链）。
                    // 角块宏最长 16 codes（LEN 表 40..59 区），16-case 会让 mIdx>=10 全走 default、
                    // mCode 残留上一次的值 → 宏后半段错乱 → 破坏十字与已拼角块（2026-09-02 日志 3093
                    // 实锤：宏 48 前 11 步正确、第 12 步起全变残留 face 2）。拆两段：0..9 直取，
                    // 10..15 走 default 内嵌第二段 MB（control = mIdx-10）。
                    // 2026-09-04 自服务端主线 3207ca5 回流（客户端分支此前漏同步）。
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
                      default: () => {
                        // mIdx 10..15：第二段查 C10..C15。控制值重新读 mIdx 图变量（不复用外层
                        // 物化，防分支内二次物化读旧值——同 negDone 2899 教训）。
                        const mIdx2 = f.getNodeGraphVariable('mIdx').asType('int')
                        f.multipleBranches(f.subtraction(mIdx2, 10n), {
                          0: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C10_c0').asType('int_list'), p), false),
                          1: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C11_c0').asType('int_list'), p), false),
                          2: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C12_c0').asType('int_list'), p), false),
                          3: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C13_c0').asType('int_list'), p), false),
                          4: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C14_c0').asType('int_list'), p), false),
                          5: () => f.setNodeGraphVariable('mCode', f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_CORNER_MACRO_C15_c0').asType('int_list'), p), false),
                          default: () => {}
                        })
                      }
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
  // —— 客户端算力通道回传（票 03）：c0/c1/c2=宏表码（e=k*100+code+10）；xd=回合完成 ——
  .onSignal(RubikSignal.rbx_echo, (evt: any, f: any) => {
    f.multipleBranches(evt.params.tag as never, {
      'c0': () => {
        f.setNodeGraphVariable('rcvC0', f.subtraction(evt.params.e, 10n), false)
      },
      'c1': () => {
        f.setNodeGraphVariable('rcvC1', f.subtraction(evt.params.e, 110n), false)
      },
      'c2': () => {
        f.setNodeGraphVariable('rcvC2', f.subtraction(evt.params.e, 210n), false)
      },
      'xd': () => {
        const e = evt.params.e
        const laneOpen = f.getNodeGraphVariable('laneOpen').asType('int')
        // epoch 解码：e ≥ 32768 表示完成标记（epoch = e-32768），否则 epoch = e
        const epoch = f.subtraction(e, f.multiplication(f.dataTypeConversion(f.greaterThanOrEqualTo(e, 32768n), 'int'), 32768n))
        // epoch 对齐 + 回合门（多实例重复回声 first-wins；陈旧回声丢弃）
        const epOk = f.equal(epoch, f.getNodeGraphVariable('rbxEpoch').asType('int'))
        f.doubleBranch(f.logicalAndOperation(f.equal(laneOpen, 1n), epOk), () => {
          f.setNodeGraphVariable('laneOpen', new int(0), false)
          const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
          f.setCustomVariable(owner, new str('rbx_ack'), epoch, false)
          f.doubleBranch(f.greaterThanOrEqualTo(e, 32768n), () => {
            // 十字完成：切角块阶段（服务端路径，票 05 搬迁），pStep=1 重启规划
            f.setNodeGraphVariable('stage', new int(2), false)
            f.setNodeGraphVariable('pStep', new int(1), false)
            f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
            f.setNodeGraphVariable('dbgVal', new str('stage-corners'), false)
            f.callComposite(solverStartPlanTick, { target: f.getSelfEntity() })
          }, () => {
            // 未完成：收集到的表码经 solverAppendCode 展开（负 moveId 折叠语义原样）→ 发 op6
            const r0 = f.getNodeGraphVariable('rcvC0').asType('int')
            f.doubleBranch(f.greaterThanOrEqualTo(r0, 0n), () => {
              f.callComposite(solverAppendCode, { code: r0, raw: new bool(false) })
            }, () => {})
            const r1 = f.getNodeGraphVariable('rcvC1').asType('int')
            f.doubleBranch(f.greaterThanOrEqualTo(r1, 0n), () => {
              f.callComposite(solverAppendCode, { code: r1, raw: new bool(false) })
            }, () => {})
            const r2 = f.getNodeGraphVariable('rcvC2').asType('int')
            f.doubleBranch(f.greaterThanOrEqualTo(r2, 0n), () => {
              f.callComposite(solverAppendCode, { code: r2, raw: new bool(false) })
            }, () => {})
            f.setCustomVariable(f.getSelfEntity(), new str('solve_seq'), f.getNodeGraphVariable('solveBuf').asType('int_list'), false)
            f.setCustomVariable(f.getSelfEntity(), new str('solve_len'), f.getNodeGraphVariable('solveLen').asType('int'), false)
            f.setNodeGraphVariable('phase', new int(2), false)
            f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
            f.setNodeGraphVariable('dbgVal', new str('seq-ready-lane'), false)
            f.sendSignal(RubikSignal.rubik3x3_solve, 6n, 0n)
          })
        }, () => {})
      },
      'xr': () => {
        // 撕裂/陈旧回执：客户端下拍自动重试同 epoch，服务端零动作
      },
      default: () => {}
    })
  })

export default graph
