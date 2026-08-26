// 足球带球复合（exec + 纯数据），命名前缀：carry_*
// 带球状态 CARRIED(3)：弹簧-阻尼场把球拉向持球者脚前 0.9m 锚点，急转甩出脱脚
// 控球权：单人阶段=场上唯一角色（getSpecifiedTypeOfEntitiesOnTheField(Character)）；
// 多人扩展=命中事件/范围查询取最近者（carriedBy: entity 接口预留，见 DESIGN.md 12.2）
// 能力预验证（2026-08-26 最小编译实验）：sineFunction/cosineFunction（弧度）、
// 获取场上角色实体、列表取值、命中检测事件 payload 全部通过正式 CLI 编译
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str, vec3 } from 'genshin-ts/runtime/value'
import { EntityType } from 'genshin-ts/definitions/enum'
import { motionToPoint, motionSpin } from './motion.js'

// —— 带球物理常量（编译期字面量）——
const K = 20 // 弹簧刚度 /s²
const C = 10 // 阻尼 /s
const DT = 0.2 // 5Hz tick
const ANCHOR_DIST = 0.9 // 锚点=角色前方 0.9m（脚前）
const BALL_R = 0.25 // 球半径（锚点贴地 y）
const CARRY_RANGE = 1.2 // 控球判定：球距角色 < 1.2m
const LOSE_RANGE = 1.5 // 丢球判定：球距锚点 > 1.5m
const LOSE_SPEED_FACTOR = 1.5 // 丢球判定：球速 > 角色速度 ×1.5
const LOSE_SPEED_FLOOR = 3 // 丢球判定球速下限（角色静止时球速 <3 不脱脚）
const TAKE_SPEED = 3 // 控球判定：球速上限（低速才自动控球）
const DEG2RAD = 0.0174533 // 度 → 弧度（实体旋转是欧拉角度）
const INV_DT = 5 // 1/DT（角色速度 = 位移×5）
const INV_BALL_R = 4 // 1/BALL_R（滚动自旋 ω = v/R）

// ================================================================
// 获取持球者角色实体（纯数据）：单人=场上角色列表第一个；多人扩展点=取最近者
// ================================================================
export const carryGetRole = g.defineComposite('carry_get_role', {
  inputs: {},
  outputs: { role: { type: 'entity' } },
  build: (_i, f) => {
    const list = f.getSpecifiedTypeOfEntitiesOnTheField(EntityType.Character)
    return { role: f.getCorrespondingValueFromList(list, new int(0)) }
  }
})

// ================================================================
// 角色锚点（纯数据）：角色位置 + 朝向×0.9m，y 贴地=球半径
// 朝向用实体旋转 rotY（度→弧度）：前方 = (sinY, 0, cosY)（Unity Y 朝上，rotY=0 → +Z）
// ================================================================
export const carryAnchor = g.defineComposite('carry_anchor', {
  inputs: { role: { type: 'entity' } },
  outputs: { anchor: { type: 'vec3' }, rolePos: { type: 'vec3' } },
  build: ({ role }, f) => {
    const t = f.getEntityLocationAndRotation(role)
    const p = f.split3dVector(t.location)
    const r = f.split3dVector(t.rotate)
    const sinY = f.sineFunction(f.multiplication(r.yComponent, DEG2RAD))
    const cosY = f.cosineFunction(f.multiplication(r.yComponent, DEG2RAD))
    const anchor = f.create3dVector(
      f.addition(p.xComponent, f.multiplication(sinY, ANCHOR_DIST)),
      BALL_R,
      f.addition(p.zComponent, f.multiplication(cosY, ANCHOR_DIST))
    )
    return { anchor, rolePos: t.location }
  }
})

// ================================================================
// 弹簧场一步积分（纯数据）：a = k·(锚点−p) − c·v；半隐式 p' = p + v'·dt；y clamp ≥ 球半径
// ================================================================
export const carrySpring = g.defineComposite('carry_spring', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' }, anchor: { type: 'vec3' } },
  outputs: { npos: { type: 'vec3' }, nvel: { type: 'vec3' } },
  build: ({ pos, vel, anchor }, f) => {
    const acc = f._3dVectorAddition(
      f._3dVectorZoom(f._3dVectorSubtraction(anchor, pos), K),
      f._3dVectorZoom(vel, -C)
    )
    const nvel = f._3dVectorAddition(vel, f._3dVectorZoom(acc, DT))
    const raw = f._3dVectorAddition(pos, f._3dVectorZoom(nvel, DT))
    const p = f.split3dVector(raw)
    // max(y, BALL_R)：球不能被弹簧拉进草里
    const clampY = f.division(
      f.addition(
        f.addition(p.yComponent, BALL_R),
        f.absoluteValueOperation(f.subtraction(p.yComponent, BALL_R))
      ),
      2
    )
    return { npos: f.create3dVector(p.xComponent, clampY, p.zComponent), nvel }
  }
})

// ================================================================
// 带球滚动自旋（纯数据）：贴地滚动 ω = (vz/R, 0, −vx/R)（与滚滑摩擦同款）
// ================================================================
export const carrySpin = g.defineComposite('carry_spin', {
  inputs: { vel: { type: 'vec3' } },
  outputs: { spin: { type: 'vec3' } },
  build: ({ vel }, f) => {
    const v = f.split3dVector(vel)
    return {
      spin: f.create3dVector(
        f.multiplication(v.zComponent, INV_BALL_R),
        0,
        f.multiplication(v.xComponent, -INV_BALL_R)
      )
    }
  }
})

// ================================================================
// 丢球判定（纯数据）：球距锚点 > 1.5m 或 球速 > max(角色速度×1.5, 3)
// ================================================================
export const carryLoseCheck = g.defineComposite('carry_lose_check', {
  inputs: {
    pos: { type: 'vec3' },
    vel: { type: 'vec3' },
    anchor: { type: 'vec3' },
    rolePrev: { type: 'vec3' },
    roleNow: { type: 'vec3' }
  },
  outputs: { lose: { type: 'bool' } },
  build: ({ pos, vel, anchor, rolePrev, roleNow }, f) => {
    const dist = f._3dVectorModuloOperation(f._3dVectorSubtraction(anchor, pos))
    const speed = f._3dVectorModuloOperation(vel)
    const roleSpeed = f.multiplication(
      f._3dVectorModuloOperation(f._3dVectorSubtraction(roleNow, rolePrev)),
      INV_DT
    )
    // max(roleSpeed×1.5, 3)（角色静止时球速 <3 由弹簧拉回，不误判脱脚）
    const speedLimit = f.division(
      f.addition(
        f.addition(f.multiplication(roleSpeed, LOSE_SPEED_FACTOR), LOSE_SPEED_FLOOR),
        f.absoluteValueOperation(
          f.subtraction(f.multiplication(roleSpeed, LOSE_SPEED_FACTOR), LOSE_SPEED_FLOOR)
        )
      ),
      2
    )
    const lose = f.logicalOrOperation(
      f.greaterThan(dist, LOSE_RANGE),
      f.greaterThan(speed, speedLimit)
    )
    return { lose }
  }
})

// ================================================================
// 控球判定（纯数据）：球距角色 < 1.2m 且球速 < 3 → 可进入 CARRIED
// ================================================================
export const carryTakeCheck = g.defineComposite('carry_take_check', {
  inputs: { role: { type: 'entity' }, pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { take: { type: 'bool' } },
  build: ({ role, pos, vel }, f) => {
    const rolePos = f.getEntityLocationAndRotation(role).location
    const dist = f._3dVectorModuloOperation(f._3dVectorSubtraction(rolePos, pos))
    const speed = f._3dVectorModuloOperation(vel)
    const take = f.logicalAndOperation(
      f.lessThan(dist, CARRY_RANGE),
      f.lessThan(speed, TAKE_SPEED)
    )
    return { take }
  }
})

// ================================================================
// FREE 状态 tick（exec 复合）：控球判定（角色走进 1.2m 且球速<3）→ CARRIED；
// 未控球 → 零速心跳运动器保持 5Hz stop 链活着（静止也能每 tick 检查走近）
// ================================================================
export const carryFreeTick = g.defineComposite('carry_free_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const roleC = f.callComposite(carryGetRole, {})
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const takeC = f.callComposite(carryTakeCheck, { role: roleC.role, pos, vel })
    f.doubleBranch(
      takeC.take,
      () => {
        const ss = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(3), new bool(false)])
        const sp = f.registerExecNode('set_node_graph_variable', [
          new str('carrierPrevPos'),
          f.getEntityLocationAndRotation(roleC.role).location,
          new bool(false)
        ])
        f.connect(ss, 0, sp, 0)
        const hb = f.callComposite(carryHeartbeat, { e })
        f.connect(sp, 0, hb as never, 0)
        f.outflow('done', hb as never, 0)
      },
      () => {
        const hb = f.callComposite(carryHeartbeat, { e })
        f.outflow('done', hb as never, 0)
      }
    )
    return {}
  }
})

// ================================================================
// 带球 tick（exec 复合）：锚点 + 弹簧场 + 丢球判定 + 写回 + 运动器插值
// 丢球 → state=ROLLING（球带当前速度自然滚出）；未丢 → 保持 CARRIED 继续拉回
// ================================================================
export const carryTick = g.defineComposite('carry_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const roleC = f.callComposite(carryGetRole, {})
    const anc = f.callComposite(carryAnchor, { role: roleC.role })
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spr = f.callComposite(carrySpring, { pos, vel, anchor: anc.anchor })
    const prev = f.getNodeGraphVariable('carrierPrevPos').asType('vec3')
    const loseC = f.callComposite(carryLoseCheck, {
      pos: spr.npos,
      vel: spr.nvel,
      anchor: anc.anchor,
      rolePrev: prev,
      roleNow: anc.rolePos
    })
    const spinC = f.callComposite(carrySpin, { vel: spr.nvel })
    // 先物化写回（丢球分支与续带分支都要用同一份 npos/nvel）
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), spr.npos, new bool(false)])
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), spr.nvel, new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sPrev = f.registerExecNode('set_node_graph_variable', [new str('carrierPrevPos'), anc.rolePos, new bool(false)])
    f.connect(sVel, 0, sPrev, 0)
    f.doubleBranch(
      loseC.lose,
      () => {
        // 脱脚：转滚滑，球带当前速度自然滚出
        const ss = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(2), new bool(false)])
        const ap = f.callComposite(carryApplyMotion, { e, pos: spr.npos, spin: spinC.spin })
        f.connect(ss, 0, ap as never, 0)
        f.outflow('done', ap as never, 0)
      },
      () => {
        const ap = f.callComposite(carryApplyMotion, { e, pos: spr.npos, spin: spinC.spin })
        f.outflow('done', ap as never, 0)
      }
    )
    return {}
  }
})

// ================================================================
// 带球运动器激活（exec 复合）：点到点 + 旋转，复用 motion 通道（"一件事"封装）
// ================================================================
export const carryApplyMotion = g.defineComposite('carry_apply_motion', {
  inputs: { e: { type: 'entity' }, pos: { type: 'vec3' }, spin: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, pos, spin }, f) => {
    const axis = f._3dVectorNormalization(spin)
    const angVel = f.multiplication(f._3dVectorModuloOperation(spin), 57.29577951308232)
    const lin = f.callComposite(motionToPoint, { e, target: pos })
    const spn = f.callComposite(motionSpin, { e, axis, angVel })
    f.connect(lin as never, 0, spn as never, 0)
    f.outflow('done', spn as never, 0)
    return {}
  }
})

// ================================================================
// FREE 心跳（exec 复合）：零速 0.2s 运动器，保持 5Hz stop 链活着，
// 让静止状态下也能每 tick 检查控球判定（玩家走近 → CARRIED）
// ================================================================
export const carryHeartbeat = g.defineComposite('carry_heartbeat', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const tail = f.callComposite(motionToPoint, { e, target: pos })
    f.outflow('done', tail as never, 0)
    return {}
  }
})
