// 足球带球「速度场吸附」复合（参考版「足球地面运动」逆向还原 + 复合化）
// 命名前缀：dribbleField_*
// 模型：连续速度场吸附——每 tick 把球速重算为「玩家速度分量 + 朝向吸附分量」的合成，
//       球被持续牵引到玩家脚前，玩家转向球跟着转、玩家停球也停。
// 状态协调（2026-08-30 状态机唯一仲裁）：
//   - state 由状态机图（game.ts）唯一写入（球实体自定义变量，跨图共享）；
//   - 本图只读 state，仅在 CARRIED(4) 驱动；FLYING/ROLLING/SLIDE/GOAL 完全停手；
//   - 进入 CARRIED（轮询迁移检测 lastSeenState）→ 球速清零重算，节流计数复位；
//   - 脱脚：CARRIED 但球脱离牵引区（>1.5m 或身后）持续 3 tick → 复合内直接发
//     ball_dropped(vel) 信号请求状态机图转 ROLLING（速度交接，宿主不参与）。
// 参考：docs/game-engine-knowledge/football-dribble-velocity-field.md
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str, vec3 } from 'genshin-ts/runtime/value'
import { EntityType } from 'genshin-ts/definitions/enum'
import { Signal } from '../resources/signals.js'

// —— 速度场参数（编译期预计算为字面量，集中可调）——
const TICK = 0.12 // 定时器间隔（秒），参考版 0.12s
const FWD_WEIGHT = 0.7 // 合成方向里玩家朝向的权重
const REL_WEIGHT = 0.3 // 合成方向里相对方向（球-玩家）的权重
const SPEED_GAIN = 1.2 // 球速 = 玩家速度 × 此系数（略快于玩家）
const DAMP = 0.95 // 旧球速每 tick 衰减系数（阻尼，防越滚越快）
const BALL_R = 0.25 // 球半径（贴地高度 = 球心 y）
const RAD2DEG = 57.29577951308232 // 180/π
const INV_TICK = 8.333333333333334 // 1/TICK（拉回地面速度系数）

// 牵引区与脱脚参数
const PULL_DIST2 = 2.25 // 球距玩家距离² < 2.25（1.5m）才牵引
const PULL_FWD_MIN = -0.3 // 球在玩家身后超过此值不牵引
const LOST_TICKS_MAX = 3 // 连续脱牵引 3 tick（0.36s）→ 请求脱脚

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
// 分段 clamp（纯数据）：前后分量 fwd → 前后系数 k1、左右系数 k2
// ================================================================
export const dribbleFieldClamp = g.defineComposite('dribble_field_clamp', {
  inputs: { fwd: { type: 'float' } },
  outputs: { k1: { type: 'float' }, k2: { type: 'float' } },
  build: ({ fwd }, f) => {
    const g09 = f.greaterThan(fwd, 0.9)
    const g05 = f.greaterThan(fwd, 0.5)
    const g0 = f.greaterThan(fwd, 0)
    const gNeg05 = f.greaterThan(fwd, -0.5)
    // 数据选择（不分裂执行流）：bool→int→float 两段转换（引擎无 bool→float 直转）
    const b1 = f.dataTypeConversion(f.dataTypeConversion(gNeg05, 'int'), 'float')
    const b2 = f.dataTypeConversion(f.dataTypeConversion(g0, 'int'), 'float')
    const b3 = f.dataTypeConversion(f.dataTypeConversion(g05, 'int'), 'float')
    const b4 = f.dataTypeConversion(f.dataTypeConversion(g09, 'int'), 'float')
    const k1 = f.addition(
      f.addition(
        f.addition(
          f.addition(0.1, f.multiplication(0.1, b1)),
          f.multiplication(0.3, b2)
        ),
        f.multiplication(0.5, b3)
      ),
      f.multiplication(0.2, b4)
    )
    const k2 = f.addition(
      f.addition(0.3, f.multiplication(0.5, b2)),
      f.multiplication(0.4, b4)
    )
    return { k1, k2 }
  }
})

// ================================================================
// 速度场计算（纯数据）：输入玩家/球状态 → 输出新球速向量（水平）
// ================================================================
export const dribbleFieldCompute = g.defineComposite('dribble_field_compute', {
  inputs: {
    playerPos: { type: 'vec3' },
    playerFwd: { type: 'vec3' },
    playerSpd: { type: 'float' },
    ballPos: { type: 'vec3' },
    ballVx: { type: 'float' },
    ballVz: { type: 'float' }
  },
  outputs: { newVelX: { type: 'float' }, newVelZ: { type: 'float' }, fwd: { type: 'float' }, dist2: { type: 'float' } },
  build: ({ playerPos, playerFwd, playerSpd, ballPos, ballVx, ballVz }, f) => {
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
    // 目标球速 vTarget = vP × 1.2
    const vTarget = f.multiplication(playerSpd, SPEED_GAIN)
    // 分段 clamp
    const clamp = f.callComposite(dribbleFieldClamp, { fwd })
    // 最终球速 vFinal = vTarget × k1 × k2
    const vFinal = f.multiplication(f.multiplication(vTarget, clamp.k1), clamp.k2)
    // 速度向量 velDir = dir × vFinal
    const velDir = f._3dVectorZoom(dir, vFinal)
    // 旧球速衰减 + 叠加（水平分量）
    const oldVx = f.multiplication(ballVx, DAMP)
    const oldVz = f.multiplication(ballVz, DAMP)
    const oldVel = f.create3dVector(oldVx, 0, oldVz)
    const newVel = f._3dVectorAddition(oldVel, velDir)
    // 拆出水平分量（y 由调用方按地面拉回处理）
    const nv = f.split3dVector(newVel)
    return { newVelX: nv.xComponent, newVelZ: nv.zComponent, fwd, dist2 }
  }
})

// ================================================================
// 球体滚动旋转计算（纯数据）：速度向量 + 半径 + 当前旋转 → 角速度 + 旋转轴
// ================================================================
export const dribbleFieldRollSpin = g.defineComposite('dribble_field_roll_spin', {
  inputs: { vel: { type: 'vec3' }, radius: { type: 'float' }, curRot: { type: 'vec3' } },
  outputs: { angVel: { type: 'float' }, axis: { type: 'vec3' } },
  build: ({ vel, radius, curRot }, f) => {
    // 滚动轴 = normalize(cross((0,1,0), vel))
    const up = f.create3dVector(0, 1, 0)
    const cross = f._3dVectorCrossProduct(up, vel)
    const worldAxis = f._3dVectorNormalization(cross)
    // 角速度 = |vel| / radius × 180/π（rad/s → °/s）
    const spd = f._3dVectorModuloOperation(vel)
    const angVel = f.multiplication(f.division(spd, radius), RAD2DEG)
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
// 速度场 tick（exec 复合）：读状态 → 判定 → 计算 → 写回 + 运动器 + 自重启
// 仅 CARRIED 驱动；脱脚（脱离牵引区 3 tick）→ 复合内直接发 ball_dropped(vel) 信号
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

    // 球状态（跨图共享的自定义变量，状态机图写）：4=CARRIED 才驱动
    const ballState = f.getCustomVariable(e, new str('state')).asType('int')
    const stateCarried = f.equal(ballState, 4n)
    // 物化球位置快照（comp.ballPos 与 y 拉回两处消费，防 Get Entity Location 重求值）
    const sBallPos = f.registerExecNode('set_node_graph_variable', [new str('tmpBallPos'), ballLoc.location, new bool(false)])

    // 图变量读取（轻量）
    const ballVx = f.getNodeGraphVariable('ballVx').asType('float')
    const ballVz = f.getNodeGraphVariable('ballVz').asType('float')
    const lastSeen = f.getNodeGraphVariable('lastSeenState').asType('int')
    const lostTicks = f.getNodeGraphVariable('lostTicks').asType('float')

    // 进入 CARRIED 检测（轮询迁移：lastSeen != 4 且现为 4）→ 球速/脱脚计数复位
    const entered = f.logicalAndOperation(stateCarried, f.lessThan(lastSeen, 4n))
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const enteredF = b2f(entered)
    const notEnteredF = f.subtraction(1, enteredF)
    const baseVx = f.multiplication(ballVx, notEnteredF)
    const baseVz = f.multiplication(ballVz, notEnteredF)

    // 计算（纯数据）：物化角色位姿后传入，避免重复求值
    const comp = f.callComposite(dribbleFieldCompute, {
      playerPos: roleLoc.location, playerFwd: f.getEntityForwardVector(role), playerSpd,
      ballPos: f.getNodeGraphVariable('tmpBallPos').asType('vec3'), ballVx: baseVx, ballVz: baseVz
    })

    // 牵引条件：CARRIED 且 球在脚前 1.5m 内 且 不在身后
    const distOk = f.lessThan(comp.dist2, PULL_DIST2)
    const fwdOk = f.greaterThan(comp.fwd, PULL_FWD_MIN)
    const pull = f.logicalAndOperation(f.logicalAndOperation(stateCarried, distOk), fwdOk)

    // 数据选择：牵引时用合成球速，否则只衰减（球自然减速，不隔空吸球）
    const decayVx = f.multiplication(baseVx, DAMP)
    const decayVz = f.multiplication(baseVz, DAMP)
    const pullF = b2f(pull)
    const newVelX = f.addition(decayVx, f.multiplication(f.subtraction(comp.newVelX, decayVx), pullF))
    const newVelZ = f.addition(decayVz, f.multiplication(f.subtraction(comp.newVelZ, decayVz), pullF))

    // y 高度修复：球离地时每 tick 拉回地面（vy = (BALL_R − 球当前y)/TICK）
    const ballY = f.split3dVector(f.getNodeGraphVariable('tmpBallPos').asType('vec3')).yComponent
    const dy = f.subtraction(BALL_R, ballY)
    const vy = f.multiplication(dy, INV_TICK)
    const finalVel = f.create3dVector(newVelX, vy, newVelZ)

    // 脱脚计数（纯数据）：CARRIED 但不满足牵引 → lostTicks+1；≥3 → 请求脱脚
    const carriedNotPull = f.logicalAndOperation(stateCarried, f.logicalNotOperation(pull))
    const cnPF = b2f(carriedNotPull)
    const lostNew = f.multiplication(f.addition(lostTicks, 1), cnPF)
    const lostAfterEntry = f.multiplication(lostNew, notEnteredF)
    const dropped = f.logicalAndOperation(carriedNotPull, f.greaterThanOrEqualTo(lostAfterEntry, 3))

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
    const sLost = f.registerExecNode('set_node_graph_variable', [new str('lostTicks'), lostAfterEntry, new bool(false)])
    f.connect(sVz, 0, sLost, 0)
    const sSeen = f.registerExecNode('set_node_graph_variable', [new str('lastSeenState'), ballState, new bool(false)])
    f.connect(sLost, 0, sSeen, 0)

    // 执行分支：牵引 → 运动器 + 自重启；否则完全停手（不激活任何运动器）+ 自重启
    // 无 outflow（宿主不依赖本复合的完成信号，避免多 outflow 续链陷阱）
    f.doubleBranch(
      pull,
      () => {
        const spin = f.callComposite(dribbleFieldRollSpin, {
          vel: f.getNodeGraphVariable('tmpDribbleVel').asType('vec3'), radius: BALL_R, curRot: ballLoc.rotate
        })
        const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [
          e, new str('dribbleCtrl'), new float(TICK), f.getNodeGraphVariable('tmpDribbleVel').asType('vec3')
        ])
        const rot = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
          e, new str('角度'), new float(TICK), spin.angVel, spin.axis
        ])
        f.connect(lin, 0, rot, 0)
        f.registerExecNode('start_timer', [e, new str('dribble_field'), new bool(false), f.assemblyList([TICK], 'float')])
      },
      () => {
        f.registerExecNode('start_timer', [e, new str('dribble_field'), new bool(false), f.assemblyList([TICK], 'float')])
      }
    )
    return {}
  }
})
