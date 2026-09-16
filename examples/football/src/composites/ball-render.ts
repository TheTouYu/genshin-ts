// 足球 v5 三层架构 · 渲染层复合（每帧：黑板 → 运动设备）
// 命名前缀：ball_render_*
//
// ballRenderFrame：读黑板 vel/spin（球实体自定义变量，逻辑层唯一发布）→ 挂设备
//   直线：add_uniform_basic_linear_motion_device('ballVis', 0.15s, vel)
//   旋转：add_uniform_basic_rotation_based_motion_device('ballSpinVis', 0.15s, |spin|°/s, 局部轴)
//
// 设备契约（v4 双铁证沿用）：
//   ① 匀速直线 + 旋转设备可叠加（定点设备会打断旋转——2026-08-23 铁证，勿换 activate_fixed_point）
//   ② 设备时长 0.15s > 拍距 0.12s：相邻设备重叠，速度切换无缝（用户定调丝滑公式）
//   ③ 同名顶替：每帧同名重挂即"永不断供"；逻辑层卡拍时设备自行延续，球平滑减速不瞬断
//   ④ 旋转轴必须转局部系（YXZ 内旋逆变换——世界轴直挂则任意朝向下旋转方向错，抄 motionSpin）
// 已知取舍（复测项）：CARRIED 贴地带球 vel.y=0 直喂，不做 grounded 拉回——获得前球已贴地
// （获得守卫仅地面态），残余 y 偏差厘米级；若实测浮空，再在逻辑层 pos.y 收敛拍内补 vy。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { BALL_FLY } from './ball-state.js'

const DEVICE_T = 0.55 // 设备时长 > 拍距 0.5（重叠无缝；2026-08-31 降载联动 0.15->0.55）
const RAD2DEG = 57.29577951308232

export const ballRenderFrame = g.defineComposite('ball_render_frame', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    // 黑板读取（渲染层只读，永不写黑板）
    const vel = f.getCustomVariable(e, new str('vel')).asType('vec3')
    const spin = f.getCustomVariable(e, new str('spin')).asType('vec3')
    const state = f.getCustomVariable(e, new str('state')).asType('int')

    // 2026-09-01 修复（日志 3085 铁证）：贴地态 vy 拉回地面——治"空中滚动/悬空球"。
    // v4 motionByVel 同款（2026-08-27 实证球 y=5.7 不下落）：FLY(1) 保留 vel.y 让球飞起，
    // 其余贴地态（ROLL/SLIDE/CARRIED）设备 vy = 拉回 0.25 的地面速度，避免实体停在
    // 上一段飞行设备推到的空中高度（日志：落地后实体 y=3.8 悬空，逻辑层已 ROLL）。
    const isFly = f.equal(state, new int(BALL_FLY))
    const vv = f.split3dVector(vel)
    const loc = f.getEntityLocationAndRotation(e).location
    const lp = f.split3dVector(loc)
    const dy = f.subtraction(new float(0.25), lp.yComponent)
    const vyRaw = f.division(dy, new float(DEVICE_T))
    // clamp vyRaw 到 ±5（防大落差瞬间巨速；max/min 公式，无分支）
    const vyFloor = f.division(f.addition(f.subtraction(vyRaw, new float(5)), f.absoluteValueOperation(f.addition(vyRaw, new float(5)))), 2)
    const vyGround = f.division(f.subtraction(f.addition(vyFloor, new float(5)), f.absoluteValueOperation(f.subtraction(vyFloor, new float(5)))), 2)
    // 数据选择 vy（无分支）：vy = velY + (vyGround − velY) × isFly?0:1
    const flyI = f.dataTypeConversion(isFly, 'int')
    const flyF = f.dataTypeConversion(flyI, 'float')
    const vy = f.addition(vv.yComponent, f.multiplication(f.subtraction(vyGround, vv.yComponent), f.subtraction(1, flyF)))
    const velRender = f.create3dVector(vv.xComponent, vy, vv.zComponent)

    // 直线设备：贴地 vy 拉回地面；FLY 保留 vy（逻辑层积分已含 y 分量语义）
    const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, new str('ballVis'), new float(DEVICE_T), velRender])

    // 旋转：世界轴 = normalize(spin + ε·up)（ε 防 |spin|→0 时 normalize 退化 NaN）；
    // 角速度 = |spin|·180/π（spin 以 rad/s 维护，设备收度/秒——量纲陷阱见 v4 PROGRESS）
    const spinSafe = f._3dVectorAddition(spin, f.create3dVector(0, 0.001, 0))
    const worldAxis = f._3dVectorNormalization(spinSafe)
    const angVel = f.multiplication(f._3dVectorModuloOperation(spin), RAD2DEG)
    // 世界轴 → 球局部系（YXZ 内旋逆旋转，与 motionSpin/dribbleFieldRollSpin 同式）
    const rot = f.getEntityLocationAndRotation(e).rotate
    const r = f.split3dVector(rot)
    const negX = f.multiplication(r.xComponent, -1)
    const negY = f.multiplication(r.yComponent, -1)
    const negZ = f.multiplication(r.zComponent, -1)
    const afterY = f._3dVectorRotation(f.create3dVector(0, negY, 0), worldAxis)
    const afterX = f._3dVectorRotation(f.create3dVector(negX, 0, 0), afterY)
    const localAxis = f._3dVectorRotation(f.create3dVector(0, 0, negZ), afterX)
    const rotDev = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [e, new str('ballSpinVis'), new float(DEVICE_T), angVel, localAxis])
    f.connect(lin, 0, rotDev, 0)
    f.outflow('done', rotDev, 0)
    return {}
  }
})

// 渲染终位（exec）：进 IDLE/GOAL 时挂一次零速直线设备（球即刻停止）+ 零转速。
// 此后渲染 loop 已停、无顶替——设备是"最后一帧"，球定住。
export const ballRenderHalt = g.defineComposite('ball_render_halt', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, new str('ballVis'), new float(DEVICE_T), f.create3dVector(0, 0, 0)])
    const rot = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [e, new str('ballSpinVis'), new float(DEVICE_T), new float(0), f.create3dVector(0, 1, 0)])
    f.connect(lin, 0, rot, 0)
    f.outflow('done', rot, 0)
    return {}
  }
})
