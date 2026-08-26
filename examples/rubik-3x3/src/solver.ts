// solver.ts —— 求解执行图（轻量：按规划序列逐条发 op3 给 turn 图，负 moveId 由 turn 图统一拆分）
// 与规划图(solverPlan)同挂自动求解实体；单信号 rubik3x3_solve(op,val)
// op 6 = 序列就绪(规划→执行)；op 3 = 执行一步(val=moveId，可为负=折叠反向)；op 5 = 完成
// 2026-08-26 节拍（日志 2895 负载实测 + 2026-08-26 用户追加降载要求）：
//   计算快进 planTick 0.15s；转动动画「前 0.5s 静默+后 0.5s 静默」——
//   preTick 0.5s 在每个动画之前，emitTick 2.3s（动画 0.65s + 1.65s 余量）为步间间隔，
//   doneTick 1.2s（动画 0.7s 完成 + 0.5s 余量）为宏尾休息；全部只影响自动求解播放，不碰手手动感。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

// exec：动画步间休息（2.3s：0.5s 动画后静默 + 动画 0.65s + 余量；转动是负载大头，多停一下）
const solverStartEmitTick = g.defineComposite('solver_start_emit_tick', {
    id: 1610700058,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('emitTick'), new bool(false), f.assemblyList([new float(2.3)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// exec：宏播完休息（1.2s：盖住最后一转 0.3s 转动 + 0.35s 完成延迟 + 0.5s 静默），回 op5 重算
const solverStartDoneTick = g.defineComposite('solver_start_done_tick', {
    id: 1610700061,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('doneTick'), new bool(false), f.assemblyList([new float(1.2)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

// exec：动画前静默 0.5s（降载：每个自动求解动画前留 0.5s 间隔）
const solverStartPreTick = g.defineComposite('solver_start_pre_tick', {
    id: 1610700069,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('preTick'), new bool(false), f.assemblyList([new float(0.5)], 'float')])
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
        const len = f.getCustomVariable(self, new str('solve_len')).asType('int')
        f.setNodeGraphVariable('solveIdx', new int(0), false)
        f.doubleBranch(f.greaterThan(len, 0), () => {
          // 首个动画也要 0.5s 前置静默
          f.callComposite(solverStartPreTick, { target: self })
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
      'preTick': () => {
        // 统一发送：读当前 solveIdx 发一步，然后按剩余量接 emitTick/doneTick
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
        }, () => {
          f.callComposite(solverStartDoneTick, { target: self })
        })
      },
      'emitTick': () => {
        // 步间静默结束：进入下一动画的 0.5s 前置静默
        f.callComposite(solverStartPreTick, { target: f.getSelfEntity() })
      },
      default: () => {}
    })
  })

export default graph
