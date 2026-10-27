// @status: 物理内核 v1 服务端渲染端（2026-10-27 新增）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828）：**把客户端算的球状态演出来**
//
// 为什么需要这张图：地图里真正的足球（实体 1077936135）建自「空模型」资源 10005018，
// 是**静态元件**，跑不了 20008 造物技能图（造物技能只对造物生效）。
// 所以采用老 v5 的既有架构（`src-fb/fb-shared.ts` 的 fbDriveDirect / fbTeleport）：
//   客户端造物（水史莱姆 1082130442）算物理 → kit_state 信号 → **本图**驱动真足球的运动器。
//
// 每拍（客户端 7.5Hz）收到 tag='B' 的一条：
//   · 位移 <5m ⇒ add_uniform_basic_linear_motion_device(球,'fb_phys', dur, vel)
//     匀速线性设备，dur = 客户端拍长（0.1333s），速度直接按 m/s 给 ⇒ 两拍之间平滑，不跳格
//   · 位移 ≥5m ⇒ activate_fixed_point_motion_device(瞬时) 直接落位
//     大跳变必须瞬移：线性设备要走过头才到（老图注释「防百米条纹」的同一理由）
//
// 载荷（kit_state 6 参，全部在用）：tag='B' / tick / pos / vel / spin=(dur, seqSelf, seqGuid) / state
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'
import { FixedMotionParameterType, MovementMode } from 'genshin-ts/definitions/enum'

const GRAPH_ID = 1073741828
const BALL_GUID = 1077936135n // 地图里的「足球」实体（元件 def 1077936138）
const DEVICE = 'fb_phys' // 运动器名（与老图同名，重复添加即替换同名设备）
const TELEPORT_DIST = 5.0 // 超过这个距离改用瞬时定点运动器

g
  .server({ id: GRAPH_ID, name: '_GSTS_kitRender' })
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.params.tag, 'B'),
      () => {
        const ball = f.queryEntityByGuid(BALL_GUID)
        const pos = evt.params.pos
        const vel = evt.params.vel
        const spin = f.split3dVector(evt.params.spin)
        const dur = spin.xComponent // 客户端把拍长放在 spin.x
        const loc = f.getEntityLocationAndRotation(ball).location
        const dist = f._3dVectorModuloOperation(f._3dVectorSubtraction(pos, loc))
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
            f.addUniformBasicLinearMotionDevice(ball, DEVICE, dur, vel)
          }
        )
      },
      () => {}
    )
  })
