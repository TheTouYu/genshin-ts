// 足球带球「速度场吸附」复合（参考版「足球地面运动」逆向还原 + 复合化）
// 命名前缀：dribbleField_*
// 模型：连续速度场吸附——每 tick 把球速向「玩家速度分量 + 朝向吸附分量」的合成收敛，
//       球被持续牵引到玩家脚前，玩家转向球跟着转、玩家停球也停。
// 状态协调（2026-08-31 四点合一：信号化）：
//   - state 由状态机图（game.ts）唯一写入（球实体自定义变量，跨图共享）；
//   - 本图只读 state，仅在 CARRIED(4) 驱动；FLYING/ROLLING/SLIDE/GOAL 完全停手；
//   - 状态变化经 state_changed(prev,next) 信号传播（stateCommit 发、本图根图监听）：
//     进入场监护态（FREE/CARRIED）→ 记忆复位（ballVx/Vz/spinW/lostTicks/drivePrev 清零）。
//     旧轮询检测 lastSeenState 链已删——每状态独立逻辑，无叠加、无重复风暴；
//   - 脱脚：CARRIED 且球距玩家 >2m（滞回上沿，防 CARRIED↔ROLLING 震荡）持续 3 tick
//     → 复合内直接发 ball_dropped(vel) 信号请求状态机图转 ROLLING（速度交接）。
// 参考：docs/game-engine-knowledge/football-dribble-velocity-field.md
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str, vec3 } from 'genshin-ts/runtime/value'
import { EntityType } from 'genshin-ts/definitions/enum'
import { Signal } from '../resources/signals.js'

// —— 速度场参数（编译期预计算为字面量，集中可调）——
const TICK = 0.12 // 定时器间隔（秒），参考版 0.12s
const FWD_WEIGHT = 0.7 // 合成方向里玩家朝向的权重
const REL_WEIGHT = 0.3 // 合成方向里相对方向（球-玩家）的权重
const SPEED_GAIN = 1.2 // 目标球速 = vP × 此系数。乘性保证"玩家停球停"（零对零）；上限 1.2×K_MAX=1.44×vP（验收口径）
const K_MIN = 0.1 // k(fwd) 连续坡度下限（球在身后几乎不推）
const K_MAX = 1.2 // k(fwd) 上限（正前方全力）
const BALL_R = 0.25 // 球半径（贴地高度 = 球心 y；ω=v/R 纯滚换算）
const RAD2DEG = 57.29577951308232 // 180/π（spinW 以 rad/s 维护，喂设备前 ×此值）
const INV_TICK = 8.333333333333334 // 1/TICK（拉回地面速度系数）

// —— 速度非线性收敛（2026-08-31 四点合一，替代 0.95 叠加+三拍节流）——
// v ← v + (target−v)·G，G = |target−v| / (|target−v| + C)：
//   d 大 → G→1 快贴合；d→0 → G→0 无限逼近；恒 <1 永不超调（凸组合，根除"越带越快"）。
// 出区 target=0 同式衰减 = 摩擦刹车（d 大刹得快，d 小缓收）。
const CONV_C = 1.5 // 收敛常数 C（m/s）：d=C 时 G=0.5

// —— 触球冲量（2026-08-31 日志 3038 复测反馈：旧冲量=1.2×k×vP 实测只有玩家速 44%
// （k=0.37 侧/脚跟进入）且无保底——慢走/贴脚触球无感，"看不到给冲量"）——
// 触球拍（进区上升沿）速度 := dir × max(TOUCH_MIN, TOUCH_GAIN×vFinal)：
// 增益放大 + 保底速度；后续拍由 G 律收敛回 target（不叠加；瞬时超调仅触球拍一拍，
// 是"永不超调"唯一许可的例外——冲量手感来源）。
const TOUCH_GAIN = 1.6 // 触球拍冲量增益
const TOUCH_MIN = 3.0 // 触球拍保底速度（m/s）：慢走/站立触球也有可感知推球

// —— 旋转摩擦累积（ω 是状态量，替代 R1 的逐拍纯滚直写）——
// 触球冲量必然滑动：v 跳上去、ω 还是慢的；摩擦每拍把 ω 拉向纯滚 v/R，滑差收敛。
// Δω = K_F·(v/R − ω) ≡ K_F·slip/R（slip=|v|−ω·R）；凸组合（K_F<1）永不超调。
const K_F = 0.35 // 摩擦增益/拍

// 牵引区与脱脚参数
const PULL_DIST2 = 2.25 // 球距玩家距离² < 2.25（1.5m）才牵引
const PULL_FWD_MIN = -0.3 // 球在玩家身后超过此值不牵引
const LOST_TICKS_MAX = 3 // 连续脱牵引 3 tick（0.36s）→ 请求脱脚
const DROP_DIST2 = 4.0 // 脱脚滞回上沿（2.0m）：>此距离才计 lostTicks。与获得下沿
// （state.ts CARRY_DIST2=4.0）构成施密特滞回：1.5~2m 之间刹停待牵引、不脱脚，
// 根除"获得 2m / 脱脚 1.5m"边界上的 CARRIED↔ROLLING 震荡（用户成功口径③）
const DEVICE_T = 0.15 // 设备时长 > 拍距 0.12s：相邻设备重叠 25%，消除调度抖动的安全间隙（用户定调丝滑公式，一个字不动：0.12s 定时器 + 0.15s 同名运动器自动顶替）

// 状态常量（与 game.ts 判定表一致）
const STATE_CARRIED = 4

// ================================================================
// 获取持球者角色实体（纯数据）：单人=场上角色列表第一个
// ================================================================
export const dribbleFieldGetRole = g.defineComposite('dribble_field_get_role', {
  inputs: {},
  outputs: { role: { type: 'entity' } },
  build: (_i, f) => {
    const list = f.getSpecifiedTypeOfEntitiesOnTheField(EntityType.Character)
    return { role: f.getCorrespondingValueFromList(list, new int(0)) }
  }
})

// ================================================================
// 速度场计算（纯数据）：输入玩家/球状态 → 输出目标球速向量（水平）
// （2026-08-31 删除分段 clamp 复合 dribble_field_clamp：非前位压速 0.32~0.4 致
// 球跟不上玩家=慢走不动；见 compute 内 3016 修复注释）
// ================================================================
export const dribbleFieldCompute = g.defineComposite('dribble_field_compute', {
  inputs: {
    playerPos: { type: 'vec3' },
    playerFwd: { type: 'vec3' },
    playerSpd: { type: 'float' },
    ballPos: { type: 'vec3' }
  },
  outputs: { newVelX: { type: 'float' }, newVelZ: { type: 'float' }, touchX: { type: 'float' }, touchZ: { type: 'float' }, fwd: { type: 'float' }, dist2: { type: 'float' } },
  build: ({ playerPos, playerFwd, playerSpd, ballPos }, f) => {
    // 相对向量 D = B - P
    const D = f._3dVectorSubtraction(ballPos, playerPos)
    // 归一化 Dn
    const Dn = f._3dVectorNormalization(D)
    // 前后分量 fwd = dot(F, Dn)
    const fwd = f._3dVectorDotProduct(playerFwd, Dn)
    // 距离² dist2 = dot(D, D)
    const dist2 = f._3dVectorDotProduct(D, D)
    // 合成方向 dir = normalize(0.7·F + 0.3·Dn)
    const fwdPart = f._3dVectorZoom(playerFwd, FWD_WEIGHT)
    const relPart = f._3dVectorZoom(Dn, REL_WEIGHT)
    const dir = f._3dVectorNormalization(f._3dVectorAddition(fwdPart, relPart))
    // 目标球速 vTarget = vP × SPEED_GAIN
    const vTarget = f.multiplication(playerSpd, SPEED_GAIN)
    // k(fwd) 连续坡度（我们自己的形状）：fwd ≤ -0.3（牵引前沿）→ K_MIN=0.1（身后
    // 几乎不推）；fwd ≥ 0.9（正前）→ K_MAX=1.2（全力）；中间线性。
    // clamp01 无节点依赖实现：max(x,0)=(x+|x|)/2；min(1,y)=(1+y−|1−y|)/2。
    const fRise = f.addition(fwd, 0.3)
    const tRaw = f.division(fRise, 1.2)
    const tMax0 = f.division(f.addition(tRaw, f.absoluteValueOperation(tRaw)), 2)
    const t01 = f.division(
      f.subtraction(f.addition(1, tMax0), f.absoluteValueOperation(f.subtraction(1, tMax0))),
      2
    )
    const k = f.addition(f.multiplication(1.1, t01), K_MIN) // K_MAX−K_MIN=1.1
    const vFinal = f.multiplication(vTarget, k)
    // 速度向量 velDir = dir × vFinal（作为收敛目标；叠加/节流已由 tick 的 G 律接管）
    const velDir = f._3dVectorZoom(dir, vFinal)
    // 触球冲量向量 velTouch = dir × max(TOUCH_MIN, TOUCH_GAIN×vFinal)（3038 反馈修复）：
    // max 无节点依赖实现同 k(fwd)：max(a,b)=(a+b+|a−b|)/2
    const vBoost = f.multiplication(TOUCH_GAIN, vFinal)
    const touchMag = f.division(
      f.addition(f.addition(TOUCH_MIN, vBoost), f.absoluteValueOperation(f.subtraction(TOUCH_MIN, vBoost))),
      2
    )
    const velTouch = f._3dVectorZoom(dir, touchMag)
    // 拆出水平分量（y 由调用方按地面拉回处理）
    const nv = f.split3dVector(velDir)
    const nt = f.split3dVector(velTouch)
    return { newVelX: nv.xComponent, newVelZ: nv.zComponent, touchX: nt.xComponent, touchZ: nt.zComponent, fwd, dist2 }
  }
})

// ================================================================
// 球体滚动旋转计算（纯数据）：速度向量（定轴）+ ω 状态 → 设备入参（°/s + 轴）
// 2026-08-31 四点合一：angVel 不再由 |v|/R 直写（R1 做法），改读状态量 spinRad
// （rad/s，摩擦链逐步获得）；半径换算已前移到 tick 的 wRoll=|v|/R。
// ================================================================
export const dribbleFieldRollSpin = g.defineComposite('dribble_field_roll_spin', {
  inputs: { vel: { type: 'vec3' }, spinRad: { type: 'float' }, curRot: { type: 'vec3' } },
  outputs: { angVel: { type: 'float' }, axis: { type: 'vec3' } },
  build: ({ vel, spinRad, curRot }, f) => {
    // 滚动轴 = normalize(cross((0,1,0), vel))
    const up = f.create3dVector(0, 1, 0)
    const cross = f._3dVectorCrossProduct(up, vel)
    const worldAxis = f._3dVectorNormalization(cross)
    // 设备收度/秒：spinW 以 rad/s 维护，喂设备 ×180/π（量纲陷阱，见 PROGRESS）
    const angVel = f.multiplication(spinRad, RAD2DEG)
    // 旋转轴朝向：把世界轴转回球的局部系（YXS 内旋逆旋转）
    const r = f.split3dVector(curRot)
    const negX = f.multiplication(r.xComponent, -1)
    const negY = f.multiplication(r.yComponent, -1)
    const negZ = f.multiplication(r.zComponent, -1)
    const afterY = f._3dVectorRotation(f.create3dVector(0, negY, 0), worldAxis)
    const afterX = f._3dVectorRotation(f.create3dVector(negX, 0, 0), afterY)
    const axis = f._3dVectorRotation(f.create3dVector(0, 0, negZ), afterX)
    return { angVel, axis }
  }
})

// ================================================================
// 速度场 tick（exec 复合）：读状态 → 判定 → 计算 → 写回 + 运动器
// 仅 CARRIED 驱动；脱脚（>2m 持续 3 tick）→ 复合内直接发 ball_dropped(vel) 信号
// 状态记忆复位不在此处（信号监听方在根图做——每状态独立逻辑，无叠加）
// ================================================================
export const dribbleFieldTick = g.defineComposite('dribble_field_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  build: ({ e }, f) => {
    // 读状态（重表达式只出现一次）
    const roleC = f.callComposite(dribbleFieldGetRole, {})
    const role = roleC.role
    const roleLoc = f.getEntityLocationAndRotation(role)
    const ballLoc = f.getEntityLocationAndRotation(e)
    const playerSpd = f.queryCharacterSCurrentMovementSpd(role).currentSpeed

    // 球状态（跨图共享自定义变量，状态机图写）：FREE(0)/CARRIED(4)=场独占驱动——
    // 连续控制器不等获得判定（几何即门，无延时）；CARRIED 仅为踢球语义标志。
    // FLY/ROLL/SLIDE/GOAL=物理链监管，场完全停手（零设备）。
    const ballState = f.getCustomVariable(e, new str('state')).asType('int')
    const stateCarried = f.equal(ballState, 4n)
    const stateFree = f.equal(ballState, 0n)
    const canDrive = f.logicalOrOperation(stateFree, stateCarried)
    // 物化球位置快照（comp.ballPos 与 y 拉回两处消费，防 Get Entity Location 重求值）
    const sBallPos = f.registerExecNode('set_node_graph_variable', [new str('tmpBallPos'), ballLoc.location, new bool(false)])

    // 图变量读取（轻量；均在写回前消费，读到的都是本拍旧值）
    const ballVx = f.getNodeGraphVariable('ballVx').asType('float')
    const ballVz = f.getNodeGraphVariable('ballVz').asType('float')
    const lostTicks = f.getNodeGraphVariable('lostTicks').asType('float')
    const drivePrev = f.getNodeGraphVariable('drivePrev').asType('bool')
    const spinW = f.getNodeGraphVariable('spinW').asType('float')

    // 计算（纯数据）：物化角色位姿后传入，避免重复求值
    const comp = f.callComposite(dribbleFieldCompute, {
      playerPos: roleLoc.location, playerFwd: f.getEntityForwardVector(role), playerSpd,
      ballPos: f.getNodeGraphVariable('tmpBallPos').asType('vec3')
    })

    // 几何反馈（每拍实时）：区=脚前 1.5m 半圆；驱动=场监管 且 在区
    const distOk = f.lessThan(comp.dist2, PULL_DIST2)
    const fwdOk = f.greaterThan(comp.fwd, PULL_FWD_MIN)
    const inZone = f.logicalAndOperation(distOk, fwdOk)
    const drive = f.logicalAndOperation(canDrive, inZone)
    // 触球拍 = 进区上升沿（drive 恢复的第一拍）：v 全额设定，ω 仍是慢值 → 滑动
    const edge = f.logicalAndOperation(drive, f.logicalNotOperation(drivePrev))
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')

    // 速度律（非线性收敛，2026-08-31 四点合一；触球增益 3038 复测修订）：
    //   target = drive ? velDir : 0（出区 target=0 同式衰减 = 摩擦刹车）
    //   非触球拍：v ← v + (target−v)·G，G = d/(d+C)，d = |target−v|（恒<1 不超调）
    //   触球拍（进区上升沿）：v := touch 向量（TOUCH_GAIN 放大 + TOUCH_MIN 保底）——
    //     数据选择 conv·(1−e) + touch·e；瞬时超调仅此一拍，后续拍 G 律收敛回 target
    const driveF = b2f(drive)
    const targetX = f.multiplication(comp.newVelX, driveF)
    const targetZ = f.multiplication(comp.newVelZ, driveF)
    const diffX = f.subtraction(targetX, ballVx)
    const diffZ = f.subtraction(targetZ, ballVz)
    const distDiff = f._3dVectorModuloOperation(f.create3dVector(diffX, 0, diffZ))
    const gNl = f.division(distDiff, f.addition(distDiff, CONV_C))
    const convX = f.addition(ballVx, f.multiplication(diffX, gNl))
    const convZ = f.addition(ballVz, f.multiplication(diffZ, gNl))
    const eF = b2f(edge)
    const keepF = f.subtraction(1, eF)
    const newVelX = f.addition(f.multiplication(convX, keepF), f.multiplication(comp.touchX, eF))
    const newVelZ = f.addition(f.multiplication(convZ, keepF), f.multiplication(comp.touchZ, eF))

    // y 高度修复：球离地时每 tick 拉回地面（vy = (BALL_R − 球当前y)/TICK）
    const ballY = f.split3dVector(f.getNodeGraphVariable('tmpBallPos').asType('vec3')).yComponent
    const dy = f.subtraction(BALL_R, ballY)
    const vy = f.multiplication(dy, INV_TICK)
    const finalVel = f.create3dVector(newVelX, vy, newVelZ)

    // 脱脚计数（滞回+身后并联合判，2026-08-31 日志 3038 rec538-586 铁证修复）：
    // 旧滞回只看距离——球在身后 0.89m（fwd=−0.96）时 fwd 守卫关驱动、距离<2m 关脱手
    // → 脚跟死锁（玩家跑球不动）。恢复"身后持续 3 拍"与">2m 持续 3 拍"并联脱手；
    // 获得侧同步加 fwd 门（state_possess_check），身后球不获得 → 无脱手/再获得死循环。
    const carriedFar = f.logicalAndOperation(stateCarried, f.greaterThan(comp.dist2, DROP_DIST2))
    const notFwdOk = f.logicalNotOperation(fwdOk)
    const lostCause = f.logicalOrOperation(carriedFar, notFwdOk)
    const carriedLost = f.logicalAndOperation(stateCarried, lostCause)
    const clF = b2f(carriedLost)
    const lostNew = f.multiplication(f.addition(lostTicks, 1), clF)
    const dropped = f.logicalAndOperation(carriedLost, f.greaterThanOrEqualTo(lostNew, LOST_TICKS_MAX))

    // 脱脚请求（复合内直接发信号；状态机图唯一仲裁落地，宿主不参与）
    // 放在写回之前求值（dropped 输入 lostTicks 若在写回后重求值会读到新值，重复求值陷阱）
    f.doubleBranch(
      dropped,
      () => {
        f.sendSignal(Signal.ball_dropped, f.create3dVector(newVelX, 0, newVelZ))
      },
      () => {}
    )

    // 写回（无条件；消费点一律读物化快照 tmpDribbleVel，避免 newVelX/Z 多消费重算）
    const sTmp = f.registerExecNode('set_node_graph_variable', [new str('tmpDribbleVel'), finalVel, new bool(false)])
    const fv = f.split3dVector(f.getNodeGraphVariable('tmpDribbleVel').asType('vec3'))
    const sVx = f.registerExecNode('set_node_graph_variable', [new str('ballVx'), fv.xComponent, new bool(false)])
    f.connect(sTmp, 0, sVx, 0)
    const sVz = f.registerExecNode('set_node_graph_variable', [new str('ballVz'), fv.zComponent, new bool(false)])
    f.connect(sVx, 0, sVz, 0)
    const sLost = f.registerExecNode('set_node_graph_variable', [new str('lostTicks'), lostNew, new bool(false)])
    f.connect(sVz, 0, sLost, 0)
    const sDrivePrev = f.registerExecNode('set_node_graph_variable', [new str('drivePrev'), drive, new bool(false)])
    f.connect(sLost, 0, sDrivePrev, 0)

    // 旋转摩擦累积（v 源 = tmpDribbleVel 快照，R1 取数点保留）：
    //   wRoll = |v_h| / R（纯滚目标，rad/s）；Δω = K_F·(wRoll − spinW) ≡ K_F·slip/R
    //   spinW += Δω —— ω 是状态量：触球拍 v 全额跳上去而 spinW 还是慢值 → 滑动；
    //   摩擦每拍把 ω 拉向纯滚（凸组合，K_F<1 永不超调）；v 衰减时 ω 同步被拉低。
    //   custody 复位（物理链→场）时根图监听 state_changed 把 spinW 清零——
    //   重新接近必有滑动（用户物理模型）。
    const vh = f._3dVectorModuloOperation(f.create3dVector(fv.xComponent, 0, fv.zComponent))
    const wRoll = f.division(vh, BALL_R)
    const dW = f.multiplication(K_F, f.subtraction(wRoll, spinW))
    const spinWNew = f.addition(spinW, dW)

    // 设备供给（连续控制器不变量①：永不断供）：场监管期间每拍无条件写设备——
    // 在区=驱动速度，出区=刹停中的 v；物理链监管态完全停手（零设备，physics 链独占球）。
    // 定时器为 loop 循环（根图启动一次），本复合不再自重启。
    // 无 outflow（宿主不依赖本复合的完成信号，避免多 outflow 续链陷阱）
    f.doubleBranch(
      canDrive,
      () => {
        // 自旋入参 = 状态量 spinW（摩擦逐步获得），不再是 |v|/R 直写（R1 替代）
        const spin = f.callComposite(dribbleFieldRollSpin, {
          vel: f.create3dVector(fv.xComponent, 0, fv.zComponent), spinRad: spinWNew, curRot: ballLoc.rotate
        })
        // 设备时长 DEVICE_T=0.15 > 拍距 0.12：相邻设备重叠，速度切换无缝（用户定调不动）
        const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [
          e, new str('dribbleCtrl'), new float(DEVICE_T), f.getNodeGraphVariable('tmpDribbleVel').asType('vec3')
        ])
        const rot = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
          e, new str('角度'), new float(DEVICE_T), spin.angVel, spin.axis
        ])
        f.connect(lin, 0, rot, 0)
        // spinW 写回放在设备之后（rot 消费 spinWNew 于写前，读到本拍旧 spinW ✓）
        const sSpinW = f.registerExecNode('set_node_graph_variable', [new str('spinW'), spinWNew, new bool(false)])
        f.connect(rot, 0, sSpinW, 0)
      },
      () => {}
    )
    return {}
  }
})
