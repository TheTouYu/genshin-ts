// 足球 R2·fb-phys2（20008 造物技能图，票 19 输入段替换实施，2026-09-04，地图 1073741908）
//
// === 与 fb-phys.ts（1082130433 现网）的唯一差异=输入段通道化（19-replacement-plan） ===
//   ⑤ 镜像读 11 → 技能变量自持组读 11 分量（channels 原语；锁步破除：tick 自增
//     不再等服务端镜像回写）；④ 拍门 gate 读退役（自由跑——apply 同率=cast 率，
//     服务端 gate 写照旧只是读侧不再节流）；新增 ⑮ 自持写回（t 先写=撕裂哨兵，
//     任务拍写回即 RESET/KICK 结果直存自持组=双保险）；bootstrap：自持组 t==0
//     哨兵触发一次性镜像读+写组（tick 二读防撕裂，低频一次性）。
// === 零改动面（git diff 证明） ===
//   ③ seqlock 任务/E1 寄存器、⑥ 参数 19 镜像读（编辑器热调通道不动）、
//   ⑦ 输入选择、⑧-⑫ 六态积分/门框/墙/反弹/状态分类（物理内核一字不动）、
//   ⑬ P 信号回传、⑭ E5 观测链；新增 ⑮ 自持写回（内核输出直存）。
// 接口契约（沿自 fb-phys，单一事实源=票 02 执行备注 + 票 01 终态）：
//   · 球实体 1077936135：fb_ball_gate + 镜像 11（bootstrap/E5/参数仍读）+ fb_p_* 19
//   · fb_ball_entity:entity 挂丘丘人实例（getSelfEntity→读引用→读球变量 = E5 主链）
//   · E1 寄存器 fb_epoch/fb_ack/fb_sum/fb_t1..t8 挂玩家实体（owner 链照旧）
//   · 状态枚举（sim/src/state.ts）：0=Airborne 1=Bouncing 2=Sliding 3=Rolling
//     4=Rest 5=DribbleControlled——服务端按 Rest=4 停拍，本图同枚举回传
//   · 任务载荷：t1=type（1=KICK: t2..t4=vel×1000, t5..t7=spin×1000 / 2=RESET:
//     t2..t4=pos×1000, t5..t7=vel×1000, t8=state）
//   · 回传：sendSignalToServerNodeGraph(fb_ball_state, 'P', base_tick, pos, vel,
//     spin, state)；tag='T'=自持组二读不一致（跨实例写交错哨兵，服务端不应用）
//   · 自持组=技能变量 11 分量（codec §1 映射序 t/px/py/pz/vx/vy/vz/sx/sy/sz/st；
//     ⚠️ codec 文档行文写"10 分量"但其 §1 表列 11 行——t+9float+st 缺一不可，
//     state=内核状态机输出必须自持，此处按 11 如实实施）
//   · ID 递增假设：1207959558~568（现有 5 个=553~57 之后连号；**注入前与用户
//     核对真实值，不符回填后才注入——占位 ID 禁止注入红线**）
// 物理数学：v4 物理复合族结构（PORTING-MAP §0）+ 参数全部来自 fb_p_* 19 快照
//   （图内零参数字面量；几何/编码/枚举字面量不属物理参数）。
// 编译硬前置：主配置全图编译（单 entry 必失败）；客户端参数序与服务端相反
//   （getCorrespondingValueFromList(iD, list)；_3dVectorZoom(标量, 向量) 同理反序）。
import { g } from 'genshin-ts/runtime/core'
import { float } from 'genshin-ts/runtime/value'

import { chanReadF, chanReadF32Group, chanWriteF } from './channels.js'
import { FbSignal } from './signals.js'

// ———— 空载形态开关（票 19 两阶段：4.1 注入=IDLE 发 fb_idle_state'V'——fb_server
// 零订阅=服务端重逻辑零执行；5.2 接管=本三行切回 fb_ball_state+'P'/'T' 重编译重注入，
// 见 4.3 回退文档。tear 分支同切（否则空载阶段 fb_server 收 fb_ball_state 非 P tag
// 走 fb:tear 打印洪泛——2.2 隔离定案否决项） ————
const OUT_SIG = FbSignal.fb_ball_state
const OUT_TAG = 'P'
const OUT_TAG_TEAR = 'T'

// ———— 状态枚举（sim/src/state.ts 单一事实源，图内按数值字面量使用）与任务类型 ————
// 0=Airborne 1=Bouncing 2=Sliding 3=Rolling 4=Rest 5=DribbleControlled
const TT_KICK = 1n
const TT_RESET = 2n
// ———— 几何/玩法字面量（PORTING-MAP §1.6 明确不参数化项；非物理参数） ————
const POST_Z = 3.6 // 门柱中心 z 偏移
const POST_R = 0.06 // 门柱/横梁半径
const BAR_Y = 2.5 // 横梁中心高度
const GOAL_X = 52.5 // 门线 |x|
const WALL_X_MIN = -55
const WALL_X_MAX = 60
const WALL_Z_MIN = -55
const WALL_Z_MAX = 60
const GROUND_EPS = 0.05 // 贴地判定余量（结构常量，v4 同值）
const DIV_GUARD = 0.0001 // 除零保护（结构常量，v4 同值）
const FIXK = 1000 // 定点编码 ×1000（R2-DESIGN §4 载荷编码）
// ———— 自持组技能变量（codec §1 映射序；实测段 1207959569~579，注入前核对） ————
// 调用点 cfgId 仅 const/字面量直传（算术会变 IR pin 被 config_id 拒——channels 铁律）
// ⚠️ 首测段 558~568 已废弃：宿主造物（447~450）无 fb_ball_entity 种子 → bootstrap
// 镜像读空值 → NaN 进组（tick 因写回 empty+1=1 引擎算术幸存 1..456 链）；换新鲜段
// =t 哨兵归零自动重 bootstrap，免手动清变量
const CFG_T = 1207959569n
const CFG_PX = 1207959570n
const CFG_PY = 1207959571n
const CFG_PZ = 1207959572n
const CFG_VX = 1207959573n
const CFG_VY = 1207959574n
const CFG_VZ = 1207959575n
const CFG_SX = 1207959576n
const CFG_SY = 1207959577n
const CFG_SZ = 1207959578n
const CFG_ST = 1207959579n

// ———— 5.3c AI 射程维持计数槽（实例隔离自持；用户建的 40 变量段 580 空闲位） ————
const CFG_JUMP_CT = 1207959580n

g.creationSkill({ id: 1082130437, name: '_GSTS_fbPhys2' }).on('start', (_evt, f) => {
  // ============ ① E2 计数器（观测面保留；E2 定论=每拍复位，恒 1） ============
  const tick = f.localVariable('int')
  tick.set(tick.value + 1n)

  // ============ ② E1 寄存器门（物化 eEq：epoch/ack 各只读一次） ============
  const owner = f.getCorrespondingValueFromList(0n, f.getListOfPlayerEntitiesOnTheField())
  const ack = f.getCustomVariable(owner, 'fb_ack').asType('int')
  const e1 = f.getCustomVariable(owner, 'fb_epoch').asType('int')
  const eEq = f.localVariable('bool')
  eEq.set(f.equal(e1, ack))

  // ============ ③ 任务物化局部（seqlock 分支写入，计算分支消费） ============
  const tPend = f.localVariable('int') // 0=无 1=KICK 2=RESET
  const tVel = f.localVariable('vec3')
  const tSpin = f.localVariable('vec3')
  const tPos = f.localVariable('vec3')
  const tSt = f.localVariable('int')

  f.doubleBranch(f.logicalNotOperation(eEq.value), () => {
    // —— seqlock 门：epoch≠ack → 读邮箱 → 求和比对 → 二读 epoch（E1 原样） ——
    const v1 = f.getCustomVariable(owner, 'fb_t1').asType('int')
    const v2 = f.getCustomVariable(owner, 'fb_t2').asType('int')
    const v3 = f.getCustomVariable(owner, 'fb_t3').asType('int')
    const v4 = f.getCustomVariable(owner, 'fb_t4').asType('int')
    const v5 = f.getCustomVariable(owner, 'fb_t5').asType('int')
    const v6 = f.getCustomVariable(owner, 'fb_t6').asType('int')
    const v7 = f.getCustomVariable(owner, 'fb_t7').asType('int')
    const v8 = f.getCustomVariable(owner, 'fb_t8').asType('int')
    const sum = f.getCustomVariable(owner, 'fb_sum').asType('int')
    const e2 = f.getCustomVariable(owner, 'fb_epoch').asType('int')
    const h8 = v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8
    f.doubleBranch(f.equal(e2, e1), () => {
      f.doubleBranch(f.equal(h8, sum), () => {
        // —— 邮箱完整：真实任务物化解码（ack 延后到镜像一致后，防丢任务）；——
        // —— 未知类型（dispatcher 测试载荷）：跳过应用、当场 ack（契约） ——
        const dv = (x: bigint) => f.division(f.dataTypeConversion(x, 'float'), FIXK)
        f.doubleBranch(f.equal(v1, TT_KICK), () => {
          tVel.set(f.create3dVector(dv(v2), dv(v3), dv(v4)))
          tSpin.set(f.create3dVector(dv(v5), dv(v6), dv(v7)))
          tPend.set(1n)
        }, () => {
          f.doubleBranch(f.equal(v1, TT_RESET), () => {
            tPos.set(f.create3dVector(dv(v2), dv(v3), dv(v4)))
            tVel.set(f.create3dVector(dv(v5), dv(v6), dv(v7)))
            tSt.set(v8)
            tPend.set(2n)
          }, () => {
            f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'ok', e1, tick.value)
          })
        })
      }, () => {
        f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'tearH', e1, tick.value)
      })
    }, () => {
      f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'tearE', e1, tick.value)
    })
  }, () => {})

  // ============ ④ 球寻址（E5 主链）+ 计算门（票 19：拍门退役，自由跑） ============
  // 球寻址=实体字面量直连（首测教训：实验造物 447~450 无 fb_ball_entity 种子——
  // 引用读空 → bootstrap/参数全空 NaN；fb-loop BALL_GUID 同款先例，框架不再依赖种子）
  const BALL_GUID = 1077936135n
  const ballRef = f.localVariable('entity')
  ballRef.set(entity(BALL_GUID))
  // 球实体变量读辅助（bootstrap 镜像读/参数 19 物化共用；原⑤段定义，随替换面上移）
  const rv = (name: string) => f.getCustomVariable(ballRef.value, name)

  // 计算拍条件：本拍有真实任务 ∨ 恒真（自持自由跑——apply 同率=cast 率，票 19 目标
  // ≥20Hz 依赖此自由度；服务端 gate 写照旧，读侧不再节流；任务在途保护由 seqlock
  // 分支自身的 epoch≠ack 门承担，与原 hasTask 语义一致）
  const hasTask = f.greaterThan(tPend.value, 0n)
  const shouldCompute = f.logicalOrOperation(
    hasTask,
    f.equal(1n, 1n)
  )
  f.doubleBranch(shouldCompute, () => {
    // ============ ⑤ 输入读（票 19 替换面：镜像 11 → 技能变量自持组 11 分量） ============
    // bootstrap：t==0 哨兵（真 tick 恒 ≥1，服务端首 apply 写 1）→ 一次性镜像读+写组
    // （tick 二读防撕裂，撕裂则下拍重试 bootstrap；低频一次性，非锁步路径）
    const tProbe = chanReadF(f, CFG_T)
    f.doubleBranch(f.equal(f.dataTypeConversion(tProbe, 'int'), 0n), () => {
      const bTick = rv('fb_ball_tick').asType('int')
      const bPos = f.create3dVector(
        rv('fb_ball_px').asType('float'),
        rv('fb_ball_py').asType('float'),
        rv('fb_ball_pz').asType('float')
      )
      const bVel = f.create3dVector(
        rv('fb_ball_vx').asType('float'),
        rv('fb_ball_vy').asType('float'),
        rv('fb_ball_vz').asType('float')
      )
      const bSpin = f.create3dVector(
        rv('fb_ball_sx').asType('float'),
        rv('fb_ball_sy').asType('float'),
        rv('fb_ball_sz').asType('float')
      )
      const bSt = rv('fb_ball_state').asType('int')
      const bTick2 = rv('fb_ball_tick').asType('int')
      f.doubleBranch(f.equal(bTick2, bTick), () => {
        // 自持组写入（t 先写=撕裂哨兵；同拍零延迟，写入即本拍可见）
        chanWriteF(f, CFG_T, f.dataTypeConversion(bTick, 'float'))
        const bp = f.split3dVector(bPos)
        chanWriteF(f, CFG_PX, bp.xComponent)
        chanWriteF(f, CFG_PY, bp.yComponent)
        chanWriteF(f, CFG_PZ, bp.zComponent)
        const bv = f.split3dVector(bVel)
        chanWriteF(f, CFG_VX, bv.xComponent)
        chanWriteF(f, CFG_VY, bv.yComponent)
        chanWriteF(f, CFG_VZ, bv.zComponent)
        const bs = f.split3dVector(bSpin)
        chanWriteF(f, CFG_SX, bs.xComponent)
        chanWriteF(f, CFG_SY, bs.yComponent)
        chanWriteF(f, CFG_SZ, bs.zComponent)
        chanWriteF(f, CFG_ST, f.dataTypeConversion(bSt, 'float'))
      }, () => {})
    }, () => {})
    // 输入物化（自持组单点读；bootstrap 拍写入后同拍读零延迟——14 票 776/776 实证）。
    // 组读=前 10 分量（引擎 assemblyList 上限 10——codec"10 分量"的真实约束）；st 单读
    const g = chanReadF32Group(f, CFG_T, 10)
    const mTick = f.localVariable('int')
    const mPos = f.localVariable('vec3')
    const mVel = f.localVariable('vec3')
    const mSpin = f.localVariable('vec3')
    const mSt = f.localVariable('int')
    mTick.set(f.dataTypeConversion(g[0], 'int'))
    mPos.set(f.create3dVector(g[1], g[2], g[3]))
    mVel.set(f.create3dVector(g[4], g[5], g[6]))
    mSpin.set(f.create3dVector(g[7], g[8], g[9]))
    mSt.set(f.dataTypeConversion(chanReadF(f, CFG_ST), 'int'))
    // ============ ⑤a AI 射程维持——造物贴玩家瞬移（5.3c 用户方案，5.3d 实测修正） ============
    // 背景：施放率被"造物-玩家距离"调制（用户实测修正：球距推论作废——玩家远→降频）。
    // 修法：每 2 次施放判一次造物-玩家距（实例隔离自持槽 580 计数，无取模用乘除判偶），
    // >4m 则把造物自身瞬移到玩家旁（x,z 取玩家位 +2x 偏移；**y 保持造物当前 y 不动**）。
    // owner=②段 E1 玩家实体（同会话作用域，复用免再取列表）。
    const jc = f.dataTypeConversion(chanReadF(f, CFG_JUMP_CT), 'int')
    chanWriteF(f, CFG_JUMP_CT, f.dataTypeConversion(f.addition(jc, 1n), 'float'))
    const jcF = f.dataTypeConversion(jc, 'float')
    const evenJump = f.equal(
      f.multiplication(f.division(jcF, new float(2)), new float(2)),
      jcF
    )
    f.doubleBranch(evenJump, () => {
      const eloc = f.getEntityLocation(f.getSelfEntity())
      const ploc = f.getEntityLocation(owner)
      const toP = f._3dVectorSubtraction(ploc, eloc)
      const d = f._3dVectorModuloOperation(toP)
      f.doubleBranch(f.greaterThan(d, new float(4)), () => {
        const es = f.split3dVector(eloc)
        const ps = f.split3dVector(ploc)
        f.complexCreationTeleport(
          f.create3dVector(f.addition(ps.xComponent, new float(2)), es.yComponent, ps.zComponent),
          f.create3dVector(0, 0, 0)
        )
      }, () => {})
    }, () => {})
    const tick2 = f.dataTypeConversion(chanReadF(f, CFG_T), 'int')
    f.doubleBranch(f.equal(tick2, mTick.value), () => {
      // —— 镜像一致：真实任务此时才 ack（撕裂则 tearE，看门狗 4s 重提交不丢任务） ——
      f.doubleBranch(hasTask, () => {
        f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'ok', e1, tick.value)
      }, () => {})

      // ============ ⑥ 参数组 19 当拍物化（不变量 1：多消费点先物化快照） ============
      const pv = (name: string) => f.getCustomVariable(ballRef.value, name).asType('float')
      const pDt = f.localVariable('float')
      const pR = f.localVariable('float')
      const pG = f.localVariable('float')
      const pKd = f.localVariable('float')
      const pKm = f.localVariable('float')
      const pKwA = f.localVariable('float')
      const pKwG = f.localVariable('float')
      const pE = f.localVariable('float')
      const pFx = f.localVariable('float')
      const pWall = f.localVariable('float')
      const pSlide = f.localVariable('float')
      const pRoll = f.localVariable('float')
      const pStop = f.localVariable('float')
      const pSEnter = f.localVariable('float')
      const pSToRoll = f.localVariable('float')
      const pGain = f.localVariable('float')
      const pBvy = f.localVariable('float')
      const pRefl = f.localVariable('float')
      const pNet = f.localVariable('float')
      pDt.set(pv('fb_p_dt'))
      pR.set(pv('fb_p_ball_r'))
      pG.set(pv('fb_p_g'))
      pKd.set(pv('fb_p_kd'))
      pKm.set(pv('fb_p_km'))
      pKwA.set(pv('fb_p_kw_air'))
      pKwG.set(pv('fb_p_kw_gnd'))
      pE.set(pv('fb_p_ground_e'))
      pFx.set(pv('fb_p_ground_fx'))
      pWall.set(pv('fb_p_wall_e'))
      pSlide.set(pv('fb_p_slide_decel'))
      pRoll.set(pv('fb_p_roll_decel'))
      pStop.set(pv('fb_p_stop_speed'))
      pSEnter.set(pv('fb_p_slide_enter'))
      pSToRoll.set(pv('fb_p_slide_to_roll'))
      pGain.set(pv('fb_p_roll_spin_gain'))
      pBvy.set(pv('fb_p_bounce_vy'))
      pRefl.set(pv('fb_p_post_refl'))
      pNet.set(pv('fb_p_net_damp'))

      // ============ ⑦ 输入选择（任务覆盖镜像；物化后下游零重读） ============
      const b2f = (b: boolean) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
      const bKick = b2f(f.equal(tPend.value, 1n))
      const bReset = b2f(f.equal(tPend.value, 2n))
      const bTask = f.addition(bKick, bReset) // 互斥 → 0/1
      const posIn = f.localVariable('vec3')
      const velIn = f.localVariable('vec3')
      const spinIn = f.localVariable('vec3')
      const stIn = f.localVariable('float')
      posIn.set(
        f._3dVectorAddition(
          f._3dVectorZoom(bReset, tPos.value),
          f._3dVectorZoom(f.subtraction(1, bReset), mPos.value)
        )
      )
      velIn.set(
        f._3dVectorAddition(
          f._3dVectorZoom(bTask, tVel.value),
          f._3dVectorZoom(f.subtraction(1, bTask), mVel.value)
        )
      )
      // RESET 自旋清零（载荷无自旋字段）；KICK 用任务自旋；否则镜像
      spinIn.set(
        f._3dVectorAddition(
          f._3dVectorZoom(bKick, tSpin.value),
          f._3dVectorZoom(
            f.subtraction(1, bKick),
            f._3dVectorZoom(f.subtraction(1, bReset), mSpin.value)
          )
        )
      )
      stIn.set(
        f.addition(
          f.multiplication(bReset, f.dataTypeConversion(tSt.value, 'float')),
          f.multiplication(
            f.subtraction(1, bReset),
            f.dataTypeConversion(mSt.value, 'float')
          )
        )
      )

      // ============ ⑧ 六态积分一拍（无循环全闭式；双管线数据选择路由） ============
      // 路由：镜像态<2（Airborne/Bouncing）走飞行管线；踢球带 vy 分量也走飞行
      const sVel = f.split3dVector(velIn.value)
      const stIsFly = f.lessThan(stIn.value, 2)
      const kickLoft = f.logicalAndOperation(
        f.greaterThan(bKick, 0.5),
        f.greaterThanOrEqualTo(f.absoluteValueOperation(sVel.yComponent), pBvy.value)
      )
      const goFly = f.logicalOrOperation(stIsFly, kickLoft)

      // —— 飞行管线：重力 + 二次阻力 + 马格努斯 + 空中自旋衰减 ——
      const spd = f._3dVectorModuloOperation(velIn.value)
      const ad = f._3dVectorZoom(
        f.multiplication(f.multiplication(-1, pKd.value), spd),
        velIn.value
      )
      const am = f._3dVectorZoom(pKm.value, f._3dVectorCrossProduct(spinIn.value, velIn.value))
      const ag = f._3dVectorZoom(pG.value, f.create3dVector(0, 1, 0))
      const fVel = f._3dVectorAddition(
        velIn.value,
        f._3dVectorZoom(
          pDt.value,
          f._3dVectorAddition(f._3dVectorAddition(ag, ad), am)
        )
      )
      const fPos = f._3dVectorAddition(posIn.value, f._3dVectorZoom(pDt.value, fVel))
      const fSpin = f._3dVectorZoom(pKwA.value, spinIn.value)

      // —— 地面管线（滑/滚同构，减速率按输入态选择；Rest 冻结自然成立） ——
      const sPos = f.split3dVector(posIn.value)
      const sSpin = f.split3dVector(spinIn.value)
      const hSpdIn = f._3dVectorModuloOperation(
        f.create3dVector(sVel.xComponent, 0, sVel.zComponent)
      )
      const bSlideIn = b2f(f.equal(stIn.value, 2))
      const decel = f.addition(
        f.multiplication(pSlide.value, bSlideIn),
        f.multiplication(pRoll.value, f.subtraction(1, bSlideIn))
      )
      // max(spd−decel·DT, 0) = (spdSub+|spdSub|)/2（min/max 对称式，不变量 4）
      const spdSub = f.subtraction(hSpdIn, f.multiplication(decel, pDt.value))
      const spd2 = f.division(
        f.addition(spdSub, f.absoluteValueOperation(spdSub)),
        2
      )
      const ratio = f.division(spd2, f.addition(hSpdIn, DIV_GUARD))
      const gvx = f.multiplication(sVel.xComponent, ratio)
      const gvz = f.multiplication(sVel.zComponent, ratio)
      const gPos = f.create3dVector(
        f.addition(sPos.xComponent, f.multiplication(gvx, pDt.value)),
        pR.value,
        f.addition(sPos.zComponent, f.multiplication(gvz, pDt.value))
      )
      const gVel = f.create3dVector(gvx, 0, gvz)
      // 自旋向纯滚目标 ω=(vz/R, 0, −vx/R) 收敛（gain），y 分量地面更快衰减
      const invR = f.division(1, pR.value)
      const tsx = f.multiplication(gvz, invR)
      const tsz = f.multiplication(f.multiplication(gvx, -1), invR)
      const gSpin = f.create3dVector(
        f.addition(
          sSpin.xComponent,
          f.multiplication(f.subtraction(tsx, sSpin.xComponent), pGain.value)
        ),
        f.multiplication(sSpin.yComponent, pKwG.value),
        f.addition(
          sSpin.zComponent,
          f.multiplication(f.subtraction(tsz, sSpin.zComponent), pGain.value)
        )
      )

      // —— 路由选择（物化：下游门框/墙/反弹/分类零重读） ——
      const bFly = b2f(goFly)
      const nFly = f.subtraction(1, bFly)
      const posI = f.localVariable('vec3')
      const velI = f.localVariable('vec3')
      posI.set(
        f._3dVectorAddition(
          f._3dVectorZoom(bFly, fPos),
          f._3dVectorZoom(nFly, gPos)
        )
      )
      velI.set(
        f._3dVectorAddition(
          f._3dVectorZoom(bFly, fVel),
          f._3dVectorZoom(nFly, gVel)
        )
      )
      const spinSel = f._3dVectorAddition(
        f._3dVectorZoom(bFly, fSpin),
        f._3dVectorZoom(nFly, gSpin)
      )

      // ============ ⑨ 门框碰撞（门柱×2/横梁/球网；反射率走 fb_p_post_refl） ============
      const ip = f.split3dVector(posI.value)
      const ax = f.absoluteValueOperation(ip.xComponent) // |px|
      const dx = f.subtraction(ax, GOAL_X) // 到门线带符号距离
      const hitR = f.addition(pR.value, POST_R)
      const hitR2 = f.multiplication(hitR, hitR)
      const dz1 = f.subtraction(ip.zComponent, POST_Z)
      const hp1 = f.logicalAndOperation(
        f.lessThan(
          f.addition(f.multiplication(dx, dx), f.multiplication(dz1, dz1)),
          hitR2
        ),
        f.lessThan(ip.yComponent, f.addition(BAR_Y, hitR))
      )
      const dz2 = f.addition(ip.zComponent, POST_Z)
      const hp2 = f.logicalAndOperation(
        f.lessThan(
          f.addition(f.multiplication(dx, dx), f.multiplication(dz2, dz2)),
          hitR2
        ),
        f.lessThan(ip.yComponent, f.addition(BAR_Y, hitR))
      )
      const dy = f.subtraction(ip.yComponent, BAR_Y)
      const hBar = f.logicalAndOperation(
        f.lessThan(
          f.addition(f.multiplication(dx, dx), f.multiplication(dy, dy)),
          hitR2
        ),
        f.lessThan(
          f.absoluteValueOperation(ip.zComponent),
          f.addition(POST_Z, hitR)
        )
      )
      const netHit = f.logicalAndOperation(
        f.greaterThan(ax, GOAL_X),
        f.logicalAndOperation(
          f.lessThan(f.absoluteValueOperation(ip.zComponent), POST_Z),
          f.lessThan(ip.yComponent, BAR_Y)
        )
      )
      const refl1 = f._3dVectorAddition(
        velI.value,
        f._3dVectorZoom(
          f.multiplication(
            f._3dVectorDotProduct(velI.value, f._3dVectorNormalization(f.create3dVector(dx, 0, dz1))),
            pRefl.value
          ),
          f._3dVectorNormalization(f.create3dVector(dx, 0, dz1))
        )
      )
      const refl2 = f._3dVectorAddition(
        velI.value,
        f._3dVectorZoom(
          f.multiplication(
            f._3dVectorDotProduct(velI.value, f._3dVectorNormalization(f.create3dVector(dx, 0, dz2))),
            pRefl.value
          ),
          f._3dVectorNormalization(f.create3dVector(dx, 0, dz2))
        )
      )
      const reflB = f._3dVectorAddition(
        velI.value,
        f._3dVectorZoom(
          f.multiplication(
            f._3dVectorDotProduct(velI.value, f._3dVectorNormalization(f.create3dVector(dx, dy, 0))),
            pRefl.value
          ),
          f._3dVectorNormalization(f.create3dVector(dx, dy, 0))
        )
      )
      // 应用链：门柱1 > 门柱2 > 横梁 > 球网 > 原速（互斥区域，else 链足够）
      const velA = f.localVariable('vec3')
      f.doubleBranch(hp1, () => {
        velA.set(refl1)
      }, () => {
        f.doubleBranch(hp2, () => {
          velA.set(refl2)
        }, () => {
          f.doubleBranch(hBar, () => {
            velA.set(reflB)
          }, () => {
            f.doubleBranch(netHit, () => {
              velA.set(f._3dVectorZoom(pNet.value, velI.value))
            }, () => {
              velA.set(velI.value)
            })
          })
        })
      })

      // ============ ⑩ 四面墙（位置钳制 + 分量反弹；v4 physWallCollide 结构） ============
      const posW = f.localVariable('vec3')
      const velW = f.localVariable('vec3')
      posW.set(posI.value)
      velW.set(velA.value)
      const wE = pWall.value
      f.doubleBranch(f.lessThan(ip.xComponent, WALL_X_MIN), () => {
        posW.set(f.create3dVector(WALL_X_MIN, ip.yComponent, ip.zComponent))
        velW.set(
          f.create3dVector(
            f.multiplication(f.absoluteValueOperation(f.split3dVector(velW.value).xComponent), wE),
            f.split3dVector(velW.value).yComponent,
            f.split3dVector(velW.value).zComponent
          )
        )
      }, () => {})
      f.doubleBranch(f.greaterThan(ip.xComponent, WALL_X_MAX), () => {
        posW.set(f.create3dVector(WALL_X_MAX, ip.yComponent, ip.zComponent))
        velW.set(
          f.create3dVector(
            f.multiplication(
              f.multiplication(f.absoluteValueOperation(f.split3dVector(velW.value).xComponent), wE),
              -1
            ),
            f.split3dVector(velW.value).yComponent,
            f.split3dVector(velW.value).zComponent
          )
        )
      }, () => {})
      f.doubleBranch(f.lessThan(ip.zComponent, WALL_Z_MIN), () => {
        posW.set(f.create3dVector(ip.xComponent, ip.yComponent, WALL_Z_MIN))
        velW.set(
          f.create3dVector(
            f.split3dVector(velW.value).xComponent,
            f.split3dVector(velW.value).yComponent,
            f.multiplication(f.absoluteValueOperation(f.split3dVector(velW.value).zComponent), wE)
          )
        )
      }, () => {})
      f.doubleBranch(f.greaterThan(ip.zComponent, WALL_Z_MAX), () => {
        posW.set(f.create3dVector(ip.xComponent, ip.yComponent, WALL_Z_MAX))
        velW.set(
          f.create3dVector(
            f.split3dVector(velW.value).xComponent,
            f.split3dVector(velW.value).yComponent,
            f.multiplication(
              f.multiplication(f.absoluteValueOperation(f.split3dVector(velW.value).zComponent), wE),
              -1
            )
          )
        )
      }, () => {})

      // ============ ⑪ 地面反弹（飞行管线专用；地面管线 y=r、vy=0 天然不触发） ============
      const wp = f.split3dVector(posW.value)
      const wv = f.split3dVector(velW.value)
      const gHit = f.logicalAndOperation(
        f.lessThan(wp.yComponent, pR.value),
        f.lessThan(wv.yComponent, 0)
      )
      const posF = f.localVariable('vec3')
      const velF = f.localVariable('vec3')
      const impact = f.localVariable('bool')
      f.doubleBranch(gHit, () => {
        posF.set(f.create3dVector(wp.xComponent, pR.value, wp.zComponent))
        velF.set(
          f.create3dVector(
            f.multiplication(wv.xComponent, pFx.value),
            f.multiplication(wv.yComponent, f.subtraction(0, pE.value)),
            f.multiplication(wv.zComponent, pFx.value)
          )
        )
        impact.set(true)
      }, () => {
        posF.set(posW.value)
        velF.set(velW.value)
        impact.set(false)
      })

      // ============ ⑫ 状态分类（sim 枚举；优先级 停>落地>活弹>空中） ============
      // 05 复测修正（不动点陷阱，日志 3096 铁证 tick161/py=0.25/vy=0.8086/state=1）：
      // 离散反弹映射 v→e·(g·DT−v) 有稳定不动点 e·g·DT/(1+e)≈0.808——该点 dead=true
      // 但 impact 恒真，若弹跳标记优先于落地分类，球永卡 33mm 微弹（视觉=原地振动）。
      // 修正：贴地∧dead → 落地转滑/滚（不动点逃逸口）；impact 且未落地静 → 活弹标记。
      const fp = f.split3dVector(posF.value)
      const fv = f.split3dVector(velF.value)
      const grounded = f.lessThan(fp.yComponent, f.addition(pR.value, GROUND_EPS))
      const dead = f.lessThan(f.absoluteValueOperation(fv.yComponent), pBvy.value)
      const hSpd = f._3dVectorModuloOperation(f.create3dVector(fv.xComponent, 0, fv.zComponent))
      const fSpd = f._3dVectorModuloOperation(velF.value)
      const stop = f.logicalAndOperation(f.lessThan(fSpd, pStop.value), grounded)
      const slideEntry = f.logicalAndOperation(
        f.logicalAndOperation(grounded, dead),
        f.greaterThan(hSpd, pSEnter.value)
      )
      const toRoll = f.lessThan(hSpd, pSToRoll.value)
      // 落地/Rest 唤醒分类（踢平球入滑）；滑态滞回（v4 slide-tick）；滚态保持
      const flyLand = f.logicalOrOperation(goFly, f.equal(stIn.value, 4))
      const slideIn = f.equal(stIn.value, 2)
      const groundDead = f.logicalAndOperation(grounded, dead)
      const bounceLive = f.logicalAndOperation(
        impact.value,
        f.logicalNotOperation(groundDead)
      )
      const bStop = b2f(stop)
      const bGD = b2f(groundDead)
      const bImp = b2f(bounceLive)
      const bFL = b2f(flyLand)
      const bSlide = b2f(slideEntry)
      const bRoll = b2f(toRoll)
      const bSlIn = b2f(slideIn)
      const notB = (x: number) => f.subtraction(1, x)
      const landPart = f.addition(
        f.multiplication(bSlide, 2),
        f.multiplication(notB(bSlide), 3)
      )
      const groundPart = f.addition(
        f.multiplication(bSlIn, f.addition(f.multiplication(bRoll, 3), f.multiplication(notB(bRoll), 2))),
        f.multiplication(notB(bSlIn), 3)
      )
      const inner = f.addition(
        f.multiplication(bFL, landPart),
        f.multiplication(notB(bFL), groundPart)
      )
      const nextStF = f.addition(
        f.multiplication(bStop, 4),
        f.multiplication(
          notB(bStop),
          f.addition(
            f.multiplication(bGD, inner),
            f.multiplication(notB(bGD), bImp)
          )
        )
      )
      const nextSt = f.dataTypeConversion(nextStF, 'int')

      // ============ ⑬ 回传打包（base_tick + 预测值 t+DT；信号/tag 由顶部三常量开关） ============
      f.sendSignalToServerNodeGraph(
        OUT_SIG,
        OUT_TAG,
        mTick.value,
        posF.value,
        velF.value,
        spinSel,
        nextSt
      )

      // ============ ⑮ 自持写回（票 19 新增段；t 先写=跨实例撕裂哨兵） ============
      // 内核输出直存自持组：tick=mTick+1（P 回传的是 base_tick，组内已是下一拍状态）；
      // 任务拍（RESET/KICK）经 ⑦ 输入选择进入积分 → 写回值即任务结果直存=RESET 双保险
      const nTick = f.dataTypeConversion(f.addition(mTick.value, 1n), 'float')
      chanWriteF(f, CFG_T, nTick)
      chanWriteF(f, CFG_PX, fp.xComponent)
      chanWriteF(f, CFG_PY, fp.yComponent)
      chanWriteF(f, CFG_PZ, fp.zComponent)
      chanWriteF(f, CFG_VX, fv.xComponent)
      chanWriteF(f, CFG_VY, fv.yComponent)
      chanWriteF(f, CFG_VZ, fv.zComponent)
      const ss = f.split3dVector(spinSel)
      chanWriteF(f, CFG_SX, ss.xComponent)
      chanWriteF(f, CFG_SY, ss.yComponent)
      chanWriteF(f, CFG_SZ, ss.zComponent)
      chanWriteF(f, CFG_ST, f.dataTypeConversion(nextSt, 'float'))

      // ============ ⑭ E5 观测链（仅任务拍发送——04 注入实测每计算拍发=5Hz 服务端打点 ×2，  ============
      // 洪泛拖卡；任务拍每会话个位数次，证据足够。对账非关键路径；失败零阻塞可删）
      f.doubleBranch(hasTask, () => {
        const eloc = f.getEntityLocation(ballRef.value)
        const dmm = f.dataTypeConversion(
          f.multiplication(
            f._3dVectorModuloOperation(f._3dVectorSubtraction(eloc, mPos.value)),
            FIXK
          ),
          'int'
        )
        f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'e5', dmm, tick.value)
      }, () => {})
    }, () => {
      // —— 镜像撕裂：任务拍 tearE（不 ack → 看门狗重提交）；拍门拍 'T'（不应用，重算） ——
      f.doubleBranch(hasTask, () => {
        f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'tearE', e1, tick.value)
      }, () => {
        f.sendSignalToServerNodeGraph(
          OUT_SIG,
          OUT_TAG_TEAR,
          mTick.value,
          mPos.value,
          mVel.value,
          mSpin.value,
          mSt.value
        )
      })
    })
  }, () => {})
})
