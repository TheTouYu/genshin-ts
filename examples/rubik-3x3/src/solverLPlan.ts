// solverLPlan.ts —— 顶层（U 层）规划图（stage 4 专用独立图）
// 由 solverEPlan 完成 E 层后发 op=14 交棒；完成后发 op=7（plan-done，最终完成）。
// 单信号 rubik3x3_solve(op,val)：op 14=武装启动 / op 5=序列播完重算 / op 6=序列就绪(→solver) / op 7=完成
// 与 solver/solverPlan/solverEPlan 同挂实体（1077936230）；定时器用独立名字 lPlanTick。
// 顶层两段：OLL（顶面朝向，216 朝向态查表）→ PLL（顶层位置，288 态紧凑查表）。
// 状态映射（游戏↔CubeLib）：角槽镜像 game i ↔ cube 3-i；棱一致；角位置镜像 pos → 3-pos；twist/flip 方向一致。
// 2026-08-28 顶层规划：OLL 表 + PLL 紧凑表离线生成，运行时纯查表（离线 20000 样本全过，平均 4.2 宏/46 codes）。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'
import { solverAppendCode } from './composites/solverCore.js'
import { longListGetInt4, longListGetInt6, longListGetInt9 } from './composites/list.js'
import {
  CF_OLL_ACT_c0, CF_OLL_ACT_c1, CF_OLL_ACT_c2,
  CF_OLL_ALGLEN_c0, CF_OLL_ALGOFF_c0,
  CF_OLL_ALG_c0, CF_OLL_ALG_c1, CF_OLL_ALG_c2, CF_OLL_ALG_c3, CF_OLL_ALG_c4,
  CF_OLL_ALG_c5, CF_OLL_ALG_c6, CF_OLL_ALG_c7, CF_OLL_ALG_c8
} from './ollTables.js'
import {
  CF_PLLC_ACT_c0, CF_PLLC_ACT_c1, CF_PLLC_ACT_c2, CF_PLLC_ACT_c3,
  CF_PLLC_ACT_c4, CF_PLLC_ACT_c5
} from './pllTables.js'
import {
  CF_PLL_ALGLEN_c0, CF_PLL_ALG_c0, CF_PLL_ALG_c1, CF_PLL_ALG_c2, CF_PLL_ALG_c3,
  CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS
} from './cfopTables.js'

// 纯数据：在 4 个位置值 p0..p3 中找 val 的位置（0..3），乘法选择器
const llFindPos = g.defineComposite('ll_find_pos', {
  id: 1610700085,
  inputs: { val: { type: 'int' }, p0: { type: 'int' }, p1: { type: 'int' }, p2: { type: 'int' }, p3: { type: 'int' } },
  outputs: { out: { type: 'int' } },
  build: ({ val, p0, p1, p2, p3 }, f) => {
    const s0 = f.multiplication(f.dataTypeConversion(f.equal(p0, val), 'int'), 0n)
    const s1 = f.multiplication(f.dataTypeConversion(f.equal(p1, val), 'int'), 1n)
    const s2 = f.multiplication(f.dataTypeConversion(f.equal(p2, val), 'int'), 2n)
    const s3 = f.multiplication(f.dataTypeConversion(f.equal(p3, val), 'int'), 3n)
    return { out: f.addition(s0, f.addition(s1, f.addition(s2, s3))) }
  }
})

// 纯数据：4 位置排列（0..3）→ 阶乘进制索引 0..23
const llPermIdx = g.defineComposite('ll_perm_idx', {
  id: 1610700086,
  inputs: { p0: { type: 'int' }, p1: { type: 'int' }, p2: { type: 'int' }, p3: { type: 'int' } },
  outputs: { out: { type: 'int' } },
  build: ({ p0, p1, p2, p3 }, f) => {
    const r1 = f.subtraction(p1, f.dataTypeConversion(f.greaterThan(p1, p0), 'int'))
    const r2 = f.subtraction(
      f.subtraction(p2, f.dataTypeConversion(f.greaterThan(p2, p0), 'int')),
      f.dataTypeConversion(f.greaterThan(p2, p1), 'int')
    )
    return { out: f.addition(f.multiplication(p0, 6n), f.addition(f.multiplication(r1, 2n), r2)) }
  }
})

// 顶层专用 planTick（独立 timer 名）
const solverStartLPlanTick = g.defineComposite('solver_start_lplan_tick', {
  id: 1610700082,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('lPlanTick'), new bool(false), f.assemblyList([new float(0.15)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741838,
    variables: {
      scp: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
      sco: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
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
      bufPos: new int(0),
      phase: new int(0),
      llStage: new int(0), // 0=OLL / 1=PLL
      pStep: new int(0), // 1=读状态 / 2=算签名查表 / 3=解段 / 4=追加U / 5=追加公式
      solveMask: new int(0),
      mP: new int(0),
      mIdx: new int(0),
      mSub: new int(0),
      mCode: new int(0),
      mLen: new int(0),
      mKind: new int(0),
      mAlgOff: new int(0),
      tmpA: new int(0),
      tmpB: new int(0),
      dbgTag: new str(''),
      dbgVal: new str(''),
      CF_OLL_ACT_c0, CF_OLL_ACT_c1, CF_OLL_ACT_c2,
      CF_OLL_ALGLEN_c0, CF_OLL_ALGOFF_c0,
      CF_OLL_ALG_c0, CF_OLL_ALG_c1, CF_OLL_ALG_c2, CF_OLL_ALG_c3, CF_OLL_ALG_c4,
      CF_OLL_ALG_c5, CF_OLL_ALG_c6, CF_OLL_ALG_c7, CF_OLL_ALG_c8,
      CF_PLLC_ACT_c0, CF_PLLC_ACT_c1, CF_PLLC_ACT_c2, CF_PLLC_ACT_c3,
      CF_PLLC_ACT_c4, CF_PLLC_ACT_c5,
      CF_PLL_ALGLEN_c0,
      CF_PLL_ALG_c0, CF_PLL_ALG_c1, CF_PLL_ALG_c2, CF_PLL_ALG_c3,
      CF_MOVE_CODE_FACE, CF_MOVE_CODE_DIR, CF_MOVE_CODE_STEPS
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('rubik3x3-lplan-ready')
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'lPlanTick': () => {
        const self = f.getSelfEntity()
        f.multipleBranches(f.getNodeGraphVariable('pStep').asType('int'), {
          // 小步 1：读主图发布的最新角/棱状态
          1: () => {
            const stHost = entity(1077936201n)
            const cp = f.getCustomVariable(stHost, new str('solver_cp')).asType('int_list')
            const co = f.getCustomVariable(stHost, new str('solver_co')).asType('int_list')
            const ep = f.getCustomVariable(stHost, new str('solver_ep')).asType('int_list')
            const eo = f.getCustomVariable(stHost, new str('solver_eo')).asType('int_list')
            const scp = f.getNodeGraphVariable('scp').asType('int_list')
            const sco = f.getNodeGraphVariable('sco').asType('int_list')
            const sep = f.getNodeGraphVariable('sep').asType('int_list')
            const seo = f.getNodeGraphVariable('seo').asType('int_list')
            f.finiteLoop(0n, 7n, (c: any) => {
              f.registerExecNode('set_list_value', [scp, c, f.getCorrespondingValueFromList(cp, c)])
              f.registerExecNode('set_list_value', [sco, c, f.getCorrespondingValueFromList(co, c)])
            })
            f.finiteLoop(0n, 11n, (c: any) => {
              f.registerExecNode('set_list_value', [sep, c, f.getCorrespondingValueFromList(ep, c)])
              f.registerExecNode('set_list_value', [seo, c, f.getCorrespondingValueFromList(eo, c)])
            })
            f.setNodeGraphVariable('pStep', new int(2), false)
            f.callComposite(solverStartLPlanTick, { target: self })
          },
          // 小步 2：算签名 + 查表（按 llStage 分 OLL/PLL）
          2: () => {
            const sco = f.getNodeGraphVariable('sco').asType('int_list')
            const seo = f.getNodeGraphVariable('seo').asType('int_list')
            const scp = f.getNodeGraphVariable('scp').asType('int_list')
            const sep = f.getNodeGraphVariable('sep').asType('int_list')
            const llStage = f.getNodeGraphVariable('llStage').asType('int')
            f.doubleBranch(f.equal(llStage, 0n), () => {
              // ---- OLL：朝向紧凑签名（槽镜像：角 game i ↔ cube 3-i）----
              const co0 = f.getCorrespondingValueFromList(sco as any, 3n)
              const co1 = f.getCorrespondingValueFromList(sco as any, 2n)
              const co2 = f.getCorrespondingValueFromList(sco as any, 1n)
              const eo0 = f.getCorrespondingValueFromList(seo as any, 0n)
              const eo1 = f.getCorrespondingValueFromList(seo as any, 1n)
              const eo2 = f.getCorrespondingValueFromList(seo as any, 2n)
              const cc = f.addition(f.addition(f.multiplication(co0, 9n), f.multiplication(co1, 3n)), co2)
              const ee = f.addition(f.addition(f.multiplication(eo0, 4n), f.multiplication(eo1, 2n)), eo2)
              const sig = f.addition(f.multiplication(cc, 8n), ee)
              f.setNodeGraphVariable('solveMask', sig, false)
              f.doubleBranch(f.equal(sig, 0n), () => {
                f.setNodeGraphVariable('llStage', new int(1), false)
                f.setNodeGraphVariable('pStep', new int(1), false)
                f.callComposite(solverStartLPlanTick, { target: self })
              }, () => {
                const p = f.callComposite(longListGetInt4, {
                  i: sig, chunkSize: 100n,
                  c0: f.getNodeGraphVariable('CF_OLL_ACT_c0').asType('int_list'),
                  c1: f.getNodeGraphVariable('CF_OLL_ACT_c1').asType('int_list'),
                  c2: f.getNodeGraphVariable('CF_OLL_ACT_c2').asType('int_list'),
                  c3: f.getNodeGraphVariable('CF_OLL_ACT_c2').asType('int_list')
                }).out
                f.setNodeGraphVariable('mP', p, false)
                f.setNodeGraphVariable('mIdx', new int(0), false)
                f.setNodeGraphVariable('pStep', new int(3), false)
                f.callComposite(solverStartLPlanTick, { target: self })
              })
            }, () => {
              // ---- PLL：位置紧凑签名（角排列阶乘进制 ×24 + 棱排列阶乘进制）----
              // 角 home 3(UFR)/2(UFL)/1(UBR)/0(UBL) 位置镜像 3-gp
              const c3p = f.subtraction(3n, f.callComposite(llFindPos, { val: 3n, p0: f.getCorrespondingValueFromList(scp as any, 0n), p1: f.getCorrespondingValueFromList(scp as any, 1n), p2: f.getCorrespondingValueFromList(scp as any, 2n), p3: f.getCorrespondingValueFromList(scp as any, 3n) }).out)
              const c2p = f.subtraction(3n, f.callComposite(llFindPos, { val: 2n, p0: f.getCorrespondingValueFromList(scp as any, 0n), p1: f.getCorrespondingValueFromList(scp as any, 1n), p2: f.getCorrespondingValueFromList(scp as any, 2n), p3: f.getCorrespondingValueFromList(scp as any, 3n) }).out)
              const c1p = f.subtraction(3n, f.callComposite(llFindPos, { val: 1n, p0: f.getCorrespondingValueFromList(scp as any, 0n), p1: f.getCorrespondingValueFromList(scp as any, 1n), p2: f.getCorrespondingValueFromList(scp as any, 2n), p3: f.getCorrespondingValueFromList(scp as any, 3n) }).out)
              const c0p = f.subtraction(3n, f.callComposite(llFindPos, { val: 0n, p0: f.getCorrespondingValueFromList(scp as any, 0n), p1: f.getCorrespondingValueFromList(scp as any, 1n), p2: f.getCorrespondingValueFromList(scp as any, 2n), p3: f.getCorrespondingValueFromList(scp as any, 3n) }).out)
              // 棱 home 0/1/2/3 位置（一致）
              const e0p = f.callComposite(llFindPos, { val: 0n, p0: f.getCorrespondingValueFromList(sep as any, 0n), p1: f.getCorrespondingValueFromList(sep as any, 1n), p2: f.getCorrespondingValueFromList(sep as any, 2n), p3: f.getCorrespondingValueFromList(sep as any, 3n) }).out
              const e1p = f.callComposite(llFindPos, { val: 1n, p0: f.getCorrespondingValueFromList(sep as any, 0n), p1: f.getCorrespondingValueFromList(sep as any, 1n), p2: f.getCorrespondingValueFromList(sep as any, 2n), p3: f.getCorrespondingValueFromList(sep as any, 3n) }).out
              const e2p = f.callComposite(llFindPos, { val: 2n, p0: f.getCorrespondingValueFromList(sep as any, 0n), p1: f.getCorrespondingValueFromList(sep as any, 1n), p2: f.getCorrespondingValueFromList(sep as any, 2n), p3: f.getCorrespondingValueFromList(sep as any, 3n) }).out
              const e3p = f.callComposite(llFindPos, { val: 3n, p0: f.getCorrespondingValueFromList(sep as any, 0n), p1: f.getCorrespondingValueFromList(sep as any, 1n), p2: f.getCorrespondingValueFromList(sep as any, 2n), p3: f.getCorrespondingValueFromList(sep as any, 3n) }).out
              const ci = f.callComposite(llPermIdx, { p0: c0p, p1: c1p, p2: c2p, p3: c3p }).out
              const ei = f.callComposite(llPermIdx, { p0: e0p, p1: e1p, p2: e2p, p3: e3p }).out
              const sig = f.addition(f.multiplication(ci, 24n), ei)
              f.setNodeGraphVariable('solveMask', sig, false)
              f.doubleBranch(f.equal(sig, 0n), () => {
                f.setNodeGraphVariable('phase', new int(0), false)
                f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
                f.setNodeGraphVariable('dbgVal', new str('plan-done'), false)
                f.sendSignal(RubikSignal.rubik3x3_solve, 7n, 0n)
              }, () => {
                const p = f.callComposite(longListGetInt6, {
                  i: sig, chunkSize: 100n,
                  c0: f.getNodeGraphVariable('CF_PLLC_ACT_c0').asType('int_list'),
                  c1: f.getNodeGraphVariable('CF_PLLC_ACT_c1').asType('int_list'),
                  c2: f.getNodeGraphVariable('CF_PLLC_ACT_c2').asType('int_list'),
                  c3: f.getNodeGraphVariable('CF_PLLC_ACT_c3').asType('int_list'),
                  c4: f.getNodeGraphVariable('CF_PLLC_ACT_c4').asType('int_list'),
                  c5: f.getNodeGraphVariable('CF_PLLC_ACT_c5').asType('int_list')
                }).out
                f.setNodeGraphVariable('mP', p, false)
                f.setNodeGraphVariable('mIdx', new int(0), false)
                f.setNodeGraphVariable('pStep', new int(3), false)
                f.callComposite(solverStartLPlanTick, { target: self })
              })
            })
          },
          // 小步 3：解当前段（mIdx → 段信息）
          3: () => {
            const llStage = f.getNodeGraphVariable('llStage').asType('int')
            const mP = f.getNodeGraphVariable('mP').asType('int')
            const mIdx = f.getNodeGraphVariable('mIdx').asType('int')
            f.doubleBranch(f.equal(llStage, 0n), () => {
              // ---- OLL：mIdx 0/1 是 token ----
              f.multipleBranches(mIdx, {
                0: () => {
                  const a1 = f.moduloOperation(mP, 64n)
                  f.setNodeGraphVariable('mCode', a1, false)
                  f.setNodeGraphVariable('pStep', new int(5), false)
                },
                1: () => {
                  const a2 = f.subtraction(f.division(mP, 64n), 1n)
                  f.doubleBranch(f.lessThan(a2, 0n), () => {
                    f.setNodeGraphVariable('pStep', new int(1), false)
                  }, () => {
                    f.setNodeGraphVariable('mCode', a2, false)
                    f.setNodeGraphVariable('pStep', new int(5), false)
                  })
                },
                default: () => {
                  f.setNodeGraphVariable('pStep', new int(1), false)
                }
              })
            }, () => {
              // ---- PLL：mIdx 0=pre / 1=alg / 2=post ----
              f.multipleBranches(mIdx, {
                0: () => {
                  const pre = f.division(mP, 88n)
                  f.setNodeGraphVariable('mLen', pre, false)
                  f.setNodeGraphVariable('mKind', new int(0), false)
                  f.setNodeGraphVariable('mSub', new int(0), false)
                  f.doubleBranch(f.greaterThan(pre, 0n), () => {
                    f.setNodeGraphVariable('pStep', new int(4), false)
                  }, () => {
                    f.setNodeGraphVariable('mIdx', new int(1), false)
                    f.setNodeGraphVariable('pStep', new int(3), false)
                  })
                },
                1: () => {
                  const algp1 = f.moduloOperation(f.division(mP, 4n), 22n)
                  f.doubleBranch(f.greaterThan(algp1, 0n), () => {
                    const alg = f.subtraction(algp1, 1n)
                    const alglen = f.getNodeGraphVariable('CF_PLL_ALGLEN_c0').asType('int_list')
                    f.setNodeGraphVariable('tmpA', new int(0), false)
                    f.finiteLoop(0n, f.subtraction(alg, 1n), (k: any) => {
                      f.setNodeGraphVariable('tmpA', f.addition(f.getNodeGraphVariable('tmpA').asType('int'), f.getCorrespondingValueFromList(alglen as any, k)), false)
                    })
                    f.setNodeGraphVariable('mAlgOff', f.getNodeGraphVariable('tmpA').asType('int'), false)
                    f.setNodeGraphVariable('mLen', f.getCorrespondingValueFromList(alglen as any, alg), false)
                    f.setNodeGraphVariable('mKind', new int(1), false)
                    f.setNodeGraphVariable('mSub', new int(0), false)
                    f.setNodeGraphVariable('pStep', new int(5), false)
                  }, () => {
                    f.setNodeGraphVariable('mIdx', new int(2), false)
                    f.setNodeGraphVariable('pStep', new int(3), false)
                  })
                },
                2: () => {
                  const post = f.moduloOperation(mP, 4n)
                  f.setNodeGraphVariable('mLen', post, false)
                  f.setNodeGraphVariable('mKind', new int(0), false)
                  f.setNodeGraphVariable('mSub', new int(0), false)
                  f.doubleBranch(f.greaterThan(post, 0n), () => {
                    f.setNodeGraphVariable('pStep', new int(4), false)
                  }, () => {
                    f.setNodeGraphVariable('mIdx', new int(3), false)
                    f.setNodeGraphVariable('pStep', new int(3), false)
                  })
                },
                default: () => {
                  f.setNodeGraphVariable('pStep', new int(1), false)
                }
              })
            })
            f.callComposite(solverStartLPlanTick, { target: self })
          },
          // 小步 4：追加 U（pre/post AUF）
          4: () => {
            const mSub = f.getNodeGraphVariable('mSub').asType('int')
            const mLen = f.getNodeGraphVariable('mLen').asType('int')
            f.doubleBranch(f.lessThan(mSub, mLen), () => {
              f.callComposite(solverAppendCode, { code: 0n, raw: new bool(false) })
              f.setNodeGraphVariable('mSub', f.addition(mSub, 1n), false)
              f.callComposite(solverStartLPlanTick, { target: self })
            }, () => {
              f.setNodeGraphVariable('mIdx', f.addition(f.getNodeGraphVariable('mIdx').asType('int'), 1n), false)
              f.setNodeGraphVariable('pStep', new int(3), false)
              f.callComposite(solverStartLPlanTick, { target: self })
            })
          },
          // 小步 5：追加一个 code（mCode=token 或公式 code）
          5: () => {
            const llStage = f.getNodeGraphVariable('llStage').asType('int')
            const mKind = f.getNodeGraphVariable('mKind').asType('int')
            const mCode = f.getNodeGraphVariable('mCode').asType('int')
            f.doubleBranch(f.equal(llStage, 0n), () => {
              // ---- OLL token ----
              f.doubleBranch(f.lessThan(mCode, 3n), () => {
                // U token
                f.callComposite(solverAppendCode, { code: mCode, raw: new bool(false) })
                f.setNodeGraphVariable('mIdx', f.addition(f.getNodeGraphVariable('mIdx').asType('int'), 1n), false)
                f.setNodeGraphVariable('pStep', new int(3), false)
                f.callComposite(solverStartLPlanTick, { target: self })
              }, () => {
                // 逆公式 token：alg = mCode - 3
                const alg = f.subtraction(mCode, 3n)
                const algOff = f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_OLL_ALGOFF_c0').asType('int_list'), alg)
                const algLen = f.getCorrespondingValueFromList(f.getNodeGraphVariable('CF_OLL_ALGLEN_c0').asType('int_list'), alg)
                f.setNodeGraphVariable('mAlgOff', algOff, false)
                f.setNodeGraphVariable('mLen', algLen, false)
                f.setNodeGraphVariable('mSub', new int(0), false)
                f.setNodeGraphVariable('mKind', new int(1), false)
                f.setNodeGraphVariable('pStep', new int(6), false)
                f.callComposite(solverStartLPlanTick, { target: self })
              })
            }, () => {
              // ---- PLL 公式（mKind=1）----
              f.setNodeGraphVariable('pStep', new int(6), false)
              f.callComposite(solverStartLPlanTick, { target: self })
            })
          },
          // 小步 6：逐 code 追加公式
          6: () => {
            const mSub = f.getNodeGraphVariable('mSub').asType('int')
            const mLen = f.getNodeGraphVariable('mLen').asType('int')
            const mAlgOff = f.getNodeGraphVariable('mAlgOff').asType('int')
            const llStage = f.getNodeGraphVariable('llStage').asType('int')
            f.doubleBranch(f.lessThan(mSub, mLen), () => {
              const idx = f.addition(mAlgOff, mSub)
              f.doubleBranch(f.equal(llStage, 0n), () => {
                const c = f.callComposite(longListGetInt9, {
                  i: idx, chunkSize: 100n,
                  c0: f.getNodeGraphVariable('CF_OLL_ALG_c0').asType('int_list'),
                  c1: f.getNodeGraphVariable('CF_OLL_ALG_c1').asType('int_list'),
                  c2: f.getNodeGraphVariable('CF_OLL_ALG_c2').asType('int_list'),
                  c3: f.getNodeGraphVariable('CF_OLL_ALG_c3').asType('int_list'),
                  c4: f.getNodeGraphVariable('CF_OLL_ALG_c4').asType('int_list'),
                  c5: f.getNodeGraphVariable('CF_OLL_ALG_c5').asType('int_list'),
                  c6: f.getNodeGraphVariable('CF_OLL_ALG_c6').asType('int_list'),
                  c7: f.getNodeGraphVariable('CF_OLL_ALG_c7').asType('int_list'),
                  c8: f.getNodeGraphVariable('CF_OLL_ALG_c8').asType('int_list')
                }).out
                f.callComposite(solverAppendCode, { code: c, raw: new bool(false) })
              }, () => {
                const c = f.callComposite(longListGetInt4, {
                  i: idx, chunkSize: 96n,
                  c0: f.getNodeGraphVariable('CF_PLL_ALG_c0').asType('int_list'),
                  c1: f.getNodeGraphVariable('CF_PLL_ALG_c1').asType('int_list'),
                  c2: f.getNodeGraphVariable('CF_PLL_ALG_c2').asType('int_list'),
                  c3: f.getNodeGraphVariable('CF_PLL_ALG_c3').asType('int_list')
                }).out
                f.callComposite(solverAppendCode, { code: c, raw: new bool(false) })
              })
              f.setNodeGraphVariable('mSub', f.addition(mSub, 1n), false)
              f.callComposite(solverStartLPlanTick, { target: self })
            }, () => {
              f.setNodeGraphVariable('mIdx', f.addition(f.getNodeGraphVariable('mIdx').asType('int'), 1n), false)
              f.setNodeGraphVariable('pStep', new int(3), false)
              f.callComposite(solverStartLPlanTick, { target: self })
            })
          },
          default: () => {}
        })
      },
      default: () => {}
    })
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.multipleBranches(evt.params.op, {
      14: () => {
        f.setNodeGraphVariable('phase', new int(1), false)
        f.setNodeGraphVariable('llStage', new int(0), false)
        f.setNodeGraphVariable('solveLen', new int(0), false)
        f.setNodeGraphVariable('bufPos', new int(0), false)
        f.setNodeGraphVariable('mP', new int(0), false)
        f.setNodeGraphVariable('mIdx', new int(0), false)
        f.setNodeGraphVariable('mSub', new int(0), false)
        f.setNodeGraphVariable('pStep', new int(1), false)
        f.setNodeGraphVariable('dbgTag', new str('DBG_RUBIK_SOLVE'), false)
        f.setNodeGraphVariable('dbgVal', new str('lplan-arm'), false)
        f.callComposite(solverStartLPlanTick, { target: f.getSelfEntity() })
      },
      5: () => {
        const phase = f.getNodeGraphVariable('phase').asType('int')
        f.doubleBranch(f.greaterThan(phase, 0n), () => {
          f.setNodeGraphVariable('solveLen', new int(0), false)
          f.setNodeGraphVariable('bufPos', new int(0), false)
          f.setNodeGraphVariable('mP', new int(0), false)
          f.setNodeGraphVariable('mIdx', new int(0), false)
          f.setNodeGraphVariable('mSub', new int(0), false)
          f.setNodeGraphVariable('pStep', new int(1), false)
          f.callComposite(solverStartLPlanTick, { target: f.getSelfEntity() })
        }, () => {})
      },
      12: () => {
        f.setNodeGraphVariable('phase', new int(0), false)
        f.setNodeGraphVariable('pStep', new int(0), false)
        f.setNodeGraphVariable('llStage', new int(0), false)
      },
      8: () => {
        f.setNodeGraphVariable('phase', new int(0), false)
        f.setNodeGraphVariable('pStep', new int(0), false)
        f.setNodeGraphVariable('llStage', new int(0), false)
      },
      default: () => {}
    })
  })

export default graph
