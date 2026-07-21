import { CompositeDefIR } from '../../runtime/IR'
import { isConnectionArgument } from './node_id.js'
import { IRNode, NodeId, Position } from './types.js'

type LayoutConfig = {
  columnWidth: number
  rowHeight: number
  maxColumns: number
  wrapHeight: number
  eventGap: number
}

type ExtraDataConnection = {
  fromId: NodeId
  toId: NodeId
  fromIndex?: number
  toIndex?: number
}

type LayoutOptions = {
  extraDataConnections?: ExtraDataConnection[]
  virtualConsumerIds?: NodeId[]
  execLaneSpacingScale?: number
}

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function buildExecutionGraph(irNodes: IRNode[]) {
  const execEdges: Array<[NodeId, NodeId]> = []
  // 节点ID -> 指向该节点的边数量（用于找出根节点，没有入边的节点是根节点）
  const incoming = new Map<NodeId, number>()
  // 节点ID -> 执行子节点ID列表（用于快速查找执行流的下游节点）
  const execChildrenMap = new Map<NodeId, NodeId[]>()
  // 节点ID -> 数据消费者节点ID列表（用于快速查找数据节点的消费者）
  const dataConsumersMap = new Map<NodeId, NodeId[]>()
  // 执行连接信息
  const flowConnections: Array<{
    fromId: NodeId
    toId: NodeId
    fromIndex: number
    toIndex: number
  }> = []
  // 数据连接信息
  const dataConnections: Array<{
    fromId: NodeId
    toId: NodeId
    fromIndex: number
    toIndex: number
  }> = []

  for (const node of irNodes) {
    const children: NodeId[] = []
    for (const next of asArray(node.next)) {
      const targetId = typeof next === 'number' ? next : next.node_id
      const fromIndex = typeof next === 'number' ? 0 : (next.source_index ?? 0)
      const toIndex = typeof next === 'number' ? 0 : (next.target_index ?? 0)
      execEdges.push([node.id, targetId])
      incoming.set(targetId, (incoming.get(targetId) ?? 0) + 1)
      children.push(targetId)
      flowConnections.push({ fromId: node.id, toId: targetId, fromIndex, toIndex })
    }
    if (children.length > 0) {
      execChildrenMap.set(node.id, children)
    }

    // 构建消费者索引和数据连接信息：遍历节点的参数，找出数据连接
    for (const [toIndex, arg] of (node.args ?? []).entries()) {
      if (isConnectionArgument(arg)) {
        const dataNodeId = arg.value.node_id
        const fromIndex = arg.value.index
        const consumers = dataConsumersMap.get(dataNodeId) ?? []
        if (!consumers.includes(node.id)) {
          consumers.push(node.id)
          dataConsumersMap.set(dataNodeId, consumers)
        }
        // 特殊节点的 GIA pin 布局与 IR args 索引不一致：
        // - assembly_list/dictionary: shared special-arg remap (pin0=count, IR i→i+1)
        // __composite_call__ 的 args[0] 是 compositeId，真正的参数从 args[1] 开始
        // send_signal 的 name 移位在 root mapInputIndex 再走 remapSpecialArgInputIndex
        const toIndexPatched =
          node.type === 'assembly_list' || node.type === 'assembly_dictionary'
            ? toIndex + 1
            : node.type === '__composite_call__'
              ? ((arg as any).compositeInputIndex ?? toIndex - 1)
              : toIndex
        dataConnections.push({
          fromId: dataNodeId,
          toId: node.id,
          fromIndex,
          toIndex: toIndexPatched
        })
      }
    }
  }

  const execNodes = new Set<NodeId>()
  execEdges.forEach(([from, to]) => {
    execNodes.add(from)
    execNodes.add(to)
  })

  let roots = irNodes
    .filter((n) => (incoming.get(n.id) ?? 0) === 0 && asArray(n.next).length > 0)
    .sort((a, b) => a.id - b.id)

  if (roots.length === 0 && execEdges.length > 0) {
    const candidates = irNodes.filter((n) => asArray(n.next).length > 0).sort((a, b) => a.id - b.id)
    if (candidates.length > 0) {
      roots = [candidates[0]]
    }
  }

  return {
    execEdges,
    execNodes,
    roots,
    execChildrenMap,
    dataConsumersMap,
    flowConnections,
    dataConnections
  }
}

function createLayoutState(irNodes: IRNode[]) {
  // 未放置位置的节点集合（初始包含所有节点，放置后从中删除）
  const unplacedNodes = new Map<NodeId, IRNode>()
  irNodes.forEach((n) => unplacedNodes.set(n.id, n))

  return {
    // 网格占位：避免执行节点坐标碰撞
    occupied: new Set<string>(),
    // 节点ID -> [x, y] 坐标位置（最终布局结果）
    positions: new Map<NodeId, Position>(),
    // 节点ID -> 事件索引（用于区分不同的执行流，控制垂直分组）
    nodeToEventIndex: new Map<NodeId, number>(),
    // 未放置位置的节点集合
    unplacedNodes,
    // 消费者节点ID -> 已堆叠的数据节点数量（用于垂直堆叠多个数据节点，避免重叠）
    consumerStackCount: new Map<NodeId, number>(),
    // 事件索引 -> 该事件中所有节点的最大Y坐标（用于计算下一个事件的基础位置）
    eventMaxYCoord: new Map<number, number>()
  }
}

function occupyNextFreeY(
  state: ReturnType<typeof createLayoutState>,
  x: number,
  y: number,
  stepY: number
): number {
  let yy = y
  // 极端情况下避免死循环
  for (let i = 0; i < 2000; i++) {
    const key = `${x},${yy}`
    if (!state.occupied.has(key)) {
      state.occupied.add(key)
      return yy
    }
    yy += stepY
  }
  throw new Error(`[error] layout collision overflow at x=${x}, y=${y}`)
}

function updateEventHeight(
  state: ReturnType<typeof createLayoutState>,
  eventIndex: number,
  y: number
) {
  const current = state.eventMaxYCoord.get(eventIndex)
  if (current === undefined || y > current) {
    state.eventMaxYCoord.set(eventIndex, y)
  }
}

/**
 * Compute the aggregate extra vertical space needed for data chains
 * in the exec subtree rooted at `nodeId`. Direct data inputs and longer
 * data ancestors add conservative allowance below their exec consumer.
 */
function computeSubtreeDataExtraHeight(
  nodeId: NodeId,
  dataBlockHeightMap: Map<NodeId, number>,
  execChildrenMap: Map<NodeId, NodeId[]>,
  memo: Map<NodeId, number>,
  visiting = new Set<NodeId>()
): number {
  const cached = memo.get(nodeId)
  if (cached !== undefined) return cached
  if (visiting.has(nodeId)) return 0

  visiting.add(nodeId)
  let total = dataBlockHeightMap.get(nodeId) ?? 0

  for (const child of execChildrenMap.get(nodeId) ?? []) {
    total += computeSubtreeDataExtraHeight(
      child,
      dataBlockHeightMap,
      execChildrenMap,
      memo,
      visiting
    )
  }

  visiting.delete(nodeId)
  memo.set(nodeId, total)
  return total
}

/**
 * Layout one exec node and all its descendants using block-height-aware
 * branch placement.  Returns the maximum Y coordinate occupied by the
 * subtree rooted at `nodeId`.
 *
 * Sibling branches are positioned below the previous sibling's subtree
 * block-bottom plus a context-dependent visual buffer, instead of using
 * a fixed per-index branch gap.  This matches the Round 8 requirement:
 * exec fan-out lanes are driven by semantic block height.
 */
function layoutExecutionChain(
  nodeId: NodeId,
  depth: number,
  baseY: number,
  eventIndex: number,
  laneOffset: number,
  execChildrenMap: Map<NodeId, NodeId[]>,
  state: ReturnType<typeof createLayoutState>,
  config: LayoutConfig,
  dataBlockHeightMap: Map<NodeId, number>,
  dataExtraHeightMemo: Map<NodeId, number>,
  minFirstChildLaneOffset?: number
): number {
  const existingPos = state.positions.get(nodeId)
  if (existingPos) return existingPos[1] + config.rowHeight

  const row = Math.floor(depth / config.maxColumns)
  const column = depth % config.maxColumns
  const x = column * config.columnWidth
  const y0 = baseY + row * config.wrapHeight + laneOffset
  // 若同位置有节点碰撞，自动下移一行，并把偏移传递给后续节点保持对齐
  const y = occupyNextFreeY(state, x, y0, config.rowHeight)
  const actualLaneOffset = y - (baseY + row * config.wrapHeight)

  state.positions.set(nodeId, [x, y])
  state.nodeToEventIndex.set(nodeId, eventIndex)
  updateEventHeight(state, eventIndex, y)

  state.unplacedNodes.delete(nodeId)

  // Default subtree bottom: this node plus one row height
  let subtreeMaxY = y + config.rowHeight

  const children = execChildrenMap.get(nodeId) ?? []
  if (children.length === 0) return subtreeMaxY

  // --- Determine spacing intent ---
  // Main swim lanes (depth 0 = direct children of event) use wide spacing
  // Multi-outlet columns (>3 children, not at root level) use tight spacing
  // Normal forks (2-3 children, not at root level) use medium spacing
  const isRootSwimLane = depth === 0
  let branchBaseSpacing: number
  if (isRootSwimLane) {
    branchBaseSpacing = 480
  } else if (children.length > 3) {
    branchBaseSpacing = 350
  } else {
    branchBaseSpacing = 400
  }

  // --- First child: place on the main lane ---
  const child0MaxY = layoutExecutionChain(
    children[0],
    depth + 1,
    baseY,
    eventIndex,
    Math.max(actualLaneOffset, minFirstChildLaneOffset ?? actualLaneOffset),
    execChildrenMap,
    state,
    config,
    dataBlockHeightMap,
    dataExtraHeightMemo
  )
  subtreeMaxY = Math.max(subtreeMaxY, child0MaxY)

  // --- Subsequent children: position below previous sibling's block ---
  let prevSubtreeMaxY = child0MaxY

  for (let idx = 1; idx < children.length; idx++) {
    const prevChildId = children[idx - 1]

    // Extra vertical allowance for data chains of the previous sibling
    const extraDataHeight = computeSubtreeDataExtraHeight(
      prevChildId,
      dataBlockHeightMap,
      execChildrenMap,
      dataExtraHeightMemo
    )

    // Root event lanes are independent swimlanes: their direct children should not
    // be pushed below the whole nested subtree of the previous root child.
    // Nested siblings still use block-bottom placement to avoid local data-heavy blocks.
    const dataLanePadding = Math.min(1100, Math.round(extraDataHeight * 0.35))
    const prevLaneBottom = prevSubtreeMaxY - (baseY + row * config.wrapHeight)
    const prevChildHasExecChildren = (execChildrenMap.get(prevChildId)?.length ?? 0) > 0
    const rootLanePadding = prevChildHasExecChildren ? 380 : dataLanePadding + 120
    const newLaneOffset = isRootSwimLane
      ? Math.max(actualLaneOffset + idx * branchBaseSpacing, prevLaneBottom + rootLanePadding)
      : Math.max(actualLaneOffset, prevLaneBottom + branchBaseSpacing + dataLanePadding)

    const childFirstLaneOffset = isRootSwimLane ? newLaneOffset : undefined

    const childMaxY = layoutExecutionChain(
      children[idx],
      depth + 1,
      baseY,
      eventIndex,
      newLaneOffset,
      execChildrenMap,
      state,
      config,
      dataBlockHeightMap,
      dataExtraHeightMemo,
      childFirstLaneOffset
    )

    subtreeMaxY = Math.max(subtreeMaxY, childMaxY)
    prevSubtreeMaxY = childMaxY
  }

  return subtreeMaxY
}

function placeDataNearConsumers(
  dataConsumersMap: Map<NodeId, NodeId[]>,
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>
): boolean {
  let placedAny = false
  const toDelete: NodeId[] = []

  state.unplacedNodes.forEach((_node, nodeId) => {
    const consumers = dataConsumersMap.get(nodeId)
    if (!consumers || consumers.length === 0) return

    // 查找已放置的消费者
    const placedConsumer = consumers.find((c) => state.positions.has(c))
    if (placedConsumer === undefined) return

    const position = state.positions.get(placedConsumer)!
    const [cx, cy] = position
    const stackCount = state.consumerStackCount.get(placedConsumer) ?? 0
    const isExecConsumer = execNodes.has(placedConsumer)

    // 数据节点初放在消费者左下方；后续 expandExecGapsForDataChains 会按整条数据链重新锚定。
    const y = isExecConsumer ? cy + (stackCount + 1) * 230 : cy + stackCount * 230
    state.positions.set(nodeId, [cx - 450, y])
    state.consumerStackCount.set(placedConsumer, stackCount + 1)

    const eventIndex = state.nodeToEventIndex.get(placedConsumer) ?? 0
    state.nodeToEventIndex.set(nodeId, eventIndex)
    updateEventHeight(state, eventIndex, y)

    toDelete.push(nodeId)
    placedAny = true
  })

  toDelete.forEach((id) => state.unplacedNodes.delete(id))
  return placedAny
}

function shiftExecChainFrom(
  startId: NodeId,
  deltaX: number,
  execChildrenMap: Map<NodeId, NodeId[]>,
  state: ReturnType<typeof createLayoutState>,
  visited = new Set<NodeId>()
) {
  if (deltaX <= 0 || visited.has(startId)) return
  visited.add(startId)

  const pos = state.positions.get(startId)
  if (pos) {
    state.positions.set(startId, [pos[0] + deltaX, pos[1]])
  }

  for (const child of execChildrenMap.get(startId) ?? []) {
    shiftExecChainFrom(child, deltaX, execChildrenMap, state, visited)
  }
}

function shiftExecChainYFrom(
  startId: NodeId,
  deltaY: number,
  execChildrenMap: Map<NodeId, NodeId[]>,
  state: ReturnType<typeof createLayoutState>,
  visited = new Set<NodeId>()
) {
  if (deltaY <= 0 || visited.has(startId)) return
  visited.add(startId)

  const pos = state.positions.get(startId)
  if (pos) {
    const nextY = pos[1] + deltaY
    state.positions.set(startId, [pos[0], nextY])
    const eventIndex = state.nodeToEventIndex.get(startId)
    if (eventIndex !== undefined) updateEventHeight(state, eventIndex, nextY)
  }

  for (const child of execChildrenMap.get(startId) ?? []) {
    shiftExecChainYFrom(child, deltaY, execChildrenMap, state, visited)
  }
}

function shiftDataChainFrom(
  startId: NodeId,
  deltaX: number,
  dataChildrenMap: Map<NodeId, NodeId[]>,
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>,
  visited = new Set<NodeId>()
) {
  if (deltaX <= 0 || visited.has(startId) || execNodes.has(startId)) return
  visited.add(startId)

  const pos = state.positions.get(startId)
  if (pos) {
    state.positions.set(startId, [pos[0] + deltaX, pos[1]])
  }

  for (const child of dataChildrenMap.get(startId) ?? []) {
    shiftDataChainFrom(child, deltaX, dataChildrenMap, execNodes, state, visited)
  }
}

function collectDataAncestors(
  nodeId: NodeId,
  dataParentsMap: Map<NodeId, NodeId[]>,
  result = new Set<NodeId>(),
  traversalStopNodes = new Set<NodeId>()
): Set<NodeId> {
  for (const parent of dataParentsMap.get(nodeId) ?? []) {
    if (result.has(parent)) continue
    result.add(parent)
    if (traversalStopNodes.has(parent)) continue
    collectDataAncestors(parent, dataParentsMap, result, traversalStopNodes)
  }
  return result
}

function compositeDefIdFromCall(node: IRNode): number | undefined {
  if (node.type !== '__composite_call__') return undefined
  const firstArg = node.args?.[0]
  if (!firstArg || firstArg.type === 'conn') return undefined
  return Number(firstArg.value)
}

function compositeCallPinCount(
  node: IRNode,
  compositeDefById: Map<number, CompositeDefIR>
): number {
  if (node.type !== '__composite_call__') return 0

  const compositeId = compositeDefIdFromCall(node)
  const def = compositeId === undefined ? undefined : compositeDefById.get(compositeId)
  const inputCount = def?.inputs.length ?? Math.max(0, (node.args?.length ?? 1) - 1)
  const outputCount = def?.outputs.length ?? 0
  return inputCount + outputCount
}

function estimateDataNodeVisualExtra(
  node: IRNode,
  compositeDefById: Map<number, CompositeDefIR>
): number {
  const pinCount = compositeCallPinCount(node, compositeDefById)

  // Composite calls with many visible input/output pins occupy a taller card than a
  // regular data node.  Reserve additional vertical space for the exec branch below
  // their consumer so a large composite data node does not overlap the next branch.
  return Math.max(0, pinCount - 2) * 140
}

function estimateDataNodeHorizontalExtra(
  node: IRNode,
  compositeDefById: Map<number, CompositeDefIR>
): number {
  const pinCount = compositeCallPinCount(node, compositeDefById)

  // Wide composite calls with many visible pins can reach into their consumer's
  // column.  Add horizontal clearance before the consumer exec node, separate from
  // vertical block-height padding.
  return Math.max(0, pinCount - 2) * 55
}

function computeDataDepths(
  dataIds: NodeId[],
  dataParentsMap: Map<NodeId, NodeId[]>,
  dataIdSet: Set<NodeId>
): Map<NodeId, number> {
  const memo = new Map<NodeId, number>()
  const visit = (id: NodeId): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    const parents = (dataParentsMap.get(id) ?? []).filter((parent) => dataIdSet.has(parent))
    const depth = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => visit(parent))) + 1
    memo.set(id, depth)
    return depth
  }
  dataIds.forEach((id) => visit(id))
  return memo
}

function buildExecParentsMap(execChildrenMap: Map<NodeId, NodeId[]>): Map<NodeId, NodeId[]> {
  const parents = new Map<NodeId, NodeId[]>()
  for (const [from, children] of execChildrenMap) {
    for (const child of children) {
      const list = parents.get(child) ?? []
      list.push(from)
      parents.set(child, list)
    }
  }
  return parents
}

function buildDataChildrenMap(dataParentsMap: Map<NodeId, NodeId[]>): Map<NodeId, NodeId[]> {
  const children = new Map<NodeId, NodeId[]>()
  for (const [child, parents] of dataParentsMap) {
    for (const parent of parents) {
      const list = children.get(parent) ?? []
      list.push(child)
      children.set(parent, list)
    }
  }
  return children
}

function hasDataChildWithin(
  nodeId: NodeId,
  dataChildrenMap: Map<NodeId, NodeId[]>,
  candidateSet: Set<NodeId>,
  execNodes: Set<NodeId>
): boolean {
  for (const child of dataChildrenMap.get(nodeId) ?? []) {
    if (execNodes.has(child)) continue
    if (candidateSet.has(child)) return true
  }
  return false
}

function hasEarlierExecConsumer(
  nodeId: NodeId,
  currentConsumerId: NodeId,
  dataChildrenMap: Map<NodeId, NodeId[]>,
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>
): boolean {
  const currentPos = state.positions.get(currentConsumerId)
  if (!currentPos) return false

  for (const child of dataChildrenMap.get(nodeId) ?? []) {
    if (child === currentConsumerId || !execNodes.has(child)) continue
    const childPos = state.positions.get(child)
    if (childPos && (childPos[0] < currentPos[0] || childPos[1] < currentPos[1])) return true
  }
  return false
}

function expandExecGapsForDataChains(
  dataParentsMap: Map<NodeId, NodeId[]>,
  execChildrenMap: Map<NodeId, NodeId[]>,
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>,
  config: LayoutConfig,
  nodeById: Map<NodeId, IRNode>,
  compositeDefById: Map<number, CompositeDefIR>
) {
  // 这些经验值来自真实正样本「主图布局1.gia」：
  // - 数据链通常在消费者下方约 190-230px。
  // - 最后一个数据节点到消费者左侧约 440-470px。
  // - 2/3 个数据节点时，执行节点间距约为 1200/1600px。
  const dataYBelowConsumer = 190
  const dataNodeStepX = 450
  const dataNodeStepY = 175
  const extraExecGapPerAdditionalDataNode = 400
  const extraGapPerAdditionalInput = 260
  const execParentsMap = buildExecParentsMap(execChildrenMap)
  const dataChildrenMap = buildDataChildrenMap(dataParentsMap)

  for (const consumerId of execNodes) {
    const consumerPos = state.positions.get(consumerId)
    if (!consumerPos) continue

    const directDataInputs = (dataParentsMap.get(consumerId) ?? []).filter((id) =>
      state.positions.has(id)
    )
    const ownedDirectDataInputs = directDataInputs.filter(
      (id) => !hasEarlierExecConsumer(id, consumerId, dataChildrenMap, execNodes, state)
    )
    const directDataInputSet = new Set(ownedDirectDataInputs)
    const allDataAncestors = [
      ...collectDataAncestors(consumerId, dataParentsMap, new Set(), execNodes)
    ].filter((id) => state.positions.has(id) && !execNodes.has(id))
    const allDataAncestorSet = new Set(allDataAncestors)

    // Keep long upstream data chains owned by their nearest data consumer instead of letting
    // a later exec node drag the entire chain into its swimlane.
    const dataAncestors = allDataAncestors.filter(
      (id) =>
        !hasEarlierExecConsumer(id, consumerId, dataChildrenMap, execNodes, state) &&
        (directDataInputSet.has(id) ||
          !hasDataChildWithin(id, dataChildrenMap, allDataAncestorSet, execNodes))
    )
    if (dataAncestors.length === 0) continue

    const dataDepths = computeDataDepths(dataAncestors, dataParentsMap, new Set(dataAncestors))
    const maxDepth = Math.max(...dataAncestors.map((id) => dataDepths.get(id) ?? 0), 0)

    const execParents = (execParentsMap.get(consumerId) ?? []).filter((id) =>
      state.positions.has(id)
    )
    const parentX = execParents.length
      ? Math.max(...execParents.map((id) => state.positions.get(id)![0]))
      : consumerPos[0] - config.columnWidth
    let directCompositeHorizontalExtra = 0
    for (const inputId of new Set(ownedDirectDataInputs)) {
      const inputNode = nodeById.get(inputId)
      if (inputNode) {
        directCompositeHorizontalExtra += estimateDataNodeHorizontalExtra(
          inputNode,
          compositeDefById
        )
      }
    }
    const desiredGap =
      config.columnWidth +
      Math.max(0, maxDepth) * extraExecGapPerAdditionalDataNode +
      Math.min(2, Math.max(0, ownedDirectDataInputs.length - 1)) * extraGapPerAdditionalInput +
      directCompositeHorizontalExtra
    const desiredConsumerX = parentX + desiredGap
    const deltaX = Math.ceil(desiredConsumerX - consumerPos[0])

    if (deltaX > 0) {
      shiftExecChainFrom(consumerId, deltaX, execChildrenMap, state)
    }

    const [cx, cy] = state.positions.get(consumerId)!
    const dataAnchorX = cx - directCompositeHorizontalExtra
    const rowCounts = new Map<number, number>()
    for (const id of dataAncestors) {
      const depth = dataDepths.get(id) ?? 0
      const row = rowCounts.get(depth) ?? 0
      rowCounts.set(depth, row + 1)
      const x = dataAnchorX - (maxDepth - depth + 1) * dataNodeStepX
      const y = cy + dataYBelowConsumer + row * dataNodeStepY
      state.positions.set(id, [x, y])
    }
  }
}

function hasDirectDataRelation(
  aId: NodeId,
  bId: NodeId,
  dataParentsMap: Map<NodeId, NodeId[]>,
  dataChildrenMap: Map<NodeId, NodeId[]>
): boolean {
  return (
    (dataParentsMap.get(aId) ?? []).includes(bId) ||
    (dataParentsMap.get(bId) ?? []).includes(aId) ||
    (dataChildrenMap.get(aId) ?? []).includes(bId) ||
    (dataChildrenMap.get(bId) ?? []).includes(aId)
  )
}

function wouldOverlapUnrelatedNode(
  nodeId: NodeId,
  targetX: number,
  targetY: number,
  dataParentsMap: Map<NodeId, NodeId[]>,
  dataChildrenMap: Map<NodeId, NodeId[]>,
  state: ReturnType<typeof createLayoutState>
): boolean {
  const minUnrelatedNodeGapX = 320
  const minUnrelatedNodeGapY = 260

  for (const [otherId, [otherX, otherY]] of state.positions) {
    if (otherId === nodeId) continue
    if (hasDirectDataRelation(nodeId, otherId, dataParentsMap, dataChildrenMap)) continue
    if (Math.abs(otherX - targetX) >= minUnrelatedNodeGapX) continue
    if (Math.abs(otherY - targetY) >= minUnrelatedNodeGapY) continue
    return true
  }

  return false
}

function compactLocalDataChains(
  dataParentsMap: Map<NodeId, NodeId[]>,
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>,
  nodeById: Map<NodeId, IRNode>
) {
  const dataChildrenMap = buildDataChildrenMap(dataParentsMap)
  const compactDataStepX = 420
  const minExecConsumerGapX = 460

  for (const [nodeId, parentIds] of dataParentsMap) {
    if (execNodes.has(nodeId) || parentIds.length === 0) continue

    const pos = state.positions.get(nodeId)
    if (!pos) continue

    const parentPositions = parentIds
      .map((id) => state.positions.get(id))
      .filter((parentPos): parentPos is Position => parentPos !== undefined)
    if (parentPositions.length === 0) continue

    const dataChildren = (dataChildrenMap.get(nodeId) ?? []).filter((id) => !execNodes.has(id))
    const execConsumers = (dataChildrenMap.get(nodeId) ?? []).filter((id) => execNodes.has(id))
    const hasLocalDataChild = dataChildren.length > 0
    const feedsLocalVariableStore = execConsumers.some(
      (consumerId) => nodeById.get(consumerId)?.type === 'set_local_variable'
    )

    // Only compact true local calculation chains.  Data leaves that merely feed an exec
    // node's ordinary parameter stack should remain anchored near that exec consumer.
    if (!hasLocalDataChild && !feedsLocalVariableStore) continue

    const parentMaxX = Math.max(...parentPositions.map(([x]) => x))
    let targetX = parentMaxX + compactDataStepX

    for (const consumerId of execConsumers) {
      const consumerPos = state.positions.get(consumerId)
      if (!consumerPos) continue
      targetX = Math.min(targetX, consumerPos[0] - minExecConsumerGapX)
    }

    const newX = Math.min(pos[0], targetX)
    const overlapsUnrelatedNode = wouldOverlapUnrelatedNode(
      nodeId,
      newX,
      pos[1],
      dataParentsMap,
      dataChildrenMap,
      state
    )
    if (newX < pos[0] && !overlapsUnrelatedNode) {
      state.positions.set(nodeId, [newX, pos[1]])
    }
  }
}

function avoidExecLanesNearDataBlocks(
  dataParentsMap: Map<NodeId, NodeId[]>,
  execChildrenMap: Map<NodeId, NodeId[]>,
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>
) {
  const minExecDataLaneGapX = 700
  const minExecDataLaneGapY = 360
  const maxShiftPerPass = 760

  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    const execIds = [...execNodes].sort((a, b) => {
      const pa = state.positions.get(a)
      const pb = state.positions.get(b)
      if (!pa || !pb) return a - b
      return pa[1] - pb[1] || pa[0] - pb[0] || a - b
    })
    const dataIds = [...state.positions.keys()].filter((id) => !execNodes.has(id))

    for (const execId of execIds) {
      const execPos = state.positions.get(execId)
      if (!execPos) continue

      let requiredY = execPos[1]
      for (const dataId of dataIds) {
        const dataPos = state.positions.get(dataId)
        if (!dataPos) continue
        if (Math.abs(dataPos[0] - execPos[0]) >= minExecDataLaneGapX) continue
        if (execPos[1] <= dataPos[1]) continue
        if (execPos[1] - dataPos[1] >= minExecDataLaneGapY) continue

        requiredY = Math.max(requiredY, dataPos[1] + minExecDataLaneGapY)
      }

      const deltaY = Math.min(maxShiftPerPass, Math.ceil(requiredY - execPos[1]))
      if (deltaY <= 0) continue

      shiftExecChainYFrom(execId, deltaY, execChildrenMap, state)
      changed = true
    }

    if (!changed) break
  }
}

function resolveDataBackflowAndOverlap(
  dataParentsMap: Map<NodeId, NodeId[]>,
  execChildrenMap: Map<NodeId, NodeId[]>,
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>
) {
  const dataChildrenMap = buildDataChildrenMap(dataParentsMap)
  const minDataEdgeGapX = 380
  const minDataNodeGapX = 360
  const minDataNodeGapY = 190

  for (let pass = 0; pass < 8; pass++) {
    let changed = false

    for (const [consumerId, parentIds] of dataParentsMap) {
      const consumerPos = state.positions.get(consumerId)
      if (!consumerPos) continue

      for (const parentId of parentIds) {
        const parentPos = state.positions.get(parentId)
        if (!parentPos) continue

        const requiredGap = execNodes.has(consumerId) ? 80 : minDataEdgeGapX
        const minConsumerX = parentPos[0] + requiredGap
        const deltaX = Math.ceil(minConsumerX - consumerPos[0])
        if (deltaX <= 0) continue

        if (execNodes.has(consumerId)) {
          shiftExecChainFrom(consumerId, deltaX, execChildrenMap, state)
        } else {
          shiftDataChainFrom(consumerId, deltaX, dataChildrenMap, execNodes, state)
        }
        changed = true
      }
    }

    const dataIds = [...state.positions.keys()]
      .filter((id) => !execNodes.has(id))
      .sort((a, b) => {
        const pa = state.positions.get(a)!
        const pb = state.positions.get(b)!
        return pa[0] - pb[0] || pa[1] - pb[1] || a - b
      })

    for (let i = 0; i < dataIds.length; i++) {
      const aId = dataIds[i]
      const aPos = state.positions.get(aId)
      if (!aPos) continue

      for (let j = i + 1; j < dataIds.length; j++) {
        const bId = dataIds[j]
        const bPos = state.positions.get(bId)
        if (!bPos) continue
        if (bPos[0] - aPos[0] >= minDataNodeGapX) break
        if (Math.abs(bPos[1] - aPos[1]) >= minDataNodeGapY) continue
        const hasLocalDataLink =
          (dataChildrenMap.get(aId) ?? []).includes(bId) ||
          (dataChildrenMap.get(bId) ?? []).includes(aId)
        if (!hasLocalDataLink) continue

        const deltaX = Math.ceil(aPos[0] + minDataNodeGapX - bPos[0])
        shiftDataChainFrom(bId, deltaX, dataChildrenMap, execNodes, state)
        changed = true
      }
    }

    if (!changed) break
  }
}

function placeVirtualConsumers(
  state: ReturnType<typeof createLayoutState>,
  virtualConsumerIds: NodeId[],
  config: LayoutConfig
) {
  if (virtualConsumerIds.length === 0) return

  let maxX = 0
  let minY = 0
  let hasPosition = false
  for (const [nodeId, pos] of state.positions) {
    if (virtualConsumerIds.includes(nodeId)) continue
    maxX = Math.max(maxX, pos[0])
    minY = hasPosition ? Math.min(minY, pos[1]) : pos[1]
    hasPosition = true
  }

  const baseX = maxX + config.columnWidth
  virtualConsumerIds.forEach((nodeId, index) => {
    if (!state.unplacedNodes.has(nodeId)) return
    state.positions.set(nodeId, [baseX, minY + index * 230])
    state.nodeToEventIndex.set(nodeId, 0)
    state.unplacedNodes.delete(nodeId)
  })
}

function scaleExecLaneSpacing(
  execNodes: Set<NodeId>,
  state: ReturnType<typeof createLayoutState>,
  scale: number
) {
  if (scale === 1 || execNodes.size === 0) return

  const execPositions = [...execNodes]
    .map((nodeId) => state.positions.get(nodeId))
    .filter((position): position is Position => position !== undefined)
  if (execPositions.length === 0) return

  const anchorY = Math.min(...execPositions.map(([, y]) => y))
  for (const nodeId of execNodes) {
    const position = state.positions.get(nodeId)
    if (!position) continue
    const scaledY = anchorY + Math.round((position[1] - anchorY) * scale)
    state.positions.set(nodeId, [position[0], scaledY])
  }
}

function placeDetachedGrid(state: ReturnType<typeof createLayoutState>, config: LayoutConfig) {
  if (state.unplacedNodes.size === 0) return

  const count = state.unplacedNodes.size
  const cols = Math.min(count, 50)
  const rows = Math.ceil(count / cols)

  // 放在 exec 流下方，避免覆盖
  let maxY = 0
  for (const pos of state.positions.values()) {
    if (pos[1] > maxY) maxY = pos[1]
  }
  const baseY = maxY + config.eventGap

  let idx = 0
  for (const nodeId of state.unplacedNodes.keys()) {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = col * config.columnWidth
    const y = baseY + row * config.rowHeight

    state.positions.set(nodeId, [x, y])
    idx += 1
  }

  state.unplacedNodes.clear()
}

export function layoutPositions(
  irNodes: IRNode[],
  graphInfo: ReturnType<typeof buildExecutionGraph>,
  compositeDefs: CompositeDefIR[] = [],
  options: LayoutOptions = {}
): Map<NodeId, Position> {
  const config: LayoutConfig = {
    columnWidth: 800,
    rowHeight: 350,
    maxColumns: 8,
    wrapHeight: 350,
    eventGap: 300
  }

  const { execNodes, roots, execChildrenMap, dataConnections } = graphInfo
  const dataConsumersMap = new Map<NodeId, NodeId[]>(graphInfo.dataConsumersMap)
  for (const conn of options.extraDataConnections ?? []) {
    const consumers = dataConsumersMap.get(conn.fromId) ?? []
    if (!consumers.includes(conn.toId)) {
      consumers.push(conn.toId)
      dataConsumersMap.set(conn.fromId, consumers)
    }
  }
  const state = createLayoutState(irNodes)

  const dataParentsMap = new Map<NodeId, NodeId[]>()
  for (const conn of [...dataConnections, ...(options.extraDataConnections ?? [])]) {
    const parents = dataParentsMap.get(conn.toId) ?? []
    parents.push(conn.fromId)
    dataParentsMap.set(conn.toId, parents)
  }

  const nodeById = new Map(irNodes.map((node) => [node.id, node]))
  const compositeDefById = new Map(compositeDefs.map((def) => [def.id, def]))

  // Estimate the vertical footprint of data chains attached to each exec node before placing lanes.
  const dataBlockHeightMap = new Map<NodeId, number>()
  for (const node of irNodes) {
    const directDataInputs = dataParentsMap.get(node.id) ?? []
    const dataAncestorCount = collectDataAncestors(
      node.id,
      dataParentsMap,
      new Set(),
      execNodes
    ).size
    const directInputExtra =
      directDataInputs.length > 0 ? 260 + Math.max(0, directDataInputs.length - 1) * 200 : 0
    const chainExtra = Math.max(0, dataAncestorCount - 1) * 150
    const uniqueDirectDataInputs = new Set(directDataInputs)
    let dataNodeVisualExtra = 0
    for (const inputId of uniqueDirectDataInputs) {
      const inputNode = nodeById.get(inputId)
      if (inputNode) {
        dataNodeVisualExtra += estimateDataNodeVisualExtra(inputNode, compositeDefById)
      }
    }
    dataBlockHeightMap.set(node.id, directInputExtra + chainExtra + dataNodeVisualExtra)
  }

  const dataExtraHeightMemo = new Map<NodeId, number>()
  for (const execNodeId of execNodes) {
    computeSubtreeDataExtraHeight(
      execNodeId,
      dataBlockHeightMap,
      execChildrenMap,
      dataExtraHeightMemo
    )
  }

  let currentBaseY = 0
  roots.forEach((root, eventIndex) => {
    currentBaseY = state.eventMaxYCoord.size
      ? Math.max(...state.eventMaxYCoord.values()) + config.eventGap
      : 0
    layoutExecutionChain(
      root.id,
      0,
      currentBaseY,
      eventIndex,
      0,
      execChildrenMap,
      state,
      config,
      dataBlockHeightMap,
      dataExtraHeightMemo
    )

    // 使用 while 循环，只有当放置了新节点时才继续
    while (placeDataNearConsumers(dataConsumersMap, execNodes, state)) {
      // 继续迭代直到无法放置更多节点
    }
  })

  placeVirtualConsumers(state, options.virtualConsumerIds ?? [], config)

  while (placeDataNearConsumers(dataConsumersMap, execNodes, state)) {
    // 让额外虚拟消费者锚定只输出到图边界的数据节点
  }

  expandExecGapsForDataChains(
    dataParentsMap,
    execChildrenMap,
    execNodes,
    state,
    config,
    nodeById,
    compositeDefById
  )

  compactLocalDataChains(dataParentsMap, execNodes, state, nodeById)

  avoidExecLanesNearDataBlocks(dataParentsMap, execChildrenMap, execNodes, state)

  resolveDataBackflowAndOverlap(dataParentsMap, execChildrenMap, execNodes, state)

  // 剩余游离节点（无消费者或无关联）统一放到左上角网格
  placeDetachedGrid(state, config)

  scaleExecLaneSpacing(execNodes, state, options.execLaneSpacingScale ?? 1)

  // 如有指定位置，则使用指定位置
  for (const node of irNodes) {
    if (node.position) {
      state.positions.set(node.id, node.position)
    }
  }

  return state.positions
}
