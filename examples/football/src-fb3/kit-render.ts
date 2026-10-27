// @status: 复刻 src-fb/fb-render.ts（2026-10-27：原版全通、每选项卡可用，直接抄调用链）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828，挂球实体 1077936135）
// 只做两件事：|delta| 太大 → INSTANT 瞬移；否则挂「线性(+可选旋转)」运动设备。
// 关键：**用复合 fbDriveDirect**（老代码原样），线性设备与旋转设备由复合内部串好 exec 边。
import { g } from 'genshin-ts/runtime/core'
import { float } from 'genshin-ts/runtime/value'

import { KitSignal } from './signals.js'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

const GRAPH_ID = 1073741828
const TELEPORT_DIST = 5.0
const DRIVE_DUR = 0.25 // 运动器时长（用户要求每次 0.25s）

g
  .server({ id: GRAPH_ID, name: '_GSTS_kitRender' })
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    // 进球事件日志（保留）
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
        const ball = f.getSelfEntity()
        const pos = evt.params.pos
        const spin = evt.params.spin
        const loc = f.getEntityLocationAndRotation(ball).location
        const delta = f._3dVectorSubtraction(pos, loc)
        const dist = f._3dVectorModuloOperation(delta)
        const vel = f._3dVectorZoom(delta, f.division(1.0, DRIVE_DUR))
        // 位移：一律用**定点运动器**（日志实证：add_uniform_basic_linear_motion_device 在这颗球上无效——
        // 速度 13.8m/s 发了 675 次，球实体位置一步没动；而旋转设备生效 ⇒ 换成定点运动器）。
        // 近平移：UniformLinearMotion + 速度 + 时长；大跳：Instant。
        f.doubleBranch(
          f.greaterThan(dist, new float(TELEPORT_DIST)),
          () => {
            f.activateFixedPointMotionDevice(
              ball, 'fb_movex', MovementMode.InstantMovement, 0.0, pos,
              f.create3dVector(0.0, 0.0, 0.0), false, FixedMotionParameterType.FixedSpeed, 0.0
            )
          },
          () => {
            f.activateFixedPointMotionDevice(
              ball, 'fb_movex', MovementMode.UniformLinearMotion,
              f.division(dist, DRIVE_DUR), pos,
              f.create3dVector(0.0, 0.0, 0.0), false, FixedMotionParameterType.FixedSpeed, DRIVE_DUR
            )
          }
        )
        // 旋转：世界轴 → 局部轴（YXZ 内旋），设备名 fb_spin
        // 用户指正（2026-10-27）：同时加多个运动器是可以的，**同名才会替换前者**。
        // ⇒ 位移设备与旋转设备名字必须不同且固定：fb_movex / fb_spinx（旧名 fb_phys 可能被历史设备占用）。
        const spd = f._3dVectorModuloOperation(spin)
        f.doubleBranch(
          f.greaterThan(spd, new float(0.001)),
          () => {
            const axis = f._3dVectorNormalization(spin)
            const angVel = f.multiplication(spd, 57.29578)
            const r = f.split3dVector(f.getEntityLocationAndRotation(ball).rotate)
            const negX = f.multiplication(r.xComponent, -1)
            const negY = f.multiplication(r.yComponent, -1)
            const negZ = f.multiplication(r.zComponent, -1)
            const afterY = f._3dVectorRotation(f.create3dVector(0.0, negY, 0.0), axis)
            const afterX = f._3dVectorRotation(f.create3dVector(negX, 0.0, 0.0), afterY)
            const localAxis = f._3dVectorRotation(f.create3dVector(0.0, 0.0, negZ), afterX)
            f.addUniformBasicRotationBasedMotionDevice(ball, 'fb_spinx', DRIVE_DUR, angVel, localAxis)
          },
          () => {}
        )
      },
      () => {}
    )
  })
