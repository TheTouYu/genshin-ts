// 视觉调度节点图：只处理 turnblock/orbit2 定时器与视觉顺序/运动
// 2026-08-21 重构：根图只做“timerName → 变量参数”，join 后单次调用统一处理器。
// 原 278 直接节点 → 目标 ~24 直接节点；复杂逻辑全部下沉到 view_handle_* 复合。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { viewHandleTimerEvent } from './composites/view.js'
import { localAxisTable0, localAxisTable1, localAxisTable2 } from './orientTables.js'

const graph = g
  .server({
    id: 1073741827,
    variables: {
      // 定时器事件统一处理器参数（由根图 multipleBranches 构造）
      handlerMode: new int(0), // 0=turn 1=orbit（unlock 由主图处理）
      handlerBase: new int(0), // 整体转 chunk 偏移：0/7/14/21

      blocks: [
        entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0),
        entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0),
        entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0),
        entity(0), entity(0)
      ],
      tempP: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      blockOrient: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      localAxisTable0,
      localAxisTable1,
      localAxisTable2,
      centerPos: [0n, 1n, 2n, 3n, 4n, 5n],
      curMove: new int(0),
      turnLastSlot: new int(7),
      turnCompletionDelay: new float(0.35),
      turnDuration: new float(0.3),
      segmentDuration: new float(0.15),
      orbitKVel: new float(6.6667),
      angularVelocity: new float(300),
      visualP: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n, 13n, 14n, 15n, 16n, 17n, 18n, 19n, 20n, 21n, 22n, 23n, 24n, 25n, 26n],
      vels1: [
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0])
      ],
      vels2: [
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]),
        vec3([0, 0, 0]), vec3([0, 0, 0])
      ],
      axes: [
        vec3([0, 0, 0]), vec3([-1, 0, 0]), vec3([1, 0, 0]), vec3([0, -1, 0]),
        vec3([0, 1, 0]), vec3([0, 0, -1]), vec3([0, 0, 1]), vec3([1, 0, 0]),
        vec3([0, 1, 0]), vec3([0, 0, -1]), vec3([-1, 0, 0]), vec3([0, -1, 0]),
        vec3([0, 0, -1])
      ],
      faceVisualOrder: [
        0n, 4n, 1n, 6n, 3n, 5n, 2n, 7n,
        0n, 4n, 1n, 6n, 3n, 5n, 2n, 7n,
        0n, 7n, 2n, 4n, 3n, 5n, 1n, 6n,
        0n, 7n, 2n, 4n, 3n, 5n, 1n, 6n,
        0n, 4n, 1n, 5n, 3n, 6n, 2n, 7n,
        0n, 4n, 1n, 5n, 3n, 6n, 2n, 7n
      ],
      middleVisualOrder: [4n, 0n, 6n, 2n, 5n, 3n, 7n, 1n],
      wholeVisualOrder: [
        0n, 8n, 20n, 18n, 1n, 9n, 21n, 19n,
        2n, 10n, 22n, 16n, 3n, 11n, 23n, 17n,
        4n, 12n, 24n, 5n, 13n, 25n, 6n, 14n,
        7n, 15n
      ],
      faceCenterIndex: [0n, 4n, 5n, 0n, 1n, 2n, 3n]
    }
  })
  .on('whenTimerIsTriggered', (evt: any, ef: any) => {
    // 分支只构造变量参数，不调用任何复合；multipleBranches join 后单次调用统一处理器。
    ef.multipleBranches(evt.timerName as never, {
      'turnblock': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 0n, false)
      },
      'turnblock0': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 0n, false)
      },
      'turnblock1': () => {
        ef.setNodeGraphVariable('handlerBase', 7n, false)
        ef.setNodeGraphVariable('handlerMode', 0n, false)
      },
      'turnblock2': () => {
        ef.setNodeGraphVariable('handlerBase', 14n, false)
        ef.setNodeGraphVariable('handlerMode', 0n, false)
      },
      'turnblock3': () => {
        ef.setNodeGraphVariable('handlerBase', 21n, false)
        ef.setNodeGraphVariable('handlerMode', 0n, false)
      },
      'orbit2': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 1n, false)
      },
      'orbit20': () => {
        ef.setNodeGraphVariable('handlerBase', 0n, false)
        ef.setNodeGraphVariable('handlerMode', 1n, false)
      },
      'orbit21': () => {
        ef.setNodeGraphVariable('handlerBase', 7n, false)
        ef.setNodeGraphVariable('handlerMode', 1n, false)
      },
      'orbit22': () => {
        ef.setNodeGraphVariable('handlerBase', 14n, false)
        ef.setNodeGraphVariable('handlerMode', 1n, false)
      },
      'orbit23': () => {
        ef.setNodeGraphVariable('handlerBase', 21n, false)
        ef.setNodeGraphVariable('handlerMode', 1n, false)
      },
      // unlock 由主图（1073741825）处理，视觉图不拦截
      default: () => {}
    })
    // join 后：只调用一次统一处理器
    ef.callComposite(viewHandleTimerEvent, {
      target: evt.eventSourceEntity,
      seq: evt.timerSequenceId as never
    })
  })

export default graph
