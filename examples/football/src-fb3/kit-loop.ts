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
const ROLL_MU = 0.06 // 滚动阻力系数：减速度 = 0.06·9.8 ≈ 0.59 m/s²（草地量级）
const FRICTION_LOSS = 0.9
const AIR_DRAG_K = 0.05 // 空气阻力速率（1/s）：v *= 1−0.05·dt
const SPIN_K = 0.15 // 竖直轴自旋（弧线球）衰减速率（1/s）
const SPIN_AIR_K = 0.02 // 水平轴自旋的空气衰减（1/s）——滚动分量靠摩擦约束，不能再额外衰减 // 消滑移冲量的耗能系数（<1 才真的耗能） // 每拍滚动摩擦
const MAGNUS_K = 0.03 // 马格努斯系数 a = K·(w×v)
const SETTLE_VY = 1.0 // 触地 |vy| 低于此 ⇒ 直接贴地不再弹
const REST_SPEED = 0.35
const GROUND_MU = 0.8 // 库仑摩擦系数（接触冲量与滑移的比值上限）
const SLIP_ROLL = 0.5 // 接触点滑移 < 此值视为纯滚动（m/s） // 贴地速度低于此 ⇒ 静止
const DRIBBLE_R = 2.4 // 保留：按键时的「有球」判定半径（射门/传球资格）
const TOUCH_R = 2.0 // 触球半径：球进到这个圈里才会被脚带到
const KEEP_R = 2.8 // 带球显示半径（只影响状态=5 的 HUD 反馈，不参与运动）
const TOUCH_BOOST = 0.7 // 触球后球速 = 玩家速度 + 常数（用固定差值而不是倍率：
// 倍率 1.15 在 5m/s 时要等球掉 1.5m/s（0.59m/s² ⇒ 2.5s）才触发下一脚，手感就是"高延时"）
const TOUCH_MIN_SPD = 2.0 // 玩家速度低于此值时用朝向兜底推一小步
const TOUCH_LIFT = 0.35 // 触球时给一点抬升，视觉上像被脚"点"了一下
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
  // ———— 玩家坐标（2026-10-30 定谳）————
  // 服务端 kitListen 用「按玩家序号取玩家 GUID → 玩家实体 → 角色列表 → [0] 位置」写 fbvx/fbvz/fbvy
  // （这条链抄自奇域资产中心复合节点「玩家，角色，关卡」，内部四步已反解确认）。
  // 内核只负责读；选项卡锁存实体 fbc_e 作为兜底（万一服务端链没拿到）。
  const carrierE = f.queryEntityByGuid(1082130445n)
  const srvX = f.getCustomVariable(carrierE, 'fbvx').asType('float')
  const srvZ = f.getCustomVariable(carrierE, 'fbvz').asType('float')
  const charE = f.getCustomVariable(carrierE, 'fbc_e').asType('entity')
  const pPxV = f.localVariable('float')
  const pPzV = f.localVariable('float')
  f.doubleBranch(
    f.greaterThan(f.addition(f._3dVectorModuloOperation(f.create3dVector(srvX, 0.0, srvZ)), 0.0), 0.01),
    () => {
      pPxV.set(srvX)
      pPzV.set(srvZ)
    },
    () => {
      f.doubleBranch(
        f.logicalNotOperation(f.equal(f.queryGuidByEntity(charE), 0n)),
        () => {
          const l = f.split3dVector(f.getEntityLocation(charE))
          pPxV.set(l.xComponent)
          pPzV.set(l.zComponent)
        },
        () => {
          pPxV.set(0.0)
          pPzV.set(0.0)
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
  // 步长标定（2026-10-30 数据：PHYSICS-DATA-REPORT 附录「时间膨胀 0.60×」）
  // 服务端写的 fb_dt 是 **Lua 帧时长**（≈0.04s@25Hz），而内核实际 66.5ms/拍 ⇒ 物理只跑到真实时间的 60%。
  // 两者都由客户端帧率驱动，比例稳定 ⇒ 用标定系数换算成"每内核 tick 的秒数"。
  // 标定方法：日志里 墙钟秒差 / tick 差 = 真实每拍秒数；实测 0.0665 / 0.04 ≈ 1.66。
  const DT_CALIB = 1.66
  const dtRaw = f.multiplication(
    f.getCustomVariable(carrier, 'fb_dt').asType('float'),
    DT_CALIB
  )
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

  // ———— 6 键复位（提到物理体之前，2026-10-30 三修）————
  // 之前它在物理体深处，日志 3426 里 kickNow=True、fb_key 读到 6，但球位置没变 ⇒ 疑为分支没进。
  // 移到最外层：只要本拍有新票且键值=6，无条件把球放到玩家正前方 1.5m。
  f.doubleBranch(
    f.logicalAndOperation(kickNow, f.equal(keyRaw, 6n)),
    () => {
      bx.set(f.addition(pPxV.value, f.multiplication(dirX, 1.5)))
      by.set(GROUND_Y)
      bz.set(f.addition(pPzV.value, f.multiplication(dirZ, 1.5)))
      vx.set(0.0)
      vy.set(0.0)
      vz.set(0.0)
      wx.set(0.0)
      wy.set(0.0)
      wz.set(0.0)
      mode.set(98n) // 诊断标记：98 = 6 键复位执行过（99 预留给旧位置，避免与历史日志混淆）
    },
    () => {}
  )

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
      // 触发条件用「球到**玩家**的距离」（2026-10-30 修）：原来用 distTarget（球到"玩家身前 1.3m 目标点"），
      // 等于要求球已经站在目标点上才允许带球 —— 日志 3426 实证：球在玩家 2.4m 内共 89 拍，
      // 带球状态 0 拍（球贴脚却永远不进入带球）。
      const ballToPlayerNow = f._3dVectorModuloOperation(
        f.create3dVector(f.subtraction(bx.value, pPxV.value), 0.0, f.subtraction(bz.value, pPzV.value))
      )
      // 触球式带球（2026-10-30 用户选型 B）：
      //   ① 带球区（HUD 用）：球在 KEEP_R 内且这一拍没按键 ⇒ 状态记 5
      //   ② 可触球：球在 TOUCH_R 内、球比玩家慢（说明球落后了、需要再带一脚）、玩家在动
      //   触球只给**一次冲量**，之后球走正常物理（摩擦/滚动/反弹），不再是"位置吸附"。
      const playerSpd = f._3dVectorModuloOperation(f.create3dVector(ffx.value, 0.0, ffz.value))
      const ballSpdH = f._3dVectorModuloOperation(f.create3dVector(vx.value, 0.0, vz.value))
      const inZone = f.logicalAndOperation(
        f.logicalNotOperation(kickNow),
        f.lessThan(ballToPlayerNow, KEEP_R)
      )
      const touch = f.logicalAndOperation(
        f.logicalNotOperation(kickNow),
        f.logicalAndOperation(
          canDribbleAfterTackle,
          f.logicalAndOperation(
            f.lessThan(ballToPlayerNow, TOUCH_R),
            f.logicalAndOperation(
              f.greaterThan(playerSpd, TOUCH_MIN_SPD),
              f.lessThan(ballSpdH, f.addition(playerSpd, 0.25))
            )
          )
        )
      )
      f.doubleBranch(
        touch,
        () => {
          // 触球方向 = **玩家速度方向**（比「玩家→球」的方向靠谱：球绕到侧面也会被带向前）
          const ux = f.division(ffx.value, playerSpd)
          const uz = f.division(ffz.value, playerSpd)
          const kickSpd = f.addition(playerSpd, TOUCH_BOOST)
          vx.set(f.multiplication(ux, kickSpd))
          vz.set(f.multiplication(uz, kickSpd))
          vy.set(TOUCH_LIFT)
          wx.set(f.division(vz.value, BALL_R))
          wy.set(0.0)
          wz.set(f.division(f.multiplication(vx.value, -1.0), BALL_R))
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
        f.logicalAndOperation(f.lessThan(ballToPlayer, 0.55), f.lessThan(vDotN, 0.0))
      )
      f.doubleBranch(
        f.logicalAndOperation(f.logicalNotOperation(touch), hitBody),
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
      // 触球式带球后，物理**每拍都跑**（不再有"带球帧跳过物理"这条旁路）
      const notDribble = f.logicalNotOperation(f.equal(1n, 2n))
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
          // 空气阻力/自旋衰减：**速率无关**（旧写法 ×0.995/拍 在 10Hz 与 26Hz 下差 2.6 倍）
          const airK = f.subtraction(1.0, f.multiplication(AIR_DRAG_K, dtv.value))
          vx.set(f.multiplication(vx.value, airK))
          vz.set(f.multiplication(vz.value, airK))
          // ⚠️ 2026-10-30 数据修正（PHYSICS-DATA-REPORT slot7：ω −44.9%/1.12s 而 v 只 −21%）
          // 滚动状态下 ω 必须跟着 v 走（ω=v/R），再额外乘 SPIN_K 就会「越滚越不转」。
          // ⇒ 只对**竖直轴自旋 wy**（弧线球的自旋）施加 SPIN_K；wx/wz 交给摩擦约束，只加很小的空气衰减。
          const spinAir = f.subtraction(1.0, f.multiplication(SPIN_AIR_K, dtv.value))
          wx.set(f.multiplication(wx.value, spinAir))
          wz.set(f.multiplication(wz.value, spinAir))
          wy.set(f.multiplication(wy.value, f.subtraction(1.0, f.multiplication(SPIN_K, dtv.value))))
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
          // ⚠️ 2026-10-30 定谳（符号错误）：接触点滑移对一次冲量的响应是**解耦**的
          //   Δs = (7/2)·a , (7/2)·b  （sympy 推导：sx2=vx+a+wz·R+2.5a 等）
          //   ⇒ 清零滑移所需 a = −(2/7)·sx、b = −(2/7)·sz。
          //   旧式子 a=γ(sx+2.5sz)/5.25 在 sx、sz 同号时给出**正号**冲量 ⇒ 每拍把滑移放大 3.3 倍 ⇒
          //   自旋与速度双双发散（日志 3425：无按键时速度 11.97→17.44、自旋 7→78 rad/s）。
          const a = f.division(f.multiplication(gamma.value, sx), -3.5)
          const b = f.division(f.multiplication(gamma.value, sz), -3.5)
          // 摩擦冲量带损耗（2026-10-30：实测球速每拍不衰减 —— 无损消滑移冲量把自旋能量
          // 全转成前进速度，球"越磨越快"；真实摩擦必须耗能 ⇒ 系数 0.9）
          const aD = f.multiplication(a, FRICTION_LOSS)
          const bD = f.multiplication(b, FRICTION_LOSS)
          vx.set(f.addition(vx.value, aD))
          vz.set(f.addition(vz.value, bD))
          wx.set(f.addition(wx.value, f.division(f.multiplication(-2.5, bD), BALL_R)))
          wz.set(f.addition(wz.value, f.division(f.multiplication(2.5, aD), BALL_R)))
          // 滚动阻力：**恒定减速度**（ROLL_MU·g），与帧率无关
          //   旧写法 v*=0.985/拍 在 10Hz 与 26Hz 下衰减速率差 2.6 倍，且几乎没有阻尼
          const spH = f._3dVectorModuloOperation(f.create3dVector(vx.value, 0.0, vz.value))
          const decel = f.multiplication(f.multiplication(ROLL_MU, GRAVITY), dtv.value)
          const keepF = f.localVariable('float')
          f.doubleBranch(
            f.greaterThan(spH, decel),
            () => {
              keepF.set(f.division(f.subtraction(spH, decel), spH))
            },
            () => {
              keepF.set(0.0)
            }
          )
          vx.set(f.multiplication(vx.value, keepF.value))
          vz.set(f.multiplication(vz.value, keepF.value))
          // ⚠️ 2026-10-30 真 bug 修复（日志 3439 slot5 实证）：
          //   静止判据原来只看**水平速度** |（vx,0,vz)| < 0.35 —— 于是「竖直下落到底」的球
          //   水平分量本来就是 0 ⇒ 触发这个分支 ⇒ vy 被清零 ⇒ **3m 自由落体落地后完全不反弹**
          //   （日志：y 3.23→0.27→0.25 后 v 恒 0，e=0.5 本该弹到 ~1.9m）。
          //   现在用**三维速度**判定静止，且竖直速度必须确实很小。
          const spG = f._3dVectorModuloOperation(
            f.create3dVector(vx.value, vy.value, vz.value)
          )
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
  // 载体跟随（2026-10-30 性能修复）：原来**每拍**都 complexCreationTeleport，
  // 15~27 次/秒的传送对引擎是重操作（重建空间索引 + 重绑 AI/技能）。
  // 改成「离玩家超过 1.5m 才传送」：载体只是算力中心，滞后 1.5m 无感；玩家静止时 0 次/秒。
  const carrierNow = f.split3dVector(f.getEntityLocation(f.getSelfEntity()))
  const carrierLag = f._3dVectorModuloOperation(
    f.create3dVector(
      f.subtraction(pPxV.value, carrierNow.xComponent),
      0.0,
      f.subtraction(pPzV.value, carrierNow.zComponent)
    )
  )
  f.doubleBranch(
    f.greaterThan(carrierLag, 1.5),
    () => {
      f.complexCreationTeleport(
        f.create3dVector(pPxV.value, CARRIER_Y, pPzV.value),
        f.create3dVector(0.0, 0.0, 0.0)
      )
    },
    () => {}
  )

  // ———— 降频回传（2026-10-30 负载修复）————
  // 服务端每收到一条 kit_state 要付：信号派发(6.7) + 变量读 + 运动器下发(51.7)。
  // 客户端物理继续按 15Hz 跑，但**回传改成隔一拍发一次**（≈7.5Hz），
  // 服务端负载直接减半；渲染设备时长 0.25s 足以覆盖 0.13s 的下发间隔。
  const sendEven = f.equal(
    f.subtraction(tick, f.multiplication(f.division(tick, 2n), 2n)),
    1n
  )
  f.doubleBranch(
    sendEven,
    () => {

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
  // （自检探针已移除：2026-10-30 11:0x 真机被负载踢出 —— 每拍多发 5 条 Q 探针 × 11 次图执行 = 基线的 33 倍。
  //   玩家位置链路的读数改由 kitListen 自己的 setCustomVariable 帧提供，不需要额外信号。）
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
    },
    () => {}
  )
})
