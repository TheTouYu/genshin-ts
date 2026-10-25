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
// —— 球物理自持槽（与 kitBall 图共用同一批 id；技能变量按施放实例隔离）——
const BX = 1207959569n
const BY = 1207959570n
const BZ = 1207959571n
const BVX = 1207959572n
const BVY = 1207959573n
const BVZ = 1207959574n
const BTICK = 1207959575n
const BSTATE = 1207959576n
const DT = 0.0666
const GRAVITY = 9.81
const RADIUS = 0.11
const RESTITUTION = 0.55
const ROLL_FRICTION = 0.92
const AIR_DRAG = 0.999
const REST_SPEED = 0.05
const SLOT_PROBE = 1207959558n
// 隐藏层高度（世界 y）：草地表面 y≈0、草层厚 2.5m ⇒ -3 落在草下、玩家跳跃也顶不出来
const HIDDEN_Y = -3.0

g.creationSkill({ id: 1082130436, name: '_GSTS_kitLoop' }).on('start', (_evt: any, f: any) => {
  // ① 拍号：跨施放保持的 int（客户端自持，绝不依赖图内局部变量）
  const tick = chanIncr(f, SLOT_TICK)

  // ② 一拍"计算"（占位）：把拍号的 ×2 写进 probe 槽——先证明「能算能写能读」
  const probe = f.addition(tick, tick)
  // setSkillVariable 只收 float（写 int 会报「无效的值类型: float」）→ 显式转换
  chanWriteF(f, SLOT_PROBE, f.dataTypeConversion(probe, 'float'))
  const back = f.dataTypeConversion(chanReadF(f, SLOT_PROBE), 'int')

  // ③ 跟随载体（2026-10-24 用户要求：造物自动贴到玩家附近，否则距离节流把 15Hz 压到 0.1/s）
  //    多人（≤8 角色）：v1 取「场上玩家列表的第 0 位」——与服务端同一口径、各客户端一致；
  //    换策略（最近/持球者/轮换）时只改这一处：把 carrier 换成服务端登记在实体变量上的玩家。
  //    瞬移是客户端节点（complexCreationTeleport 只作用于本图所属造物），服务端无对应节点。
  // 载体来自**服务端**登记的实体变量 kit_carrier（多人时唯一权威；见 kit-follow.ts）
  // 目标点只由这个全局值决定 ⇒ 8 个客户端算出的目标相同 ⇒ 瞬移幂等、不会互相拉扯
  const selfE = f.getSelfEntity()
  const players = f.getListOfPlayerEntitiesOnTheField()
  const fallbackCarrier = f.getCorrespondingValueFromList(0n, players)
  const carrierVar = f.getCustomVariable(selfE, 'kit_carrier').asType('entity')
  // 守卫用 int 标志位（entity 与 int 不可直接比较，guid→int 转换不被支持）
  const hasCarrier = f.greaterThan(f.getCustomVariable(selfE, 'kit_has_carrier').asType('int'), 0n)
  // Y **固定**（2026-10-24 用户实测 bug：跟随玩家 y ⇒ 玩家一跳把造物顶出草地，露出来）。
  // 只跟 X/Z，Y 恒等于隐藏层高度 HIDDEN_Y；split3dVector 取分量（creation_skill 白名单有）。
  // ⚠️ 2026-10-25 起：位移由 kitBall（物理内核）接管，这里只保留载体判定，**不再 teleport**
  //    （两个图同时 teleport 同一造物会互相打架；kit-loop 只负责工况/探针）
  void hasCarrier
  void carrierVar
  void fallbackCarrier

  // ④ 回传一拍：pos/vel/spin 先填 0 向量（物理接入后改成真实状态）
  const zero = f.create3dVector(0, 0, 0)
  chanSendState6(f, KitSignal.kit_state, 'P', tick, zero, zero, zero, back)

  // ———— 球物理（R3-a 第一段）：重力 / 阻尼 / 积分 / 地面反弹与滚动摩擦 ————
  const bt0 = chanReadF(f, BTICK)
  chanWriteF(f, BTICK, f.addition(bt0, 1.0))
  const lpx = f.localVariable('float')
  const lpy = f.localVariable('float')
  const lpz = f.localVariable('float')
  const lvx2 = f.localVariable('float')
  const lvy2 = f.localVariable('float')
  const lvz2 = f.localVariable('float')
  const lst = f.localVariable('float')
  f.doubleBranch(
    f.lessThanOrEqualTo(bt0, 0.0),
    () => {
      // 第 0 拍：把造物当前所在位置播成自持初值，并给一个验证用初速度（斜抛）
      const p0 = f.split3dVector(f.getEntityLocation(f.getSelfEntity()))
      lpx.set(p0.xComponent)
      lpy.set(p0.yComponent)
      lpz.set(p0.zComponent)
      lvx2.set(2.0)
      lvy2.set(3.0)
      lvz2.set(0.5)
      lst.set(2.0)
    },
    () => {
      const bx = chanReadF(f, BX)
      const by = chanReadF(f, BY)
      const bz = chanReadF(f, BZ)
      const bvx = chanReadF(f, BVX)
      const bvy = chanReadF(f, BVY)
      const bvz = chanReadF(f, BVZ)
      const vyG = bvy - GRAVITY * DT
      const vxA = bvx * AIR_DRAG
      const vzA = bvz * AIR_DRAG
      lpx.set(bx + vxA * DT)
      lpy.set(by + vyG * DT)
      lpz.set(bz + vzA * DT)
      lvx2.set(vxA)
      lvy2.set(vyG)
      lvz2.set(vzA)
      lst.set(2.0)
      f.doubleBranch(
        f.lessThanOrEqualTo(lpy.value, RADIUS),
        () => {
          lpy.set(RADIUS)
          lvy2.set(0.0 - vyG * RESTITUTION)
          const vxRoll = vxA * ROLL_FRICTION
          const vzRoll = vzA * ROLL_FRICTION
          lvx2.set(vxRoll)
          lvz2.set(vzRoll)
          lst.set(1.0)
          f.doubleBranch(
            f.lessThanOrEqualTo(f._3dVectorModuloOperation(f.create3dVector(vxRoll, 0.0, vzRoll)), REST_SPEED),
            () => {
              lvx2.set(0.0)
              lvz2.set(0.0)
            },
            () => {}
          )
        },
        () => {}
      )
    }
  )
  chanWriteF(f, BX, lpx.value)
  chanWriteF(f, BY, lpy.value)
  chanWriteF(f, BZ, lpz.value)
  chanWriteF(f, BVX, lvx2.value)
  chanWriteF(f, BVY, lvy2.value)
  chanWriteF(f, BVZ, lvz2.value)
  chanWriteF(f, BSTATE, lst.value)
  f.complexCreationTeleport(f.create3dVector(lpx.value, lpy.value, lpz.value), f.create3dVector(0.0, 0.0, 0.0))
})
