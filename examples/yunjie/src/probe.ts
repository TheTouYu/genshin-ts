// 云阶（游戏①）v1 —— 三合一探针图
// 目的：一次试玩同时验证 ①注入通路 ②玩家能否移动 ③玩家能否跳跃
// 判据：日志出现 YJ-BOOT = 注入成功；X/Y/Z 数值随时间变化 = 能移动；Y 出现峰值 = 能跳
import { g } from 'genshin-ts/runtime/core'

// 玩家序号（UID 110170759 对应的局内玩家序号；单人局为 1）
const PLAYER_ID = 1

const graph = g.server({ id: 1073741825, variables: { booted: false } })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    // 地图有 14 个实体 → 本事件会触发多次；用图变量做一次性闸门，只装一个定时器
    if (f.get('booted')) return
    f.set('booted', true)
    f.printString('YJ-BOOT')
    setInterval(() => {
      const guid = f.getPlayerGuidByPlayerId(PLAYER_ID)
      const p = f.queryEntityByGuid(guid)
      const loc = f.getEntityLocationAndRotation(p).location
      f.printString('X')
      f.printString(f.dataTypeConversion(loc.x, 'str'))
      f.printString('Y')
      f.printString(f.dataTypeConversion(loc.y, 'str'))
      f.printString('Z')
      f.printString(f.dataTypeConversion(loc.z, 'str'))
    }, 400)
  })

export default graph
