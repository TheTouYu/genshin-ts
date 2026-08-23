// 逻辑状态层（单一事实源）
// 命名前缀：logic_*
// 状态变量：cornerPos/cornerOrient/edgePos/edgeOrient/centerPos
// 应用 move 时先读入 tempP/tempT（tempP 存全局块索引：角 0..7/棱 8..19/心 20..25），再写回状态。
// 2026-08-20：改用 finiteLoop 物化循环体，避免 26 槽展开导致节点预算超限。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'
import { longListGetInt } from './list.js'

type Flow = any

// 面转：4 角 + 4 棱（心不位移）
export const logicApplyFace = g.defineComposite('logic_apply_face', {
    id: 1610700000,
  inputs: { moveId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId }, f) => {
    const faceCornerFromVar = f.getNodeGraphVariable('faceCornerFrom').asType('int_list')
    const faceCornerToVar = f.getNodeGraphVariable('faceCornerTo').asType('int_list')
    const faceCornerTwistVar = f.getNodeGraphVariable('faceCornerTwist').asType('int_list')
    const faceEdgeFromVar = f.getNodeGraphVariable('faceEdgeFrom').asType('int_list')
    const faceEdgeToVar = f.getNodeGraphVariable('faceEdgeTo').asType('int_list')
    const faceEdgeFlipVar = f.getNodeGraphVariable('faceEdgeFlip').asType('int_list')
    const faceCenterIndexVar = f.getNodeGraphVariable('faceCenterIndex').asType('int_list')
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const edgePos = f.getNodeGraphVariable('edgePos').asType('int_list')
    const edgeOrient = f.getNodeGraphVariable('edgeOrient').asType('int_list')
    const centerPos = f.getNodeGraphVariable('centerPos').asType('int_list')
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    const blockOrient = f.getNodeGraphVariable('blockOrient').asType('int_list')
    const orientTrans0 = f.getNodeGraphVariable('moveOrientTransition0').asType('int_list')
    const orientTrans1 = f.getNodeGraphVariable('moveOrientTransition1').asType('int_list')
    const orientTrans2 = f.getNodeGraphVariable('moveOrientTransition2').asType('int_list')
    // 块移动后完整朝向 = longListGetInt(moveOrientTransition, (moveId-1)*24 + 旧朝向)
    const nextOrient = (oldOrient: any) => f.callComposite(longListGetInt, {
      i: f.addition(f.multiplication(f.subtraction(moveId, 1n), 24n), oldOrient),
      chunkSize: 100n,
      c0: orientTrans0,
      c1: orientTrans1,
      c2: orientTrans2
    }).out

    // 角：phase 1 读入 tempP[0..3]/tempT[0..3]
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 1n), 4n), s)
      const from = f.getCorrespondingValueFromList(faceCornerFromVar, idx)
      const piece = f.getCorrespondingValueFromList(cornerPos, from)
      const twist = f.getCorrespondingValueFromList(cornerOrient, from)
      const setP = f.registerExecNode('set_list_value', [tempP, s, piece])
      const setT = f.registerExecNode('set_list_value', [tempT, s, twist])
      f.connect(setP, 0, setT, 0)
    })
    // 角：phase 2 写回（同步增量更新 blockOrient）
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 1n), 4n), s)
      const to = f.getCorrespondingValueFromList(faceCornerToVar, idx)
      const twIdx = f.addition(
        f.addition(f.multiplication(f.subtraction(moveId, 1n), 12n), f.multiplication(s, 3n)),
        f.getCorrespondingValueFromList(tempT, s)
      )
      const tw = f.getCorrespondingValueFromList(faceCornerTwistVar, twIdx)
      const piece = f.getCorrespondingValueFromList(tempP, s)
      const setPos = f.registerExecNode('set_list_value', [cornerPos, to, piece])
      const setOrient = f.registerExecNode('set_list_value', [cornerOrient, to, tw])
      const oldOrient = f.getCorrespondingValueFromList(blockOrient, piece)
      const newOrient = nextOrient(oldOrient)
      const setBO = f.registerExecNode('set_list_value', [blockOrient, piece, newOrient])
      f.connect(setPos, 0, setOrient, 0)
      f.connect(setOrient, 0, setBO, 0)
    })
    // 棱：temp 槽 4..7，全局块索引 = 8 + 本地棱号
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 1n), 4n), s)
      const slot = f.addition(s, 4n)
      const from = f.getCorrespondingValueFromList(faceEdgeFromVar, idx)
      const piece = f.getCorrespondingValueFromList(edgePos, from)
      const flip = f.getCorrespondingValueFromList(edgeOrient, from)
      const globalPiece = f.addition(piece, 8n)
      const setP = f.registerExecNode('set_list_value', [tempP, slot, globalPiece])
      const setT = f.registerExecNode('set_list_value', [tempT, slot, flip])
      f.connect(setP, 0, setT, 0)
    })
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 1n), 4n), s)
      const slot = f.addition(s, 4n)
      const to = f.getCorrespondingValueFromList(faceEdgeToVar, idx)
      const flIdx = f.addition(
        f.addition(f.multiplication(f.subtraction(moveId, 1n), 8n), f.multiplication(s, 2n)),
        f.getCorrespondingValueFromList(tempT, slot)
      )
      const fl = f.getCorrespondingValueFromList(faceEdgeFlipVar, flIdx)
      const globalPiece = f.getCorrespondingValueFromList(tempP, slot)
      const piece = f.subtraction(globalPiece, 8n)
      const setPos = f.registerExecNode('set_list_value', [edgePos, to, piece])
      const setOrient = f.registerExecNode('set_list_value', [edgeOrient, to, fl])
      const oldOrient = f.getCorrespondingValueFromList(blockOrient, globalPiece)
      const newOrient = nextOrient(oldOrient)
      const setBO = f.registerExecNode('set_list_value', [blockOrient, globalPiece, newOrient])
      f.connect(setPos, 0, setOrient, 0)
      f.connect(setOrient, 0, setBO, 0)
    })
    // 面心：不位移但绕面法线自旋，同样更新 blockOrient
    const centerIdx = f.getCorrespondingValueFromList(faceCenterIndexVar, moveId)
    const centerLocal = f.getCorrespondingValueFromList(centerPos, centerIdx)
    const centerPiece = f.addition(centerLocal, 20n)
    const centerOld = f.getCorrespondingValueFromList(blockOrient, centerPiece)
    const centerNew = nextOrient(centerOld)
    const setCenterBO = f.registerExecNode('set_list_value', [blockOrient, centerPiece, centerNew])

    // done 标记（普通节点，确保 outflow 有真实物理出口）
    const doneNode = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
    f.connect(setCenterBO, 0, doneNode, 0)
    f.outflow('done', doneNode, 0)
    return {}
  }
})

// 中层转：4 棱 + 4 心
export const logicApplyMiddle = g.defineComposite('logic_apply_middle', {
    id: 1610700001,
  inputs: { moveId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId }, f) => {
    const middleEdgeFromVar = f.getNodeGraphVariable('middleEdgeFrom').asType('int_list')
    const middleEdgeToVar = f.getNodeGraphVariable('middleEdgeTo').asType('int_list')
    const middleEdgeFlipVar = f.getNodeGraphVariable('middleEdgeFlip').asType('int_list')
    const middleCenterFromVar = f.getNodeGraphVariable('middleCenterFrom').asType('int_list')
    const middleCenterToVar = f.getNodeGraphVariable('middleCenterTo').asType('int_list')
    const edgePos = f.getNodeGraphVariable('edgePos').asType('int_list')
    const edgeOrient = f.getNodeGraphVariable('edgeOrient').asType('int_list')
    const centerPos = f.getNodeGraphVariable('centerPos').asType('int_list')
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    const blockOrient = f.getNodeGraphVariable('blockOrient').asType('int_list')
    const orientTrans0 = f.getNodeGraphVariable('moveOrientTransition0').asType('int_list')
    const orientTrans1 = f.getNodeGraphVariable('moveOrientTransition1').asType('int_list')
    const orientTrans2 = f.getNodeGraphVariable('moveOrientTransition2').asType('int_list')
    const nextOrient = (oldOrient: any) => f.callComposite(longListGetInt, {
      i: f.addition(f.multiplication(f.subtraction(moveId, 1n), 24n), oldOrient),
      chunkSize: 100n,
      c0: orientTrans0,
      c1: orientTrans1,
      c2: orientTrans2
    }).out

    // 棱：temp 槽 0..3，全局块索引 = 8 + 本地棱号
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 7n), 4n), s)
      const from = f.getCorrespondingValueFromList(middleEdgeFromVar, idx)
      const piece = f.getCorrespondingValueFromList(edgePos, from)
      const flip = f.getCorrespondingValueFromList(edgeOrient, from)
      const globalPiece = f.addition(piece, 8n)
      const setP = f.registerExecNode('set_list_value', [tempP, s, globalPiece])
      const setT = f.registerExecNode('set_list_value', [tempT, s, flip])
      f.connect(setP, 0, setT, 0)
    })
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 7n), 4n), s)
      const to = f.getCorrespondingValueFromList(middleEdgeToVar, idx)
      const flIdx = f.addition(
        f.addition(f.multiplication(f.subtraction(moveId, 7n), 8n), f.multiplication(s, 2n)),
        f.getCorrespondingValueFromList(tempT, s)
      )
      const fl = f.getCorrespondingValueFromList(middleEdgeFlipVar, flIdx)
      const globalPiece = f.getCorrespondingValueFromList(tempP, s)
      const piece = f.subtraction(globalPiece, 8n)
      const setPos = f.registerExecNode('set_list_value', [edgePos, to, piece])
      const setOrient = f.registerExecNode('set_list_value', [edgeOrient, to, fl])
      const oldOrient = f.getCorrespondingValueFromList(blockOrient, globalPiece)
      const newOrient = nextOrient(oldOrient)
      const setBO = f.registerExecNode('set_list_value', [blockOrient, globalPiece, newOrient])
      f.connect(setPos, 0, setOrient, 0)
      f.connect(setOrient, 0, setBO, 0)
    })
    // 心：temp 槽 4..7，全局块索引 = 20 + 本地心号；心也随转更新朝向
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 7n), 4n), s)
      const slot = f.addition(s, 4n)
      const from = f.getCorrespondingValueFromList(middleCenterFromVar, idx)
      const piece = f.getCorrespondingValueFromList(centerPos, from)
      const globalPiece = f.addition(piece, 20n)
      const setP = f.registerExecNode('set_list_value', [tempP, slot, globalPiece])
    })
    f.finiteLoop(0n, 3n, (s) => {
      const idx = f.addition(f.multiplication(f.subtraction(moveId, 7n), 4n), s)
      const slot = f.addition(s, 4n)
      const to = f.getCorrespondingValueFromList(middleCenterToVar, idx)
      const globalPiece = f.getCorrespondingValueFromList(tempP, slot)
      const piece = f.subtraction(globalPiece, 20n)
      const setPos = f.registerExecNode('set_list_value', [centerPos, to, piece])
      const oldOrient = f.getCorrespondingValueFromList(blockOrient, globalPiece)
      const newOrient = nextOrient(oldOrient)
      const setBO = f.registerExecNode('set_list_value', [blockOrient, globalPiece, newOrient])
      f.connect(setPos, 0, setBO, 0)
    })

    const doneNode = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
    f.outflow('done', doneNode, 0)
    return {}
  }
})

// 整体转：8 角 + 12 棱 + 6 心
export const logicApplyWhole = g.defineComposite('logic_apply_whole', {
    id: 1610700002,
  inputs: { moveId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId }, f) => {
    const wholeCornerFromVar = f.getNodeGraphVariable('wholeCornerFrom').asType('int_list')
    const wholeCornerToVar = f.getNodeGraphVariable('wholeCornerTo').asType('int_list')
    const wholeCornerTwistVar = f.getNodeGraphVariable('wholeCornerTwist').asType('int_list')
    const wholeEdgeFromVar = f.getNodeGraphVariable('wholeEdgeFrom').asType('int_list')
    const wholeEdgeToVar = f.getNodeGraphVariable('wholeEdgeTo').asType('int_list')
    const wholeEdgeFlipVar = f.getNodeGraphVariable('wholeEdgeFlip').asType('int_list')
    const wholeCenterFromVar = f.getNodeGraphVariable('wholeCenterFrom').asType('int_list')
    const wholeCenterToVar = f.getNodeGraphVariable('wholeCenterTo').asType('int_list')
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const edgePos = f.getNodeGraphVariable('edgePos').asType('int_list')
    const edgeOrient = f.getNodeGraphVariable('edgeOrient').asType('int_list')
    const centerPos = f.getNodeGraphVariable('centerPos').asType('int_list')
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    const blockOrient = f.getNodeGraphVariable('blockOrient').asType('int_list')
    // 2026-08-22 性能修复：整体转用专用 72 项紧凑表（3 move × 24 朝向 < 100 免分块），
    // 每块朝向查表从 longListGetInt（~9 节点）降到直接查表（2 节点），压帧数到引擎单记录上限内
    const wholeOrientTrans = f.getNodeGraphVariable('wholeOrientTransition').asType('int_list')
    // 循环不变量提升：moveId 在 6 个有限循环中不变，减法/乘法只在图里建一次
    const m10 = f.subtraction(moveId, 10n)
    const m10x8 = f.multiplication(m10, 8n)
    const m10x12 = f.multiplication(m10, 12n)
    const m10x6 = f.multiplication(m10, 6n)
    const wholeOrientBase = f.multiplication(m10, 24n)
    const nextOrient = (oldOrient: any) => f.getCorrespondingValueFromList(
      wholeOrientTrans, f.addition(wholeOrientBase, oldOrient)
    )

    // 角：temp 槽 0..7（build 期展开——temp 段体小，展开帧收益 ~3.1f/节点，性价比高）
    // 2026-08-22 修复（bug2 + 节点预算回归）：
    //   bug2 根因：6 个运行时 finiteLoop 控制帧 978f（36%）是单记录 3002 帧截断的直接原因；
    //   但全展开把 logic_apply_whole 从 ~87 推到 512 节点，游戏“节点图数量”预测 3657 > 3000 拒载。
    //   折中：temp 段（26 迭代，体 ~6 节点/迭代）保持展开；写回段（26 迭代，体 ~13 节点/迭代）
    //   恢复有限循环。节点 ≈216（预算余量 ~480），帧 ≈2513 <3000。
    for (let s = 0; s < 8; s++) {
      const idx = f.addition(m10x8, new int(s))
      const from = f.getCorrespondingValueFromList(wholeCornerFromVar, idx)
      const piece = f.getCorrespondingValueFromList(cornerPos, from)
      const twist = f.getCorrespondingValueFromList(cornerOrient, from)
      const setP = f.registerExecNode('set_list_value', [tempP, new int(s), piece])
      const setT = f.registerExecNode('set_list_value', [tempT, new int(s), twist])
      f.connect(setP, 0, setT, 0)
    }
    // 角：写回（有限循环）
    f.finiteLoop(0n, 7n, (s) => {
      const idx = f.addition(m10x8, s)
      const to = f.getCorrespondingValueFromList(wholeCornerToVar, idx)
      const twIdx = f.addition(
        f.addition(wholeOrientBase, f.multiplication(s, 3n)),
        f.getCorrespondingValueFromList(tempT, s)
      )
      const tw = f.getCorrespondingValueFromList(wholeCornerTwistVar, twIdx)
      const piece = f.getCorrespondingValueFromList(tempP, s)
      const setPos = f.registerExecNode('set_list_value', [cornerPos, to, piece])
      const setOrient = f.registerExecNode('set_list_value', [cornerOrient, to, tw])
      const oldOrient = f.getCorrespondingValueFromList(blockOrient, piece)
      const newOrient = nextOrient(oldOrient)
      const setBO = f.registerExecNode('set_list_value', [blockOrient, piece, newOrient])
      f.connect(setPos, 0, setOrient, 0)
      f.connect(setOrient, 0, setBO, 0)
    })
    // 棱：temp 槽 8..19
    // 2026-08-22 节点预算回归（游戏拒载 3150）：棱 temp 12 迭代展开 ≈120 节点→循环化省 ~106
    // 节点（Δformula ≈ -193）；旋转记录帧 2513→~2740 仍 <3000（余量 ~260f，全部 temp 循环化
    // 会 3002f 截断，故角/心 temp 保持展开）。
    f.finiteLoop(0n, 11n, (s) => {
      const idx = f.addition(m10x12, s)
      const slot = f.addition(s, 8n)
      const from = f.getCorrespondingValueFromList(wholeEdgeFromVar, idx)
      const piece = f.getCorrespondingValueFromList(edgePos, from)
      const flip = f.getCorrespondingValueFromList(edgeOrient, from)
      const globalPiece = f.addition(piece, new int(8))
      const setP = f.registerExecNode('set_list_value', [tempP, slot, globalPiece])
      const setT = f.registerExecNode('set_list_value', [tempT, slot, flip])
      f.connect(setP, 0, setT, 0)
    })
    // 棱：写回（有限循环）
    f.finiteLoop(0n, 11n, (s) => {
      const idx = f.addition(m10x12, s)
      const slot = f.addition(s, 8n)
      const to = f.getCorrespondingValueFromList(wholeEdgeToVar, idx)
      const flIdx = f.addition(
        f.addition(wholeOrientBase, f.multiplication(s, 2n)),
        f.getCorrespondingValueFromList(tempT, slot)
      )
      const fl = f.getCorrespondingValueFromList(wholeEdgeFlipVar, flIdx)
      const globalPiece = f.getCorrespondingValueFromList(tempP, slot)
      const piece = f.subtraction(globalPiece, new int(8))
      const setPos = f.registerExecNode('set_list_value', [edgePos, to, piece])
      const setOrient = f.registerExecNode('set_list_value', [edgeOrient, to, fl])
      const oldOrient = f.getCorrespondingValueFromList(blockOrient, globalPiece)
      const newOrient = nextOrient(oldOrient)
      const setBO = f.registerExecNode('set_list_value', [blockOrient, globalPiece, newOrient])
      f.connect(setPos, 0, setOrient, 0)
      f.connect(setOrient, 0, setBO, 0)
    })
    // 心：temp 槽 20..25；心随整体转也更新朝向
    for (let s = 0; s < 6; s++) {
      const idx = f.addition(m10x6, new int(s))
      const slot = new int(20 + s)
      const from = f.getCorrespondingValueFromList(wholeCenterFromVar, idx)
      const piece = f.getCorrespondingValueFromList(centerPos, from)
      const globalPiece = f.addition(piece, new int(20))
      const setP = f.registerExecNode('set_list_value', [tempP, slot, globalPiece])
    }
    // 心：写回（有限循环）
    f.finiteLoop(0n, 5n, (s) => {
      const idx = f.addition(m10x6, s)
      const slot = f.addition(s, 20n)
      const to = f.getCorrespondingValueFromList(wholeCenterToVar, idx)
      const globalPiece = f.getCorrespondingValueFromList(tempP, slot)
      const piece = f.subtraction(globalPiece, new int(20))
      const setPos = f.registerExecNode('set_list_value', [centerPos, to, piece])
      const oldOrient = f.getCorrespondingValueFromList(blockOrient, globalPiece)
      const newOrient = nextOrient(oldOrient)
      const setBO = f.registerExecNode('set_list_value', [blockOrient, globalPiece, newOrient])
      f.connect(setPos, 0, setBO, 0)
    })

    const doneNode = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
    f.outflow('done', doneNode, 0)
    return {}
  }
})

// 胜利判定：所有位置恒等 + 所有朝向为 0
export const logicIsSolved = g.defineComposite('logic_is_solved', {
    id: 1610700003,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const edgePos = f.getNodeGraphVariable('edgePos').asType('int_list')
    const edgeOrient = f.getNodeGraphVariable('edgeOrient').asType('int_list')
    const centerPos = f.getNodeGraphVariable('centerPos').asType('int_list')

    // 先假设已还原；任一项不满足就把 solvedFlag 置 false。
    // 用 finiteLoop 物化循环体，节点数从 142 降到 ~30。
    const init = f.node('set_node_graph_variable', [new str('solvedFlag'), new bool(true), new bool(false)])
    f.link(f.entry(), 0, init, 0)

    const checkFalse = (ok: any) => {
      f.doubleBranch(f.logicalNotOperation(ok), () => {
        f.registerExecNode('set_node_graph_variable', [new str('solvedFlag'), new bool(false), new bool(false)])
      }, () => {})
    }

    f.finiteLoop(0n, 7n, (i) => {
      const ok = f.logicalAndOperation(
        f.equal(f.getCorrespondingValueFromList(cornerPos, i), i),
        f.equal(f.getCorrespondingValueFromList(cornerOrient, i), new int(0))
      )
      checkFalse(ok)
    })
    f.finiteLoop(0n, 11n, (i) => {
      const ok = f.logicalAndOperation(
        f.equal(f.getCorrespondingValueFromList(edgePos, i), i),
        f.equal(f.getCorrespondingValueFromList(edgeOrient, i), new int(0))
      )
      checkFalse(ok)
    })
    f.finiteLoop(0n, 5n, (i) => {
      const ok = f.equal(f.getCorrespondingValueFromList(centerPos, i), i)
      checkFalse(ok)
    })

    const doneNode = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
    f.outflow('done', doneNode, 0)
    return {}
  }
})

// 逻辑复位：corner/edge/center 全部回到恒等，temp 清零
export const logicReset = g.defineComposite('logic_reset', {
    id: 1610700004,
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const edgePos = f.getNodeGraphVariable('edgePos').asType('int_list')
    const edgeOrient = f.getNodeGraphVariable('edgeOrient').asType('int_list')
    const centerPos = f.getNodeGraphVariable('centerPos').asType('int_list')
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    const blockOrient = f.getNodeGraphVariable('blockOrient').asType('int_list')
    const blockOrientPre = f.getNodeGraphVariable('blockOrientPre').asType('int_list')

    // 引擎对“全 0 int_list”图变量只物化出很短长度，且 set_list_value 写 0 到越界下标
    // 不会扩展长度（日志 2766 实证：logicReset 写 0 后 cornerOrient 仍是 [0,0]、
    // edgeOrient 仍是 [0,0,0]）。因此必须先写非 0 哨兵把列表撑到满长，再写真实值。
    // 2026-08-22 修复（bug3 + 节点预算回归）：哨兵段 build 期展开（46 迭代、124 节点、
    // 0 控制帧——撑列表必须先于循环写 0，且展开后索引是编译期常量更稳）；
    // 复位段恢复有限循环（见下）。复原 execMove 帧 ≈2138 <3000。
    for (let i = 0; i < 8; i++) {
      f.registerExecNode('set_list_value', [cornerOrient, new int(i), new int(i + 1)])
    }
    for (let i = 0; i < 12; i++) {
      f.registerExecNode('set_list_value', [edgeOrient, new int(i), new int(i + 1)])
    }
    for (let i = 0; i < 26; i++) {
      const p = f.registerExecNode('set_list_value', [tempP, new int(i), new int(i + 1)])
      const t = f.registerExecNode('set_list_value', [tempT, new int(i), new int(i + 1)])
      const b = f.registerExecNode('set_list_value', [blockOrient, new int(i), new int(i + 1)])
      const bp = f.registerExecNode('set_list_value', [blockOrientPre, new int(i), new int(i + 1)])
      f.connect(p, 0, t, 0)
      f.connect(t, 0, b, 0)
      f.connect(b, 0, bp, 0)
    }

    // 复位（有限循环：52 迭代控制帧 ~978f，换回 ~150 展开节点——节点预算余量 ~480 的关键）
    // 2026-08-22 节点预算回归修复：全展开版 logic_reset 285 节点把“节点图数量”预测推到 3657 拒载；
    // 哨兵段保持展开（无控制帧、必须先撑满列表），复位段恢复有限循环（体 ~9 节点/循环）。
    // 复原 execMove 帧 ≈2138 <3000、logic_reset 节点 ≈148。
    f.finiteLoop(0n, 7n, (i) => {
      const p = f.registerExecNode('set_list_value', [cornerPos, i, i])
      const t = f.registerExecNode('set_list_value', [cornerOrient, i, new int(0)])
      f.connect(p, 0, t, 0)
    })
    f.finiteLoop(0n, 11n, (i) => {
      const p = f.registerExecNode('set_list_value', [edgePos, i, i])
      const t = f.registerExecNode('set_list_value', [edgeOrient, i, new int(0)])
      f.connect(p, 0, t, 0)
    })
    f.finiteLoop(0n, 5n, (i) => {
      f.registerExecNode('set_list_value', [centerPos, i, i])
    })
    f.finiteLoop(0n, 25n, (i) => {
      const p = f.registerExecNode('set_list_value', [tempP, i, new int(0)])
      const t = f.registerExecNode('set_list_value', [tempT, i, new int(0)])
      const b = f.registerExecNode('set_list_value', [blockOrient, i, new int(0)])
      const bp = f.registerExecNode('set_list_value', [blockOrientPre, i, new int(0)])
      f.connect(p, 0, t, 0)
      f.connect(t, 0, b, 0)
      f.connect(b, 0, bp, 0)
    })

    const doneNode = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), f.getNodeGraphVariable('turnLastSlot').asType('int'), new bool(false)])
    f.outflow('done', doneNode, 0)
    return {}
  }
})
