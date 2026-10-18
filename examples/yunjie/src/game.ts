// 云阶（游戏①）—— 正式玩法图
//
// 玩法：在悬浮平台之间跳跃前进 → 登顶 → 按 F 触发「登顶完成」选项卡 → 关卡结算胜利。
//
// 关键设计（2026-10-17 实证）：
//   · 玩家坐标唯一有效通道 = whenTabIsSelected 载荷里的 **selectorEntity**（角色实体）。
//     getListOfPlayerEntitiesOnTheField() 给的是「玩家控制器实体」，其坐标恒 0（429 样本）。
//   · 选项卡既当**输入**又当**位置传感器**：事件里带真实坐标。
//   · 终点判定**不依赖 tabBar 的 regionRadius**（现值 60 是标定期的作弊值，覆盖全场）：
//     收到选项卡事件后，用 distanceBetweenTwoCoordinatePoints 与终点坐标比距离，
//     < GOAL_R 才判胜利。这样即使区域覆盖全场，"站在出生点按 F"也只是打印 YJ-FAR。
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'

// 终点：顶峰平台中心（实体 1077936201「终点台」在 42.5, 5.7, 0）
const GOAL_X = 36.0
const GOAL_Y = 2.75
const GOAL_Z = 0.0
const GOAL_R = 5.0 // 判定半径（米）

const graph = g
  .server({ id: 1073741825, variables: { booted: false, settled: false } })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    // 一次性闸门：地图实体多、本图挂多宿主，会触发多次
    if (f.get('booted')) return
    f.set('booted', true)
    f.printString('YJ-BOOT')
  })
  .on('whenTabIsSelected', (e: any, f: any) => {
    // selectorEntity = 触发选项卡的角色实体（唯一能读到真坐标的通道）
    const loc = f.getEntityLocationAndRotation(e.selectorEntity).location

    // ── 遥测：每次触发都留一条可解析的位置读数
    f.printString('YJ-PX')
    f.printString(f.dataTypeConversion(loc.x, 'str'))
    f.printString('YJ-PY')
    f.printString(f.dataTypeConversion(loc.y, 'str'))
    f.printString('YJ-PZ')
    f.printString(f.dataTypeConversion(loc.z, 'str'))

    // ── 终点判定：与终点的平方距离
    const dx = f.subtraction(loc.x, GOAL_X)
    const dy = f.subtraction(loc.y, GOAL_Y)
    const dz = f.subtraction(loc.z, GOAL_Z)
    const d2 = f.addition(
      f.addition(f.multiplication(dx, dx), f.multiplication(dy, dy)),
      f.multiplication(dz, dz),
    )
    const win = f.lessThan(d2, GOAL_R * GOAL_R)

    if (!win) {
      f.printString('YJ-FAR')
      return
    }
    if (f.get('settled')) return
    f.set('settled', true)
    f.printString('YJ-GOAL')
    const players = f.getListOfPlayerEntitiesOnTheField()
    if (f.getListLength(players) > 0n) {
      f.setPlayerSettlementSuccessStatus(
        f.getCorrespondingValueFromList(players, 0n),
        SettlementStatus.Victory,
      )
    }
    f.printString('YJ-SETTLED')
    f.settleStage()
  })

export default graph
