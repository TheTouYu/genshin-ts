// 表现层：把逻辑 tempP 的槽位顺序重排为视觉播放顺序
// 命名前缀：view_prepare_*
// 面/中层：角/棱（或心/棱）交替绕一圈；整体：角/棱/心交错，避免按类型分组启动。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'

export const viewPrepareVisualOrder = g.defineComposite('view_prepare_visual_order', {
    id: 1610700030,
  inputs: { moveId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId }, f) => {
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const visualP = f.getNodeGraphVariable('visualP').asType('int_list')
    const lastSlot = f.getNodeGraphVariable('turnLastSlot').asType('int')

    const isFace = f.logicalAndOperation(
      f.greaterThan(moveId, 0),
      f.logicalNotOperation(f.greaterThan(moveId, 6))
    )
    const isMiddle = f.logicalAndOperation(
      f.greaterThan(moveId, 6),
      f.logicalNotOperation(f.greaterThan(moveId, 9))
    )

    // 用 f.node 创建 detached 公共 done，避免它被 auto-chain 成 doubleBranch 的入口
    const doneNode = f.node('set_node_graph_variable', [
      new str('turnLastSlot'), lastSlot, new bool(false)
    ])

    f.doubleBranch(isFace, () => {
      const order = f.getNodeGraphVariable('faceVisualOrder').asType('int_list')
      f.finiteLoop(0n, 7n, (i) => {
        const srcIdx = f.addition(f.multiplication(f.subtraction(moveId, 1n), 8n), i)
        const src = f.getCorrespondingValueFromList(order, srcIdx)
        const piece = f.getCorrespondingValueFromList(tempP, src)
        // 2026-08-26 中心块优先：8 个块写入槽 1..8
        f.registerExecNode('set_list_value', [visualP, f.addition(i, 1n), piece])
      })
      const centerIdx = f.getCorrespondingValueFromList(
        f.getNodeGraphVariable('faceCenterIndex').asType('int_list'),
        moveId
      )
      const centerLocal = f.getCorrespondingValueFromList(
        f.getNodeGraphVariable('centerPos').asType('int_list'),
        centerIdx
      )
      const centerPiece = f.addition(centerLocal, 20n)
      const setCenter = f.registerExecNode('set_list_value', [visualP, new int(0), centerPiece])
      const branchDone = f.registerExecNode('set_node_graph_variable', [
        new str('turnLastSlot'), lastSlot, new bool(false)
      ])
      f.connect(setCenter, 0, branchDone, 0)
      f.connect(branchDone, 0, doneNode, 0)
    }, () => {
      f.doubleBranch(isMiddle, () => {
        const order = f.getNodeGraphVariable('middleVisualOrder').asType('int_list')
        f.finiteLoop(0n, 7n, (i) => {
          const src = f.getCorrespondingValueFromList(order, i)
          const piece = f.getCorrespondingValueFromList(tempP, src)
          f.registerExecNode('set_list_value', [visualP, i, piece])
        })
        const branchDone = f.registerExecNode('set_node_graph_variable', [
          new str('turnLastSlot'), lastSlot, new bool(false)
        ])
        f.connect(branchDone, 0, doneNode, 0)
      }, () => {
        const order = f.getNodeGraphVariable('wholeVisualOrder').asType('int_list')
        f.finiteLoop(0n, 25n, (i) => {
          const src = f.getCorrespondingValueFromList(order, i)
          const piece = f.getCorrespondingValueFromList(tempP, src)
          f.registerExecNode('set_list_value', [visualP, i, piece])
        })
        const branchDone = f.registerExecNode('set_node_graph_variable', [
          new str('turnLastSlot'), lastSlot, new bool(false)
        ])
        f.connect(branchDone, 0, doneNode, 0)
      })
    })
    f.outflow('done', doneNode, 0)
    return {}
  }
})
