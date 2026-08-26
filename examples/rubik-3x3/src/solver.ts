// solver.ts —— 求解执行图（轻量：按规划序列逐条发 op3 给 turn 图，负 moveId 由 turn 图统一拆分）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId，可为负=折叠反向)；op 5 = 完成
// 2026-08-26 节拍重排（日志 2895 实测负载）：计算(规划)≈2200 负载/轮 vs 转动≈5450 负载/秒——
// 计算快进（planTick 0.15s）、转动步间保持间隔（emitTick 1.8s）、播完只需盖住最后一转动画（doneTick 0.7s）。
// 2026-08-26 串台修复：执行器不再自己拆负值（op4 状态机有与打乱队列串台的缺陷），
// 只发 op3；turn 图按负值做 3 次逻辑-only + 负轴视觉。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

// exec：启动下一个 emitTick（1.8s——转动步间休息；转动是负载大头，多停一下）
const solverStartEmitTick = g.defineComposite('solver_start_emit_tick', {
    id: 1610700058,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('emitTick'), new bool(false), f.assemblyList([new float(1.8)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// exec：序列播完后再等 0.7s（0.3s 转动 + 0.35s 完成延迟 + 发布余量），回 op5 重算
const solverStartDoneTick = g.defineComposite('solver_start_done_tick', {
    id: 1610700061,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('doneTick'), new bool(false), f.assemblyList([new float(0.7)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

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
        const seq = f.getCustomVariable(self, new str('solve_seq')).asType('int_list')
        const len = f.getCustomVariable(self, new str('solve_len')).asType('int')
        f.setNodeGraphVariable('solveIdx', new int(0), false)
        f.doubleBranch(f.greaterThan(len, 0), () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 3n, f.getCorrespondingValueFromList(seq, 0n))
          f.setNodeGraphVariable('solveIdx', new int(1), false)
          f.doubleBranch(f.greaterThan(len, 1), () => {
            f.callComposite(solverStartEmitTick, { target: self })
          }, () => {
            // 单步序列也必须等最后一个转动动画完成，再通过 doneTick 回 op5
            f.callComposite(solverStartDoneTick, { target: self })
          })
        }, () => {
          f.callComposite(solverStartDoneTick, { target: self })
        })
      },
      default: () => {}
    })
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'doneTick': () => {
        f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
      },
      'emitTick': () => {
        const self = f.getSelfEntity()
        const seq = f.getCustomVariable(self, new str('solve_seq')).asType('int_list')
        const len = f.getCustomVariable(self, new str('solve_len')).asType('int')
        const idx = f.getNodeGraphVariable('solveIdx').asType('int')
        f.doubleBranch(f.lessThan(idx, len), () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 3n, f.getCorrespondingValueFromList(seq, idx))
          f.setNodeGraphVariable('solveIdx', f.addition(idx, 1n), false)
          // 续播判定必须读“已写入的新 solveIdx”，不能复用表达式 idx+1：
          // 复用会被编译器二次物化，实际比较 (idx+1)+1，永远丢掉每个宏的最后一步。
          f.doubleBranch(f.lessThan(f.getNodeGraphVariable('solveIdx').asType('int'), len), () => {
            f.callComposite(solverStartEmitTick, { target: self })
          }, () => {
            f.callComposite(solverStartDoneTick, { target: self })
          })
        }, () => {})
      },
      default: () => {}
    })
  })

export default graph
