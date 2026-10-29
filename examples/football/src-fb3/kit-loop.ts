// @status: 物理内核 v2 完整版（2026-10-27：自旋/马格努斯/六态状态机/滚转/三踢法）
// fb3/kit-loop.ts —— 20008 造物技能图（1082130436）：**球物理内核（客户端算）**
//
// 分工：本图只在客户端算，算完通过 kit_state 交给服务端 kitRender（1073741828）施运动器。
//   · 弹道/自旋/滚转/带球全部在客户端积分（7.5Hz 实测拍频，dt=0.1333）
//   · 服务端只负责"演"：线性运动器补间 + 旋转运动器滚转（客户端不碰真实足球）
//
// 六态状态机（mode，随 kit_state 的 state 字段回传）：
//   0 Airborne   空中：重力 + 马格努斯 + 空气阻力
//   1 Bouncing   刚触地：法向反弹（e=0.5）+ 切向摩擦 + 自旋衰减
//   2 Sliding    贴地慢速滑行
//   3 Rolling    贴地滚动：滚动摩擦 0.985/拍，自旋 = v×up / r（纯滚动）
//   4 Rest       静止
//   5 DribbleControlled 带球：玩家 2.4m 内且球速 <8，速度混合 + 玩家速度前馈 + 纯滚动自旋
//
// 三种踢法（由 Lua 的 fb_key 选择，1/2/3 对应三个基础键）：
//   key=1 轻射 10m/s + 上挑 1.2，无旋
//   key=2 重射 16m/s + 上挑 2.0，侧旋 w=(0,10,0) ⇒ 马格努斯弧线
//   key=3 高吊  7m/s + 上抛 7.0，无旋
//
// 离线数值自检（同公式）：静止稳在脚前 1.30m；5.5m/s 跑动稳态落后 0.63m；
//   轻射落地后滚动衰减到静止；重射侧旋横向偏移 ~1.5m（KM=0.03）。改公式必须重跑自检。
//
// 真值：图 1082130436 / 技能配置 1191182341（丘丘人）/ 算力载体实体 1082130445
// 技能变量段 1207959553..568（16 槽，段外槽会让图运行期崩、日志零记录）
// 铁律：客户端参数序 (iD, list)；编译必须用 dist CLI；客户端无 print，遥测只走 kit_state
import { g } from 'genshin-ts/runtime/core'

import { chanIncr, chanSendState6 } from '../../client-kit/channels.js'
import { KitSignal } from './signals.js'

// ———— 技能变量槽（段内 553..568，16 个全部排满）————
const SLOT_TICK = 1207959557n // 拍号（chanIncr 自增）
const S_BX = 1207959553n // 球位置 x
const S_BY = 1207959554n // 球位置 y
const S_BZ = 1207959555n // 球位置 z
const S_VX = 1207959556n // 球速度 x
const S_VY = 1207959559n // 球速度 y
const S_VZ = 1207959560n // 球速度 z
const S_WX = 1207959558n // 自旋 x
const S_WY = 1207959565n // 自旋 y
const S_WZ = 1207959567n // 自旋 z
const S_MODE = 1207959562n // 状态机 0..5
const S_INIT = 1207959561n // 初始化标记（0=未初始化）
const S_LASTSEQ = 1207959564n // 已消费的输入序号（= 服务器 fb_seq）
const S_PPX = 1207959563n // 上拍玩家 x（差分算玩家速度）
const S_PPZ = 1207959566n // 上拍玩家 z
const S_COOLDOWN = 1207959568n // 抢断/解围后的带球抑制截止拍（tick < 它 ⇒ 球不吸附）

// ———— 输入源：服务器图 kitListen 挂在丘丘人实体上，fb_seq/fb_key 写在那儿 ————
const CARRIER_GUID = 1082130445n

// ———— 物理常数（7.5Hz 实测拍频标定）————
// 真实步长：载体技能 CD 让内核实际跑 14~27Hz，而固定按 7.5Hz 标定的 DT 会让模拟时间跑快 2~3.5 倍
// （用户 2026-10-29 体感「高吊球整个过程光速完成」）。服务端 kitListen 每秒校准一次写 fb_dt。
const DT_FALLBACK = 0.1333
const GRAVITY = 9.8
// 草皮表面 y≈0（场地线 y=0.01 / 门横梁 2.5 / 球初始 0.25 三处互证）。
// GROUND_Y 语义 = **球心贴地时的高度** = 表面 + 球半径 0.25（用户 2026-10-27 指出：漏算半径会半个球埋地）
const BALL_R = 0.25
const SURFACE_Y = 0.0
const GROUND_Y = SURFACE_Y + BALL_R
const MAX_SPEED = 18.0
const RESTITUTION = 0.5
const GROUND_FRICTION = 0.82 // 触地切向摩擦（事件型）
const AIR_DRAG = 0.995 // 每拍空气阻力
const ROLL_FRICTION = 0.985 // 每拍滚动摩擦
const SPIN_DECAY = 0.985 // 每拍自旋衰减（空中）
const SPIN_GROUND = 0.85 // 触地自旋衰减
const MAGNUS_K = 0.03 // 马格努斯系数 a = K·(w×v)
const SETTLE_VY = 1.0 // 触地 |vy| 低于此 ⇒ 直接贴地不再弹
const REST_SPEED = 0.35
const GROUND_MU = 0.8 // 库仑摩擦系数（接触冲量与滑移的比值上限）
const SLIP_ROLL = 0.5 // 接触点滑移 < 此值视为纯滚动（m/s） // 贴地速度低于此 ⇒ 静止
const ROLL_SPEED = 3.0 // 贴地速度高于此 ⇒ 进入滚动
const DRIBBLE_R = 2.4
const DRIBBLE_AHEAD = 1.3
// 带球跟随增益：每拍吃掉 55% 位置误差 ⇒ K = 0.55/dt（几何收敛，无过冲）
const DRIBBLE_FOLLOW = 0.55
// 带球增益每拍按真实步长折算（v = 0.55·ddx/dt + 前馈），见下方 vdesX/vdesZ
const PLAYER_SPEED_CAP = 8.0
const WARMUP_TICKS = 75n // 开局建图期不做物理
// 载体停放策略：**x/z 跟随玩家 + y 固定在支撑空模型内部**
//   · 距离节流是硬事实（用户多次强调，2026-10-27 再次纠正）：造物离玩家越远，技能施放越慢
//     （实测：贴人 7~8/s，飞离 10m 掉到 1~3/s）⇒ **必须跟随**，这也是当初做"跟随瞬移"的原因。
//   · y 不能读玩家位置求相对值（读回异常会浮到草地上，用户当场发现两次）⇒ 用常量。
//   · 常量取「草地地基」空模型 1077936161 的内部：实体 pos y=−5.5、scale y=1 ⇒ 占据 y∈[−5.5,−4.5]，
//     顶面 −4.5 就是草地表面。取 −5.1 = 顶面下 0.4m：有实体支撑、被地形遮住、离玩家 ≤1m 不掉频。
// 场地与球门（field.structure.json / goal.structure.json 实测）
const PITCH_X = 52.5 // 底线 x=±52.5（门线）
const PITCH_Z = 34.0 // 边线 z=±34
const GOAL_HALF = 3.6 // 门洞半宽（门柱局部 x 0.06..7.26 ⇒ 7.2 宽，实体在 z=±3.66 旋转后居中 z∈[−3.6,3.6]）
const GOAL_H = 2.5 // 横梁高
const POST_R = 0.35 // 门柱判定的碰撞半径（视觉柱径 0.12，留余量）
const WALL_REST = 0.6 // 边界反弹保留系数
const CENTER_Y = GROUND_Y // 球静止时的球心高度（表面 0 + 半径 0.25）

const CARRIER_Y = -4.21 // = 旧 -5.1 + 0.893（草地地基 y 由 -5.5→-4.607，保持同一相对埋深）

// 踢法：[水平速度, 上挑, 自旋Y]
const KICK_LIGHT_SPD = 10.0
const KICK_LIGHT_LIFT = 3.2
const KICK_HEAVY_SPD = 16.0
const KICK_HEAVY_LIFT = 4.5
const KICK_HEAVY_SPIN = 10.0
const KICK_LOB_SPD = 7.0
const KICK_LOB_LIFT = 9.0

g.creationSkill({ id: 1082130436, name: '_GSTS_kitLoop' }).on('start', (_evt: any, f: any) => {
  const tick = chanIncr(f, SLOT_TICK)

  // ———— 玩家位置：从载体实体变量读（服务端 kitRender 每拍写 fb_px/fb_pz）————
  // 不用 getListOfPlayerEntitiesOnTheField：那是玩家控制器实体，读位置恒 0（2026-10-17 定谳）。
  // ———— 玩家坐标（2026-10-29 四修）————
  // 固定 GUID 的「玩家模板实体」1086324737 是玩家侧锚点（v5 架构也用它挂 UI 事件与寄存器），
  // 角色实体是它的子实体 ⇒ 取子实体[0] 的坐标。玩家控制器实体本身坐标恒 (0,y,0)（日志 3416 实证），
  // 20008 图又拿不到 getCurrentCharacter 之类节点（编译期实测拒收），所以走这条固定 GUID 链。
  const carrierE = f.queryEntityByGuid(1082130445n)
  const playerE = f.queryEntityByGuid(1086324737n)
  const pSubs = f.getSubEntityList(playerE)
  const pSubLen = f.getListLength(pSubs)
  const pPxV = f.localVariable('float')
  const pPzV = f.localVariable('float')
  f.doubleBranch(
    f.greaterThan(pSubLen, 0n),
    () => {
      const l = f.split3dVector(
        f.getEntityLocation(f.getCorrespondingValueFromList(0n, pSubs))
      )
      pPxV.set(l.xComponent)
      pPzV.set(l.zComponent)
    },
    () => {
      // 兜底 1：选项卡锁存的角色实体（whenTabIsSelected 的 selectorEntity）
      const charE = f.getCustomVariable(carrierE, 'fbc_e').asType('entity')
      f.doubleBranch(
        f.logicalNotOperation(f.equal(f.queryGuidByEntity(charE), 0n)),
        () => {
          const l2 = f.split3dVector(f.getEntityLocation(charE))
          pPxV.set(l2.xComponent)
          pPzV.set(l2.zComponent)
        },
        () => {
          // 兜底 2：服务端写的 fbvx/fbvz（可能为 0，至少不会崩）
          pPxV.set(f.getCustomVariable(carrierE, 'fbvx').asType('float'))
          pPzV.set(f.getCustomVariable(carrierE, 'fbvz').asType('float'))
        }
      )
    }
  )
  // ———— 输入：fb_seq（有没有新输入）+ fb_key（哪一种踢法）————
  const carrier = f.queryEntityByGuid(CARRIER_GUID)
  const seqStd = f.getCustomVariable(carrier, 'fb_seq').asType('int')
  const seqSelf = f.getCustomVariable(f.getSelfEntity(), 'fb_seq').asType('int')
  const guidBigger = f.greaterThan(seqStd, seqSelf)
  const drv = f.localVariable('int')
  f.doubleBranch(
    guidBigger,
    () => {
      drv.set(seqStd)
    },
    () => {
      drv.set(seqSelf)
    }
  )
  const keyRaw = f.getCustomVariable(carrier, 'fb_key').asType('int')
  // 真实步长（服务端 kitListen 每秒校准写入；0 或越界时回退到 7.5Hz 标定值）
  const dtRaw = f.getCustomVariable(carrier, 'fb_dt').asType('float')
  const dtv = f.localVariable('float')
  f.doubleBranch(
    f.logicalAndOperation(f.greaterThan(dtRaw, 0.004), f.lessThan(dtRaw, 0.25)),
    () => {
      dtv.set(dtRaw)
    },
    () => {
      dtv.set(DT_FALLBACK)
    }
  )
  const lastSeq = f.dataTypeConversion(f.querySkillVariableValue(S_LASTSEQ), 'int')
  const kickNow = f.greaterThan(drv.value, lastSeq)

  // ———— 状态读入（技能变量 = 唯一真值）————
  const bx = f.localVariable('float')
  const by = f.localVariable('float')
  const bz = f.localVariable('float')
  const vx = f.localVariable('float')
  const vy = f.localVariable('float')
  const vz = f.localVariable('float')
  const wx = f.localVariable('float')
  const wy = f.localVariable('float')
  const wz = f.localVariable('float')
  const mode = f.localVariable('int')
  const inited = f.localVariable('float')
  const ffx = f.localVariable('float')
  const ffz = f.localVariable('float')
  const goalFlag = f.localVariable('int')
  bx.set(f.querySkillVariableValue(S_BX))
  by.set(f.querySkillVariableValue(S_BY))
  bz.set(f.querySkillVariableValue(S_BZ))
  vx.set(f.querySkillVariableValue(S_VX))
  vy.set(f.querySkillVariableValue(S_VY))
  vz.set(f.querySkillVariableValue(S_VZ))
  wx.set(f.querySkillVariableValue(S_WX))
  wy.set(f.querySkillVariableValue(S_WY))
  wz.set(f.querySkillVariableValue(S_WZ))
  mode.set(f.dataTypeConversion(f.querySkillVariableValue(S_MODE), 'int'))
  inited.set(f.querySkillVariableValue(S_INIT))
  ffx.set(0.0)
  ffz.set(0.0)
  goalFlag.set(0n)

  // ———— 玩家速度前馈（位置差分，>8m/s 视为瞬移置 0）————
  const vpVec = f.create3dVector(
    f.division(f.subtraction(pPxV.value, f.querySkillVariableValue(S_PPX)), dtv.value),
    0.0,
    f.division(f.subtraction(pPzV.value, f.querySkillVariableValue(S_PPZ)), dtv.value)
  )
  const vp = f.split3dVector(vpVec)
  const vpOK = f.logicalAndOperation(
    f.greaterThan(inited.value, 0.5),
    f.lessThan(f._3dVectorModuloOperation(vpVec), PLAYER_SPEED_CAP)
  )
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
  f.setSkillVariable(S_PPX, pPxV.value)
  f.setSkillVariable(S_PPZ, pPzV.value)

  // ———— 初始化：球放玩家前方 1.5m，静止 ————
  f.doubleBranch(
    f.lessThan(inited.value, 0.5),
    () => {
      bx.set(pPxV.value)
      by.set(GROUND_Y) // 地面基准用场地表面，不用玩家 y（玩家 origin ≈ 地面 +1.92m）
      bz.set(f.addition(pPzV.value, 1.5))
      vx.set(0.0)
      vy.set(0.0)
      vz.set(0.0)
      wx.set(0.0)
      wy.set(0.0)
      wz.set(0.0)
      mode.set(4n)
      f.setSkillVariable(S_INIT, 1.0)
    },
    () => {}
  )

  // 玩家→球水平单位向量（1e-4 保护：重合时方向退化，踢球失效但不炸）
  const dx = f.subtraction(bx.value, pPxV.value)
  const dz = f.subtraction(bz.value, pPzV.value)
  const horizLen = f.addition(f._3dVectorModuloOperation(f.create3dVector(dx, 0.0, dz)), 0.0001)
  const dirX = f.division(dx, horizLen)
  const dirZ = f.division(dz, horizLen)

  const warm = f.lessThanOrEqualTo(tick, WARMUP_TICKS)
  f.doubleBranch(
    warm,
    () => {
      // 暖机：球贴玩家前方跟随，速度清零
      bx.set(pPxV.value)
      by.set(GROUND_Y)
      bz.set(f.addition(pPzV.value, 1.5))
      vx.set(0.0)
      vy.set(0.0)
      vz.set(0.0)
      mode.set(4n)
    },
    () => {
      // ———— ① 动作分发（P0：有球=射门/传球，无球=抢断/解围/停球）————
      const ballToPlayer = f._3dVectorModuloOperation(
        f.create3dVector(f.subtraction(bx.value, pPxV.value), 0.0, f.subtraction(bz.value, pPzV.value))
      )
      const speedAct = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      const hasBall = f.logicalAndOperation(f.lessThan(ballToPlayer, DRIBBLE_R), f.lessThan(speedAct, 8.0))
      const cooldownNow = f.dataTypeConversion(f.querySkillVariableValue(S_COOLDOWN), 'int')
      const canDribbleAfterTackle = f.greaterThanOrEqualTo(tick, cooldownNow)

      f.doubleBranch(
        kickNow,
        () => {
          f.doubleBranch(
            hasBall,
            () => {
              // ——— 有球：五个键 = 五种出球 ———
              f.doubleBranch(
                f.equal(keyRaw, 1n),
                () => {
                  vx.set(f.multiplication(dirX, 10.0))
                  vz.set(f.multiplication(dirZ, 10.0))
                  vy.set(KICK_LIGHT_LIFT)
                  wy.set(0.0)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 2n),
                () => {
                  vx.set(f.multiplication(dirX, KICK_HEAVY_SPD))
                  vz.set(f.multiplication(dirZ, KICK_HEAVY_SPD))
                  vy.set(KICK_HEAVY_LIFT)
                  wy.set(10.0)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 3n),
                () => {
                  vx.set(f.multiplication(dirX, KICK_LOB_SPD))
                  vz.set(f.multiplication(dirZ, KICK_LOB_SPD))
                  vy.set(KICK_LOB_LIFT)
                  wy.set(0.0)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 4n),
                () => {
                  vx.set(f.multiplication(dirX, 12.0))
                  vz.set(f.multiplication(dirZ, 12.0))
                  vy.set(0.8)
                  wy.set(0.0)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 5n),
                () => {
                  // 弧线球：侧旋左右交替（按拍号奇偶）
                  const mod2 = f.dataTypeConversion(f.division(f.dataTypeConversion(tick, 'float'), 2.0), 'int')
                  const odd = f.equal(f.multiplication(mod2, 2n), tick)
                  const sign = f.localVariable('float')
                  f.doubleBranch(odd, () => { sign.set(1.0) }, () => { sign.set(-1.0) })
                  vx.set(f.multiplication(dirX, 14.0))
                  vz.set(f.multiplication(dirZ, 14.0))
                  vy.set(4.0)
                  wy.set(f.multiplication(sign.value, 14.0))
                },
                () => {}
              )
              mode.set(0n)
            },
            () => {
              // ——— 无球：抢断 / 解围 / 停球 ———
              f.doubleBranch(
                f.logicalAndOperation(f.equal(keyRaw, 1n), f.lessThan(ballToPlayer, 2.5)),
                () => {
                  vx.set(f.multiplication(dirX, 7.0))
                  vz.set(f.multiplication(dirZ, 7.0))
                  vy.set(4.0)
                  wy.set(0.0)
                  f.setSkillVariable(S_COOLDOWN, f.dataTypeConversion(f.addition(tick, 4n), 'float'))
                  mode.set(0n)
                },
                () => {}
              )
              f.doubleBranch(
                f.logicalAndOperation(f.equal(keyRaw, 2n), f.lessThan(ballToPlayer, 3.0)),
                () => {
                  vx.set(f.multiplication(dirX, 20.0))
                  vz.set(f.multiplication(dirZ, 20.0))
                  vy.set(5.0)
                  wy.set(0.0)
                  f.setSkillVariable(S_COOLDOWN, f.dataTypeConversion(f.addition(tick, 4n), 'float'))
                  mode.set(0n)
                },
                () => {}
              )
              f.doubleBranch(
                f.logicalAndOperation(
                  f.equal(keyRaw, 3n),
                  f.logicalAndOperation(f.lessThan(ballToPlayer, 2.5), f.greaterThan(speedAct, 6.0))
                ),
                () => {
                  vx.set(f.multiplication(vx.value, 0.12))
                  vz.set(f.multiplication(vz.value, 0.12))
                  vy.set(0.0)
                  wy.set(0.0)
                  mode.set(4n)
                },
                () => {}
              )
            }
          )
          f.setSkillVariable(S_LASTSEQ, f.dataTypeConversion(drv.value, 'float'))
        },
        () => {}
      )

      // ———— ② 带球判定 ————
      const speed0 = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      const onGround = f.lessThanOrEqualTo(by.value, f.addition(GROUND_Y, 0.03))
      const onGroundAfter = f.lessThanOrEqualTo(by.value, f.addition(GROUND_Y, 0.03))
      const tx = f.addition(pPxV.value, f.multiplication(dirX, DRIBBLE_AHEAD))
      const tz = f.addition(pPzV.value, f.multiplication(dirZ, DRIBBLE_AHEAD))
      const ddx = f.subtraction(tx, bx.value)
      const ddz = f.subtraction(tz, bz.value)
      const distTarget = f._3dVectorModuloOperation(
        f.create3dVector(ddx, f.subtraction(GROUND_Y, by.value), ddz)
      )
      const dribble = f.logicalAndOperation(
        f.logicalNotOperation(kickNow),
        f.logicalAndOperation(
          canDribbleAfterTackle,
          f.logicalAndOperation(f.lessThan(distTarget, DRIBBLE_R), f.lessThan(speed0, 8.0))
        )
      )
      f.doubleBranch(
        dribble,
        () => {
          // 带球：**位置式跟随**（2026-10-29 第二轮修「运动不正常/抖」）
          // 旧写法 v ← 0.45v + 0.55·(ddx·8 + ff) 是速度环套位置环，闭环增益 ≈ 0.586/拍
          // 外加 0.45 惯性 ⇒ 欠阻尼。真机日志 3411 实证：tick 81 速度 4.99，随后在 x≈−2.2 附近
          // 以 0.1~0.6 m/s 来回抖（过冲→回拉），玩家已走远球还留在原地打转。
          // 新写法：**每拍吃掉 55% 位置误差**（v = 0.55·ddx/dt + 玩家速度前馈），几何收敛、无过冲。
          const vdesX = f.addition(
            f.multiplication(ddx, f.division(DRIBBLE_FOLLOW, dtv.value)),
            ffx.value
          )
          const vdesZ = f.addition(
            f.multiplication(ddz, f.division(DRIBBLE_FOLLOW, dtv.value)),
            ffz.value
          )
          vx.set(vdesX)
          vy.set(0.0)
          vz.set(vdesZ)
          wx.set(f.division(vz.value, BALL_R))
          wy.set(0.0)
          wz.set(f.division(f.multiplication(vx.value, -1.0), BALL_R))
          // ⚠️ 2026-10-29 修复「球原地旋转」：位置积分原来只写在 notDribble 分支里，
          //   带球帧速度在变、位置却一动不动 ⇒ 球钉在原地按 spin 自转（试玩日志 3410 实证：
          //   tick 98→658 六个字段 pos 恒 (0,0.25,1.5)、vel 恒 (0,0,-1.6006)、state 恒 5）。
          //   带球帧是「球跟着玩家」的帧，必须自己推进位置；y 钉地面（带球不离开地面）。
          by.set(GROUND_Y)
          bx.set(f.addition(bx.value, f.multiplication(vx.value, dtv.value)))
          bz.set(f.addition(bz.value, f.multiplication(vz.value, dtv.value)))
          mode.set(5n)
        },
        () => {}
      )

      // ———— ②b 拦截（自动，无需按键）：球以 >6m/s 撞进 0.9m 且朝我飞来 ⇒ 沿法线反弹 ————
      const relLen = f.addition(ballToPlayer, 0.0001)
      const nX = f.division(f.subtraction(bx.value, pPxV.value), relLen)
      const nZ = f.division(f.subtraction(bz.value, pPzV.value), relLen)
      const vDotN = f.addition(f.multiplication(vx.value, nX), f.multiplication(vz.value, nZ))
      const hitBody = f.logicalAndOperation(
        f.greaterThan(speed0, 6.0),
        f.logicalAndOperation(f.lessThan(ballToPlayer, 0.9), f.lessThan(vDotN, 0.0))
      )
      f.doubleBranch(
        f.logicalAndOperation(f.logicalNotOperation(dribble), hitBody),
        () => {
          // v' = v − 1.6·(v·n)·n，再整体 0.7 衰减（身体挡球，不是满弹）
          vx.set(f.multiplication(f.subtraction(vx.value, f.multiplication(f.multiplication(vDotN, 1.6), nX)), 0.7))
          vz.set(f.multiplication(f.subtraction(vz.value, f.multiplication(f.multiplication(vDotN, 1.6), nZ)), 0.7))
          vy.set(f.multiplication(vy.value, 0.7))
          mode.set(1n)
        },
        () => {}
      )

      // ———— ③ 力与积分（非带球帧；每步独立守卫，扁平结构，避免深嵌套触发转换器问题）————
      const notDribble = f.logicalNotOperation(dribble)
      // 重力 + 马格努斯：非带球 且 在空中
      f.doubleBranch(
        f.logicalAndOperation(notDribble, f.logicalNotOperation(onGround)),
        () => {
          vy.set(f.subtraction(vy.value, f.multiplication(GRAVITY, dtv.value)))
          const magVec = f._3dVectorZoom(
            MAGNUS_K,
            f._3dVectorCrossProduct(
              f.create3dVector(wx.value, wy.value, wz.value),
              f.create3dVector(vx.value, vy.value, vz.value)
            )
          )
          const ms = f.split3dVector(magVec)
          vx.set(f.addition(vx.value, f.multiplication(ms.xComponent, dtv.value)))
          vy.set(f.addition(vy.value, f.multiplication(ms.yComponent, dtv.value)))
          vz.set(f.addition(vz.value, f.multiplication(ms.zComponent, dtv.value)))
        },
        () => {}
      )
      // 空气阻力 + 自旋衰减 + 位置积分
      f.doubleBranch(
        notDribble,
        () => {
          vx.set(f.multiplication(vx.value, AIR_DRAG))
          vz.set(f.multiplication(vz.value, AIR_DRAG))
          wx.set(f.multiplication(wx.value, SPIN_DECAY))
          wy.set(f.multiplication(wy.value, SPIN_DECAY))
          wz.set(f.multiplication(wz.value, SPIN_DECAY))
          bx.set(f.addition(bx.value, f.multiplication(vx.value, dtv.value)))
          by.set(f.addition(by.value, f.multiplication(vy.value, dtv.value)))
          bz.set(f.addition(bz.value, f.multiplication(vz.value, dtv.value)))
        },
        () => {}
      )
      // ④⑤ 接触模型（2026-10-29 重写：法向冲量 + 库仑摩擦 + 自旋耦合）
      //   旧实现三处硬伤：①摩擦只在 by<GROUND_Y 触发，而位置每拍被夹回地面 ⇒ 几乎不触发；
      //   ②滑行态完全不改自旋（用户实测「反弹后旋转不变、只有速度变」）；③反弹没有法向冲量参与摩擦上限。
      const grounded = f.lessThanOrEqualTo(by.value, f.addition(GROUND_Y, 0.01))
      f.doubleBranch(
        f.logicalAndOperation(notDribble, grounded),
        () => {
          by.set(GROUND_Y)
          const vyIn = vy.value
          const hitting = f.lessThan(vyIn, -SETTLE_VY)
          const jn = f.localVariable('float') // 法向冲量当量（m/s）：撞击=(1+e)|vy|，静息=g·dt
          f.doubleBranch(
            hitting,
            () => {
              vy.set(f.multiplication(vyIn, -RESTITUTION))
              jn.set(
                f.multiplication(f.multiplication(vyIn, -1.0), f.addition(1.0, RESTITUTION))
              )
              mode.set(1n)
            },
            () => {
              vy.set(0.0)
              jn.set(f.multiplication(GRAVITY, dtv.value))
            }
          )
          // 接触点滑移：v_slip = v + ω×r_c，r_c=(0,−R,0) ⇒ (vx + wz·R, 0, vz − wx·R)
          const sx = f.addition(vx.value, f.multiplication(wz.value, BALL_R))
          const sz = f.subtraction(vz.value, f.multiplication(wx.value, BALL_R))
          const slip = f._3dVectorModuloOperation(f.create3dVector(sx, 0.0, sz))
          // 库仑上限：γ = min(1, μ·jn / |slip|) —— 压力大（撞击）就抓得死，压力小就慢慢磨
          const gammaRaw = f.division(
            f.multiplication(GROUND_MU, jn.value),
            f.addition(slip, 0.001)
          )
          const gamma = f.localVariable('float')
          f.doubleBranch(
            f.greaterThan(gammaRaw, 1.0),
            () => {
              gamma.set(1.0)
            },
            () => {
              gamma.set(gammaRaw)
            }
          )
          // 消滑移冲量（实心球 I=2/5·mR² 解得）：a=(γ/5.25)(sx+2.5sz), b=(γ/5.25)(sz+2.5sx)
          const a = f.division(
            f.multiplication(gamma.value, f.addition(sx, f.multiplication(2.5, sz))),
            5.25
          )
          const b = f.division(
            f.multiplication(gamma.value, f.addition(sz, f.multiplication(2.5, sx))),
            5.25
          )
          vx.set(f.addition(vx.value, a))
          vz.set(f.addition(vz.value, b))
          wx.set(f.addition(wx.value, f.division(f.multiplication(-2.5, b), BALL_R)))
          wz.set(f.addition(wz.value, f.division(f.multiplication(2.5, a), BALL_R)))
          // 滚动阻力（地面接触始终存在）
          vx.set(f.multiplication(vx.value, ROLL_FRICTION))
          vz.set(f.multiplication(vz.value, ROLL_FRICTION))
          const spG = f._3dVectorModuloOperation(f.create3dVector(vx.value, 0.0, vz.value))
          f.doubleBranch(
            f.lessThan(spG, REST_SPEED),
            () => {
              vx.set(0.0)
              vy.set(0.0)
              vz.set(0.0)
              wx.set(0.0)
              wy.set(f.multiplication(wy.value, 0.9))
              wz.set(0.0)
              mode.set(4n)
            },
            () => {
              const sx2 = f.addition(vx.value, f.multiplication(wz.value, BALL_R))
              const sz2 = f.subtraction(vz.value, f.multiplication(wx.value, BALL_R))
              const slip2 = f._3dVectorModuloOperation(f.create3dVector(sx2, 0.0, sz2))
              f.doubleBranch(
                f.lessThan(slip2, SLIP_ROLL),
                () => {
                  mode.set(3n)
                },
                () => {
                  mode.set(2n)
                }
              )
            }
          )
        },
        () => {}
      )
      // ———— ⑦ 重置键：把球放回角色正前方 1.5m（测试用手感按钮）————
      f.doubleBranch(
        f.logicalAndOperation(kickNow, f.equal(keyRaw, 6n)),
        () => {
          bx.set(f.addition(pPxV.value, f.multiplication(dirX, 1.5)))
          by.set(f.addition(0.0, CENTER_Y))
          bz.set(f.addition(pPzV.value, f.multiplication(dirZ, 1.5)))
          vx.set(0.0)
          vy.set(0.0)
          vz.set(0.0)
          wx.set(0.0)
          wy.set(0.0)
          wz.set(0.0)
          mode.set(4n)
        },
        () => {}
      )

      // ———— ⑧ 进球判定：越过门线(|x|>52.5) + 门洞内(|z|<3.6) + 低于横梁(y<2.5) ————
      const overLine = f.greaterThan(f._3dVectorModuloOperation(f.create3dVector(bx.value, 0.0, 0.0)), PITCH_X - 0.05)
      const inMouth = f.lessThan(f._3dVectorModuloOperation(f.create3dVector(0.0, 0.0, bz.value)), GOAL_HALF)
      const underBar = f.lessThan(f.subtraction(by.value, SURFACE_Y), GOAL_H)
      const goalHit = f.logicalAndOperation(overLine, f.logicalAndOperation(inMouth, underBar))
      f.doubleBranch(
        goalHit,
        () => {
          goalFlag.set(1n)
          bx.set(0.0)
          by.set(CENTER_Y)
          bz.set(0.0)
          vx.set(0.0)
          vy.set(0.0)
          vz.set(0.0)
          mode.set(4n)
        },
        () => {}
      )

      // ———— ⑨ 门柱反弹：四根柱 (x=±52.5, z=±3.6)，命中就沿 z 弹开 ————
      const absX = f._3dVectorModuloOperation(f.create3dVector(bx.value, 0.0, 0.0))
      const postReach = f.addition(POST_R, BALL_R)
      const nearGoalX = f.lessThan(f._3dVectorModuloOperation(f.create3dVector(f.subtraction(absX, PITCH_X), 0.0, 0.0)), postReach)
      const atPostUp = f.lessThan(f._3dVectorModuloOperation(f.create3dVector(0.0, 0.0, f.subtraction(bz.value, GOAL_HALF))), postReach)
      const atPostDown = f.lessThan(f._3dVectorModuloOperation(f.create3dVector(0.0, 0.0, f.addition(bz.value, GOAL_HALF))), postReach)
      f.doubleBranch(
        f.logicalAndOperation(nearGoalX, f.logicalAndOperation(atPostUp, underBar)),
        () => {
          bz.set(f.subtraction(GOAL_HALF, f.multiplication(POST_R, 0.6)))
          vz.set(f.multiplication(vz.value, -WALL_REST))
          vx.set(f.multiplication(vx.value, 0.8))
          mode.set(1n)
        },
        () => {}
      )
      f.doubleBranch(
        f.logicalAndOperation(nearGoalX, f.logicalAndOperation(atPostDown, underBar)),
        () => {
          bz.set(f.addition(f.multiplication(GOAL_HALF, -1.0), f.multiplication(POST_R, 0.6)))
          vz.set(f.multiplication(vz.value, -WALL_REST))
          vx.set(f.multiplication(vx.value, 0.8))
          mode.set(1n)
        },
        () => {}
      )

      // ———— ⑩ 边界反弹：边线 z=±34 一律弹；底线 x=±52.5 只有「不在门洞内」才弹 ————
      f.doubleBranch(
        f.greaterThan(f._3dVectorModuloOperation(f.create3dVector(0.0, 0.0, bz.value)), f.subtraction(PITCH_Z, BALL_R)),
        () => {
          const signZ = f.localVariable('float')
          f.doubleBranch(f.greaterThan(bz.value, 0.0), () => { signZ.set(1.0) }, () => { signZ.set(-1.0) })
          bz.set(f.multiplication(signZ.value, f.subtraction(PITCH_Z, f.addition(BALL_R, 0.05))))
          vz.set(f.multiplication(vz.value, -WALL_REST))
          mode.set(1n)
        },
        () => {}
      )
      f.doubleBranch(
        f.logicalAndOperation(
          f.greaterThan(absX, f.subtraction(PITCH_X, BALL_R)),
          f.logicalNotOperation(f.logicalAndOperation(inMouth, underBar))
        ),
        () => {
          const signX = f.localVariable('float')
          f.doubleBranch(f.greaterThan(bx.value, 0.0), () => { signX.set(1.0) }, () => { signX.set(-1.0) })
          bx.set(f.multiplication(signX.value, f.subtraction(PITCH_X, f.addition(BALL_R, 0.1))))
          vx.set(f.multiplication(vx.value, -WALL_REST))
          mode.set(1n)
        },
        () => {}
      )

      // ⑥ 限速（防隧穿）
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

  // ———— 写回自持槽 ————
  f.setSkillVariable(S_BX, bx.value)
  f.setSkillVariable(S_BY, by.value)
  f.setSkillVariable(S_BZ, bz.value)
  f.setSkillVariable(S_VX, vx.value)
  f.setSkillVariable(S_VY, vy.value)
  f.setSkillVariable(S_VZ, vz.value)
  f.setSkillVariable(S_WX, wx.value)
  f.setSkillVariable(S_WY, wy.value)
  f.setSkillVariable(S_WZ, wz.value)
  f.setSkillVariable(S_MODE, f.dataTypeConversion(mode.value, 'float'))

  // ———— 载体停到地图最下方的固定点（只当算力中心，永不入镜）————
  // 用户 2026-10-27：y 必须固定死、不许出现在草地上（此前用「玩家 y−1.8」求相对高度，
  //   一旦玩家位置读回异常就会浮到地面）。⇒ 现在用**常量坐标**，不依赖任何读回值。
  // 频率读数（2026-10-27 18:13 试玩日志）：389 条 kitLoop / 53s ≈ 7.3/s，停在地下不影响施放频率。
  f.complexCreationTeleport(
    f.create3dVector(pPxV.value, CARRIER_Y, pPzV.value),
    f.create3dVector(0.0, 0.0, 0.0)
  )

  // ———— 每拍回传（服务端 kitRender 每拍驱一次运动器）————
  // pos=球位置 vel=球速度 spin=自旋 state=状态机 mode
  // 进球时额外发一条 tag='G'（服务端 kitRender 打 fb-goal，供离线判读）
  f.doubleBranch(
    f.equal(goalFlag.value, 1n),
    () => {
      chanSendState6(
        f,
        KitSignal.kit_state,
        'G',
        tick,
        f.create3dVector(bx.value, by.value, bz.value),
        f.create3dVector(0.0, 0.0, 0.0),
        f.create3dVector(0.0, 0.0, 0.0),
        0n
      )
    },
    () => {}
  )
  chanSendState6(
    f,
    KitSignal.kit_state,
    'B',
    tick,
    f.create3dVector(bx.value, by.value, bz.value),
    f.create3dVector(vx.value, vy.value, vz.value),
    f.create3dVector(wx.value, wy.value, wz.value),
    mode.value
  )
})
