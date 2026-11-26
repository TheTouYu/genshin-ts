// @status: 探针（核验用）
// zz-char-srv.ts —— **挂在角色上的服务端图**：证明「角色挂载的图能直接拿到自己的实体/位置/朝向」
//
// 这是 A 层（角色意图层）要用的最基础原语：服务端图挂在角色上时，`getSelfEntity()` 就是**这个角色**，
// 于是不需要四步链、不需要点选项卡，就能拿到位置/朝向（每角色各跑一份）。
// 结果写关卡实体变量 fb_sh_*（供离线/编辑器回读）+ 打点 'fb-sh'。
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741833, name: '_GSTS_charSrv' }).on('whenEntityIsCreated', (_evt: any, f: any) => {
  const me = f.getSelfEntity()
  const level = f.queryEntityByGuid(1094713345n)
  const lr = f.getEntityLocationAndRotation(me)
  const l = f.split3dVector(lr.location)
  const r = f.split3dVector(lr.rotate)
  f.setCustomVariable(level, 'fb_sh_x', l.xComponent, false)
  f.setCustomVariable(level, 'fb_sh_y', l.yComponent, false)
  f.setCustomVariable(level, 'fb_sh_z', l.zComponent, false)
  f.setCustomVariable(level, 'fb_sh_rx', r.xComponent, false)
  f.setCustomVariable(level, 'fb_sh_ry', r.yComponent, false)
  f.setCustomVariable(level, 'fb_sh_rz', r.zComponent, false)
  f.setCustomVariable(level, 'fb_sh_ok', 1n, false)
  print('fb-sh')
})
