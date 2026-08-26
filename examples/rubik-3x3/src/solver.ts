// solver.ts —— 求解执行图（轻量：按规划序列逐条发 op3 给 turn 图，负 moveId 由 turn 图统一拆分）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId，可为负=折叠反向)；op 5 = 完成
// 2026-08-26 节拍（+20% 防踢 + 整转 3 倍等待）：
//   面转：preTick 1.2s / emitTick 1.1s / doneTick 1.75s；
//   整转（|moveId|>=10，负载 ~3x）：wholePre 3.6s / wholeEmit 3.3s / wholeDone 5.25s。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

const mkTimer = (id: number, name: string, timerName: string, delay: number) => g.defineComposite(name, {
    id,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str(timerName), new bool(false), f.assemblyList([new float(delay)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// 面转：步间 1.1s（动画 ~0.35s + 旋转后 0.75s 余量）
const solverStartEmitTick = mkTimer(1610700058, 'solver_start_emit_tick', 'emitTick', 1.1)
// 面转：宏尾 1.75s（面转 0.6s 完成 + 1.1s 余量）
const solverStartDoneTick = mkTimer(1610700061, 'solver_start_done_tick', 'doneTick', 1.75)
// 面转：动画前 1.2s
const solverStartPreTick = mkTimer(1610700069, 'solver_start_pre_tick', 'preTick', 1.2)
// 整转：动画前 3.6s、步间 3.3s、宏尾 5.25s（负载 3 倍 → 间隔 3 倍）
const solverStartWholePre = mkTimer(1610700076, 'solver_start_whole_pre', 'wholePre', 3.6)
const solverStartWholeEmit = mkTimer(1610700077, 'solver_start_whole_emit', 'wholeEmit', 3.3)
const solverStartWholeDone = mkTimer(1610700078, 'solver_start_whole_done', 'wholeDone', 5.25)

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
