// rubik-game 玩家输入图 v2（W1 UI 重构，2026-09-09）
//
// 职责：① UI 事件 → rubikgame_input 信号（btnId 映射中枢）② 悬浮页 per-player 编排。
//   whenUiControlGroupIsTriggered（HUD 按钮）：compositeIdx→btnId，0 基假设：
//     0..11 = 12 转动按钮 → btnId 1..12（donor op3 moveId 序）；
//     12→20 提示、13→21 重开、14→22 菜单。
//     ⚠ 首轮游戏核验请对 rgInput 开详情日志校准 compositeIdx 实际基数/顺序，偏差只改本表。
//   whenFloatingInteractionPageIsTriggered：页0 选关（item 0..3→100..103 档位、4→200 自由）；
//     页1 结算（0→21 重试、1→23 下一关、2→22 菜单）；其余页直传。
//   whenEntityIsCreated：开局（rg_stage==1）唤起选关页0（初始化列表0 选中首项）。
//   onSignal rubikgame_state：ev1 val1→开页0；val2/3→关页0；ev4→关页0+开结算页1。
// 挂载：玩家模板 1086324737（def + root5 九副本 737..745，attach --def + 逐副本 attach --entity）。

import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'

import { RgSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741837,
    variables: {
      // 唤起页初始化列表数据（内联 dict 参数 vendor 编码器不支持 → 走图变量）
      initDict: dict([{ k: 0n, v: list('int', [new int(0)]) }])
    }
  })
  .on('whenEntityIsCreated', (evt, f) => {
    // 开局/重连：IDLE(0)/SELECTING(1) 均自动弹选关页（首局 stage=0，菜单后=1）
    const self = f.getSelfEntity()
    const stage = f.getCustomVariable(self, new str('rg_stage')).asType('int')
    const menuish = f.logicalOrOperation(f.equal(stage, 0n), f.equal(stage, 1n))
    f.doubleBranch(
      menuish,
      () => {
        f.showFloatingInteractionPage(
          self,
          new int(0),
          f.getNodeGraphVariable('initDict').asDict('int', 'int_list')
        )
      },
      () => {}
    )
  })
  .onSignal(RgSignal.rubikgame_state, (evt: any, f: any) => {
    const self = f.getSelfEntity()
    f.doubleBranch(
      f.equal(evt.params.ev, 1n),
      () => {
        f.doubleBranch(
          f.equal(evt.params.val, 1n),
          () => {
            f.showFloatingInteractionPage(
              self,
              new int(0),
              f.getNodeGraphVariable('initDict').asDict('int', 'int_list')
            )
          },
          () => {
            f.closeFloatingInteractionPage(self, new int(0))
          }
        )
      },
      () => {
        f.doubleBranch(
          f.equal(evt.params.ev, 4n),
          () => {
            f.closeFloatingInteractionPage(self, new int(0))
            f.showFloatingInteractionPage(
              self,
              new int(1),
              f.getNodeGraphVariable('initDict').asDict('int', 'int_list')
            )
          },
          () => {}
        )
      }
    )
  })
  .on('whenUiControlGroupIsTriggered', (evt, f) => {
    // HUD 按钮：复合索引 → btnId（0 基假设，详情日志校准点）
    const ci = evt.uiControlGroupCompositeIndex
    const isMove = f.logicalNotOperation(f.greaterThan(ci, 11n))
    f.doubleBranch(
      isMove,
      () => {
        const btn = f.addition(ci, 1n)
        f.sendSignal(RgSignal.rubikgame_input, btn)
      },
      () => {
        f.doubleBranch(
          f.equal(ci, 12n),
          () => {
            f.sendSignal(RgSignal.rubikgame_input, 20n)
          },
          () => {
            f.doubleBranch(
              f.equal(ci, 13n),
              () => {
                f.sendSignal(RgSignal.rubikgame_input, 21n)
              },
              () => {
                f.doubleBranch(
                  f.equal(ci, 14n),
                  () => {
                    f.sendSignal(RgSignal.rubikgame_input, 22n)
                  },
                  () => {}
                )
              }
            )
          }
        )
      }
    )
  })
  .on('whenFloatingInteractionPageIsTriggered', (evt, f) => {
    const page = evt.floatingInteractionPageIndex
    const item = evt.interactiveItemIndex
    f.doubleBranch(
      f.equal(page, 0n),
      () => {
        // 页0 选关：0..3→100..103（3/5/8/12 档）、4→200（自由）
        f.doubleBranch(
          f.equal(item, 4n),
          () => {
            f.sendSignal(RgSignal.rubikgame_input, 200n)
          },
          () => {
            const btn = f.addition(item, 100n)
            f.sendSignal(RgSignal.rubikgame_input, btn)
          }
        )
      },
      () => {
        f.doubleBranch(
          f.equal(page, 1n),
          () => {
            // 页1 结算：0→重试21、1→下一关23、2→菜单22
            f.doubleBranch(
              f.equal(item, 0n),
              () => {
                f.sendSignal(RgSignal.rubikgame_input, 21n)
              },
              () => {
                f.doubleBranch(
                  f.equal(item, 1n),
                  () => {
                    f.sendSignal(RgSignal.rubikgame_input, 23n)
                  },
                  () => {
                    f.sendSignal(RgSignal.rubikgame_input, 22n)
                  }
                )
              }
            )
          },
          () => {
            f.sendSignal(RgSignal.rubikgame_input, item)
          }
        )
      }
    )
  })

export default graph
