// @status: 探针（核验用，不进生产链；验证完可删）
// zz-probe-char.ts —— 角色侧能力核验：**客户端技能图（20002）**
//
// 目的：在真机上确认「角色技能图能拿到什么」——自身角色实体、位置、朝向、类型、在场判定、GUID。
// 结果通过 kit_state 信号以 tag='C' 发回服务端（复用已注册信号，不新增信号资产）。
//   打包：tick=实体类型, pos=位置(x,y,z), vel=朝向(x,y,z), spin=(onField, guidLower, 0), state=0
import { g } from 'genshin-ts/runtime/core'

import { chanSendState6 } from '../../client-kit/channels.js'
import { KitSignal } from './signals.js'

g.characterSkill({ id: 1082130450, name: '_GSTS_charProbe' }).on('start', (_evt: any, f: any) => {
  const me = f.getCurrentCharacter()
  // bool → float 不支持直接转换（官方限制）⇒ 用分支落成 1.0/0.0
  const onField = f.queryIfEntityIsOnTheField(me)
  const onFieldF = f.localVariable('float')
  f.doubleBranch(onField, () => { onFieldF.set(1.0) }, () => { onFieldF.set(0.0) })
  // 角色技能图（20002）白名单里没有 getEntityLocationAndRotation ⇒ 位置/朝向分两个节点取
  const loc = f.split3dVector(f.getEntityLocation(me))
  const rot = f.split3dVector(f.getEntityRotation(me))
  // 注：guid → float 不支持转换（官方限制），GUID 这一项本轮不采
  chanSendState6(
    f,
    KitSignal.kit_state,
    'C',
    0,
    f.create3dVector(loc.xComponent, loc.yComponent, loc.zComponent),
    f.create3dVector(rot.xComponent, rot.yComponent, rot.zComponent),
    f.create3dVector(onFieldF.value, 0.0, 0.0),
    0
  )
})
