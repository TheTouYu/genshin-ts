// 足球带球「速度场吸附」复合（参考版「足球地面运动」逆向还原 + 复合化）
// 命名前缀：dribbleField_*
// 模型：连续速度场吸附——每 tick 把球速重算为「玩家速度分量 + 朝向吸附分量」的合成，
//       球被持续牵引到玩家脚前，玩家转向球跟着转、玩家停球也停。
//       与旧「冲量踢球」（踢一脚滚出去）是两种物理模型，本模块是前者。
// 参考：docs/game-engine-knowledge/football-dribble-velocity-field.md
// 定时器：0.12s 循环（参考版 8.3Hz，比旧 0.2s 更密，手感更跟手）
//
// 玩家速度来源：queryCharacterSCurrentMovementSpd（依赖「监听移动速率」buff，用户会打开）。
//   参考版即用此节点；buff 未打开时返回 0，球速目标=0、球跟不上玩家。
// 球状态协调：读球实体自定义变量 state（主图写，跨图共享），0=静止 FREE 才驱动，
//   射门/传球飞行中（state!=0）停手，不与主图抢驱动。
//
// 2026-08-30 日志 2999 实证修复：
//   - 高度差：速度场 y 恒 0 导致球保持离地高度（实测 y=0.9387 悬浮滚动）→
//     运动器速度 y = (BALL_R − 球当前y)/TICK 每 tick 拉回地面。
//   - 不流畅：单 tick 11.4KB 执行记录，Get Entity Forward Vector/Get Entity Location
//     被多个消费点重复求值（playerFwd 单帧 8 次）→ 重表达式先物化到图变量
//     （exec 链首 set 一次，消费点 get 读轻量快照），消除重复重算。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str, vec3 } from 'genshin-ts/runtime/value'
import { EntityType } from 'genshin-ts/definitions/enum'

// —— 速度场参数（编译期预计算为字面量，集中可调）——
const TICK = 0.12 // 定时器间隔（秒），参考版 0.12s
const FWD_WEIGHT = 0.7 // 合成方向里玩家朝向的权重
const REL_WEIGHT = 0.3 // 合成方向里相对方向（球-玩家）的权重
const SPEED_GAIN = 1.2 // 球速 = 玩家速度 × 此系数（略快于玩家）
const DAMP = 0.95 // 旧球速每 tick 衰减系数（阻尼，防越滚越快）
const BALL_R = 0.25 // 球半径（贴地高度 = 球心 y）
const RAD2DEG = 57.29577951308232 // 180/π
const INV_TICK = 8.333333333333334 // 1/TICK（拉回地面速度系数）

// 踢球节流参数（参考版 lastKickTick 逻辑）
const KICK_COOLDOWN_TICKS = 3 // 距上次踢 ≥3 tick（0.36s）才再踢
const KICK_DIST2 = 2.25 // 球距玩家距离² < 2.25（1.5m）才踢
const KICK_FWD_MIN = -0.3 // 球在玩家身后超过此值不踢（不吸身后球）

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
// 参考版用同一个 fwd 分段（未单独算左右分量），阈值/系数不同
// ================================================================
export const dribbleFieldClamp = g.defineComposite('dribble_field_clamp', {
  inputs: { fwd: { type: 'float' } },
  outputs: { k1: { type: 'float' }, k2: { type: 'float' } },
  build: ({ fwd }, f) => {
    // k1（前后系数）：fwd 越大推力越强，球在身后几乎不推
    // 分段：>0.9→1.2 / 0.5~0.9→1.0 / 0~0.5→0.5 / -0.5~0→0.2 / ≤-0.5→0.1
    const g09 = f.greaterThan(fwd, 0.9)
    const g05 = f.greaterThan(fwd, 0.5)
    const g0 = f.greaterThan(fwd, 0)
    const gNeg05 = f.greaterThan(fwd, -0.5)
    // 数据选择（不分裂执行流）：bool→int→float 两段转换（引擎无 bool→float 直转）
    // k1 = 0.1 + 0.1·[fwd>-0.5] + 0.3·[fwd>0] + 0.5·[fwd>0.5] + 0.2·[fwd>0.9]
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
    // k2（左右系数）：>0.9→1.2 / 0~0.9→0.8 / ≤0→0.3
    // k2 = 0.3 + 0.5·[fwd>0] + 0.4·[fwd>0.9]
    const k2 = f.addition(
      f.addition(0.3, f.multiplication(0.5, b2)),
      f.multiplication(0.4, b4)
    )
    return { k1, k2 }
  }
})

// ================================================================
// 速度场计算（纯数据）：输入玩家/球状态 → 输出新球速向量（水平）
// 核心公式（参考版逐节点还原）：
//   D = B - P；Dn = normalize(D)；fwd = dot(F, Dn)
//   dir = normalize(0.7·F + 0.3·Dn)
//   vTarget = vP × 1.2
//   vFinal = vTarget × k1 × k2
//   newVelXZ = (ballVx·0.95, 0, ballVz·0.95) + dir × vFinal
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
// 参考版「球体滚动旋转计算」复合（14 节点）的复合化等价
// 滚动轴 = normalize(cross(上向量, 速度方向))；角速度 = |v| / r（纯滚动无滑）
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
// 踢球节流：距上次踢 ≥3 tick 且球在脚前 1.5m 内且球不在身后且球静止 FREE → 施加吸附力；
//           否则只做衰减（球自然减速，不隔空吸球）
// 2026-08-30 负载修复：重表达式（GetEntityForwardVector/GetEntityLocationAndRotation）
//   先物化到图变量快照（exec 链首 set 一次），消费点 getNodeGraphVariable 读轻量快照。
// ================================================================
export const dribbleFieldTick = g.defineComposite('dribble_field_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    // 读状态（重表达式只出现一次，物化到图变量快照）
    const roleC = f.callComposite(dribbleFieldGetRole, {})
    const role = roleC.role
    const roleLoc = f.getEntityLocationAndRotation(role)
    const ballLoc = f.getEntityLocationAndRotation(e)

    // 玩家速度：queryCharacterSCurrentMovementSpd（依赖「监听移动速率」buff，用户会打开）
    const playerSpd = f.queryCharacterSCurrentMovementSpd(role).currentSpeed

    // 球状态（跨图共享的自定义变量，主图写）：0=静止 FREE 才驱动
    // 2026-08-30 日志 3000 修复：state!=0（射门/传球飞行/滚滑中）完全停手，
    //   不激活任何运动器——否则与 game 图的 physics 运动器冲突（物理回归异常）。
    const ballState = f.getCustomVariable(e, new str('state')).asType('int')
    const stateFree = f.equal(ballState, 0n)

    // 图变量读取（轻量）
    const ballVx = f.getNodeGraphVariable('ballVx').asType('float')
    const ballVz = f.getNodeGraphVariable('ballVz').asType('float')
    const tickCount = f.getNodeGraphVariable('tickCount').asType('int')
    const lastKickTick = f.getNodeGraphVariable('lastKickTick').asType('int')

    // 计算（纯数据）：playerFwd/playerPos/ballPos 物化后传入，避免重复求值
    const comp = f.callComposite(dribbleFieldCompute, {
      playerPos: roleLoc.location, playerFwd: f.getEntityForwardVector(role), playerSpd,
      ballPos: ballLoc.location, ballVx, ballVz
    })

    // 踢球节流判定
    const tickDiff = f.subtraction(tickCount, lastKickTick)
    const cooldownOk = f.greaterThanOrEqualTo(tickDiff, new int(KICK_COOLDOWN_TICKS))
    const distOk = f.lessThan(comp.dist2, KICK_DIST2)
    const fwdOk = f.greaterThan(comp.fwd, KICK_FWD_MIN)
    const kick = f.logicalAndOperation(
      f.logicalAndOperation(f.logicalAndOperation(cooldownOk, distOk), fwdOk),
      stateFree
    )

    // 数据选择：踢球时用 comp.newVelX/Z，不踢时用衰减后的旧球速（不施加吸附力）
    const decayVx = f.multiplication(ballVx, DAMP)
    const decayVz = f.multiplication(ballVz, DAMP)
    const kickF = f.dataTypeConversion(f.dataTypeConversion(kick, 'int'), 'float')
    const newVelX = f.addition(decayVx, f.multiplication(f.subtraction(comp.newVelX, decayVx), kickF))
    const newVelZ = f.addition(decayVz, f.multiplication(f.subtraction(comp.newVelZ, decayVz), kickF))

    // y 高度修复（2026-08-30 日志 2999）：球离地时每 tick 拉回地面
    // vy = (BALL_R − 球当前y) / TICK；球已贴地时 vy=0（不弹跳）
    const ballY = f.split3dVector(ballLoc.location).yComponent
    const dy = f.subtraction(BALL_R, ballY)
    const vy = f.multiplication(dy, INV_TICK)

    // 组装最终速度向量（物化到图变量快照，防二次求值）
    const finalVel = f.create3dVector(newVelX, vy, newVelZ)

    // exec 链分叉（链尾分支，两分支都自重启）：
    //   true（state==0 静止）→ 完整驱动：写快照→写球速→运动器→速度变量→lastKickTick→自重启
    //   false（state!=0 飞行/滚滑）→ 完全停手：只 tickCount + 自重启（不碰球）
    f.doubleBranch(
      stateFree,
      () => {
        const sVel = f.registerExecNode('set_node_graph_variable', [new str('tmpDribbleVel'), finalVel, new bool(false)])
        const sTick = f.registerExecNode('set_node_graph_variable', [new str('tickCount'), f.addition(tickCount, new int(1)), new bool(false)])
        f.connect(sVel, 0, sTick, 0)

        // 写回 ballVx/ballVz（从物化快照读）
        const velSnap = f.getNodeGraphVariable('tmpDribbleVel').asType('vec3')
        const fv = f.split3dVector(velSnap)
        const sVx = f.registerExecNode('set_node_graph_variable', [new str('ballVx'), fv.xComponent, new bool(false)])
        f.connect(sTick, 0, sVx, 0)
        const sVz = f.registerExecNode('set_node_graph_variable', [new str('ballVz'), fv.zComponent, new bool(false)])
        f.connect(sVx, 0, sVz, 0)

        // 滚动旋转（纯数据，从物化快照读）
        const spin = f.callComposite(dribbleFieldRollSpin, {
          vel: velSnap, radius: BALL_R, curRot: ballLoc.rotate
        })

        // 运动器：匀速直线（速度含 vy 拉回地面）+ 匀速旋转（0.12s）
        const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [
          e, new str('dribbleCtrl'), new float(TICK), velSnap
        ])
        f.connect(sVz, 0, lin, 0)
        const rot = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
          e, new str('角度'), new float(TICK), spin.angVel, spin.axis
        ])
        f.connect(lin, 0, rot, 0)

        // 写回自定义变量「速度」（参考版 Set Custom Variable）
        const sCv = f.registerExecNode('set_custom_variable', [e, new str('速度'), velSnap, new bool(false)])
        f.connect(rot, 0, sCv, 0)

        // 踢球时更新 lastKickTick（数据选择，不分裂执行流）
        const kickI = f.dataTypeConversion(kick, 'int')
        const lastKick = f.addition(
          f.multiplication(f.subtraction(tickCount, lastKickTick), kickI),
          lastKickTick
        )
        const sLast = f.registerExecNode('set_node_graph_variable', [new str('lastKickTick'), lastKick, new bool(false)])
        f.connect(sCv, 0, sLast, 0)

        // 自重启定时器（0.12s 循环）
        const rt = f.registerExecNode('start_timer', [e, new str('dribble_field'), new bool(false), f.assemblyList([TICK], 'float')])
        f.connect(sLast, 0, rt, 0)
        f.outflow('done', rt, 0)
      },
      () => {
        // 停手分支：只 tickCount + 自重启，不激活运动器（球交给 game 物理图）
        const sTick = f.registerExecNode('set_node_graph_variable', [new str('tickCount'), f.addition(tickCount, new int(1)), new bool(false)])
        const rt = f.registerExecNode('start_timer', [e, new str('dribble_field'), new bool(false), f.assemblyList([TICK], 'float')])
        f.connect(sTick, 0, rt, 0)
        f.outflow('done', rt, 0)
      }
    )
    return {}
  }
})
