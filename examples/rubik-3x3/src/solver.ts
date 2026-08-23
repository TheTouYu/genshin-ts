// solver.ts —— 求解执行图（轻量，逐条定时发 move 给主图渲染，无需回执，不撑大 game 主图）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId)；op 5 = 完成
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

// exec：启动下一个 emitTick（1.2s，与转动动画完成时长对齐）
const solverStartEmitTick = g.defineComposite('solver_start_emit_tick', {
  id: 1610700058,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('emitTick'), new bool(false), f.assemblyList([new float(1.2)], 'float')])
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
            f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
          })
        }, () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
        })
      },
      default: () => {}
    })
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'emitTick': () => {
        const self = f.getSelfEntity()
        const seq = f.getCustomVariable(self, new str('solve_seq')).asType('int_list')
        const len = f.getCustomVariable(self, new str('solve_len')).asType('int')
        const idx = f.getNodeGraphVariable('solveIdx').asType('int')
        f.doubleBranch(f.lessThan(idx, len), () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 3n, f.getCorrespondingValueFromList(seq, idx))
          const nxt = f.addition(idx, 1n)
          f.setNodeGraphVariable('solveIdx', nxt, false)
          f.doubleBranch(f.lessThan(nxt, len), () => {
            f.callComposite(solverStartEmitTick, { target: self })
          }, () => {
            f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
          })
        }, () => {})
      },
      default: () => {}
    })
  })


export default graph
