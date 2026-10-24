// @status: 新线（v3 客户端计算最小链路，2026-10-24）
// fb3/kit-loop.ts —— 20008 造物技能图（1082130436）：最小闭环 = 自持递增 + 回传一拍
//
// 目标（第一层，先要行为证据）：造物 AI 15Hz 施放 → 本图跑一拍 → 写技能变量（自持组）→
// 发 kit_state/'P' 回服务端。**不含物理**：物理内核下一步接（loop.ts 的 step 钩子）。
//
// 真值（`gsts assets:*` 回读，勿凭记忆改）：
//   图        1082130436 kit_loop（20008，assets:node-graphs create 分配）
//   技能配置   1191182338 kit_loop技能（28 模板 + 瞬发，body-f5 绑本图）
//   技能变量   1207959557..1207959568（12 个 kit_sN；总段 1207959553..568 共 16 个）
//   信号      kit_state（1610612744/745/746，6 参 vec3 形态）
//   造物      1082130442 水史莱姆（决策 1082130435／技能 #1=1191182337 为 zaowu 探针，本线另建）
//
// 铁律（本轮实测）：
//   · 图声明必须写在本文件顶层（库里的 g.* 不展开）
//   · 客户端参数序 (iD, list)；20008 无 getCurrentCharacter
//   · 编译必须用 dist CLI（`node dist/src/cli/gsts.js`），`npx tsx src/cli` ⇒ IR 恒 []
import { g } from 'genshin-ts/runtime/core'

import { chanIncr, chanReadF, chanSendState6, chanWriteF } from '../../client-kit/channels.js'
import { KitSignal } from './signals.js'

// 自持组（技能变量）：1207959557..568。本图只用 1 号位当拍号。
const SLOT_TICK = 1207959557n
const SLOT_PROBE = 1207959558n

g.creationSkill({ id: 1082130436, name: '_GSTS_kitLoop' }).on('start', (_evt: any, f: any) => {
  // ① 拍号：跨施放保持的 int（客户端自持，绝不依赖图内局部变量）
  const tick = chanIncr(f, SLOT_TICK)

  // ② 一拍"计算"（占位）：把拍号的 ×2 写进 probe 槽——先证明「能算能写能读」
  const probe = f.addition(tick, tick)
  // setSkillVariable 只收 float（写 int 会报「无效的值类型: float」）→ 显式转换
  chanWriteF(f, SLOT_PROBE, f.dataTypeConversion(probe, 'float'))
  const back = f.dataTypeConversion(chanReadF(f, SLOT_PROBE), 'int')

  // ③ 回传一拍：pos/vel/spin 先填 0 向量（物理接入后改成真实状态）
  const zero = f.create3dVector(0, 0, 0)
  chanSendState6(f, KitSignal.kit_state, 'P', tick, zero, zero, zero, back)
})
