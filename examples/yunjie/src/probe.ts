// 云阶（游戏①）—— 位置遥测 + 终点判定
//
// 设计依据（2026-10-17 实测）：
//   · getListOfPlayerEntitiesOnTheField() 给的是「玩家控制器实体」，对它读位置得到 0
//   · 正解：getPlayerGuidByPlayerId(n) → PlayerEntity → getActiveCharacterOfSpecifiedPlayer(p)
//     → CharacterEntity，对它读位置**有效**（v1 已实测：按 W 走 3 秒 → loc.x=16.983）
//   · whenTabIsSelected 载荷里的 selectorEntity 也是角色实体（备用通道）
//   · tabBar 只能配在「元件」上（gil_entities.ts:582），故终点台 = 静态元件 1077936200 的实例 1077936201
//
// 本版目的：**把「角色在哪、跳多高、走多远」变成日志里可读的数字**——
// 有了它，跳跃距离/掉落判定/检查点全都可以用数据定，而不是猜。
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'

const graph = g.server({ id: 1073741825, variables: { booted: false } })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    // 一次性闸门（图变量）——地图实体多，本图挂了 2 个宿主，会触发多次
    if (f.get('booted')) return
    f.set('booted', true)
    f.printString('YJ-BOOT')

    // 位置遥测暂缺：getActiveCharacterOfSpecifiedPlayer 需要 PlayerEntity 值，
    // 而 getPlayerGuidByPlayerId→queryEntityByGuid 只给普通 entity，编译期 parseValue 拒收
    // （Error: 无效的值类型: entity）。可用的角色实体通道 = whenTabIsSelected 的 selectorEntity。
  })
  .on('whenTabIsSelected', (e: any, f: any) => {
    f.printString('YJ-TAB')
    f.printString(f.dataTypeConversion(e.tabId, 'str'))

    // selectorEntity = 触发选项卡的角色实体（有效坐标）
    const loc = f.getEntityLocationAndRotation(e.selectorEntity).location
    f.printString('TABX')
    f.printString(f.dataTypeConversion(loc.x, 'str'))
    f.printString('TABY')
    f.printString(f.dataTypeConversion(loc.y, 'str'))

    const players = f.getListOfPlayerEntitiesOnTheField()
    const n = f.getListLength(players)
    if (n > 0n) {
      const p = f.getCorrespondingValueFromList(players, 0n)
      f.setPlayerSettlementSuccessStatus(p, SettlementStatus.Victory)
    }
    f.settleStage()
    f.printString('YJ-SETTLED')
  })

export default graph
