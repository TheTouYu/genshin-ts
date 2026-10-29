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
// 运动器时长 = 一拍（内核 7.5Hz ⇒ 0.1333s；取 0.14 略长一点，保证下一拍到来前已走完，无空档）
// 2026-10-29 修：原来 0.25s + FixedSpeed，运动器比拍长一倍 ⇒ 每拍都在"重启"未完成的运动，
//   实测（日志 3412）tick 61 之后球实体一直停在 (0,0,1.5) 不动，而内核目标已走到 3m 外。
// 运动器时长 = 一拍。内核实际步长随客户端负载在 0.037~0.07s 之间变（14~27Hz），
// 固定 0.14s 会让球永远慢半拍 ⇒ 每拍从载体变量 fb_dt 读真实步长（读不到用 0.14 兜底）。
const DRIVE_DUR = 0.14

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
        // 真实步长（kitListen 每秒校准写入载体变量）
    const dtRaw = f
      .getCustomVariable(f.queryEntityByGuid(1082130445n), 'fb_dt')
      .asType('float')
    const driveDur = f.localVariable('float')
    f.doubleBranch(
      f.logicalAndOperation(f.greaterThan(dtRaw, 0.004), f.lessThan(dtRaw, 0.25)),
      () => {
        driveDur.set(dtRaw)
      },
      () => {
        driveDur.set(DRIVE_DUR)
      }
    )
    const pos = evt.params.pos
        const spin = evt.params.spin
        const loc = f.getEntityLocationAndRotation(ball).location
        const delta = f._3dVectorSubtraction(pos, loc)
        const dist = f._3dVectorModuloOperation(delta)
        // 位移速度 = (目标点 − 实体当前位置)/时长（docs/game-engine-knowledge/motion-devices.md §10 已验证配方：
        //   「直线设备的 velocity 显式算成 (target-current)/duration，可同时拿到精确到点与不漂移」）
        const velToTarget = f._3dVectorZoom(delta, f.division(1.0, driveDur.value))
        // 大跳用定点器瞬移（§10：定点器仍可用于 INSTANT_MOVEMENT，别全盘禁用）
        f.doubleBranch(
          f.greaterThan(dist, new float(TELEPORT_DIST)),
          () => {
            f.activateFixedPointMotionDevice(
              ball, 'fb_movex', MovementMode.InstantMovement, 0.0, pos,
              f.create3dVector(0.0, 0.0, 0.0), false, FixedMotionParameterType.FixedSpeed, 0.0
            )
          },
          () => {
            // ⚠️ 平移**必须用基础运动器**，不能与旋转设备一起混用定点器：
            //   motion-devices.md §10（2026-08-23 足球实证，日志 2828/2829）——同一 exec 链里
            //   「定点器匀速直线 + 旋转设备」= 直线设备被秒停、实体位置纹丝不动、只剩微量自旋。
            //   本轮真机日志 3412 复现同形态：参数照发、实体停在 (0,0.25,1.5)。
            // 参数：add_uniform_basic_linear_motion_device(实体, 设备名, 时长(秒), 速度向量(m/s))
            f.addUniformBasicLinearMotionDevice(ball, 'fb_movex', driveDur.value, velToTarget)
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
            f.addUniformBasicRotationBasedMotionDevice(ball, 'fb_spinx', driveDur.value, angVel, localAxis)
          },
          () => {}
        )
      },
      () => {}
    )
  })
