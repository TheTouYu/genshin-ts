// @status: 复刻 src-fb/fb-render.ts（2026-10-27：原版全通、每选项卡可用，直接抄调用链）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828，挂球实体 1077936135）
// 只做两件事：|delta| 太大 → INSTANT 瞬移；否则挂「线性(+可选旋转)」运动设备。
// 关键：**用复合 fbDriveDirect**（老代码原样），线性设备与旋转设备由复合内部串好 exec 边。
import { g } from 'genshin-ts/runtime/core'
import { float } from 'genshin-ts/runtime/value'

import { KitSignal } from './signals.js'
import { fbDriveDirect, fbTeleport } from './fb-shared.js'

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
        f.doubleBranch(
          f.greaterThan(dist, new float(TELEPORT_DIST)),
          () => {
            f.callComposite(fbTeleport, { ball, pos })
          },
          () => {
            f.callComposite(fbDriveDirect, { ball, dur: new float(DRIVE_DUR), vel, spin })
          }
        )
      },
      () => {}
    )
  })
