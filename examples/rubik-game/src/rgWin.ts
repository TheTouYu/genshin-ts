// rubik-game 胜利动画图（G4 票07，2026-09-09）
//
// 职责：监听 rubikgame_state[ev=4]（SETTLED 广播）→ 胜利庆祝自旋 360°：
//   4× 整转 X（op3 val=10，复用 donor 整转通道），节拍 wholePre 7.18s；
//   spinLeft 递减到 0 停止（定时器有停止条件，零轮询）。
//   升降段留 v2（需 stage/块级运动设备，RG-DESIGN §3 胜利动画完整形态）。
// 挂载：实体 1077936260（与 rgState/rgHint 同锚点）。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { RubikSignal, RgSignal } from './signals.js'

const mkWinTimer = g.defineComposite('rg_win_spin_tick', {
    id: 1610700170,
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const t = f.registerExecNode('start_timer', [target, new str('winSpin'), new bool(false), f.assemblyList([new float(7.18)], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741838,
    variables: {
      spinLeft: new int(0),
      active: new int(0)
    }
  })
  .onSignal(RgSignal.rubikgame_state, (evt: any, f: any) => {
    f.doubleBranch(f.equal(evt.params.ev, 4n), () => {
      const self = f.getSelfEntity()
      f.doubleBranch(f.equal(f.getNodeGraphVariable('active').asType('int'), 0n), () => {
        f.setNodeGraphVariable('active', new int(1), false)
        f.setNodeGraphVariable('spinLeft', new int(4), false)
        f.printString('rg-win-spin-start')
        f.callComposite(mkWinTimer, { target: self })
      }, () => {})
    }, () => {})
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.multipleBranches(evt.timerName as never, {
      'winSpin': () => {
        const self = f.getSelfEntity()
        const left = f.getNodeGraphVariable('spinLeft').asType('int')
        f.doubleBranch(f.greaterThan(left, 0n), () => {
          f.sendSignal(RubikSignal.rubik3x3_solve, 3n, 10n)
          f.setNodeGraphVariable('spinLeft', f.subtraction(left, 1n), false)
          // 续播判定必须读回已写入的新 spinLeft（先写回再显式读回）
          f.doubleBranch(f.greaterThan(f.getNodeGraphVariable('spinLeft').asType('int'), 0n), () => {
            f.callComposite(mkWinTimer, { target: self })
          }, () => {
            f.setNodeGraphVariable('active', new int(0), false)
            f.printString('rg-win-spin-done')
          })
        }, () => {
          f.setNodeGraphVariable('active', new int(0), false)
        })
      },
      default: () => {}
    })
  })

export default graph
