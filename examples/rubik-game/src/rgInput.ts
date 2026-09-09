// rubik-game 玩家输入图（G3，2026-09-09）
//
// 职责：UI 事件 → rubikgame_input 信号转发（无状态）。
//   ① whenUiControlGroupIsTriggered（HUD 常驻层交互按钮族；触发玩家专属语义，per-player 实例
//      各收自己的交互，无需去重门）：btnId = uiControlGroupCompositeIndex（复合组值，票04 给
//      18 转动按钮+提示+重开+菜单分配 1..12/20/21/22）。
//   ② whenFloatingInteractionPageIsTriggered（悬浮交互页）：页 0=选关（交互项 0..3→100..103
//      档位、4→200 自由）；其余页交互项索引直传（票04 联调时按素材 id 细化映射）。
// 挂载：玩家模板 1086324737（def + root5 九副本 737..745，attach --def + 逐副本 attach --entity）。
import { g } from 'genshin-ts/runtime/core'
import { RgSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741837,
    variables: {}
  })
  .on('whenUiControlGroupIsTriggered', (evt, f) => {
    // HUD 按钮：复合组值即按钮身份（票04 契约）
    f.sendSignal(RgSignal.rubikgame_input, evt.uiControlGroupCompositeIndex)
  })
  .on('whenFloatingInteractionPageIsTriggered', (evt, f) => {
    const page = evt.floatingInteractionPageIndex
    const item = evt.interactiveItemIndex
    // 页 0=选关：0..3→100..103（3/5/8/12 档）、4→200（自由）；其他页索引直传
    f.doubleBranch(f.equal(page, 0n), () => {
      f.doubleBranch(f.equal(item, 4n), () => {
        f.sendSignal(RgSignal.rubikgame_input, 200n)
      }, () => {
        const btn = f.addition(item, 100n)
        f.sendSignal(RgSignal.rubikgame_input, btn)
      })
    }, () => {
      f.sendSignal(RgSignal.rubikgame_input, item)
    })
  })

export default graph
