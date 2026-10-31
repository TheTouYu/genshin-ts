// @status: 探针（核验用，不进生产链）
// zz-probe-char-srv.ts —— 角色探针的接收端：**服务端图（20000）**
//
// 收到 tag='C'（角色技能图发来的探针包）→ 写关卡实体变量 fb_cp_*（供离线读/后续逻辑用）+ 打点。
// 关卡实体 1094713345 需要这些 float 变量：fb_cp_et/fb_cp_x/fb_cp_y/fb_cp_z/fb_cp_rx/fb_cp_ry/fb_cp_rz/fb_cp_ok/fb_cp_guid。
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

g.server({ id: 1073741830, name: '_GSTS_charProbeSrv' }).onSignal(KitSignal.kit_state, (evt: any, f: any) => {
  f.doubleBranch(
    f.equal(evt.params.tag, 'C'),
    () => {
      const level = f.queryEntityByGuid(1094713345n)
      const p = f.split3dVector(evt.params.pos)
      const r = f.split3dVector(evt.params.vel)
      const s = f.split3dVector(evt.params.spin)
      f.setCustomVariable(level, 'fb_cp_et', f.dataTypeConversion(evt.params.tick, 'float'), false)
      f.setCustomVariable(level, 'fb_cp_x', p.xComponent, false)
      f.setCustomVariable(level, 'fb_cp_y', p.yComponent, false)
      f.setCustomVariable(level, 'fb_cp_z', p.zComponent, false)
      f.setCustomVariable(level, 'fb_cp_rx', r.xComponent, false)
      f.setCustomVariable(level, 'fb_cp_ry', r.yComponent, false)
      f.setCustomVariable(level, 'fb_cp_rz', r.zComponent, false)
      f.setCustomVariable(level, 'fb_cp_ok', s.xComponent, false)
      f.setCustomVariable(level, 'fb_cp_guid', s.yComponent, false)
      print('fb-cp')
    },
    () => {}
  )
})
