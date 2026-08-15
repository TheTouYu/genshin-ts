// @ts-nocheck
// U4b 差分实验（2026-08-16）：activateDisableModelDisplay（节点 308）游戏内是否生效
// 背景：U4 已判定 835（modifyModelColorAndMaterial）为无效节点 ID（执行但无效果）；
// 灯阵"点亮/熄灭"改用 308 显隐方案（data.json 官方定义 Set_Model_Visible）。
// 触发：whenTabIsSelected——选项 1（R）= 隐藏实体；其他选项（L 等）= 显示实体
// 判定（用户游戏观察）：
//   点 R 实体消失 + 点 L 实体重现 = 308 生效 → 灯阵明暗用显隐
//   无变化 = 308 无效/参数问题（需进一步差分）
import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({ id: 1073741836 })
  .on('whenTabIsSelected', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.tabId, 1n),
      () => {
        f.activateDisableModelDisplay(evt.eventSourceEntity, false)
        f.printString('u4b-hide-fire')
      },
      () => {
        f.activateDisableModelDisplay(evt.eventSourceEntity, true)
        f.printString('u4b-show-fire')
      }
    )
  })

export default graph
