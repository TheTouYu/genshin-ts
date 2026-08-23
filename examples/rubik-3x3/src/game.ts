// rubik-3x3 完整魔方（2026-08-20）
//
// 架构：五层分离（输入/流程/逻辑/表现/结算），复合按目录分类：
//   math / motion / logic / flow / view
// 性能设计：N 块统一定时器（turnblock + orbit2），timerSequenceId 即槽位，避免 per-block 分支。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { flowDoMove, flowResetCore, flowSpawnRubik, flowTabDispatch, flowAfterTurn, flowRequestMove, flowResetPublish } from './composites/flow.js'
import { logicReset } from './composites/logic.js'
import { RubikSignal } from './signals.js'
import { orientIndexByEuler, moveOrientTransition0, moveOrientTransition1, moveOrientTransition2, wholeOrientTransition } from './orientTables.js'
import {
  faceCornerFrom, faceCornerTo, faceCornerTwist,
  faceEdgeFrom, faceEdgeTo, faceEdgeFlip,
  middleEdgeFrom, middleEdgeTo, middleEdgeFlip,
  middleCenterFrom, middleCenterTo,
  wholeCornerFrom, wholeCornerTo, wholeCornerTwist,
  wholeEdgeFrom, wholeEdgeTo, wholeEdgeFlip,
  wholeCenterFrom, wholeCenterTo
} from './tables.js'

const graph = g
  .server({
    id: 1073741830,
    variables: {
      // —— 流程层 ——
      lock: false,
      autoMode: false,
      settled: false,
      solvedFlag: false,
      qLen: new int(0),
      qIdx: new int(0),
      lastMove: new int(0),
      queue: dict([{ k: 0, v: new int(0) }]),
      curMove: new int(0),
      pendingMove: new int(0),
      turnLastSlot: new int(7),
      turnDuration: new float(0.3),
      segmentDuration: new float(0.15),
      orbitKVel: new float(6.6667),
      angularVelocity: new float(300),
      turnCompletionDelay: new float(0.35),

      // —— 逻辑状态层（单一事实源）——
      cornerPos: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
      cornerOrient: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      edgePos: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
      edgeOrient: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      centerPos: [0n, 1n, 2n, 3n, 4n, 5n],
      tempP: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tempT: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      // 朝向优化：每块 24 朝向索引 + 欧拉角→朝向索引表
      blockOrient: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      // 视觉层每次转动需要“转动前”的朝向；blockOrientPre 保存 pre-move 快照供 publish
      blockOrientPre: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      orientIndexByEuler,
      moveOrientTransition0,
      moveOrientTransition1,
      moveOrientTransition2,
      wholeOrientTransition,
      // 表现层：视觉调度顺序（view 只读 visualP，不碰逻辑 tempP）
      visualP: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n, 13n, 14n, 15n, 16n, 17n, 18n, 19n, 20n, 21n, 22n, 23n, 24n, 25n, 26n],
      // 面转视觉顺序：每 8 个一组，角/棱交替绕一圈（R/L 同构，U/D 同构，F/B 同构）
      faceVisualOrder: [
        0n, 4n, 1n, 6n, 3n, 5n, 2n, 7n,
        0n, 4n, 1n, 6n, 3n, 5n, 2n, 7n,
        0n, 7n, 2n, 4n, 3n, 5n, 1n, 6n,
        0n, 7n, 2n, 4n, 3n, 5n, 1n, 6n,
        0n, 4n, 1n, 5n, 3n, 6n, 2n, 7n,
        0n, 4n, 1n, 5n, 3n, 6n, 2n, 7n
      ],
      // 中层视觉顺序：心/棱交替绕一圈（M/E/S 同构）
      middleVisualOrder: [4n, 0n, 6n, 2n, 5n, 3n, 7n, 1n],
      // 整体转视觉顺序：角/棱/心交错，避免“角先全转、棱再转、心最后转”
      wholeVisualOrder: [
        0n, 8n, 20n, 18n, 1n, 9n, 21n, 19n,
        2n, 10n, 22n, 16n, 3n, 11n, 23n, 17n,
        4n, 12n, 24n, 5n, 13n, 25n, 6n, 14n,
        7n, 15n
      ],
      // 面转对应的中心块（centerPos 下标）：0 占位，1 R, 2 L, 3 U, 4 D, 5 F, 6 B
      faceCenterIndex: [0n, 4n, 5n, 0n, 1n, 2n, 3n],

      // —— 3×3 move 表（tools/gen-3x3-logic-table.mjs 生成，CubeLib 验证）——
      faceCornerFrom,
      faceCornerTo,
      faceCornerTwist,
      faceEdgeFrom,
      faceEdgeTo,
      faceEdgeFlip,
      middleEdgeFrom,
      middleEdgeTo,
      middleEdgeFlip,
      middleCenterFrom,
      middleCenterTo,
      wholeCornerFrom,
      wholeCornerTo,
      wholeCornerTwist,
      wholeEdgeFrom,
      wholeEdgeTo,
      wholeEdgeFlip,
      wholeCenterFrom,
      wholeCenterTo,

      // —— 表现层 ——
      blocks: [
        entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0),
        entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0),
        entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0),
        entity(0), entity(0)
      ],
      axes: [
        vec3([0, 0, 0]), // 0 占位
        vec3([-1, 0, 0]), // 1 R（与 logic ROT.R=-90°X 一致）
        vec3([1, 0, 0]), // 2 L（与 logic ROT.L=+90°X 一致）
        vec3([0, -1, 0]), // 3 U
        vec3([0, 1, 0]), // 4 D
        vec3([0, 0, -1]), // 5 F（与 logic ROT.F=-90°Z 一致）
        vec3([0, 0, 1]), // 6 B（与 logic ROT.B=+90°Z 一致）
        vec3([1, 0, 0]), // 7 M (follows L)
        vec3([0, 1, 0]), // 8 E (follows D)
        vec3([0, 0, -1]), // 9 S (follows F)
        vec3([-1, 0, 0]), // 10 x
        vec3([0, -1, 0]), // 11 y
        vec3([0, 0, -1]) // 12 z
      ],
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
      // —— 统一定时器相位（面 9 槽，中层 8 槽，整体 26 槽）——
      // 2026-08-20 用户确认：时间精度为两位小数；延迟列表必须用两位小数且尽量唯一，
      // 避免 0.012/0.162 被精度截断成 0.01/0.16 造成重复。
      faceTurnTimes: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09],
      faceOrbit2Times: [0.16, 0.17, 0.18, 0.19, 0.20, 0.21, 0.22, 0.23, 0.24],
      middleTurnTimes: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08],
      middleOrbit2Times: [0.16, 0.17, 0.18, 0.19, 0.20, 0.21, 0.22, 0.23],
      // 整体转拆成 4 个不同名字的定时器，每个定时器内部两位小数唯一且低延迟；
      // 不同定时器之间可以复用相同时间序列（名字不同互不影响）。
      wholeTurnTimes0: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07],
      wholeTurnTimes1: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07],
      wholeTurnTimes2: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07],
      wholeTurnTimes3: [0.01, 0.02, 0.03, 0.04, 0.05],
      wholeOrbit2Times0: [0.51, 0.52, 0.53, 0.54, 0.55, 0.56, 0.57],
      wholeOrbit2Times1: [0.51, 0.52, 0.53, 0.54, 0.55, 0.56, 0.57],
      wholeOrbit2Times2: [0.51, 0.52, 0.53, 0.54, 0.55, 0.56, 0.57],
      wholeOrbit2Times3: [0.51, 0.52, 0.53, 0.54, 0.55],
      // 整体转 orbit2 使用单一定时器全量列表（避免链式延迟累积）
      wholeOrbit2Times: [
        0.51, 0.514, 0.518, 0.522, 0.526, 0.53, 0.534, 0.538,
        0.542, 0.546, 0.55, 0.554, 0.558, 0.562, 0.566, 0.57,
        0.574, 0.578, 0.582, 0.586, 0.59, 0.594, 0.598, 0.602,
        0.606, 0.61
      ],
      // 整体转 turnblock 链式定时器当前块索引（0..3）
      turnChunk: new int(0)
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // 创建 26 块 + 写 blocks；发布到控制器实体自定义变量供视觉图读取
    const self = f.getSelfEntity()
    const cubes = f.callComposite(flowSpawnRubik, { stage })
    f.setNodeGraphVariable('blocks', [
      cubes.c0, cubes.c1, cubes.c2, cubes.c3, cubes.c4, cubes.c5, cubes.c6, cubes.c7,
      cubes.c8, cubes.c9, cubes.c10, cubes.c11, cubes.c12, cubes.c13, cubes.c14, cubes.c15,
      cubes.c16, cubes.c17, cubes.c18, cubes.c19, cubes.c20, cubes.c21, cubes.c22, cubes.c23,
      cubes.c24, cubes.c25
    ], false)
    f.setCustomVariable(self, new str('blocks'), [
      cubes.c0, cubes.c1, cubes.c2, cubes.c3, cubes.c4, cubes.c5, cubes.c6, cubes.c7,
      cubes.c8, cubes.c9, cubes.c10, cubes.c11, cubes.c12, cubes.c13, cubes.c14, cubes.c15,
      cubes.c16, cubes.c17, cubes.c18, cubes.c19, cubes.c20, cubes.c21, cubes.c22, cubes.c23,
      cubes.c24, cubes.c25
    ], false)
    f.setCustomVariable(entity(1077936203n), new str('blocks'), [
      cubes.c0, cubes.c1, cubes.c2, cubes.c3, cubes.c4, cubes.c5, cubes.c6, cubes.c7,
      cubes.c8, cubes.c9, cubes.c10, cubes.c11, cubes.c12, cubes.c13, cubes.c14, cubes.c15,
      cubes.c16, cubes.c17, cubes.c18, cubes.c19, cubes.c20, cubes.c21, cubes.c22, cubes.c23,
      cubes.c24, cubes.c25
    ], false)
    // 引擎对“全 0 int_list”图变量只物化出很短的长度（日志实证 cornerOrient 只有 2、
    // edgeOrient 只有 3），必须用 logicReset 显式 set_list_value 写满长度，否则首次转动
    // 读取越界（“列表索引越界”）且胜利判定读到错误状态。
    f.callComposite(logicReset, {})
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    f.multipleBranches(evt.timerName as never, {
      'execMove': () => {
        const mv = f.getNodeGraphVariable('pendingMove').asType('int')
        f.setNodeGraphVariable('curMove', mv, false)
        f.callComposite(flowDoMove, { moveId: mv, target: evt.eventSourceEntity })
      },
      'unlock': () => {
        f.setNodeGraphVariable('lock', false, false)
        f.callComposite(flowAfterTurn, { target: evt.eventSourceEntity })
      },
      default: () => {}
    })
  })
  .on('whenTabIsSelected', (evt, f) => {
    // 14 复原（临时=重置到还原态）/ 15 重置：宿主写 blocks（复合内 entity_list 数组字面量有编码缺口）
    f.doubleBranch(
      f.logicalOrOperation(f.equal(evt.tabId, 14), f.equal(evt.tabId, 15)),
      () => {
        f.callComposite(flowResetPublish, { stage, target: f.getSelfEntity() })
      },
      () => {
        // curMove 由宿主设置（事件载荷数据引脚路径，复合内 capture 设变量有类型问题）
        f.setNodeGraphVariable('curMove', evt.tabId, false)
        f.callComposite(flowTabDispatch, {
          tabId: evt.tabId,
          target: evt.eventSourceEntity
        })
      }
    )
  })
  .onSignal(RubikSignal.rubik3x3_tab, (evt: any, f: any) => {
    const target = f.getSelfEntity()
    // 副控制器 B 的本地 tabId 已在 relay 中 +9 映射到全局 10..15
    f.doubleBranch(
      f.logicalOrOperation(f.equal(evt.params.tabId, 14), f.equal(evt.params.tabId, 15)),
      () => {
        f.callComposite(flowResetPublish, { stage, target })
      },
      () => {
        f.setNodeGraphVariable('curMove', evt.params.tabId, false)
        f.callComposite(flowTabDispatch, {
          tabId: evt.params.tabId,
          target
        })
      }
    )
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.doubleBranch(f.equal(evt.params.op, 3), () => {
      f.callComposite(flowRequestMove, { moveId: evt.params.val, target: f.getSelfEntity() })
    }, () => {})
  })

export default graph
