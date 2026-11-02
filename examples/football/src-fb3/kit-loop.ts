// @status: 物理引擎 v3（2026-10-31 重写：固定 15Hz 步长 / 力-冲量管线 / 与渲染解耦）
// fb3/kit-loop.ts —— 20008 造物技能图（1082130436）：**球物理引擎**（客户端算，唯一物理真值源）
//
// ════════════════════════ 设计契约（改代码前必读）════════════════════════
// ① 时间：客户端造物图稳定 15 次/秒 ⇒ 一步 = 1/15 s。`dt` 从**球实体变量 fb_dt** 读
//    （默认 0.0666667，可调）；**不读 Lua 帧时长、不读服务端帧率**——渲染侧有自己的节奏
//    （kit-render 的 fb_dur），两边只通过 kit_state 的 pos/vel/spin 交接，互不引用。
// ② 参数：物理参数首拍从球实体 1077936135 的自定义变量读入技能变量（S_P_*），
//    缺失/为 0 时用本文件常量兜底（见 G_DEFAULT…）——不会因为变量没配就静默变 0。
//    另有 5 个「活参数」每拍从球实体读，改完下一拍立即生效：
//    fb_dt / fb_kick / fb_drib_kp / fb_drib_kd / fb_drib_r。
// ③ 管线（每拍顺序固定；速度改变只有两个入口：impulse=瞬时 Δv、force=加速度×dt）：
//      读状态 → 累积冲量（踢球/抢断/解围/停球/拦截）→ 施加冲量
//      → 累积力（重力 / 带球弹簧 / 马格努斯 / 外部施力）→ 空气阻力 → 限速
//      → 位置积分 → 碰撞求解（地面 TOI 子步 / 门柱圆截面 / 门线穿越 / 边界）
//      → 接触摩擦 + 滚动约束 + 静止 → 状态机 → 写回 + 回传
// ④ 外部施力通道：载体实体 1082130445 的变量 fb_fx/fb_fy/fb_fz（单位质量力 m/s²，每拍叠加）
//    —— 任何玩法系统/调试台都可以「直接施加力」，不必改本图。
// ⑤ 单一真值：球的位置/速度/自旋只在本图产生；服务端 kitRender 只做插值运动器，不持有物理。
//
// 六态状态机（mode 随 kit_state 回传，HUD 可读）：
//   0 Airborne 空中   1 Bouncing 刚触地   2 Sliding 贴地滑行（接触点有滑移）
//   3 Rolling 纯滚动  4 Rest 静止         5 Dribbling 带球助力中
//
// 键位（Lua fb-input.lua → 信号 fb_input → 服务端写载体 fb_seq/fb_key）：
//   有球（2.4m 内且球速<8）：1 轻射 10+3.2 / 2 重射 16+4.5+侧旋 / 3 高吊 7+9 /
//                            4 贴地传 12+0.8 / 5 弧线 14+4+交替侧旋 / 6 重置球到脚下
//   无球：1 抢断（2.5m 内 7+4）/ 2 解围（3m 内 14+5）/ 3 停球（2.5m 内且球速>6，吸掉 88% 速度）
//
// 真值：图 1082130436 / 技能配置 1191182341 / 算力载体实体 1082130445
// 铁律：客户端参数序 (iD, list)；编译必须用 dist CLI；客户端无 print，遥测只走 kit_state。
import { g } from 'genshin-ts/runtime/core'

import { chanIncr, chanSendState6 } from '../../client-kit/channels.js'
import { KitSignal } from './signals.js'

// ═════════════════════ 技能变量槽（段 1207959553..568 自持 16 槽全满）═════════════════
const SLOT_TICK = 1207959557n // 拍号（chanIncr 自增）
const S_BX = 1207959553n // 球位置 x
const S_BY = 1207959554n // 球位置 y
const S_BZ = 1207959555n // 球位置 z
const S_VX = 1207959556n
const S_WX = 1207959558n
const S_VY = 1207959559n
const S_VZ = 1207959560n
const S_INIT = 1207959561n // 初始化标记（0=未初始化）
const S_MODE = 1207959562n // 状态机 0..5
const S_PPX = 1207959563n // 上拍玩家 x（差分算玩家速度）
const S_LASTSEQ = 1207959564n // 已消费的输入序号（= 服务器 fb_seq）
const S_WY = 1207959565n
const S_PPZ = 1207959566n
const S_WZ = 1207959567n
const S_COOLDOWN = 1207959568n // 抢断/解围后的带球抑制截止拍
const S_SPINSIGN = 1207959570n // 弧线球侧旋方向（±1，逐次翻转；0=未初始化 ⇒ 取 +1）
// 外力脉冲门控（测试台图已删，569/571 两槽空出来给生产用）
const S_FSEQ = 1207959569n  // 已消费的 fb_f_seq
const S_FWIN = 1207959571n  // 剩余脉冲拍数
const PULSE_TICKS = 3n // 一次施力持续几拍

// 物理参数槽（首拍从球实体读一次，之后只用技能变量）
const S_P_G = 1207959572n
const S_P_E = 1207959573n
const S_P_MU = 1207959574n
const S_P_ROLL = 1207959575n
const S_P_SPIN = 1207959576n
const S_P_AIR = 1207959577n
const S_P_MAGNUS = 1207959578n
const S_P_MAXV = 1207959579n
const S_P_REST = 1207959580n
const S_P_INIT = 1207959581n

// ═════════════════════ 世界几何（field.structure.json / goal.structure.json 实测）═══════════
const BALL_R = 0.25
const SURFACE_Y = 0.0 // 草皮表面 y（场地线 y=0.01 / 门横梁 2.5 / 球初始 0.25 三处互证）
const GROUND_Y = SURFACE_Y + BALL_R // 球心贴地高度
const CENTER_Y = GROUND_Y
const PITCH_X = 52.5 // 底线（门线）
const PITCH_Z = 34.0 // 边线
const GOAL_HALF = 3.6 // 门柱中心 z（门洞 7.2m）
const GOAL_H = 2.5 // 横梁高
const POST_R = 0.06 // 门柱半径（视觉柱径 0.12）
const WALL_E = 0.6 // 边界/门柱反弹保留系数

// ═════════════════════ 默认参数（实体变量缺失时的兜底，绝不让 0 生效）═════════════════════
const DT_DEFAULT = 0.06666666666666667 // 1/15 s：客户端造物图稳定拍频
const G_DEFAULT = 9.8
const E_DEFAULT = 0.5 // 触地法向反弹
const MU_DEFAULT = 0.8 // 库仑摩擦系数（草皮量级）
const ROLL_DEFAULT = 0.06 // 滚动阻力系数：减速度 = 0.06·g ≈ 0.59 m/s²
const SPIN_DEFAULT = 0.15 // 竖直轴自旋（弧线）衰减速率 1/s
const AIR_DEFAULT = 0.05 // 空气阻力速率 1/s（水平与垂直都作用）
const MAGNUS_DEFAULT = 0.03 // 马格努斯系数 a = K·(ω×v)
const MAXV_DEFAULT = 18.0 // 限速 m/s
const REST_DEFAULT = 0.35 // 静止阈值 m/s
const KICK_DEFAULT = 1.0 // 踢球力度倍率（活参数）
// 面板力度硬边界（内核侧夹）：面板图只做累加，实测连按 14 次 → 3.8，
// 水平冲量 38 m/s 被限速夹到 18 而自旋按 38 算 ⇒ 球打滑注能、越跑越快。
// ⚠️ 上限必须 ≤ 球实体 fb_maxv/K1_SPD（22/10 = 2.2），否则超出部分完全无效：
//    实测力度 1.01/1.18/1.42 → 球速 10.1/11.8/14.2（= 10×力度，线性），
//    而 1.88/2.63/3.8 → 全部锁死 18.02（撞限速），只有自旋还在涨。
const POW_MIN = 0.2
const POW_MAX = 2.2
// 踢球自旋 = (冲量/R) × SLIP。纯滚动=1.0；0.7 让「力度撞限速」时刚好接近纯滚动，
// 力度小则自旋偏慢（球先滑后滚，摩擦让它转起来），永远不会出现自旋 > 滚动（那会注能）。
const KICK_SPIN_SLIP = 0.7
const DRIB_KP_DEFAULT = 45.0 // 带球弹簧刚度 1/s²
const DRIB_KD_DEFAULT = 12.0 // 带球相对速度阻尼 1/s
const DRIB_R_DEFAULT = 2.0 // 带球助力半径 m

const DRIB_AHEAD = 1.0 // 带球目标点：玩家前方多远
const DRIB_AMAX = 30.0
const DRIB_VMAX = 4.0 // 带球助力给球的目标速度上限（相对玩家速度，m/s） // 带球助力加速度上限 m/s²（≈3g，追得上但不会瞬移）
const SLIP_ROLL = 0.5 // 接触点滑移 < 此值视为纯滚动 m/s
const SETTLE_VY = 1.0 // 触地 |vy| 低于此值 ⇒ 直接贴地不再弹
const CONTACT_EPS = 0.02 // 贴地判定余量 m
const WARMUP_TICKS = 75n // 开局建图期不做物理
const DRIBBLE_R = 2.4 // 「有球」判定半径（踢球资格）
const KICK_GATE_SPD = 8.0 // 「有球」判定球速上限
const PLAYER_SPEED_CAP = 8.0 // 玩家速度上限（超过视为瞬移，置 0）
const PLAYER_JUMP = 1.5 // 单拍玩家位移超过此值 = 瞬移（不产生速度）
const CARRIER_GUID = 1082130445n
const BALL_GUID = 1077936135n
const CARRIER_Y = -4.21 // 载体停放高度（草地地基内部，永不入镜）

// 五种出球：[水平速度, 上挑, 侧旋]
const K1_SPD = 10.0
const K1_LIFT = 3.2
const K2_SPD = 16.0
const K2_LIFT = 4.5
const K2_SPIN = 10.0
const K3_SPD = 7.0
const K3_LIFT = 9.0
const K4_SPD = 12.0
const K4_LIFT = 0.8
const K5_SPD = 14.0
const K5_LIFT = 4.0
const K5_SPIN = 14.0

g.creationSkill({ id: 1082130436, name: '_GSTS_kitLoop' }).on('start', (_evt: any, f: any) => {
  const tick = chanIncr(f, SLOT_TICK)
  const ballE = f.queryEntityByGuid(BALL_GUID)

  // ═════════════ 1. 参数：首拍从球实体读入技能变量（缺失/为 0 ⇒ 兜底常量）═════════════
  f.doubleBranch(
    f.lessThan(f.dataTypeConversion(f.querySkillVariableValue(S_P_INIT), 'int'), 1n),
    () => {
      const pG = f.getCustomVariable(ballE, 'fb_g').asType('float')
      f.doubleBranch(f.greaterThan(pG, 0.1), () => { f.setSkillVariable(S_P_G, pG) }, () => { f.setSkillVariable(S_P_G, G_DEFAULT) })
      const pE = f.getCustomVariable(ballE, 'fb_e').asType('float')
      f.doubleBranch(f.greaterThan(pE, 0.01), () => { f.setSkillVariable(S_P_E, pE) }, () => { f.setSkillVariable(S_P_E, E_DEFAULT) })
      const pMu = f.getCustomVariable(ballE, 'fb_mu').asType('float')
      f.doubleBranch(f.greaterThan(pMu, 0.01), () => { f.setSkillVariable(S_P_MU, pMu) }, () => { f.setSkillVariable(S_P_MU, MU_DEFAULT) })
      const pRoll = f.getCustomVariable(ballE, 'fb_roll').asType('float')
      f.doubleBranch(f.greaterThan(pRoll, 0.001), () => { f.setSkillVariable(S_P_ROLL, pRoll) }, () => { f.setSkillVariable(S_P_ROLL, ROLL_DEFAULT) })
      const pSpin = f.getCustomVariable(ballE, 'fb_spin').asType('float')
      f.doubleBranch(f.greaterThan(pSpin, 0.001), () => { f.setSkillVariable(S_P_SPIN, pSpin) }, () => { f.setSkillVariable(S_P_SPIN, SPIN_DEFAULT) })
      const pAir = f.getCustomVariable(ballE, 'fb_air').asType('float')
      f.doubleBranch(f.greaterThan(pAir, 0.001), () => { f.setSkillVariable(S_P_AIR, pAir) }, () => { f.setSkillVariable(S_P_AIR, AIR_DEFAULT) })
      const pMag = f.getCustomVariable(ballE, 'fb_magnus').asType('float')
      f.doubleBranch(f.greaterThan(pMag, 0.001), () => { f.setSkillVariable(S_P_MAGNUS, pMag) }, () => { f.setSkillVariable(S_P_MAGNUS, MAGNUS_DEFAULT) })
      const pMax = f.getCustomVariable(ballE, 'fb_maxv').asType('float')
      f.doubleBranch(f.greaterThan(pMax, 1.0), () => { f.setSkillVariable(S_P_MAXV, pMax) }, () => { f.setSkillVariable(S_P_MAXV, MAXV_DEFAULT) })
      const pRest = f.getCustomVariable(ballE, 'fb_rest').asType('float')
      f.doubleBranch(f.greaterThan(pRest, 0.01), () => { f.setSkillVariable(S_P_REST, pRest) }, () => { f.setSkillVariable(S_P_REST, REST_DEFAULT) })
      f.setSkillVariable(S_P_INIT, 1.0)
    },
    () => {}
  )
  const G = f.querySkillVariableValue(S_P_G)
  const E = f.querySkillVariableValue(S_P_E)
  const MU = f.querySkillVariableValue(S_P_MU)
  const ROLL = f.querySkillVariableValue(S_P_ROLL)

  // ═════════════ 2. 活参数（每拍读球实体，改完下一拍立即生效）═══════════════════════════
  const dtRaw = f.getCustomVariable(ballE, 'fb_dt').asType('float')
  const dt = f.localVariable('float')
  f.doubleBranch(
    f.logicalAndOperation(f.greaterThan(dtRaw, 0.02), f.lessThan(dtRaw, 0.2)),
    () => { dt.set(dtRaw) },
    () => { dt.set(DT_DEFAULT) }
  )
  const kickRaw = f.getCustomVariable(ballE, 'fb_kick').asType('float')
  const km = f.localVariable('float')  // = fb_kick × 面板力度
  f.doubleBranch(f.greaterThan(kickRaw, 0.05), () => { km.set(kickRaw) }, () => { km.set(KICK_DEFAULT) })
  const kpRaw = f.getCustomVariable(ballE, 'fb_drib_kp').asType('float')
  const kp = f.localVariable('float')
  f.doubleBranch(f.greaterThan(kpRaw, 0.5), () => { kp.set(kpRaw) }, () => { kp.set(DRIB_KP_DEFAULT) })
  const kdRaw = f.getCustomVariable(ballE, 'fb_drib_kd').asType('float')
  const kd = f.localVariable('float')
  f.doubleBranch(f.greaterThan(kdRaw, 0.1), () => { kd.set(kdRaw) }, () => { kd.set(DRIB_KD_DEFAULT) })
  const drRaw = f.getCustomVariable(ballE, 'fb_drib_r').asType('float')
  const dribR = f.localVariable('float')
  f.doubleBranch(f.greaterThan(drRaw, 0.3), () => { dribR.set(drRaw) }, () => { dribR.set(DRIB_R_DEFAULT) })

  // ═════════════ 3. 输入：玩家位置（服务端每拍写 fbvx/fbvz；兜底读角色实体）══════════════
  const carrierE = f.queryEntityByGuid(CARRIER_GUID)
  const srvX = f.getCustomVariable(carrierE, 'fbvx').asType('float')
  const srvZ = f.getCustomVariable(carrierE, 'fbvz').asType('float')
  const charE = f.getCustomVariable(carrierE, 'fbc_e').asType('entity')
  // 优先级（2026-10-31 翻面）：**客户端读角色实体 > 服务端写变量 > 冻结上一拍**。
  // 理由：服务端写→客户端读至少晚 1 拍（0.133s）；`fbc_e` 是服务端在玩家选中球选项卡时写一次的
  // **角色实体句柄**，客户端拿 `getEntityLocation` 每拍自己读 = 0 延时（20008 白名单允许
  // getEntityLocation，但不允许 getCurrentCharacter / getCharacterEntityOfSpecifiedPlayer，
  // 所以句柄只能由服务端给一次，位置查询搬到客户端）。
  // 两个来源都失效时**冻结上一拍位置**，绝不回 0：回 0 会让带球目标点跳到中圈、把球吸走。
  const pPxV = f.localVariable('float')
  const pPzV = f.localVariable('float')
  pPxV.set(f.querySkillVariableValue(S_PPX))
  pPzV.set(f.querySkillVariableValue(S_PPZ))
  const posSrc = f.localVariable('int')
  posSrc.set(0n)
  // 判据用**官方节点**「查询实体是否在场」（`queryIfEntityIsOnTheField`：角色实体即使倒下也算在场）。
  // 曾经的错误：用 `queryGuidByEntity(charE) != 0` 当有效性——角色实体是运行时动态初始化的，
  // GUID 恒 0（D724/PKC 口径），于是客户端直读整条被废掉；也错在拿位置量级当判据（玩家站在
  // 原点时位置就是 (0,0)，那是真值不是垃圾）。
  const charOK = f.queryIfEntityIsOnTheField(charE)
  f.doubleBranch(
    charOK,
    () => {
      const cLoc = f.split3dVector(f.getEntityLocation(charE))
      pPxV.set(cLoc.xComponent)
      pPzV.set(cLoc.zComponent)
      posSrc.set(1n)
    },
    () => {}
  )
  const srvLen = f._3dVectorModuloOperation(f.create3dVector(srvX, 0.0, srvZ))
  f.doubleBranch(
    f.logicalAndOperation(f.equal(posSrc.value, 0n), f.greaterThan(srvLen, 0.01)),
    () => {
      pPxV.set(srvX)
      pPzV.set(srvZ)
      posSrc.set(2n)
    },
    () => {}
  )

  // 玩家速度：位置差分 / dt（服务端每拍写 ⇒ 不存在隔拍混叠；单拍位移过大判瞬移）
  const pdx = f.subtraction(pPxV.value, f.querySkillVariableValue(S_PPX))
  const pdz = f.subtraction(pPzV.value, f.querySkillVariableValue(S_PPZ))
  const pstep = f._3dVectorModuloOperation(f.create3dVector(pdx, 0.0, pdz))
  const vpxV = f.localVariable('float')
  const vpzV = f.localVariable('float')
  f.doubleBranch(
    f.logicalAndOperation(
      f.greaterThan(f.querySkillVariableValue(S_INIT), 0.5),
      f.lessThan(pstep, PLAYER_JUMP)
    ),
    () => {
      vpxV.set(f.division(pdx, dt.value))
      vpzV.set(f.division(pdz, dt.value))
    },
    () => {
      vpxV.set(0.0)
      vpzV.set(0.0)
    }
  )
  // 速度限幅（瞬移以外的异常大速度也不许把球带飞）
  const pSpdRaw = f._3dVectorModuloOperation(f.create3dVector(vpxV.value, 0.0, vpzV.value))
  f.doubleBranch(
    f.greaterThan(pSpdRaw, PLAYER_SPEED_CAP),
    () => {
      const k = f.division(PLAYER_SPEED_CAP, pSpdRaw)
      vpxV.set(f.multiplication(vpxV.value, k))
      vpzV.set(f.multiplication(vpzV.value, k))
    },
    () => {}
  )
  f.setSkillVariable(S_PPX, pPxV.value)
  f.setSkillVariable(S_PPZ, pPzV.value)

  // ═════════════ 4. 输入：按键票（服务端写载体 fb_seq/fb_key）═══════════════════════════
  const seqStd = f.getCustomVariable(carrierE, 'fb_seq').asType('int')
  const drv = f.localVariable('int')
  drv.set(seqStd)
  const keyRaw = f.getCustomVariable(carrierE, 'fb_key').asType('int')
  // ⚠️ 多消费点必须物化：kickNow 在「动作分支 / 踢球自旋 / 拦截 / 带球助力」四处被消费，
  //   而本图会在动作分支里写回 S_LASTSEQ。数据节点是**执行到才求值**的——若 kickNow 直接
  //   引用 `querySkillVariableValue(S_LASTSEQ)`，后三处会读到刚写入的新值 ⇒ 恒 false。
  //   实测指纹：踢球当拍自旋块被跳过，球速 10m/s 但 spin 恒 (0,0,0)，落地靠摩擦才转起来。
  const lastSeqV = f.localVariable('int')
  lastSeqV.set(f.dataTypeConversion(f.querySkillVariableValue(S_LASTSEQ), 'int'))
  const kickNow = f.greaterThan(drv.value, lastSeqV.value)

  // 外部施力通道（载体变量，单位质量力 m/s²）
  // ⚠️ 做成**脉冲**：服务端每次施力会把 fb_f_seq 自增；内核只在该序号变化后的 PULSE_TICKS 拍内
  //    真的施加，其余拍当作 0。教训（日志 3454）：外力常驻会让球在滚动/飞行中一直加速——
  //    实测 vx 从 −3.6 线性涨到 −17.76（−8 m/s²），肉眼就是"球自己往左飘"。
  const extFx = f.getCustomVariable(carrierE, 'fb_fx').asType('float')
  const extFy = f.getCustomVariable(carrierE, 'fb_fy').asType('float')
  const extFz = f.getCustomVariable(carrierE, 'fb_fz').asType('float')
  const fSeqNow = f.getCustomVariable(carrierE, 'fb_f_seq').asType('int') // 已是 int，别再转（int→int 被拒）
  const fSeqLast = f.dataTypeConversion(f.querySkillVariableValue(S_FSEQ), 'int')
  const fWinLast = f.dataTypeConversion(f.querySkillVariableValue(S_FWIN), 'int')
  const fWin = f.localVariable('int')
  f.doubleBranch(
    f.logicalNotOperation(f.equal(fSeqNow, fSeqLast)),
    () => {
      fWin.set(PULSE_TICKS)
      f.setSkillVariable(S_FSEQ, f.dataTypeConversion(fSeqNow, 'float'))
    },
    () => {
      f.doubleBranch(
        f.greaterThan(fWinLast, 0n),
        () => { fWin.set(f.subtraction(fWinLast, 1n)) },
        () => { fWin.set(0n) }
      )
    }
  )
  f.setSkillVariable(S_FWIN, f.dataTypeConversion(fWin.value, 'float'))

  // ═════════════ 5. 状态读入（技能变量 = 唯一真值）═══════════════════════════════════════
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
  const goalFlag = f.localVariable('int')
  const resetFlag = f.localVariable('int')
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
  goalFlag.set(0n)
  resetFlag.set(0n)

  // ═════════════ 6. 初始化：球放玩家前方 1.5m，静止 ═══════════════════════════════════════
  f.doubleBranch(
    f.lessThan(inited.value, 0.5),
    () => {
      bx.set(pPxV.value)
      by.set(GROUND_Y)
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

  const warm = f.lessThanOrEqualTo(tick, WARMUP_TICKS)
  f.doubleBranch(
    f.logicalNotOperation(warm),
    () => {
      // ═══════════ 7. 架势：玩家速度向量与瞄准方向 ═══════════
      const pSpd = f._3dVectorModuloOperation(f.create3dVector(vpxV.value, 0.0, vpzV.value))
      // 球相对玩家的水平向量（dir = 玩家→球）
      const bpx = f.subtraction(bx.value, pPxV.value)
      const bpz = f.subtraction(bz.value, pPzV.value)
      const distBP = f._3dVectorModuloOperation(f.create3dVector(bpx, 0.0, bpz))
      const dirX = f.division(bpx, f.addition(distBP, 0.0001))
      const dirZ = f.division(bpz, f.addition(distBP, 0.0001))
      // 瞄准 = **角色朝向**（用户 2026-10-31 口径）：把 (0,0,1) 绕 Y 旋 yaw 度得到世界前向。
      // 兜底：yaw 无效（0 且球在身后）时退回「玩家→球」，避免开局朝向未就绪时踢空。
      const yawDeg = f.getCustomVariable(carrierE, 'fb_yaw').asType('float')
      const fwdV = f._3dVectorRotation(
        f.create3dVector(0.0, 0.0, 1.0),
        f.create3dVector(0.0, yawDeg, 0.0)
      )
      const fwdS = f.split3dVector(fwdV)
      const rightV = f._3dVectorRotation(
        f.create3dVector(1.0, 0.0, 0.0),
        f.create3dVector(0.0, yawDeg, 0.0)
      )
      const rightS = f.split3dVector(rightV)
      const aimX = f.localVariable('float')
      const aimZ = f.localVariable('float')
      // 面板：力度倍率 + 右偏/上偏（m/s），latch 在载体变量上，点一次永久生效。
      // ⚠️ 边界夹在**内核侧**（面板图只累加不夹）：实测连按 14 次 +0.2 → powT=3.8，
      //    水平冲量 38 m/s 被限速夹到 18，而自旋按 38 算（152 rad/s，纯滚动只需 72）
      //    ⇒ 接触点滑移 20 m/s，摩擦把滑移转成动能，球越跑越快（实测 vz 17.99→19.01）。
      const powRaw = f.getCustomVariable(carrierE, 'fb_t_pow').asType('float')
      const powT = f.localVariable('float')
      f.doubleBranch(
        f.lessThan(powRaw, POW_MIN),
        () => { powT.set(POW_MIN) },
        () => {
          f.doubleBranch(
            f.greaterThan(powRaw, POW_MAX),
            () => { powT.set(POW_MAX) },
            () => { powT.set(powRaw) }
          )
        }
      )
      const offR = f.getCustomVariable(carrierE, 'fb_t_right').asType('float')
      const offU = f.getCustomVariable(carrierE, 'fb_t_up').asType('float')
      f.doubleBranch(
        f.greaterThan(f._3dVectorModuloOperation(fwdV), 0.5),
        () => {
          aimX.set(fwdS.xComponent)
          aimZ.set(fwdS.zComponent)
        },
        () => {
          aimX.set(dirX)
          aimZ.set(dirZ)
        }
      )
      // 踢球方向 = 前向×力度倍率 + 右轴×右偏（m/s）；带球目标仍用单位 aim（距离不随力度变）
      const kickX = f.addition(
        f.multiplication(aimX.value, powT.value),
        f.multiplication(rightS.xComponent, offR)
      )
      const kickZ = f.addition(
        f.multiplication(aimZ.value, powT.value),
        f.multiplication(rightS.zComponent, offR)
      )

      // ═══════════ 8. 冲量累加器 + 动作分发 ═══════════
      const impX = f.localVariable('float')
      const impY = f.localVariable('float')
      const impZ = f.localVariable('float')
      impX.set(0.0)
      impY.set(0.0)
      impZ.set(0.0)
      const ballSpd0 = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      const hasBall = f.logicalAndOperation(
        f.lessThan(distBP, DRIBBLE_R),
        f.lessThan(ballSpd0, KICK_GATE_SPD)
      )

      f.doubleBranch(
        kickNow,
        () => {
          // —— 6 号键：重置球到脚下（物理结束后统一执行，避免本拍穿越判定拿到跳变）——
          f.doubleBranch(f.equal(keyRaw, 6n), () => { resetFlag.set(1n) }, () => {})
          // —— 有球：五种出球（冲量 = Δv，方向 = 瞄准）——
          f.doubleBranch(
            hasBall,
            () => {
              f.doubleBranch(
                f.equal(keyRaw, 1n),
                () => {
                  impX.set(f.multiplication(kickX, f.multiplication(K1_SPD, km.value)))
                  impZ.set(f.multiplication(kickZ, f.multiplication(K1_SPD, km.value)))
                  impY.set(f.multiplication(K1_LIFT, km.value))
                  wy.set(0.0)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 2n),
                () => {
                  impX.set(f.multiplication(kickX, f.multiplication(K2_SPD, km.value)))
                  impZ.set(f.multiplication(kickZ, f.multiplication(K2_SPD, km.value)))
                  impY.set(f.multiplication(K2_LIFT, km.value))
                  wy.set(K2_SPIN)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 3n),
                () => {
                  impX.set(f.multiplication(kickX, f.multiplication(K3_SPD, km.value)))
                  impZ.set(f.multiplication(kickZ, f.multiplication(K3_SPD, km.value)))
                  impY.set(f.multiplication(K3_LIFT, km.value))
                  wy.set(0.0)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 4n),
                () => {
                  impX.set(f.multiplication(kickX, f.multiplication(K4_SPD, km.value)))
                  impZ.set(f.multiplication(kickZ, f.multiplication(K4_SPD, km.value)))
                  impY.set(f.multiplication(K4_LIFT, km.value))
                  wy.set(0.0)
                },
                () => {}
              )
              f.doubleBranch(
                f.equal(keyRaw, 5n),
                () => {
                  // 弧线球：侧旋方向逐次翻转（存 S_SPINSIGN，初值 0 ⇒ 取 +1）
                  const signOld = f.querySkillVariableValue(S_SPINSIGN)
                  const signNew = f.localVariable('float')
                  f.doubleBranch(
                    f.greaterThan(signOld, 0.0),
                    () => { signNew.set(-1.0) },
                    () => { signNew.set(1.0) }
                  )
                  f.setSkillVariable(S_SPINSIGN, signNew.value)
                  impX.set(f.multiplication(kickX, f.multiplication(K5_SPD, km.value)))
                  impZ.set(f.multiplication(kickZ, f.multiplication(K5_SPD, km.value)))
                  impY.set(f.multiplication(K5_LIFT, km.value))
                  wy.set(f.multiplication(signNew.value, K5_SPIN))
                },
                () => {}
              )
              // 力度同时放大竖直（力度大 ⇒ 又高又远）：修前 powT 只作用水平，
              // 调力度只得到「更快更打滑」，球照样贴地滑 —— 手感像换了台机器不是加了力气。
              impY.set(f.multiplication(impY.value, powT.value))
              // 面板竖直偏移（上偏，m/s）：点一次永久生效，之后每脚都带。绝对量，不被力度放大。
              impY.set(f.addition(impY.value, offU))
              // —— 踢球自旋：由**本拍冲量**推出（不读回写后的 vx/vz；旧的独立块要二次消费
              //    kickNow，会被「本拍写回 S_LASTSEQ」污染 ⇒ 实测踢出 10m/s 但 spin 恒 0）——
              // ⚠️ 乘 KICK_SPIN_SLIP：踢球瞬间球是**打滑**的，不是纯滚动。纯滚动 ω=imp/R 在
              //    力度被限速夹住时给出远超实际的角速度（38/0.25=152，实际 18/0.25=72），
              //    接触点滑移 20 m/s ⇒ 库仑摩擦把滑移转成动能 ⇒ 球越跑越快、突破限速。
              wx.set(f.multiplication(f.division(impZ.value, BALL_R), KICK_SPIN_SLIP))
              wz.set(
                f.multiplication(
                  f.division(f.multiplication(impX.value, -1.0), BALL_R),
                  KICK_SPIN_SLIP
                )
              )
            },
            () => {
              // —— 无球：抢断 / 解围 / 停球 ——
              f.doubleBranch(
                f.logicalAndOperation(f.equal(keyRaw, 1n), f.lessThan(distBP, 2.5)),
                () => {
                  impX.set(f.multiplication(kickX, 7.0))
                  impZ.set(f.multiplication(kickZ, 7.0))
                  impY.set(4.0)
                  f.setSkillVariable(S_COOLDOWN, f.dataTypeConversion(f.addition(tick, 4n), 'float'))
                },
                () => {}
              )
              f.doubleBranch(
                f.logicalAndOperation(f.equal(keyRaw, 2n), f.lessThan(distBP, 3.0)),
                () => {
                  impX.set(f.multiplication(kickX, 14.0))
                  impZ.set(f.multiplication(kickZ, 14.0))
                  impY.set(5.0)
                  f.setSkillVariable(S_COOLDOWN, f.dataTypeConversion(f.addition(tick, 4n), 'float'))
                },
                () => {}
              )
              f.doubleBranch(
                f.logicalAndOperation(
                  f.equal(keyRaw, 3n),
                  f.logicalAndOperation(f.lessThan(distBP, 2.5), f.greaterThan(ballSpd0, 6.0))
                ),
                () => {
                  // 停球 = 反冲量（吸掉 88% 速度），不是直接改速度
                  impX.set(f.multiplication(vx.value, -0.88))
                  impY.set(f.multiplication(vy.value, -0.88))
                  impZ.set(f.multiplication(vz.value, -0.88))
                  wy.set(0.0)
                },
                () => {}
              )
            }
          )
          f.setSkillVariable(S_LASTSEQ, f.dataTypeConversion(drv.value, 'float'))
        },
        () => {}
      )

      // 施加冲量
      vx.set(f.addition(vx.value, impX.value))
      vy.set(f.addition(vy.value, impY.value))
      vz.set(f.addition(vz.value, impZ.value))
      // —— 拦截（自动）：高速球撞进身体 0.9m 且朝我飞来 ⇒ 沿法线反弹 0.7 ——
      const relLen = f.addition(distBP, 0.0001)
      const nX = f.division(f.subtraction(bx.value, pPxV.value), relLen)
      const nZ = f.division(f.subtraction(bz.value, pPzV.value), relLen)
      const vDotN = f.addition(f.multiplication(vx.value, nX), f.multiplication(vz.value, nZ))
      const hitBody = f.logicalAndOperation(
        f.greaterThan(f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value)), 6.0),
        f.logicalAndOperation(f.lessThan(distBP, 0.55), f.lessThan(vDotN, 0.0))
      )
      f.doubleBranch(
        f.logicalAndOperation(hitBody, f.logicalNotOperation(kickNow)),
        () => {
          vx.set(f.multiplication(f.subtraction(vx.value, f.multiplication(f.multiplication(vDotN, 1.6), nX)), 0.7))
          vz.set(f.multiplication(f.subtraction(vz.value, f.multiplication(f.multiplication(vDotN, 1.6), nZ)), 0.7))
          vy.set(f.multiplication(vy.value, 0.7))
        },
        () => {}
      )

      // ═══════════ 9. 力累加器：重力 / 带球弹簧 / 马格努斯 / 外部施力 ═══════════
      const accX = f.localVariable('float')
      const accY = f.localVariable('float')
      const accZ = f.localVariable('float')
      // 外力只在脉冲窗口内生效（窗口外当作 0），重力始终在
      f.doubleBranch(
        f.greaterThan(fWin.value, 0n),
        () => {
          accX.set(extFx)
          accY.set(f.subtraction(extFy, G))
          accZ.set(extFz)
        },
        () => {
          accX.set(0.0)
          accY.set(f.multiplication(G, -1.0))
          accZ.set(0.0)
        }
      )
      const groundedBefore = f.lessThanOrEqualTo(by.value, f.addition(GROUND_Y, 0.05))

      // 带球助力（弹簧-阻尼，力而不是速度改写 ⇒ 没有速度悬崖）：
      // 只在落地、未踢球、球没飞走时生效；目标点 = 玩家前方 1.0m
      const ballSpdNow = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      const assistOn = f.logicalAndOperation(
        f.logicalAndOperation(f.logicalNotOperation(kickNow), groundedBefore),
        f.logicalAndOperation(
          f.lessThan(distBP, dribR.value),
          f.lessThan(ballSpdNow, f.addition(pSpd, 3.0))
        )
      )
      f.doubleBranch(
        assistOn,
        () => {
          // 一阶跟随（不是弹簧-阻尼）：7.5Hz 下 kp=45/kd=12 的显式积分会自激——实测
          // tick217..220 球速每拍翻号（1.13→−0.75→1.72→−0.73），玩家站着球在原地抖。
          //   desiredV = 玩家速度 + clamp(误差·posGain, ±DRIB_VMAX)
          //   a        = (desiredV − 球速)/tau        （tau≈0.3s ⇒ 每拍走 44%，无过冲）
          const tX = f.addition(pPxV.value, f.multiplication(aimX.value, DRIB_AHEAD))
          const tZ = f.addition(pPzV.value, f.multiplication(aimZ.value, DRIB_AHEAD))
          const errX = f.subtraction(tX, bx.value)
          const errZ = f.subtraction(tZ, bz.value)
          const posGain = f.division(kp.value, 10.0)
          const tau = f.addition(0.2, f.division(kd.value, 100.0))
          const dvxRaw = f.multiplication(errX, posGain)
          const dvzRaw = f.multiplication(errZ, posGain)
          const dvx = f.localVariable('float')
          const dvz = f.localVariable('float')
          f.doubleBranch(f.greaterThan(dvxRaw, DRIB_VMAX), () => { dvx.set(DRIB_VMAX) }, () => {
            f.doubleBranch(f.lessThan(dvxRaw, -DRIB_VMAX), () => { dvx.set(-DRIB_VMAX) }, () => { dvx.set(dvxRaw) })
          })
          f.doubleBranch(f.greaterThan(dvzRaw, DRIB_VMAX), () => { dvz.set(DRIB_VMAX) }, () => {
            f.doubleBranch(f.lessThan(dvzRaw, -DRIB_VMAX), () => { dvz.set(-DRIB_VMAX) }, () => { dvz.set(dvzRaw) })
          })
          const aX = f.division(f.subtraction(f.addition(vpxV.value, dvx.value), vx.value), tau)
          const aZ = f.division(f.subtraction(f.addition(vpzV.value, dvz.value), vz.value), tau)
          const am = f._3dVectorModuloOperation(f.create3dVector(aX, 0.0, aZ))
          const sc = f.localVariable('float')
          f.doubleBranch(
            f.greaterThan(am, DRIB_AMAX),
            () => { sc.set(f.division(DRIB_AMAX, am)) },
            () => { sc.set(1.0) }
          )
          accX.set(f.addition(accX.value, f.multiplication(aX, sc.value)))
          accZ.set(f.addition(accZ.value, f.multiplication(aZ, sc.value)))
        },
        () => {}
      )

      // 马格努斯：只在空中（a = K·ω×v）
      f.doubleBranch(
        f.logicalNotOperation(groundedBefore),
        () => {
          // 马格努斯只取**竖直轴自旋 wy**（弧线/香蕉球）：a = K·(ŷ·wy)×v = K·wy·(vz, 0, −vx)
          // 不让滚动自旋 wx/wz 参与气动力：15Hz 下贴地滚动 ω=v/R≈40rad/s，K=0.03 会给出
          // ~12m/s² 的"砸地"力（旧测试台 slot2 漏清 wz 时球被吹到 6.59m 就是同一机制）。
          const magK = f.multiplication(f.querySkillVariableValue(S_P_MAGNUS), wy.value)
          accX.set(f.addition(accX.value, f.multiplication(magK, vz.value)))
          accZ.set(f.subtraction(accZ.value, f.multiplication(magK, vx.value)))
        },
        () => {}
      )

      // ═══════════ 10. 积分：v += a·dt → 空气阻力 → 限速 → x += v̄·dt ═══════════
      // 位置用「施力前/后速度平均」（二阶）：纯重力下等价于 x += v·dt + ½a·dt²，
      // 15Hz 的弹道高度误差从 22% 降到 ~2%（旧实现半隐式欧拉，每次弹跳都偏矮）。
      const vxPre = vx.value
      const vyPre = vy.value
      const vzPre = vz.value
      vx.set(f.addition(vx.value, f.multiplication(accX.value, dt.value)))
      vy.set(f.addition(vy.value, f.multiplication(accY.value, dt.value)))
      vz.set(f.addition(vz.value, f.multiplication(accZ.value, dt.value)))
      const airK = f.subtraction(1.0, f.multiplication(f.querySkillVariableValue(S_P_AIR), dt.value))
      vx.set(f.multiplication(vx.value, airK))
      vy.set(f.multiplication(vy.value, airK))
      vz.set(f.multiplication(vz.value, airK))
      // 自旋：wx/wz 交给接触约束（这里只加很小的空气衰减），wy 是弧线自旋
      wx.set(f.multiplication(wx.value, airK))
      wz.set(f.multiplication(wz.value, airK))
      wy.set(f.multiplication(wy.value, f.subtraction(1.0, f.multiplication(f.querySkillVariableValue(S_P_SPIN), dt.value))))
      // 限速在**位置积分前**（旧实现放在最后 ⇒ 20m/s 的解围球先走 1.33m 再被夹）
      const spPre = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      f.doubleBranch(
        f.greaterThan(spPre, f.querySkillVariableValue(S_P_MAXV)),
        () => {
          const kMax = f.division(f.querySkillVariableValue(S_P_MAXV), spPre)
          vx.set(f.multiplication(vx.value, kMax))
          vy.set(f.multiplication(vy.value, kMax))
          vz.set(f.multiplication(vz.value, kMax))
        },
        () => {}
      )
      // 位置快照（TOI / 门线穿越都用它），速度保持不变
      const bx0 = bx.value
      const by0 = by.value
      const bz0 = bz.value
      const vyIn = vy.value
      const halfDt = f.multiplication(dt.value, 0.5)
      bx.set(f.addition(bx0, f.multiplication(f.addition(vxPre, vx.value), halfDt)))
      by.set(f.addition(by0, f.multiplication(f.addition(vyPre, vy.value), halfDt)))
      bz.set(f.addition(bz0, f.multiplication(f.addition(vzPre, vz.value), halfDt)))

      // ═══════════ 11. 地面接触（含 TOI 子步：消除穿透与「反弹漏重力」）═══════════
      const jn = f.localVariable('float')
      const contact = f.localVariable('int') // 0=空中 1=静息接触 2=撞击
      jn.set(0.0)
      contact.set(0n)
      const belowGround = f.lessThan(by.value, GROUND_Y)
      const vyAbs = f._3dVectorModuloOperation(f.create3dVector(0.0, vy.value, 0.0))
      const hardHit = f.logicalAndOperation(
        belowGround,
        f.logicalAndOperation(f.lessThan(vy.value, 0.0), f.greaterThan(vyAbs, SETTLE_VY))
      )
      f.doubleBranch(
        hardHit,
        () => {
          // 撞击时刻 t* = (y0 − 地面) / (y0 − y1)，只在本拍内，用解析式代替子步循环
          const denom = f.subtraction(by0, by.value)
          const tRaw = f.division(f.subtraction(by0, GROUND_Y), f.addition(denom, 0.0001))
          const tHit = f.localVariable('float')
          f.doubleBranch(
            f.lessThan(tRaw, 0.0),
            () => { tHit.set(0.0) },
            () => {
              f.doubleBranch(
                f.greaterThan(tRaw, 1.0),
                () => { tHit.set(1.0) },
                () => { tHit.set(tRaw) }
              )
            }
          )
          // 撞击时刻的速度：v(t*) = v_拍末 − a·dt·(1−t*)（重力还在往下加，不能拿拍末速度当撞击速度）
          // ⚠️ 必须先物化：vyHit 被 vyOut 与 jn 两处消费，而中间有 `vy.set(vyOut)`；
          //   延迟求值会让 jn 读到反弹后的 vy ⇒ jn 负 ⇒ gamma 负 ⇒ 摩擦加能量（实测弹跳 +20~29%）。
          const vyHitV = f.localVariable('float')
          vyHitV.set(f.subtraction(vy.value, f.multiplication(f.multiplication(accY.value, dt.value), f.subtraction(1.0, tHit.value))))
          const vyOut = f.multiplication(f.multiplication(vyHitV.value, -1.0), E)
          by.set(f.addition(GROUND_Y, f.multiplication(f.multiplication(vyOut, dt.value), f.subtraction(1.0, tHit.value))))
          vy.set(vyOut)
          jn.set(f.multiplication(f.multiplication(vyHitV.value, -1.0), f.addition(1.0, E)))
          contact.set(2n)
        },
        () => {}
      )
      f.doubleBranch(
        f.logicalAndOperation(
          f.logicalNotOperation(hardHit),
          f.lessThanOrEqualTo(by.value, f.addition(GROUND_Y, CONTACT_EPS))
        ),
        () => {
          by.set(GROUND_Y)
          vy.set(0.0)
          jn.set(f.multiplication(G, dt.value))
          contact.set(1n)
        },
        () => {}
      )

      // ═══════════ 12. 接触摩擦（法向冲量 + 库仑上限 + 自旋耦合）═══════════════════
      //   Δslip = 3.5·J ⇒ 零化滑移需要 J = −s/3.5；库仑上限 |J| ≤ μ·jn ⇒ γ = min(1, 3.5·μ·jn/|s|)
      //   （旧实现漏了 3.5，实际摩擦只有 μ/3.5 —— 真机滑行减速 2.10m/s² 的指纹）
      f.doubleBranch(
        f.greaterThan(contact.value, 0n),
        () => {
          const sx = f.addition(vx.value, f.multiplication(wz.value, BALL_R))
          const sz = f.subtraction(vz.value, f.multiplication(wx.value, BALL_R))
          const slip = f._3dVectorModuloOperation(f.create3dVector(sx, 0.0, sz))
          const gRaw = f.division(
            f.multiplication(f.multiplication(3.5, MU), jn.value),
            f.addition(slip, 0.001)
          )
          const gamma = f.localVariable('float')
          f.doubleBranch(f.greaterThan(gRaw, 1.0), () => { gamma.set(1.0) }, () => { gamma.set(gRaw) })
          const aD = f.division(f.multiplication(gamma.value, sx), -3.5)
          const bD = f.division(f.multiplication(gamma.value, sz), -3.5)
          vx.set(f.addition(vx.value, aD))
          vz.set(f.addition(vz.value, bD))
          wx.set(f.addition(wx.value, f.division(f.multiplication(-2.5, bD), BALL_R)))
          wz.set(f.addition(wz.value, f.division(f.multiplication(2.5, aD), BALL_R)))
          const sx2 = f.addition(vx.value, f.multiplication(wz.value, BALL_R))
          const sz2 = f.subtraction(vz.value, f.multiplication(wx.value, BALL_R))
          const slip2 = f._3dVectorModuloOperation(f.create3dVector(sx2, 0.0, sz2))
          // 纯滚动：滚动阻力（恒定减速度，与帧率无关）+ 把自旋锁到滚动约束
          f.doubleBranch(
            f.lessThan(slip2, SLIP_ROLL),
            () => {
              const spH = f._3dVectorModuloOperation(f.create3dVector(vx.value, 0.0, vz.value))
              const decel = f.multiplication(f.multiplication(ROLL, G), dt.value)
              const keep = f.localVariable('float')
              f.doubleBranch(
                f.greaterThan(spH, decel),
                () => { keep.set(f.division(f.subtraction(spH, decel), spH)) },
                () => { keep.set(0.0) }
              )
              vx.set(f.multiplication(vx.value, keep.value))
              vz.set(f.multiplication(vz.value, keep.value))
              wx.set(f.division(vz.value, BALL_R))
              wz.set(f.division(f.multiplication(vx.value, -1.0), BALL_R))
            },
            () => {}
          )
        },
        () => {}
      )

      // ═══════════ 13. 静止（平滑衰减，不再「0.36→0 一拍断崖」）═══════════════════════
      const sp1 = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      f.doubleBranch(
        f.logicalAndOperation(f.greaterThan(contact.value, 0n), f.lessThan(sp1, f.querySkillVariableValue(S_P_REST))),
        () => {
          vx.set(f.multiplication(vx.value, 0.5))
          vz.set(f.multiplication(vz.value, 0.5))
          vy.set(0.0)
        },
        () => {}
      )
      const sp2 = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      f.doubleBranch(
        f.lessThan(sp2, f.multiplication(f.querySkillVariableValue(S_P_REST), 0.25)),
        () => {
          vx.set(0.0)
          vy.set(0.0)
          vz.set(0.0)
          wx.set(0.0)
          wz.set(0.0)
          wy.set(f.multiplication(wy.value, 0.5))
        },
        () => {}
      )

      // ═══════════ 14. 门柱（扫掠圆检测：p0→p1 线段与圆柱截面求交，快球也不穿柱）═════
      //   旧实现是 1.2×1.2m 的方盒、且在进球判定之后 ⇒ 一半的必进球被"隐形门柱"弹回（离线 53.5% 判错）。
      //   现在：解 |p(t) − c|² = (POST_R+R)² 的小二次方程，取最早交点；法线 = 交点−柱心。
      const absX = f._3dVectorModuloOperation(f.create3dVector(bx.value, 0.0, 0.0))
      const absX0 = f._3dVectorModuloOperation(f.create3dVector(bx0, 0.0, 0.0))
      const postReach = f.addition(POST_R, BALL_R)
      const reach2 = f.multiplication(postReach, postReach)
      const stepX = f.subtraction(absX, absX0)
      const stepZ = f.subtraction(bz.value, bz0)
      const stepSq = f.addition(f.multiplication(stepX, stepX), f.multiplication(stepZ, stepZ))
      const hasStep = f.greaterThan(stepSq, 0.000001)
      const belowBar = f.lessThan(by.value, f.addition(GOAL_H, postReach))
      const sgnX = f.localVariable('float')
      f.doubleBranch(
        f.greaterThanOrEqualTo(bx.value, 0.0),
        () => { sgnX.set(1.0) },
        () => { sgnX.set(-1.0) }
      )
      const postX = f.subtraction(absX0, PITCH_X)
      // —— 前柱（z = +3.6）——
      const p0zP = f.subtraction(bz0, GOAL_HALF)
      const cP = f.subtraction(
        f.addition(f.multiplication(postX, postX), f.multiplication(p0zP, p0zP)),
        reach2
      )
      const bP = f.multiplication(
        2.0,
        f.addition(f.multiplication(postX, stepX), f.multiplication(p0zP, stepZ))
      )
      const discP = f.subtraction(f.multiplication(bP, bP), f.multiplication(f.multiplication(4.0, stepSq), cP))
      f.doubleBranch(
        f.logicalAndOperation(
          f.logicalAndOperation(f.greaterThan(discP, 0.0), f.greaterThan(cP, 0.0)),
          f.logicalAndOperation(hasStep, belowBar)
        ),
        () => {
          const sqrtD = f._3dVectorModuloOperation(f.create3dVector(discP, 0.0, 0.0))
          const tRaw = f.division(
            f.subtraction(f.multiplication(bP, -1.0), sqrtD),
            f.multiplication(2.0, stepSq)
          )
          const tHit = f.localVariable('float')
          f.doubleBranch(
            f.lessThan(tRaw, 0.0),
            () => { tHit.set(0.0) },
            () => {
              f.doubleBranch(
                f.greaterThan(tRaw, 1.0),
                () => { tHit.set(1.0) },
                () => { tHit.set(tRaw) }
              )
            }
          )
          const cX = f.addition(postX, f.multiplication(tHit.value, stepX))
          const cZ = f.addition(p0zP, f.multiplication(tHit.value, stepZ))
          const distC = f._3dVectorModuloOperation(f.create3dVector(cX, 0.0, cZ))
          const nX = f.division(cX, f.addition(distC, 0.0001))
          const nZ = f.division(cZ, f.addition(distC, 0.0001))
          bx.set(f.multiplication(sgnX.value, f.addition(PITCH_X, f.multiplication(nX, postReach))))
          bz.set(f.addition(GOAL_HALF, f.multiplication(nZ, postReach)))
          const vxM = f.multiplication(sgnX.value, vx.value)
          const vn = f.addition(f.multiplication(vxM, nX), f.multiplication(vz.value, nZ))
          f.doubleBranch(
            f.lessThan(vn, 0.0),
            () => {
              vx.set(f.multiplication(sgnX.value, f.subtraction(vxM, f.multiplication(f.multiplication(vn, f.addition(1.0, WALL_E)), nX))))
              vz.set(f.subtraction(vz.value, f.multiplication(f.multiplication(vn, f.addition(1.0, WALL_E)), nZ)))
            },
            () => {}
          )
        },
        () => {}
      )
      // —— 后柱（z = −3.6）——
      const p0zN = f.addition(bz0, GOAL_HALF)
      const cN = f.subtraction(
        f.addition(f.multiplication(postX, postX), f.multiplication(p0zN, p0zN)),
        reach2
      )
      const bN = f.multiplication(
        2.0,
        f.addition(f.multiplication(postX, stepX), f.multiplication(p0zN, stepZ))
      )
      const discN = f.subtraction(f.multiplication(bN, bN), f.multiplication(f.multiplication(4.0, stepSq), cN))
      f.doubleBranch(
        f.logicalAndOperation(
          f.logicalAndOperation(f.greaterThan(discN, 0.0), f.greaterThan(cN, 0.0)),
          f.logicalAndOperation(hasStep, belowBar)
        ),
        () => {
          const sqrtD = f._3dVectorModuloOperation(f.create3dVector(discN, 0.0, 0.0))
          const tRaw = f.division(
            f.subtraction(f.multiplication(bN, -1.0), sqrtD),
            f.multiplication(2.0, stepSq)
          )
          const tHit = f.localVariable('float')
          f.doubleBranch(
            f.lessThan(tRaw, 0.0),
            () => { tHit.set(0.0) },
            () => {
              f.doubleBranch(
                f.greaterThan(tRaw, 1.0),
                () => { tHit.set(1.0) },
                () => { tHit.set(tRaw) }
              )
            }
          )
          const cX = f.addition(postX, f.multiplication(tHit.value, stepX))
          const cZ = f.addition(p0zN, f.multiplication(tHit.value, stepZ))
          const distC = f._3dVectorModuloOperation(f.create3dVector(cX, 0.0, cZ))
          const nX = f.division(cX, f.addition(distC, 0.0001))
          const nZ = f.division(cZ, f.addition(distC, 0.0001))
          bx.set(f.multiplication(sgnX.value, f.addition(PITCH_X, f.multiplication(nX, postReach))))
          bz.set(f.addition(f.multiplication(GOAL_HALF, -1.0), f.multiplication(nZ, postReach)))
          const vxM = f.multiplication(sgnX.value, vx.value)
          const vn = f.addition(f.multiplication(vxM, nX), f.multiplication(vz.value, nZ))
          f.doubleBranch(
            f.lessThan(vn, 0.0),
            () => {
              vx.set(f.multiplication(sgnX.value, f.subtraction(vxM, f.multiplication(f.multiplication(vn, f.addition(1.0, WALL_E)), nX))))
              vz.set(f.subtraction(vz.value, f.multiplication(f.multiplication(vn, f.addition(1.0, WALL_E)), nZ)))
            },
            () => {}
          )
        },
        () => {}
      )

      // ═══════════ 15. 门线穿越（插值，快球不漏；进球先于边界反弹）═══════════════════
      const absX2 = f._3dVectorModuloOperation(f.create3dVector(bx.value, 0.0, 0.0))
      const goalHit = f.localVariable('int')
      goalHit.set(0n)
      f.doubleBranch(
        f.greaterThan(absX2, PITCH_X),
        () => {
          const denomX = f.addition(f.subtraction(absX2, absX0), 0.0001)
          const tC = f.division(f.subtraction(PITCH_X, absX0), denomX)
          const zc = f.addition(bz0, f.multiplication(tC, f.subtraction(bz.value, bz0)))
          const yc = f.addition(by0, f.multiplication(tC, f.subtraction(by.value, by0)))
          const inMouth = f.lessThan(
            f._3dVectorModuloOperation(f.create3dVector(0.0, 0.0, zc)),
            f.subtraction(GOAL_HALF, POST_R)
          )
          const underBarC = f.lessThan(yc, GOAL_H)
          f.doubleBranch(
            f.logicalAndOperation(inMouth, underBarC),
            () => { goalHit.set(1n) },
            () => {}
          )
        },
        () => {}
      )
      f.doubleBranch(
        f.equal(goalHit.value, 1n),
        () => {
          goalFlag.set(1n)
          bx.set(0.0)
          by.set(CENTER_Y)
          bz.set(0.0)
          vx.set(0.0)
          vy.set(0.0)
          vz.set(0.0)
          wx.set(0.0)
          wy.set(0.0)
          wz.set(0.0)
        },
        () => {}
      )

      // ═══════════ 16. 边界反弹（边线一律弹；底线只在「不是进球」时弹）════════════════
      f.doubleBranch(
        f.greaterThan(f._3dVectorModuloOperation(f.create3dVector(0.0, 0.0, bz.value)), f.subtraction(PITCH_Z, BALL_R)),
        () => {
          const signZ = f.localVariable('float')
          f.doubleBranch(f.greaterThan(bz.value, 0.0), () => { signZ.set(1.0) }, () => { signZ.set(-1.0) })
          bz.set(f.multiplication(signZ.value, f.subtraction(PITCH_Z, f.addition(BALL_R, 0.05))))
          vz.set(f.multiplication(vz.value, -WALL_E))
          vx.set(f.multiplication(vx.value, 0.9))
        },
        () => {}
      )
      // 门洞内（|z| < 3.54 且 y < 2.5）不放墙：让球真的越过 52.5 的门线（否则球心到 52.25 就被弹回，
      //   16m/s 时约 23% 的必进球会被"提前反弹"吃掉）
      const inMouthNow = f.logicalAndOperation(
        f.lessThan(
          f._3dVectorModuloOperation(f.create3dVector(0.0, 0.0, bz.value)),
          f.subtraction(GOAL_HALF, POST_R)
        ),
        f.lessThan(by.value, GOAL_H)
      )
      f.doubleBranch(
        f.logicalAndOperation(
          f.greaterThan(absX2, f.subtraction(PITCH_X, BALL_R)),
          f.logicalAndOperation(f.equal(goalHit.value, 0n), f.logicalNotOperation(inMouthNow))
        ),
        () => {
          const signX = f.localVariable('float')
          f.doubleBranch(f.greaterThan(bx.value, 0.0), () => { signX.set(1.0) }, () => { signX.set(-1.0) })
          bx.set(f.multiplication(signX.value, f.subtraction(PITCH_X, f.addition(BALL_R, 0.1))))
          vx.set(f.multiplication(vx.value, -WALL_E))
          vz.set(f.multiplication(vz.value, 0.9))
        },
        () => {}
      )

      // ═══════════ 17. 状态机（扁平守卫，不做深嵌套）═══════════════════════════════════
      const spFinal = f._3dVectorModuloOperation(f.create3dVector(vx.value, vy.value, vz.value))
      const sxF = f.addition(vx.value, f.multiplication(wz.value, BALL_R))
      const szF = f.subtraction(vz.value, f.multiplication(wx.value, BALL_R))
      const slipF = f._3dVectorModuloOperation(f.create3dVector(sxF, 0.0, szF))
      const touching = f.logicalAndOperation(
        f.greaterThan(contact.value, 0n),
        f.lessThanOrEqualTo(by.value, f.addition(GROUND_Y, CONTACT_EPS))
      )
      mode.set(0n)
      f.doubleBranch(touching, () => { mode.set(2n) }, () => {})
      f.doubleBranch(f.equal(contact.value, 2n), () => { mode.set(1n) }, () => {})
      f.doubleBranch(
        f.logicalAndOperation(touching, f.lessThan(spFinal, f.querySkillVariableValue(S_P_REST))),
        () => { mode.set(4n) },
        () => {}
      )
      f.doubleBranch(
        f.logicalAndOperation(
          touching,
          f.logicalAndOperation(
            f.greaterThanOrEqualTo(spFinal, f.querySkillVariableValue(S_P_REST)),
            f.lessThan(slipF, SLIP_ROLL)
          )
        ),
        () => { mode.set(3n) },
        () => {}
      )
      f.doubleBranch(assistOn, () => { mode.set(5n) }, () => {})
    },
    () => {}
  )

  // ═════════════ 18. 重置（6 号键）：放在物理之后，避免本拍穿越/TOI 拿到跳变 ═════════════
  f.doubleBranch(
    f.equal(resetFlag.value, 1n),
    () => {
      const relX = f.subtraction(bx.value, pPxV.value)
      const relZ = f.subtraction(bz.value, pPzV.value)
      const relLen = f.addition(f._3dVectorModuloOperation(f.create3dVector(relX, 0.0, relZ)), 0.0001)
      const dirXV = f.localVariable('float')
      const dirZV = f.localVariable('float')
      dirXV.set(f.division(relX, relLen))
      dirZV.set(f.division(relZ, relLen))
      bx.set(f.addition(pPxV.value, f.multiplication(dirXV.value, 1.5)))
      by.set(GROUND_Y)
      bz.set(f.addition(pPzV.value, f.multiplication(dirZV.value, 1.5)))
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

  // ═════════════ 19. 写回自持槽（唯一真值）═══════════════════════════════════════════════
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

  // ═════════════ 20. 载体跟随（只当算力中心，永不入镜）═════════════════════════════════
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

  // ═════════════ 21. 回传（每拍一条 'B'；进球额外一条 'G'）═════════════════════════════
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
