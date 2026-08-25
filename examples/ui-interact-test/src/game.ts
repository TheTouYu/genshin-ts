import { g } from 'genshin-ts/runtime/core'
import * as E from 'genshin-ts/definitions/enum'

// 节点图 UI 交互测试：游戏开始时把控件 1073741955（文本框）设为「隐藏」
// 验证 modifyUiControlStatusWithinTheInterfaceLayout 的控件索引语义 + 显隐控制
const graph = g
  .server({ id: 1073741901 })
  .on('whenEntityIsCreated', (_evt, f) => {
    // 目标玩家 = 玩家 1 号；控件索引 = 1073741955（先试控件 ID）；状态 = 隐藏
    f.modifyUiControlStatusWithinTheInterfaceLayout(player(1n), 1073741955n, E.UIControlGroupStatus.Hidden)
    f.printString('ui-interact-test: hidden')
  })

export default graph
