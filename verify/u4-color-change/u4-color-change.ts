// @ts-nocheck
// U4 差分实验（2026-08-16，S4 测评未知清单 U4 + M4 同步决策依据）：
// modifyModelColorAndMaterial（节点 835）游戏内是否生效 + fillColor 颜色格式
// 背景：835 不在编辑器官方 data.json（558 节点）也不在 server 静态元数据（493 节点），
// 但 committed nodes.ts 有完整 DSL 支持（旧快照遗产）；灯阵玩法变色依赖它；
// M4 同步是否保留 835 取决于本实验。
// 触发：whenTabIsSelected（用户点击选项卡）→ 对事件源实体改色
// 动作：modifyModelColorAndMaterial(evt.eventSourceEntity, true, true,
//       fillColor=0xFF0000(红), opacity=100, Overwrite, false, false, ?)
// 判定（用户游戏观察 + 日志）：
//   实体变红 = 835 生效（fillColor 0xRRGGBB 格式成立）→ 灯阵可用 835 变色，同步需保留
//   不变色 = 835 无效或参数格式错（需进一步差分：opacity 范围/颜色格式）
import { g } from 'genshin-ts/runtime/core'
import * as E from 'genshin-ts/definitions/enum'

const graph = g
  .server({ id: 1073741835 })
  .on('whenTabIsSelected', (evt: any, f: any) => {
    f.modifyModelColorAndMaterial(
      evt.eventSourceEntity,
      true,
      true,
      0xff0000n,
      100,
      E.ColorBlendType.Overwrite,
      false,
      false,
      E.FillMaterial.Frozen
    )
    f.printString('u4-color-fire')
  })

export default graph
