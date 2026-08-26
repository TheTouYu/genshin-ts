// solver.ts —— 求解执行图（轻量，逐条定时发 move 给主图渲染，无需回执，不撑大 game 主图）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId)；op 4 = 逻辑-only 应用(val=正 base)；
// op 5 = 完成
// 2026-08-26 节拍重排（日志 2895 实测负载）：计算(规划)≈2200 负载/轮 vs 转动≈5450 负载/秒——
// 计算快进（planTick 0.15s）、转动步间保持间隔（emitTick 1.8s）、播完只需盖住最后一转动画（doneTick 0.7s）。
// 负 moveId（U3 折叠 U'）安全拆分：3 条逻辑-only(op4) 事件 + 1 条负轴视觉(op3)，每条记录独立不超帧。
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

// exec：发送一个求解序列元素——正 moveId 直接发视觉转动(op3)；
// 负 moveId 先记录 pendNeg 并 0.02s 步进发 3 条逻辑-only(op4)，再由 negTick 发负轴视觉(op3)
export const solverSendMove = g.defineComposite('solver_send_move', {
    id: 1610700069,
  inputs: { v: { type: 'int' }, self: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ v, self }, f) => {
    f.doubleBranch(f.lessThan(v, 0n), () => {
      const setP = f.registerExecNode('set_node_graph_variable', [new str('pendNeg'), v, new bool(false)])
      const setZ = f.registerExecNode('set_node_graph_variable', [new str('negPhase'), new int(0), new bool(false)])
      f.connect(setP, 0, setZ, 0)
      const b = f.absoluteValueOperation(v)
      f.callComposite(solverSendLogicOnly, { b, self })
    }, () => {
      f.sendSignal(RubikSignal.rubik3x3_solve, 3n, v)
      const doneN = f.registerExecNode('set_node_graph_variable', [new str('solveIdx'), f.getNodeGraphVariable('solveIdx').asType('int'), new bool(false)])
      f.outflow('done', doneN, 0)
    })
    return {}
  }
})

// exec：发一条逻辑-only(op4) + 0.02s 后 negTick 步进
export const solverSendLogicOnly = g.defineComposite('solver_send_logic_only', {
    id: 1610700070,
  inputs: { b: { type: 'int' }, self: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ b, self }, f) => {
    f.sendSignal(RubikSignal.rubik3x3_solve, 4n, b)
    const t = f.registerExecNode('start_timer', [self, new str('negTick'), new bool(false), f.assemblyList([new float(0.02)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// exec：negTick 0.02s 步进定时器
export const solverStartNegTick = g.defineComposite('solver_start_neg_tick', {
    id: 1610700071,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('negTick'), new bool(false), f.assemblyList([new float(0.02)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741833,
    variables: {
      solveIdx: new int(0),
      // 负 moveId 拆分状态：pendNeg=待发的负 moveId，negPhase=已发逻辑-only 次数（0..2）
      pendNeg: new int(0),
      negPhase: new int(0)
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
          const v = f.getCorrespondingValueFromList(seq, 0n)
          f.callComposite(solverSendMove, { v, self })
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
          const v = f.getCorrespondingValueFromList(seq, idx)
          f.callComposite(solverSendMove, { v, self })
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
      'negTick': () => {
        // 负 moveId 拆分步进：每次 0.02s 发一条逻辑-only(op4)，发满 3 条后发视觉(op3)
        const self = f.getSelfEntity()
        const v = f.getNodeGraphVariable('pendNeg').asType('int')
        const b = f.absoluteValueOperation(v)
        const ph = f.addition(f.getNodeGraphVariable('negPhase').asType('int'), 1n)
        f.setNodeGraphVariable('negPhase', ph, false)
        f.doubleBranch(f.lessThan(ph, 3n), () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 4n, b)
          f.callComposite(solverStartNegTick, { target: self })
        }, () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 3n, v)
        })
      },
      default: () => {}
    })
  })

export default graph
