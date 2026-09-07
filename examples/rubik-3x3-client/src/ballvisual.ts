// 球跟随渲染执行图 _GSTS_ballvisual（1073741840，2026-09-07 球跟随负载优化）。
// 取代 _GSTS_visual(832) 的设备执行职责（旧图保留在图中、解除挂载）：
//   1) onSignal(rbv_echo)：与旧 visual 相同——客户端渲染单元逐槽执行包 → 图变量缓冲
//      （piece=块索引=球索引、axis=球局部轴；vel1/vel2 兼容保留不再消费）
//      收齐 N 槽 → 玩家 rbv_ack=e + rbv_go(e)（turn 图起 ballturn 定时器）
//   2) whenTimerIsTriggered('ballturn')：逐槽读缓冲 → 给中心球加「旋转型基础运动器」。
//      块由跟随运动器组件自动公转+自转（game 图开局一次性绑定，运行时零逐块编排）。
// 旧图的 turnblock/orbit2 双段轨道、vel 分解、A/B 通道、视觉顺序编排全部退役。
// unlock/execMove 等其它定时器仍由 turn 图处理（default 分支空操作）。
import { g } from 'genshin-ts/runtime/core'
import { float, int, str } from 'genshin-ts/runtime/value'
import { viewRcvPkg } from './composites/view.js'
import { RubikSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741840,
    variables: {
      // —— 执行包缓冲（onSignal 写 / ballturn 事件读；按槽位索引；viewRcvPkg 依赖同名变量）——
      rbvPiece: [
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n
      ],
      rbvAxis: [
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0])
      ],
      // viewRcvPkg 仍写这两组缓冲（信号 wire 保持 7 参兼容）；本图执行器不消费。
      rbvVel1: [
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0])
      ],
      rbvVel2: [
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0])
      ],
      rbvFlags: [
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n
      ],
      rbvRcvd: new int(0),
      rbvDone: new int(-1),

      // 收包暂存（根图 onSignal 逐信号写入，viewRcvPkg 复合读取）
      rbvTmpSlot: new int(-1),
      rbvTmpPiece: new int(-1),
      rbvTmpAxis: vec3([0, 0, 0]),
      rbvTmpVel1: vec3([0, 0, 0]),
      rbvTmpVel2: vec3([0, 0, 0]),

      // 设备壳参数镜像（turn 图 rbRenderPost 每次发布到宿主自定义变量；ballturn 直读自定义变量）
      turnLastSlot: new int(7),
      turnCompletionDelay: new float(0.35),
      turnDuration: new float(0.3),
      segmentDuration: new float(0.15),
      angularVelocity: new float(300)
    }
  })
  .on('whenTimerIsTriggered', (evt: any, ef: any) => {
    ef.multipleBranches(evt.timerName as never, {
      // 球跟随执行：逐槽 ball=pieces[piece]、axis=rbvAxis[slot]，一次旋转型基础运动器/球。
      // dur/av 从宿主自定义变量直读（rbRenderPost 每回合发布：面/中 0.3s+300°/s、整 1.0s+90°/s）。
      'ballturn': () => {
        const visualHost = entity(1077936203n)
        const n = ef.getCustomVariable(visualHost, new str('rbv_n')).asType('int')
        const balls = ef.getCustomVariable(visualHost, new str('balls')).asType('entity_list')
        const dur = ef.getCustomVariable(visualHost, new str('turnDuration')).asType('float')
        const av = ef.getCustomVariable(visualHost, new str('angularVelocity')).asType('float')
        ef.finiteLoop(0n, ef.subtraction(n, 1n), (i: any) => {
          const piece = ef.getCorrespondingValueFromList(
            ef.getNodeGraphVariable('rbvPiece').asType('int_list'), i
          )
          const axis = ef.getCorrespondingValueFromList(
            ef.getNodeGraphVariable('rbvAxis').asType('vec3_list'), i
          )
          const ball = ef.getCorrespondingValueFromList(balls, piece)
          ef.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
            ball,
            new str('ballspin'),
            dur,
            av,
            axis
          ])
        })
      },
      // execMove / unlock 等非视觉定时器（turn 图起在宿主上）：空操作
      default: () => {}
    })
  })

  // —— 执行包逐槽收包（tag='s'；与旧 visual 同构，委托 viewRcvPkg）——
  .onSignal(RubikSignal.rbv_echo, (evt: any, f: any) => {
    f.multipleBranches(evt.params.tag as never, {
      's': () => {
        const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
        const ep = f.getCustomVariable(owner, new str('rbv_epoch')).asType('int')
        f.doubleBranch(f.equal(evt.params.e, ep), () => {
          f.setNodeGraphVariable('rbvTmpSlot', evt.params.slot, false)
          f.setNodeGraphVariable('rbvTmpPiece', evt.params.piece, false)
          f.setNodeGraphVariable('rbvTmpAxis', evt.params.axis, false)
          f.setNodeGraphVariable('rbvTmpVel1', evt.params.vel1, false)
          f.setNodeGraphVariable('rbvTmpVel2', evt.params.vel2, false)
          f.callComposite(viewRcvPkg, { owner, e: evt.params.e })
        }, () => {})
      },
      default: () => {}
    })
  })

export default graph
