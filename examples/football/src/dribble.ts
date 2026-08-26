// 足球弹球图（挂球实体 1077936135，图 1073741827）
// 职责：带球「推」逻辑——真实足球带球 = 玩家跑动时每次触球给球小踢一脚（冲量），球往前滚一小段，
// 玩家追上再碰（命中检测触发）再推，一小段一小段推进；球因此总在玩家正前方，消除"拉拽滞后"。
// 输入渠道：
//   ① 命中检测触发（球挂命中检测组件，碰到角色受击盒触发）——主通道，触球即推
//   ② （预留）接收信号：将来其他图（如物理图）发信号也可走同一套推球逻辑
// 输出：计算推球目标点 → 发信号 football_push(target) 给物理图执行（运动器+状态，物理权威留在物理图）
import { g } from 'genshin-ts/runtime/core'
import { bool, str, vec3 } from 'genshin-ts/runtime/value'
import { Signal } from './resources/signals.js'

const PUSH_DIST = 1.8 // 推球距离（米）：球从接触点向前滚到该点，玩家追上后再次触球
const BALL_R = 0.25 // 球半径（目标点 y 贴地）

const graph = g
  .server({
    id: 1073741827,
    variables: {
      dbgTag: new str(''),
      dbgVal: new str('')
    }
  })
  // ================================================================
  // 命中检测触发：球碰到玩家（受击盒）→ 推球
  // 推离方向 = 球心 − 命中位置（水平归一）= 从玩家接触面把球推出去的方向；
  // 玩家从后面追球时命中点在球后侧 → 球被向前推 ✓
  // ================================================================
  .on('whenOnHitDetectionIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      evt.onHitHurtbox,
      () => {
        const ball = f.getSelfEntity()
        const ballPos = f.getEntityLocationAndRotation(ball).location
        const bp = f.split3dVector(ballPos)
        const raw = f._3dVectorSubtraction(ballPos, evt.onHitLocation)
        const r = f.split3dVector(raw)
        const len = f.addition(f._3dVectorModuloOperation(raw), 0.0001)
        const dirX = f.division(r.xComponent, len)
        const dirZ = f.division(r.zComponent, len)
        const target = f.create3dVector(
          f.addition(bp.xComponent, f.multiplication(dirX, PUSH_DIST)),
          BALL_R,
          f.addition(bp.zComponent, f.multiplication(dirZ, PUSH_DIST))
        )
        f.setNodeGraphVariable('dbgTag', new str('DBG_PUSH'), false)
        f.setNodeGraphVariable('dbgVal', f.dataTypeConversion(target, 'str'), false)
        f.sendSignal(Signal.football_push, target)
      },
      () => {}
    )
  })

export default graph