// solver.ts —— 求解执行图（轻量，仅"读序列→逐条发 move→回执推进"）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId)；op 4 = 主图回执；op 5 = 完成
import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741828,
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
        }, () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
        })
      },
      4: () => {
        const self = f.getSelfEntity()
        const seq = f.getCustomVariable(self, new str('solve_seq')).asType('int_list')
        const len = f.getCustomVariable(self, new str('solve_len')).asType('int')
        const idx = f.addition(f.getNodeGraphVariable('solveIdx').asType('int'), 1n)
        f.setNodeGraphVariable('solveIdx', idx, false)
        f.doubleBranch(f.lessThan(idx, len), () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 3n, f.getCorrespondingValueFromList(seq, idx))
        }, () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 5n, 1n)
        })
      },
      default: () => {}
    })
  })

export default graph
