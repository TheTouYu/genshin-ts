// solver.ts —— 求解执行图（轻量，逐条定时发 move 给主图渲染，无需回执，不撑大 game 主图）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId)；op 5 = 完成
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

// exec：启动下一个 emitTick（2.2s——仅自动求解的动画步进；玩家手动转动不受影响）
const solverStartEmitTick = g.defineComposite('solver_start_emit_tick', {
  id: 1610700058,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('emitTick'), new bool(false), f.assemblyList([new float(2.2)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// exec：序列播完后再等 4.0s：给最后一转动画与状态发布一段休息，再回 op5 重算
const solverStartDoneTick = g.defineComposite('solver_start_done_tick', {
  id: 1610700061,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    // 4s：必须等最后一个转动的 flowAfterTurn 发布完 solver_ep/eo 再回 op5 重算
    const t = f.registerExecNode('start_timer', [target, new str('doneTick'), new bool(false), f.assemblyList([new float(4.0)], 'float')])
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
          const nxt = f.addition(idx, 1n)
          f.setNodeGraphVariable('solveIdx', nxt, false)
          f.doubleBranch(f.lessThan(nxt, len), () => {
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
