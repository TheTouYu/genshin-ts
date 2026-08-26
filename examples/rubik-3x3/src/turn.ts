// rubik-3x3 转动/逻辑图 _GSTS_turn（2026-08-24 拆图：承载 flowDoMove/flowAfterTurn/flowRequestMove）
//
// 架构：五层分离（输入/流程/逻辑/表现/结算），复合按目录分类：
//   math / motion / logic / flow / view
// 性能设计：N 块统一定时器（turnblock + orbit2），timerSequenceId 即槽位，避免 per-block 分支。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { flowDoMove, flowAfterTurn, flowRequestMove, flowTabLock, flowScramble, flowWholeTail } from './composites/flow.js'
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
    id: 1073741835,
    variables: {
      // —— 流程层 ——
      lock: false,
      // 逻辑-only 执行标志：op3 负向分支置 true，flowDoMove 只推逻辑状态、跳过视觉与定时器，并在结束时复位
      logicOnly: false,
      // 负 moveId 拆分状态：pendNeg=待发的负 moveId，negPhase=已完成逻辑-only 次数（0..2）
      pendNeg: new int(0),
      negPhase: new int(0),
      autoMode: false,
      spawned: false,
      settled: false,
      solvedFlag: false,
      qLen: new int(0),
      qIdx: new int(0),
      lastMove: new int(0),
      queue: dict([{ k: 0, v: new int(0) }]),
      curMove: new int(0),
      pendingMove: new int(0),
      pendingTab: new int(-1),
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
      faceTurnTimes: [0.01, 0.02, 0.03, 0.04, 0.05],
      // 2026-08-26 微调：面转拆双通道（A/B 各 4-5 槽并行），块间运动错开从 70ms 缩到 40ms、动画更紧凑
      faceTurnTimesB: [0.01, 0.02, 0.03, 0.04],
      faceOrbit2Times: [0.16, 0.17, 0.18, 0.19, 0.20],
      // 2026-08-26 修复 2909：orbit2 必须与 B 通道相位对齐（B 块 0.01s 起转 → orbit2 0.16s 起），
      // 否则 B 块两段运动错开 0.2s，动画后最终位置错乱
      faceOrbit2TimesB: [0.16, 0.17, 0.18, 0.19],
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
      'wholeTail': () => {
        // 整转事件拆分第二段：逻辑 B + 参数 + 发布 + 8 视觉定时器（2910 单事件超限拆分）
        f.callComposite(flowWholeTail, { target: evt.eventSourceEntity })
      },
      'negDone': () => {
        // 负 moveId 拆分的状态机：每完成一次逻辑-only 应用，推进一次；
        // 满 3 次后请求负 moveId 的视觉转动（flowDoMove isInv 分支只转视觉）。
        // 2026-08-26 日志 2899 修复：分支必须读“已写入的 negPhase”，不能复用表达式 ph——
        // 表达式被二次物化，第二次物化在 set 之后重读 negPhase，(ph+1)+1 导致只做 2 次逻辑应用，
        // 反向面转少转 90°（旋转面回归）。
        const self = f.getSelfEntity()
        const ph = f.addition(f.getNodeGraphVariable('negPhase').asType('int'), 1n)
        f.setNodeGraphVariable('negPhase', ph, false)
        const pend = f.getNodeGraphVariable('pendNeg').asType('int')
        const base = f.absoluteValueOperation(pend)
        f.doubleBranch(f.lessThan(f.getNodeGraphVariable('negPhase').asType('int'), 3n), () => {
          f.setNodeGraphVariable('logicOnly', true, false)
          f.callComposite(flowRequestMove, { moveId: base, target: self })
        }, () => {
          f.callComposite(flowRequestMove, { moveId: pend, target: self })
        })
      },
      default: () => {}
    })
  })


  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    f.multipleBranches(evt.params.op, {
      3: () => {
        // 手动 tab 与求解执行都从这里统一进入转动；打乱队列播放期间忽略外部指令（防串台）
        f.doubleBranch(f.equal(f.getNodeGraphVariable('autoMode').asType('bool'), true), () => {
          // 打乱队列播放中：忽略外部指令（2897 实证空真分支不影响 join 与 false 分支链路）
        }, () => {
          f.doubleBranch(f.lessThan(evt.params.val, 0n), () => {
            // 负 moveId：锁门后先 3 次逻辑-only（negDone 状态机），最后负轴视觉
            f.callComposite(flowTabLock, {})
            f.setNodeGraphVariable('pendNeg', evt.params.val, false)
            f.setNodeGraphVariable('negPhase', new int(0), false)
            f.setNodeGraphVariable('logicOnly', true, false)
            f.callComposite(flowRequestMove, { moveId: f.absoluteValueOperation(evt.params.val), target: f.getSelfEntity() })
          }, () => {
            f.callComposite(flowTabLock, {})
            f.callComposite(flowRequestMove, { moveId: evt.params.val, target: f.getSelfEntity() })
          })
        })
      },
      8: () => {
        // 主图重置/开局 5s 后通知 turn 图复位自己的逻辑状态
        f.callComposite(logicReset, {})
      },
      10: () => {
        // 打乱：由 turn 图统一维护 queue/lock/autoMode
        f.callComposite(flowScramble, { target: f.getSelfEntity() })
      },
      default: () => {}
    })
  })

export default graph