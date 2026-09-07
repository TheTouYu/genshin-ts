// 球跟随渲染执行图 _GSTS_ballvisual（1073741840，2026-09-07 R2 事件驱动最小服务端）。
// 用户负载定则：服务端「写变量」单次成本高于读/简单运算；高频×单发贵节点必须事件驱动。
// R2 协议（本图无图变量、无定时器、无循环、无缓冲写）：
//   onSignal(rbv_echo)：客户端逐球回传「只有真动量的球」（每球一条，含完整几何参数）——
//     epoch 门（读玩家 rbv_epoch，陈旧丢弃）→ balls[piece] 取球（读宿主自定义变量）
//     → 读 turnDuration/angularVelocity（宿主自定义变量，rbRenderPost 每回合发布）
//     → 添加旋转型基础运动器（唯一动作）。
// 完成链：客户端发完最后窗口自己发 rbv_go(e)（turn 图回 ack + 起 unlock）——
// 服务端零计数/零缓冲/零窗口推进。R1 的 viewRcvPkg 缓冲协议与 ballturn 定时器循环退役
// （旧 visual(832) 图保留在图中、未挂载；viewRcvPkg 复合随 832 保留编译）。
import { g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'
import { RubikSignal } from './signals.js'

const graph = g
  .server({ id: 1073741840 })
  .onSignal(RubikSignal.rbv_echo, (evt: any, f: any) => {
    f.multipleBranches(evt.params.tag as never, {
      's': () => {
        const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
        const cur = f.getCustomVariable(owner, new str('rbv_epoch')).asType('int')
        f.doubleBranch(f.equal(evt.params.e, cur), () => {
          const visualHost = entity(1077936203n)
          const balls = f.getCustomVariable(visualHost, new str('balls')).asType('entity_list')
          const ball = f.getCorrespondingValueFromList(balls, evt.params.piece)
          const dur = f.getCustomVariable(visualHost, new str('turnDuration')).asType('float')
          const av = f.getCustomVariable(visualHost, new str('angularVelocity')).asType('float')
          f.addUniformBasicRotationBasedMotionDevice(
            ball, new str('ballspin'), dur, av, evt.params.axis
          )
        }, () => {})
      },
      default: () => {}
    })
  })

export default graph
