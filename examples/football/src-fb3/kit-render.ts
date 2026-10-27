// @status: 物理内核 v2 服务端渲染端（2026-10-27：加旋转运动器）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828）：**把客户端算的球状态演出来**
//
// 为什么需要这张图：地图里真正的足球（实体 1077936135）建自「空模型」资源 10005018，
// 是**静态元件**，跑不了 20008 造物技能图（造物技能只对造物生效）。
// 所以沿用 v5 既有架构（`src-fb/fb-shared.ts` 的 fbDriveDirect / fbTeleport）：
//   客户端造物（打手丘丘人 1082130445）算物理 → kit_state 信号 → **本图**驱动真足球的运动器。
//
// 每拍（客户端 7.5Hz）收到 tag='B' 的一条：
//   · 位移 <5m ⇒ add_uniform_basic_linear_motion_device(球,'fb_phys', DT, vel)
//     匀速线性设备，速度按 m/s 给 ⇒ 两拍之间平滑补间，不跳格
//   · 位移 ≥5m ⇒ activate_fixed_point_motion_device(瞬时) 直接落位（防"百米条纹"）
//   · |自旋| > 0.001 ⇒ add_uniform_basic_rotation_based_motion_device(球,'fb_spin', DT, °/s, 局部轴)
//     世界自旋轴必须经实体当前朝向转回局部轴（YXZ 内旋，抄 v5 fb-shared 的变换链）
//
// 载荷（kit_state 6 参）：tag='B' / tick / pos / vel / spin(自旋, rad/s) / state(状态机 mode)
import { g } from 'genshin-ts/runtime/core'

import { FixedMotionParameterType, MovementMode } from 'genshin-ts/definitions/enum'
import { KitSignal } from './signals.js'

const GRAPH_ID = 1073741828
const BALL_GUID = 1077936135n // 地图里的「足球」实体（元件 def 1077936138，scale 0.25）
const CARRIER_GUID = 1082130445n // 打手丘丘人：算力载体，客户端从它的自定义变量读输入与玩家位置
const DEVICE = 'fb_phys' // 线性运动器名（同名重复添加即替换）
const SPIN_DEVICE = 'fb_spin' // 旋转运动器名
const TELEPORT_DIST = 5.0 // 超过此距离改用瞬时定点运动器
const DT = 0.1333 // 客户端拍长（与 kit-loop 的 DT 保持一致）
const DRIVE_DUR = 0.25 // 运动器时长：比拍长更长 ⇒ 即使丢一拍，球也连续运动（用户 2026-10-27 要求）
const RAD2DEG = 57.29578

g
  .server({ id: GRAPH_ID, name: '_GSTS_kitRender' })
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    // 进球事件：客户端判到球越过门线后发 tag='G'，这里打一行给离线判读（服务端有 print）
    f.doubleBranch(
      f.equal(evt.params.tag, 'G'),
      () => {
        print('fb-goal')
      },
      () => {}
    )
    f.doubleBranch(
      f.equal(evt.params.tag, 'B'),
      () => {
        const ball = f.queryEntityByGuid(BALL_GUID)
        const pos = evt.params.pos
        const vel = evt.params.vel
        const spin = evt.params.spin
        const loc = f.getEntityLocationAndRotation(ball).location
        // 用位置误差算速度（老 v5 fbDrive 的做法）：实体会自动追到目标点，
        // 不会因为物理速度≈0（带球/静止）而卡在出生点。
        const delta = f._3dVectorSubtraction(pos, loc)
        const dist = f._3dVectorModuloOperation(delta)
        const velErr = f._3dVectorZoom(delta, f.division(1.0, DRIVE_DUR))

        f.doubleBranch(
          f.greaterThan(dist, TELEPORT_DIST),
          () => {
            f.activateFixedPointMotionDevice(
              ball,
              DEVICE,
              MovementMode.InstantMovement,
              0.0,
              pos,
              f.create3dVector(0.0, 0.0, 0.0),
              false,
              FixedMotionParameterType.FixedSpeed,
              0.0
            )
          },
          () => {
            f.addUniformBasicLinearMotionDevice(ball, DEVICE, DRIVE_DUR, velErr)
          }
        )

        // —— 滚转：世界轴 → 实体局部轴（Rz(−rz)·Rx(−rx)·Ry(−ry)·worldAxis，YXZ 内旋）——
        const spd = f._3dVectorModuloOperation(spin)
        f.doubleBranch(
          f.greaterThan(spd, 0.001),
          () => {
            const axis = f._3dVectorNormalization(spin)
            const angVel = f.multiplication(spd, RAD2DEG)
            const r = f.split3dVector(f.getEntityLocationAndRotation(ball).rotate)
            const negX = f.multiplication(r.xComponent, -1)
            const negY = f.multiplication(r.yComponent, -1)
            const negZ = f.multiplication(r.zComponent, -1)
            const afterY = f._3dVectorRotation(f.create3dVector(0.0, negY, 0.0), axis)
            const afterX = f._3dVectorRotation(f.create3dVector(negX, 0.0, 0.0), afterY)
            const localAxis = f._3dVectorRotation(f.create3dVector(0.0, 0.0, negZ), afterX)
            f.addUniformBasicRotationBasedMotionDevice(ball, SPIN_DEVICE, DRIVE_DUR, angVel, localAxis)
          },
          () => {}
        )
      },
      () => {}
    )
  })
