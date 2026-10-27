// @status: 新线（v3 客户端计算最小链路，2026-10-24）
// fb3/kit-status.ts —— 20009 造物状态图（1082130437）：持续执行造物技能 #1
//
// 状态图 = 持续行为：决策图切进来后每拍执行行为序列（start1..start10，前一行为失败才走下一个）。
// 本图只有一个行为：执行**技能序号 1**——序号对应造物「技能管理」里的第 1 条引用（CLI：
// `assets:creations skill add --target <实体> --skill-config 1191182338 --cd 0 --ignore-public-cd`）。
import { g } from 'genshin-ts/runtime/core'

g.creationStatus({ id: 1082130437, name: '_GSTS_kitStatus' }).on('start1', (_evt: any, f: any) => {
  f.executeSkill(true, 1n) // 造物技能第 1 条（丘丘人=1191182341 / 史莱姆=1191182338，两者都只挂 1 条）
})
