// @status: 角色初始化图（生产用，非探针）
// zz-char-init.ts —— **服务端图**：角色进关时，把「玩家角色实体 + 当前位置」写进关卡实体变量。
//
// 用途：客户端内核（20008）不能自己解析角色实体（20008 白名单拒收），但它能读关卡/载体上的实体变量。
// 挂载：角色技能的服务端槽（用户 2026-10-31 配置）。事件 whenEntityIsCreated 在角色实体进关时触发。
// 与角色探针（zz-probe-char.ts）严格分离：探针只核验能力、不写生产变量。
//
// 为什么不用 evt.eventSourceEntity：该事件对**所有类型实体**都触发（官方 events-payload.ts:220-238），
//   拿它直接存会被物件/造物覆盖。这里改用官方四步链（docs/game-engine-knowledge/entity-acquisition.md）
//   现取现用：玩家序号 → 玩家 GUID → 玩家实体 → 角色列表 → [0]。
// 关卡实体 1094713345 需要的变量：fb_char_ref(entity) / fb_char_x,fb_char_y,fb_char_z(float) / fb_char_ok(int)
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741831, name: '_GSTS_charInit' }).on('whenEntityIsCreated', (_evt: any, f: any) => {
  const level = f.queryEntityByGuid(1094713345n)
  const playerGuid = f.getPlayerGuidByPlayerId(1n)
  const playerE = f.queryEntityByGuid(playerGuid)
  const chars = f.getAllCharacterEntitiesOfSpecifiedPlayer(playerE)
  f.doubleBranch(
    f.greaterThan(f.getListLength(chars), 0n),
    () => {
      const c = f.getCorrespondingValueFromList(chars, 0n)
      const l = f.split3dVector(f.getEntityLocationAndRotation(c).location)
      f.setCustomVariable(level, 'fb_char_ref', c, false)
      f.setCustomVariable(level, 'fb_char_x', l.xComponent, false)
      f.setCustomVariable(level, 'fb_char_y', l.yComponent, false)
      f.setCustomVariable(level, 'fb_char_z', l.zComponent, false)
      f.setCustomVariable(level, 'fb_char_ok', 1n, false)
      print('fb-char-init')
    },
    () => {}
  )
})
