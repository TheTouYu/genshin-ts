// solver.ts —— 求解执行图（轻量：按规划序列逐条发 op3 给 turn 图，负 moveId 由 turn 图统一拆分）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId，可为负=折叠反向)；op 5 = 完成
// 2026-08-27 节拍（fd40432 歇息 +15% → 本轮触发前后 +20% / 整转 +30%，降低平均负载）：
//   面转：preTick 1.66s / emitTick 1.52s / doneTick 2.01s；
//   整转（|moveId|>=10，负载 ~3x）：wholePre 7.18s / wholeEmit 6.6s / wholeDone 10.45s。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

const mkTimer = (id: number, name: string, timerName: string, delay: number, fixed = false) => g.defineComposite(name, {
    id,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    // fixed=true：延时固定不参与 fast/慢速折扣——只用于必须盖住物理链路耗时的定时器
    // （emit/done 类；详见下方 3185 根因注释）。
    if (fixed) {
      const tf = f.registerExecNode('start_timer', [target, new str(timerName), new bool(false), f.assemblyList([new float(delay)], 'float')])
      f.outflow('done', tf, 0)
      return {}
    }
    // 速度切换（测试台 tab2）：快速=×0.4（缩短 60%，日常演示）；慢速=×1.3（+30%，日志收集降负载）
    // 从主控制器 1077936201 的自定义变量读取；factor = 1.3 - 0.9×fast（fast=1→0.4，fast=0→1.3）
    const fast = f.getCustomVariable(entity(1077936201n), new str('rubik3x3_fast_mode')).asType('bool')
    const fastInt = f.dataTypeConversion(fast, 'int')
    const fastF = f.dataTypeConversion(fastInt, 'float')
    const factor = f.subtraction(new float(1.3), f.multiplication(new float(0.9), fastF))
    const scaled = f.multiplication(new float(delay), factor)
    const t = f.registerExecNode('start_timer', [target, new str(timerName), new bool(false), f.assemblyList([scaled], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// 面转：步间/触发后 1.52s（动画 ~0.2s + 旋转后余量）
// 2026-09-04 日志 3185 实证（fixed 化）：票 06 客户端渲染分载后每步面转 =
// 任务发布→客户端 15Hz 拍→分片回传(9 槽 3 拍≈0.2s)→rbv_go→动画 0.3s→unlock→solver_cp 发布，
// 合计 ≈0.9~1.1s 物理下限。fast×0.4 后 emitTick=0.61s / doneTick=0.80s 早于宏尾步发布到期：
// doneTick→op5 时 solver_cp 仍旧值 → 规划器按旧状态重发同一宏 → 宏在已更新状态上执行
// → 破坏已拼角块（3185 角块 mask 9→1 振荡；轮2 按十字尾旧状态重发轮1 宏 [17,2,15] 帧级实锤：
// 轮2 查表 rec2862 读 scp=[6,0,2,1,5,3,4,7]，而轮1 第3 步发布 rec3107 才更新 solver_cp）。
// 故 emit/done 固定为普通速度值，fast 收益只保留在 preTick/planTick/whole 组。
// open-item：根治方案=事件驱动（turn 图每步 unlock 后发步完成信号驱动 emit），登记于看板。
const solverStartEmitTick = mkTimer(1610700058, 'solver_start_emit_tick', 'emitTick', 1.52, true)
// 面转：宏尾 2.01s（面转完成 + 余量）——同上固定（必须 > 宏尾步 op3→solver_cp 发布 ~1.1s）
const solverStartDoneTick = mkTimer(1610700061, 'solver_start_done_tick', 'doneTick', 2.01, true)
// 面转：触发前/动画前 1.66s
const solverStartPreTick = mkTimer(1610700069, 'solver_start_pre_tick', 'preTick', 1.66)
// 整转：触发前 7.18s、步间 6.6s、宏尾 10.45s（负载 ~3x → 间隔放大，降平均负载）
const solverStartWholePre = mkTimer(1610700076, 'solver_start_whole_pre', 'wholePre', 7.18)
const solverStartWholeEmit = mkTimer(1610700077, 'solver_start_whole_emit', 'wholeEmit', 6.6)
const solverStartWholeDone = mkTimer(1610700078, 'solver_start_whole_done', 'wholeDone', 10.45)

const graph = g
  .server({
    id: 1073741833,
    variables: {
      solveIdx: new int(0)
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('rubik3x3-solver-exec-ready')
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.multipleBranches(evt.params.op, {
      6: () => {
        const self = f.getSelfEntity()
        const len = f.getCustomVariable(self, new str('solve_len')).asType('int')
        f.setNodeGraphVariable('solveIdx', new int(0), false)
        f.doubleBranch(f.greaterThan(len, 0), () => {
          // 首个动画：整转给 3.6s 前置，面转 1.2s
          const seq0 = f.getCustomVariable(self, new str('solve_seq')).asType('int_list')
          const first = f.getCorrespondingValueFromList(seq0, 0n)
          const absFirst = f.absoluteValueOperation(first)
          const isWhole = f.logicalNotOperation(f.lessThan(absFirst, 10n))
          f.doubleBranch(isWhole, () => {
            f.callComposite(solverStartWholePre, { target: self })
          }, () => {
            f.callComposite(solverStartPreTick, { target: self })
          })
        }, () => {
          f.callComposite(solverStartDoneTick, { target: self })
        })
      },
      default: () => {}
    })
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    // 统一发送：读当前 solveIdx 发一步，然后按剩余量与当前步类型接 emit/done
    const sendOne = (self: any, f: any) => {
      const seq = f.getCustomVariable(self, new str('solve_seq')).asType('int_list')
      const len = f.getCustomVariable(self, new str('solve_len')).asType('int')
      const idx = f.getNodeGraphVariable('solveIdx').asType('int')
      f.doubleBranch(f.lessThan(idx, len), () => {
        const mv = f.getCorrespondingValueFromList(seq, idx)
        f.sendSignal(RubikSignal.rubik3x3_solve, 3n, mv)
        f.setNodeGraphVariable('solveIdx', f.addition(idx, 1n), false)
        // 续播判定必须读“已写入的新 solveIdx”，不能复用表达式 idx+1
        const absMv = f.absoluteValueOperation(mv)
        const isWhole = f.logicalNotOperation(f.lessThan(absMv, 10n))
        f.doubleBranch(f.lessThan(f.getNodeGraphVariable('solveIdx').asType('int'), len), () => {
          f.doubleBranch(isWhole, () => {
            f.callComposite(solverStartWholeEmit, { target: self })
          }, () => {
            f.callComposite(solverStartEmitTick, { target: self })
          })
        }, () => {
          f.doubleBranch(isWhole, () => {
            f.callComposite(solverStartWholeDone, { target: self })
          }, () => {
            f.callComposite(solverStartDoneTick, { target: self })
          })
        })
      }, () => {
        f.callComposite(solverStartDoneTick, { target: self })
      })
    }
    const t = evt.timerName as never
    f.multipleBranches(t, {
      'doneTick': () => {
        f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
      },
      'wholeDone': () => {
        f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
      },
      'preTick': () => sendOne(f.getSelfEntity(), f),
      'wholePre': () => sendOne(f.getSelfEntity(), f),
      'emitTick': () => {
        f.callComposite(solverStartPreTick, { target: f.getSelfEntity() })
      },
      'wholeEmit': () => {
        f.callComposite(solverStartWholePre, { target: f.getSelfEntity() })
      },
      default: () => {}
    })
  })

export default graph
