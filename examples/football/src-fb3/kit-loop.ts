// @status: 物理内核 v1（2026-10-27；探针期结束，E1/E3/E4 结论已落档）
// fb3/kit-loop.ts —— 20008 造物技能图（1082130436）：**球物理内核 + Lua 输入消费**
//
// 本拍四件事（全在本图内，实测拍频 7.5Hz ⇒ dt=0.1333）：
//   ① 取输入：读载体实体自定义变量 `fb_seq`（服务器图 kitListen 收到 Lua 的 fb_input 后 +1）
//      —— 同时用「按 guid 查实体」和「自身实体」两条读法，取较大者驱动（真机未定哪条可靠）
//   ② 球物理：位置/速度自持积分（重力 9.8 / 地面反弹 0.5 / 地面摩擦 0.90 / 空气阻力 0.995 / 限速 14）
//   ③ 带球：球距目标点 <3.0m 且球速 <8 ⇒ 速度混合 v=0.45v+0.55vdes，
//      vdes = (目标−球)*8 + **玩家速度前馈**（玩家速度由位置差分得到，避免跑动时球掉队）
//      目标点 = 玩家位置 + （玩家→球水平方向）*1.3 + 高度 0.35
//   ④ 回传：每 8 拍 + 踢球当拍发 kit_state
//      pos=球位置 vel=球速度 spin=(驱动seq, 自身seq, guid seq) state=踢球次数
//
// 数值已离线自检（同一套公式跑 60 拍）：静止带球稳定停在脚前 1.30m；玩家 5.5m/s 跑动 max_lag<1m；
// 踢球 12m/s+3m/s 上抛后 2.7s 内衰减到 <1m/s（滚动摩擦）。改动公式后必须重跑这段自检。
//
// 真值：图 1082130436 / 技能配置 1191182338（cd 0.03 + 忽略公共冷却）/ 载体造物实体 1082130442
// 技能变量段 1207959553..568（16 槽，段外槽会让图运行期崩、日志零记录）
// 铁律：客户端参数序 (iD, list)；编译必须用 dist CLI；客户端无 print（白名单里没有），遥测只走 kit_state
import { g } from 'genshin-ts/runtime/core'

import { chanIncr, chanSendState6 } from '../../client-kit/channels.js'
import { KitSignal } from './signals.js'

// ———— 技能变量槽（段内 553..568）————
const SLOT_TICK = 1207959557n // 拍号（chanIncr 自增）
const S_BX = 1207959553n // 球位置 x
const S_BY = 1207959554n // 球位置 y
const S_BZ = 1207959555n // 球位置 z
const S_VX = 1207959556n // 球速度 x
const S_VY = 1207959559n // 球速度 y
const S_VZ = 1207959560n // 球速度 z
const S_LASTSEQ = 1207959564n // 已消费的输入序号（= 服务器 fb_seq）
const S_INIT = 1207959561n // 初始化标记（0=未初始化）
const S_KICKS = 1207959562n // 踢球次数（读数）
const S_PPX = 1207959563n // 上拍玩家位置 x（差分算玩家速度）
const S_PPY = 1207959565n // 上拍玩家位置 y
const S_PPZ = 1207959566n // 上拍玩家位置 z
// 备用：1207959567 / 1207959568

// ———— 载体 guid（本图挂在它身上；服务器图把 fb_seq 写在这个实体的自定义变量上）————
const CARRIER_GUID = 1082130442n

// ———— 物理常数（按 7.5Hz 实测拍频标定）————
const DT = 0.1333
const GRAVITY = 9.8
const GROUND_Y = -4.25 // 草地顶面 −4.5 + 真足球半高 ~0.25（球实体 1077936135 scale=0.25）
const KICK_SPEED = 12.0 // 踢球水平初速 m/s（每拍 1.6m）
const KICK_LIFT = 3.0 // 踢球竖直初速（小挑球）
const MAX_SPEED = 14.0
const RESTITUTION = 0.5
const GROUND_FRICTION = 0.9
const AIR_DRAG = 0.995
const DRIBBLE_R = 3.0
const DRIBBLE_AHEAD = 1.3
const DRIBBLE_GAIN = 8.0
const DRIBBLE_BLEND = 0.55
const PLAYER_SPEED_CAP = 8.0 // 差分噪声闸：超过这个速度视为瞬移，前馈置 0
const WARMUP_TICKS = 75n // 开局建图/建实体期间不做物理（用户 2026-10-27：等 5s）

g.creationSkill({ id: 1082130436, name: '_GSTS_kitLoop' }).on('start', (_evt: any, f: any) => {
  const tick = chanIncr(f, SLOT_TICK)

  // ———— 玩家位置（客户端参数序 (iD, list)）————
  const players = f.getListOfPlayerEntitiesOnTheField()
  const p0 = f.getCorrespondingValueFromList(0n, players)
  const pP = f.split3dVector(f.getEntityLocation(p0))

  // ———— 输入：载体实体变量 fb_seq（两条读法取较大者）————
  const carrier = f.queryEntityByGuid(CARRIER_GUID)
  const seqGuid = f.getCustomVariable(carrier, 'fb_seq').asType('int')
  const seqSelf = f.getCustomVariable(f.getSelfEntity(), 'fb_seq').asType('int')
  const guidBigger = f.greaterThan(seqGuid, seqSelf)
  // ⚠ 客户端 dataTypeConversion 不支持 bool→int/float（实测报错），选值一律走 doubleBranch 写局部变量
  const drv = f.localVariable('int')
  f.doubleBranch(
    guidBigger,
    () => {
      drv.set(seqGuid)
    },
    () => {
      drv.set(seqSelf)
    }
  )
  const lastSeq = f.dataTypeConversion(f.querySkillVariableValue(S_LASTSEQ), 'int')
  const kickNow = f.greaterThan(drv.value, lastSeq)

  // ———— 球状态（技能变量是唯一真值，不依赖 getEntityLocation(self)）————
  const bx = f.localVariable('float')
  const by = f.localVariable('float')
  const bz = f.localVariable('float')
  const vx = f.localVariable('float')
  const vy = f.localVariable('float')
  const vz = f.localVariable('float')
  const inited = f.localVariable('float')
  const ffx = f.localVariable('float')
  const ffz = f.localVariable('float')
  bx.set(f.querySkillVariableValue(S_BX))
  by.set(f.querySkillVariableValue(S_BY))
  bz.set(f.querySkillVariableValue(S_BZ))
  vx.set(f.querySkillVariableValue(S_VX))
  vy.set(f.querySkillVariableValue(S_VY))
  vz.set(f.querySkillVariableValue(S_VZ))
  inited.set(f.querySkillVariableValue(S_INIT))
  ffx.set(0.0)
  ffz.set(0.0)

  // 玩家速度前馈：vp = (p − pPrev)/dt，长度闸 8m/s（首拍 pPrev=0 会得到巨值 ⇒ 闸掉）
  const vpVec = f.create3dVector(
    f.division(f.subtraction(pP.xComponent, f.querySkillVariableValue(S_PPX)), DT),
    0.0,
    f.division(f.subtraction(pP.zComponent, f.querySkillVariableValue(S_PPZ)), DT)
  )
  const vpLen = f._3dVectorModuloOperation(vpVec)
  const vpOK = f.logicalAndOperation(f.greaterThan(inited.value, 0.5), f.lessThan(vpLen, PLAYER_SPEED_CAP))
  const vp = f.split3dVector(vpVec)
  f.doubleBranch(
    vpOK,
    () => {
      ffx.set(vp.xComponent)
      ffz.set(vp.zComponent)
    },
    () => {
      ffx.set(0.0)
      ffz.set(0.0)
    }
  )

  // 记本拍玩家位置（下一拍做差分）
  f.setSkillVariable(S_PPX, pP.xComponent)
  f.setSkillVariable(S_PPY, pP.yComponent)
  f.setSkillVariable(S_PPZ, pP.zComponent)

  // ———— 初始化：未初始化就把球放到玩家前方 1.5m ————
  f.doubleBranch(
    f.lessThan(inited.value, 0.5),
    () => {
      bx.set(pP.xComponent)
      by.set(f.addition(pP.yComponent, 0.5))
      bz.set(f.addition(pP.zComponent, 1.5))
      vx.set(0.0)
      vy.set(0.0)
      vz.set(0.0)
      f.setSkillVariable(S_INIT, 1.0)
    },
    () => {}
  )

  // 玩家→球的水平单位向量（1e-4 保护：球与玩家重合时方向退化为 0，踢球失效但不炸）
  const dx = f.subtraction(bx.value, pP.xComponent)
  const dz = f.subtraction(bz.value, pP.zComponent)
  const horizLen = f.addition(f._3dVectorModuloOperation(f.create3dVector(dx, 0.0, dz)), 0.0001)
  const dirX = f.division(dx, horizLen)
  const dirZ = f.division(dz, horizLen)

  const warm = f.lessThanOrEqualTo(tick, WARMUP_TICKS)
  f.doubleBranch(
    warm,
    () => {
      // 暖机：球贴在玩家前方跟随，不积分（此时建图未完成，teleport 无意义）
      bx.set(pP.xComponent)
      by.set(f.addition(pP.yComponent, 0.5))
      bz.set(f.addition(pP.zComponent, 1.5))
      vx.set(0.0)
      vy.set(0.0)
      vz.set(0.0)
    },
    () => {
      // ———— ① 踢球：输入序号变了 ⇒ 沿「玩家→球」水平方向给小挑球 ————
      f.doubleBranch(
        kickNow,
        () => {
          vx.set(f.multiplication(dirX, KICK_SPEED))
          vz.set(f.multiplication(dirZ, KICK_SPEED))
          vy.set(KICK_LIFT)
          f.setSkillVariable(S_LASTSEQ, f.dataTypeConversion(drv.value, 'float'))
          f.increaseSkillVariableValue(S_KICKS, 1.0)
        },
        () => {}
      )

      // ———— ② 带球：距离 + 低速 ⇒ 速度混合拉向「玩家前方 1.3m」并叠加玩家速度前馈 ————
      const tx = f.addition(pP.xComponent, f.multiplication(dirX, DRIBBLE_AHEAD))
      const tz = f.addition(pP.zComponent, f.multiplication(dirZ, DRIBBLE_AHEAD))
      const ty = f.addition(pP.yComponent, 0.35)
      const ddx = f.subtraction(tx, bx.value)
      const ddy = f.subtraction(ty, by.value)
      const ddz = f.subtraction(tz, bz.value)
      const distTarget = f._3dVectorModuloOperation(f.create3dVector(ddx, ddy, ddz))
      const speed0 = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      const dribble = f.logicalAndOperation(
        f.logicalNotOperation(kickNow),
        f.logicalAndOperation(f.lessThan(distTarget, DRIBBLE_R), f.lessThan(speed0, 8.0))
      )
      f.doubleBranch(
        dribble,
        () => {
          const vdesX = f.addition(f.multiplication(ddx, DRIBBLE_GAIN), ffx.value)
          const vdesY = f.multiplication(ddy, DRIBBLE_GAIN)
          const vdesZ = f.addition(f.multiplication(ddz, DRIBBLE_GAIN), ffz.value)
          const keep = 1.0 - DRIBBLE_BLEND
          vx.set(f.addition(f.multiplication(vx.value, keep), f.multiplication(vdesX, DRIBBLE_BLEND)))
          vy.set(f.addition(f.multiplication(vy.value, keep), f.multiplication(vdesY, DRIBBLE_BLEND)))
          vz.set(f.addition(f.multiplication(vz.value, keep), f.multiplication(vdesZ, DRIBBLE_BLEND)))
        },
        () => {}
      )

      // ———— ③ 积分（半隐式欧拉：先速度再位置）————
      vy.set(f.subtraction(vy.value, GRAVITY * DT))
      vx.set(f.multiplication(vx.value, AIR_DRAG))
      vz.set(f.multiplication(vz.value, AIR_DRAG))
      bx.set(f.addition(bx.value, f.multiplication(vx.value, DT)))
      by.set(f.addition(by.value, f.multiplication(vy.value, DT)))
      bz.set(f.addition(bz.value, f.multiplication(vz.value, DT)))

      // ———— ④ 地面：落地反弹 + 地面摩擦 ————
      f.doubleBranch(
        f.lessThan(by.value, GROUND_Y),
        () => {
          by.set(GROUND_Y)
          vy.set(f.multiplication(vy.value, -RESTITUTION))
          vx.set(f.multiplication(vx.value, GROUND_FRICTION))
          vz.set(f.multiplication(vz.value, GROUND_FRICTION))
        },
        () => {}
      )

      // ———— ⑤ 限速（每拍位移上限 ~1.9m，防隧穿）————
      const sp = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      f.doubleBranch(
        f.greaterThan(sp, MAX_SPEED),
        () => {
          const k = f.division(MAX_SPEED, sp)
          vx.set(f.multiplication(vx.value, k))
          vy.set(f.multiplication(vy.value, k))
          vz.set(f.multiplication(vz.value, k))
        },
        () => {}
      )
    }
  )

  // ———— 写回自持槽（跨施放保持）————
  f.setSkillVariable(S_BX, bx.value)
  f.setSkillVariable(S_BY, by.value)
  f.setSkillVariable(S_BZ, bz.value)
  f.setSkillVariable(S_VX, vx.value)
  f.setSkillVariable(S_VY, vy.value)
  f.setSkillVariable(S_VZ, vz.value)

  // ———— 载体自身藏到玩家脚下地下（只当算力中心，不再当球）————
  // 距离节流实测：飞离 10m ⇒ 施放掉到 1~3/s；藏在玩家正下方 1.8m ⇒ 距离 ~1.8m，频率不受影响。
  f.complexCreationTeleport(
    f.create3dVector(pP.xComponent, f.subtraction(pP.yComponent, 1.8), pP.zComponent),
    f.create3dVector(0.0, 0.0, 0.0)
  )

  // ———— 回传：**每拍一条**（服务端 kitRender 每拍用一条驱运动器，两拍之间由匀速设备补间）————
  // 载荷：pos=球位置 vel=球速度 spin=(拍长 dur, 自身 seq, guid seq) state=踢球次数
  const kicksI = f.dataTypeConversion(f.querySkillVariableValue(S_KICKS), 'int')
  f.doubleBranch(
    f.logicalOrOperation(f.equal(tick, tick), kickNow),
    () => {
      chanSendState6(
        f,
        KitSignal.kit_state,
        'B',
        tick,
        f.create3dVector(bx.value, by.value, bz.value),
        f.create3dVector(vx.value, vy.value, vz.value),
        f.create3dVector(
          DT,
          f.dataTypeConversion(seqSelf, 'float'),
          f.dataTypeConversion(seqGuid, 'float')
        ),
        kicksI
      )
    },
    () => {}
  )
})
