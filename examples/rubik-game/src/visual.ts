// 视觉调度节点图（票 06 重写版，2026-09-05）：服务端只留「添加运动器」。
// 职责收缩为：
//   1) onSignal(rbv_echo)：客户端渲染单元逐槽执行包 → 图变量缓冲（piece/axis/vel1/vel2）
//      收齐 N 槽 → 玩家 rbv_ack=e + rbv_go(e)（turn 图按 curMove 起既有定时器）
//   2) whenTimerIsTriggered（turnblock/orbit2 及整转批量）：机械读缓冲 → 添加运动器设备
// 全部表查询/向量数学已删除（localAxis/axes/vels/visualP/centerPos 等不再存在）。
// unlock 定时器仍由 turn 图处理（逻辑发布权威侧）。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { viewHandleTimerEvent, viewRcvPkg } from './composites/view.js'
import { RubikSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741827,
    variables: {
      // 定时器事件统一处理器参数（由根图 multipleBranches 构造）
      handlerMode: new int(0), // 0=turn 1=orbit 2=noop 3=整转 turnblock 批量 4=整转 orbit2 批量
      handlerBase: new int(0),
      handlerCount: new int(0),

      // —— 执行包缓冲（onSignal 写 / 定时器事件读；按槽位索引）——
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

      // 设备壳参数（turn 图 rbRenderPost 每次发布到本实体自定义变量，首事件同步到图变量）
      turnLastSlot: new int(7),
      turnCompletionDelay: new float(0.35),
      turnDuration: new float(0.3),
      segmentDuration: new float(0.15),
      angularVelocity: new float(300)
    }
  })
  .on('whenTimerIsTriggered', (evt: any, ef: any) => {
    // 分支只构造变量参数，join 后单次调用统一处理器（设备壳：读缓冲 + 加设备）
    ef.multipleBranches(evt.timerName as never, {
      // 06-R7 批量化：turnblock/orbit2 每通道 1 事件，事件内串行 count 槽（count=rbv_nA/nB）
      'turnblock': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 3n, false)
        ef.setNodeGraphVariable('handlerCount', ef.getCustomVariable(entity(1077936203n), new str('rbv_nA')).asType('int'), false)
      },
      // 面转 B 通道：槽 5..8
      'turnblockB': () => {
        ef.setNodeGraphVariable('handlerBase', 5n, false)
        ef.setNodeGraphVariable('handlerMode', 3n, false)
        ef.setNodeGraphVariable('handlerCount', ef.getCustomVariable(entity(1077936203n), new str('rbv_nB')).asType('int'), false)
      },
      'orbit2B': () => {
        ef.setNodeGraphVariable('handlerBase', 5n, false)
        ef.setNodeGraphVariable('handlerMode', 4n, false)
        ef.setNodeGraphVariable('handlerCount', ef.getCustomVariable(entity(1077936203n), new str('rbv_nB')).asType('int'), false)
      },
      'turnblock0': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 3n, false)
        ef.setNodeGraphVariable('handlerCount', 7n, false)
      },
      'turnblock1': () => {
        ef.setNodeGraphVariable('handlerBase', 7n, false)
        ef.setNodeGraphVariable('handlerMode', 3n, false)
        ef.setNodeGraphVariable('handlerCount', 7n, false)
      },
      'turnblock2': () => {
        ef.setNodeGraphVariable('handlerBase', 14n, false)
        ef.setNodeGraphVariable('handlerMode', 3n, false)
        ef.setNodeGraphVariable('handlerCount', 7n, false)
      },
      'turnblock3': () => {
        ef.setNodeGraphVariable('handlerBase', 21n, false)
        ef.setNodeGraphVariable('handlerMode', 3n, false)
        ef.setNodeGraphVariable('handlerCount', 5n, false)
      },
      'orbit2': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 4n, false)
        ef.setNodeGraphVariable('handlerCount', ef.getCustomVariable(entity(1077936203n), new str('rbv_nA')).asType('int'), false)
      },
      // 整转 orbit2 批量：只保留 2 个定时器（orbit20=槽0..13 / orbit21=槽14..25）。
      // 根图 multipleBranches 上限 10 case —— fd40432 教训保留
      'orbit20': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 4n, false)
        ef.setNodeGraphVariable('handlerCount', 14n, false)
      },
      'orbit21': () => {
        ef.setNodeGraphVariable('handlerBase', 14n, false)
        ef.setNodeGraphVariable('handlerMode', 4n, false)
        ef.setNodeGraphVariable('handlerCount', 12n, false)
      },
      // execMove / unlock 等非视觉定时器：handlerMode 置 2（无匹配分支）→ view 处理器 default 空操作
      default: () => {
        ef.setNodeGraphVariable('handlerMode', 2n, false)
      }
    })
    // join 后：只调用一次统一处理器
    ef.callComposite(viewHandleTimerEvent, {
      target: evt.eventSourceEntity,
      seq: evt.timerSequenceId as never
    })
  })

  // —— 票 06：执行包逐槽收包（tag='s'；dup 实例回声 same-epoch 值相同，flags first-wins）——
  // 委托 viewRcvPkg 复合处理（复合体内节点数组形态与旧设备链一致，规避 handler 分支包裹差异）
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
