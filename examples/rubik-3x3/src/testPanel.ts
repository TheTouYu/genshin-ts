// 测试台独立图：挂在独立测试实体（tabBar 平台）上，只服务测试功能，不影响主图
// tab1 = 二层测试状态（只打乱 U/E，保持第一层完整；不自动还原，由用户按自动还原按钮）
// tab2 = 快速模式开关（自动还原等待缩短 60%）
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

const graph = g
  .server({ id: 1073741837 })
  .on('whenTabIsSelected', (evt: any, f: any) => {
    f.multipleBranches(evt.tabId, {
      1: () => {
        // 二层测试状态：发 op18 给 turn 图（只 U/E 打乱，保持第一层，不自动还原）
        f.sendSignal(RubikSignal.rubik3x3_solve, 18n, 0n)
      },
      2: () => {
        // 快速模式：切换主控制器 rubik3x3_fast_mode → solver 定时器 ×0.4
        const main = entity(1077936201n)
        const fm = f.getCustomVariable(main, new str('rubik3x3_fast_mode')).asType('bool')
        f.setCustomVariable(main, new str('rubik3x3_fast_mode'), f.logicalNotOperation(fm), false)
        f.printString('rubik3x3-fast-mode-toggled')
      },
      default: () => {}
    })
  })

export default graph
