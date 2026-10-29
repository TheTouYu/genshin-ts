// @status: 新线（2026-10-29）—— 玩家节点图取「当前角色」位置
// kit-ppos.ts —— 服务端图（20000），**挂在玩家模板实体 1086324737 上**（= 玩家节点图）
//
// 为什么要挂在玩家上（B 站教程《从入门到入土 EP08 在玩家节点图寻找当前角色的方法》给出的口径：
//   「对于寻找玩家和寻找角色，需要完全对应的实体，不然很多节点无法使用」）：
//   · 挂在造物/球上的图：getListOfPlayerEntitiesOnTheField()[0] 拿到的是**玩家控制器实体**，
//     坐标恒 (0, y, 0)（日志 3416 实证），拿不到角色；
//   · 挂在玩家模板上的图：getSelfEntity() 就是**本玩家实体**，再用
//     「获取指定玩家所有角色实体」取到的就是**自己**的角色，不存在"取到别人的"问题。
//
// 职责：每拍把本玩家的角色坐标写到载体实体（打手丘丘人 1082130445）的 fbvx/fbvz/fbvy，
//       客户端内核 kitLoop 直接读（它本来就每拍读这三个变量）。
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

const CARRIER_GUID = 1082130445n

const graph = g
  .server({
    id: 1073741829,
    name: '_GSTS_kitPpos'
  })
  .onSignal(KitSignal.kit_state, (_evt: any, f: any) => {
    const self = f.getSelfEntity() // = 玩家实体（本图挂在玩家模板上）
    const owner = f.queryEntityByGuid(CARRIER_GUID)
    const chars = f.getAllCharacterEntitiesOfSpecifiedPlayer(self)
    const cx = f.localVariable('float')
    const cy = f.localVariable('float')
    const cz = f.localVariable('float')
    f.doubleBranch(
      f.greaterThan(f.getListLength(chars), 0n),
      () => {
        // 只接受「站在场上」的角色（y ∈ [−6, 20]）：掉出场外/无效实体会给到 −142 这类值
        const l = f.split3dVector(
          f.getEntityLocationAndRotation(f.getCorrespondingValueFromList(chars, 0n)).location
        )
        f.doubleBranch(
          f.logicalAndOperation(
            f.greaterThan(l.yComponent, -6.0),
            f.lessThan(l.yComponent, 20.0)
          ),
          () => {
            cx.set(l.xComponent)
            cy.set(l.yComponent)
            cz.set(l.zComponent)
            f.setCustomVariable(owner, 'fbvx', cx.value, false)
            f.setCustomVariable(owner, 'fbvz', cz.value, false)
            f.setCustomVariable(owner, 'fbvy', cy.value, false)
          },
          () => {}
        )
      },
      () => {
        // 空槽（没有玩家的槽位）：**什么都不写**。
        // 9 个玩家槽都会挂本图，若空槽也写就会把有玩家那槽算出的真值覆盖掉。
      }
    )
  })

export default graph
