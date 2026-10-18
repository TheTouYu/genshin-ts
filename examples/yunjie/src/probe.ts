// 云阶（游戏①）—— 位置探针版（标定专用）
//
// 目的：**把「角色在哪、跳多高、走多远」变成日志里可读的数字**，用来标定跳跃能力。
// 手段：大半径 tabBar 当**全局位置探针**——按 F 恒能触发，每次触发打印角色当前坐标。
//   · getListOfPlayerEntitiesOnTheField() 给「玩家控制器实体」，读位置恒 0（实测 429 样本全 0）
//   · 唯一有效通道 = whenTabIsSelected 载荷的 selectorEntity（角色实体）
//   · getPlayerGuidByPlayerId→queryEntityByGuid 产出普通 entity，喂给要 PlayerEntity 的节点编译期拒收
//
// ⚠️ 本版**不做结算**：按 F 只打印，不结束游戏（标定期间要能连续按 F）。
//    标定完成后恢复结算分支（见文件末尾注释）。
import { g } from 'genshin-ts/runtime/core'

const graph = g.server({ id: 1073741825, variables: { booted: false } })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    // 一次性闸门：地图实体多、本图挂多宿主，会触发多次
    if (f.get('booted')) return
    f.set('booted', true)
    f.printString('YJ-BOOT')
  })
  .on('whenTabIsSelected', (e: any, f: any) => {
    // selectorEntity = 触发选项卡的角色实体（唯一能读到真坐标的通道）
    const loc = f.getEntityLocationAndRotation(e.selectorEntity).location
    f.printString('PX')
    f.printString(f.dataTypeConversion(loc.x, 'str'))
    f.printString('PY')
    f.printString(f.dataTypeConversion(loc.y, 'str'))
    f.printString('PZ')
    f.printString(f.dataTypeConversion(loc.z, 'str'))
  })

// 标定完成后恢复结算：
//   import { SettlementStatus } from 'genshin-ts/definitions/enum'
//   const players = f.getListOfPlayerEntitiesOnTheField()
//   if (f.getListLength(players) > 0n) {
//     f.setPlayerSettlementSuccessStatus(f.getCorrespondingValueFromList(players, 0n),
//       SettlementStatus.Victory)
//   }
//   f.settleStage()

export default graph
