// 足球 R2·fb-phys（20008 造物技能图，票 03 六态物理客户端半边，2026-09-03，地图 1073741908）
//
// 触发链照旧：造物 AI 15Hz 施放 → 本图 start 一次执行 = 一拍轮询。
// 接口契约（单一事实源=票 02 执行备注 + 票 01 终态，优先于 R2-DESIGN §4 旧文）：
//   · 球实体 1077936135 = 唯一状态容器：fb_ball_gate:int + 镜像 11
//     （fb_ball_tick/state:int + px..sz:float×9）+ fb_p_* 参数 19
//   · fb_ball_entity:entity 挂丘丘人实例（本图 getSelfEntity→读引用→读球变量 = E5 主链）
//   · E1 寄存器 fb_epoch/fb_ack/fb_sum/fb_t1..t8 挂玩家实体（owner 链照旧）
//   · 状态枚举（sim/src/state.ts）：0=Airborne 1=Bouncing 2=Sliding 3=Rolling
//     4=Rest 5=DribbleControlled——服务端按 Rest=4 停拍，本图同枚举回传
//   · 任务载荷：t1=type（1=KICK: t2..t4=vel×1000, t5..t7=spin×1000 / 2=RESET:
//     t2..t4=pos×1000, t5..t7=vel×1000, t8=state）；dispatcher 测试载荷 t1=pe*1000+1
//     恒为未知类型——跳过应用但仍走 seqlock/ack（E1 观测面不断链）
//   · 回传：sendSignalToServerNodeGraph(fb_ball_state, 'P', base_tick, pos, vel,
//     spin, state)；tag='T'=镜像二读撕裂（服务端不应用；E2 后客户端不再依赖 gate 重开）
//   · 镜像写者=服务端唯一：本图只读镜像+积分+回传，不写任何 fb_ball_*/运动器
// 一拍流程（T3，E2/票17 后客户端不再等 gate 拍门）：
//   停球空转（state==Rest 且无任务）≈ 变量读+比较，不发 P；
//   任务拍（epoch≠ack 且 sum 过）→ 解码物化 → 镜像一致才 ack（否则 tearE 交看门狗
//     重提交）→ 应用+积分一拍 → 回传 'P'（服务端收 ack 唤醒 beat）；
//   常开拍（state≠Rest 且 epoch==ack，不再依赖 fb_ball_gate）→ 镜像 11+参数 19 当拍
//     物化 → 六态积分一拍 → 回传（每施放都试算并发 P，服务端 first-wins 照旧）。
// 物理数学：v4 物理复合族结构（PORTING-MAP §0「结构已对齐」）+ 定稿参数值全部来自
//   fb_p_* 19 变量快照（图内零参数字面量；几何/编码/枚举字面量不属物理参数——
//   PORTING-MAP §1.6 玩法边界/门框几何明确不参数化）。
// 编译硬前置：主配置全图编译（单 entry 必失败）；客户端参数序与服务端相反
//   （getCorrespondingValueFromList(iD, list)；_3dVectorZoom(标量, 向量) 同理反序）。
import { g } from 'genshin-ts/runtime/core'

import { FbSignal } from './signals.js'

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

g.creationSkill({ id: 1082130433, name: '_GSTS_fbPhysSkill' }).on('start', (_evt, f) => {
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

  // ============ ④ 球寻址（E5 主链）+ 停球判定读（E2/票17：gate 拍门退役） ============
  const self = f.getSelfEntity()
  const ballRef = f.localVariable('entity')
  ballRef.set(f.getCustomVariable(self, 'fb_ball_entity').asType('entity'))
  // E2：不再读 fb_ball_gate（服务端拍门关门/重开节流=近距 apply 主瓶颈，票 13 结论）。
  // Rest 防呆改由镜像 state≠4 承担：球停且无任务时空转不试算，避免每施放空算回传洪泛。
  // 与 ⑤ 各读一次 state：镜像若在拍间翻转至 Rest，最多多算一拍，服务端 first-wins/
  // 停拍语义兜底；与旧版 gate 读同为拍内非原子读，不新增撕裂面。
  const stGate = f.getCustomVariable(ballRef.value, 'fb_ball_state').asType('int')
  // R1(3129 判读)：常开放行 75% 垃圾 P（tick 空读=None、自旋 nan；服务端 0 nan=发送侧即被拒，负载/异常源）。
  // 加镜像就绪门 mirrorTick>0（镜像至少应用过一次）；任务拍不受影响（KICK/RESET 照旧）。
  const mirrorTick = f.getCustomVariable(ballRef.value, 'fb_ball_tick').asType('int')

  // 计算拍条件：本拍有真实任务 ∨ (镜像 state≠Rest ∧ 镜像已就绪 mirrorTick>0 ∧ 寄存器空闲 e==a)。
  // e==a 防「任务在途/撕裂未决」时从旧镜像计算顶掉任务回传（first-wins 掉拍）。
  const hasTask = f.greaterThan(tPend.value, 0n)
  const ballRest = f.equal(stGate, 4n)
  const mirrorReady = f.greaterThan(mirrorTick, 0n)
  const shouldCompute = f.logicalOrOperation(
    hasTask,
    f.logicalAndOperation(eEq.value, f.logicalAndOperation(f.logicalNotOperation(ballRest), mirrorReady))
  )
  f.doubleBranch(shouldCompute, () => {
    // ============ ⑤ 镜像读 11（tick 二读防撕裂）+ 当拍物化 ============
    const mTick = f.localVariable('int')
    const mPos = f.localVariable('vec3')
    const mVel = f.localVariable('vec3')
    const mSpin = f.localVariable('vec3')
    const mSt = f.localVariable('int')
    const rv = (name: string) => f.getCustomVariable(ballRef.value, name)
    mTick.set(rv('fb_ball_tick').asType('int'))
    mPos.set(
      f.create3dVector(
        rv('fb_ball_px').asType('float'),
        rv('fb_ball_py').asType('float'),
        rv('fb_ball_pz').asType('float')
      )
    )
    mVel.set(
      f.create3dVector(
        rv('fb_ball_vx').asType('float'),
        rv('fb_ball_vy').asType('float'),
        rv('fb_ball_vz').asType('float')
      )
    )
    mSpin.set(
      f.create3dVector(
        rv('fb_ball_sx').asType('float'),
        rv('fb_ball_sy').asType('float'),
        rv('fb_ball_sz').asType('float')
      )
    )
    mSt.set(rv('fb_ball_state').asType('int'))
    const tick2 = rv('fb_ball_tick').asType('int')
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

      // ============ ⑬ 回传打包（'P' + base_tick；预测值 t+DT） ============
      f.sendSignalToServerNodeGraph(
        FbSignal.fb_ball_state,
        'P',
        mTick.value,
        posF.value,
        velF.value,
        spinSel,
        nextSt
      )

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
      // —— 镜像撕裂：任务拍 tearE（不 ack → 看门狗重提交）；非任务拍 'T'（不应用，回显镜像待下拍重算） ——
      f.doubleBranch(hasTask, () => {
        f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'tearE', e1, tick.value)
      }, () => {
        f.sendSignalToServerNodeGraph(
          FbSignal.fb_ball_state,
          'T',
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
