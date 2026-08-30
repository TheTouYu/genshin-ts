import type { Argument, ConnectionArgument, IRDocument, NextConnection } from '../../runtime/IR.js'
import type { IRNode } from './types.js'

type NextDetail = Extract<NextConnection, { node_id: number }>

const TIMER_EVENT_NODE = 'when_timer_is_triggered'
const TIMER_NAME_INDEX = 2

const asNextArray = (value?: NextConnection | NextConnection[]): NextConnection[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const getNextNodeId = (next: NextConnection): number =>
  typeof next === 'number' ? next : next.node_id

const getNextSourceIndex = (next: NextConnection): number =>
  typeof next === 'number' ? 0 : (next.source_index ?? 0)

const isConnArg = (arg: Argument | undefined): arg is ConnectionArgument =>
  !!arg && arg.type === 'conn'

const isStrLiteralArg = (arg: Argument | undefined): arg is { type: 'str'; value: string } =>
  !!arg && arg.type === 'str' && typeof arg.value === 'string'

const isTimerNameConn = (arg: Argument | undefined, eventNodeId: number): boolean =>
  isConnArg(arg) &&
  arg.value.node_id === eventNodeId &&
  arg.value.index === TIMER_NAME_INDEX &&
  arg.value.type === 'str'

type DispatchCase = {
  timerName: string
  headNodeId?: number
}

// 有 default 分支（next source_index=0）的 dispatch：default 只保留在首个 chunk，
// 其余 chunk 不带 default；有 default 的 dispatch 不参与多 dispatch 合并（default 语义唯一）。
type DefaultHead = {
  defaultHeadNodeId?: number
}

type DispatchInfo = DefaultHead & {
  eventNodeId: number
  dispatchNodeId: number
  equalNodeId?: number
  cases: DispatchCase[]
}

const MAX_TIMER_DISPATCH_CASES = 10

function parseDoubleBranchDispatch(
  eventNodeId: number,
  dispatch: IRNode,
  nodesById: Map<number, IRNode>
): DispatchInfo | null {
  const condArg = dispatch.args?.[0]
  if (!isConnArg(condArg)) return null
  const condNode = nodesById.get(condArg.value.node_id)
  if (!condNode || condNode.type !== 'equal') return null

  const condArgs = condNode.args ?? []
  if (condArgs.length !== 2) return null

  let timerName: string | null = null
  for (const [a, b] of [
    [condArgs[0], condArgs[1]],
    [condArgs[1], condArgs[0]]
  ]) {
    if (isTimerNameConn(a, eventNodeId) && isStrLiteralArg(b)) {
      timerName = b.value
      break
    }
  }
  if (timerName === null) return null

  const nexts = asNextArray(dispatch.next)
  if (nexts.some((n) => ![0, 1].includes(getNextSourceIndex(n)))) return null
  if (nexts.some((n) => getNextSourceIndex(n) === 1)) return null

  const trueEdges = nexts.filter((n) => getNextSourceIndex(n) === 0)
  if (trueEdges.length > 1) return null
  const headNodeId = trueEdges.length ? getNextNodeId(trueEdges[0]) : undefined

  return {
    eventNodeId,
    dispatchNodeId: dispatch.id,
    equalNodeId: condNode.id,
    cases: [{ timerName, headNodeId }]
  }
}

function parseMultipleBranchesDispatch(eventNodeId: number, dispatch: IRNode): DispatchInfo | null {
  const args = dispatch.args ?? []
  if (!args.length) return null
  if (!isTimerNameConn(args[0], eventNodeId)) return null

  const caseArgs = args.slice(1)
  if (caseArgs.some((arg) => !isStrLiteralArg(arg))) return null
  const caseNames = caseArgs.map((arg) => (arg as { type: 'str'; value: string }).value)
  const uniqueNames = new Set(caseNames)
  if (uniqueNames.size !== caseNames.length) return null

  const nexts = asNextArray(dispatch.next)
  const caseCount = caseNames.length
  const heads = new Map<number, number>()
  let defaultHeadNodeId: number | undefined
  for (const n of nexts) {
    const sourceIndex = getNextSourceIndex(n)
    if (sourceIndex === 0) {
      // default 分支（Multiple Branches 的 OutFlow[0]）：至多一条
      if (defaultHeadNodeId !== undefined) return null
      defaultHeadNodeId = getNextNodeId(n)
      continue
    }
    if (sourceIndex > caseCount) return null
    if (heads.has(sourceIndex)) return null
    heads.set(sourceIndex, getNextNodeId(n))
  }

  const cases: DispatchCase[] = caseNames.map((timerName, idx) => ({
    timerName,
    headNodeId: heads.get(idx + 1)
  }))

  return {
    eventNodeId,
    dispatchNodeId: dispatch.id,
    defaultHeadNodeId,
    cases
  }
}

export function optimizeTimerDispatchAggregate(ir: IRDocument, enabled: boolean): IRDocument {
  if (!enabled) return ir
  if (!ir.nodes || ir.nodes.length === 0) return ir
  if (ir.graph?.type !== 'server') return ir

  const nodes = ir.nodes as IRNode[]
  const nodesById = new Map<number, IRNode>(nodes.map((n) => [n.id, n]))
  const incomingById = new Map<number, number[]>()

  for (const node of nodes) {
    for (const next of asNextArray(node.next)) {
      const targetId = getNextNodeId(next)
      const list = incomingById.get(targetId) ?? []
      list.push(node.id)
      incomingById.set(targetId, list)
    }
  }

  let infos: DispatchInfo[] = []
  for (const node of nodes) {
    if (node.type !== TIMER_EVENT_NODE) continue
    const nexts = asNextArray(node.next)
    if (nexts.length !== 1) continue
    const next = nexts[0]
    if (getNextSourceIndex(next) !== 0) continue
    const dispatchId = getNextNodeId(next)
    const dispatchNode = nodesById.get(dispatchId)
    if (!dispatchNode) continue
    const incoming = incomingById.get(dispatchId) ?? []
    if (incoming.length !== 1 || incoming[0] !== node.id) continue

    let info: DispatchInfo | null = null
    if (dispatchNode.type === 'double_branch') {
      info = parseDoubleBranchDispatch(node.id, dispatchNode, nodesById)
    } else if (dispatchNode.type === 'multiple_branches') {
      info = parseMultipleBranchesDispatch(node.id, dispatchNode)
    }
    if (info) infos.push(info)
  }

  if (!infos.length) return ir

  const maxCases = MAX_TIMER_DISPATCH_CASES
  let maxId = Math.max(...nodes.map((n) => n.id))

  const newNodes: IRNode[] = []
  const normalizedInfos: DispatchInfo[] = []

  const buildDispatch = (
    dispatchId: number,
    eventNodeId: number,
    cases: DispatchCase[],
    defaultHeadNodeId?: number
  ): IRNode => {
    const controlArg: ConnectionArgument = {
      type: 'conn',
      value: { node_id: eventNodeId, index: TIMER_NAME_INDEX, type: 'str' }
    }
    const caseArgs: Argument[] = cases.map((c) => ({ type: 'str', value: c.timerName }))
    const next: NextDetail[] = []
    if (defaultHeadNodeId !== undefined) {
      next.push({ node_id: defaultHeadNodeId, source_index: 0 })
    }
    cases.forEach((c, idx) => {
      if (c.headNodeId === undefined) return
      next.push({ node_id: c.headNodeId, source_index: idx + 1 })
    })

    const node: IRNode = {
      id: dispatchId,
      type: 'multiple_branches',
      args: [controlArg, ...caseArgs]
    }
    if (next.length) node.next = next
    return node
  }

  for (const info of infos) {
    if (info.cases.length <= maxCases) {
      normalizedInfos.push(info)
      continue
    }

    const baseEvent = nodesById.get(info.eventNodeId)
    const baseDispatch = nodesById.get(info.dispatchNodeId)
    if (!baseEvent || !baseDispatch) {
      normalizedInfos.push(info)
      continue
    }

    const chunks: DispatchCase[][] = []
    for (let i = 0; i < info.cases.length; i += maxCases) {
      chunks.push(info.cases.slice(i, i + maxCases))
    }
    if (chunks.length <= 1) {
      normalizedInfos.push(info)
      continue
    }

    const first = chunks[0] ?? []
    if (first.length) {
      const updated = buildDispatch(
        info.dispatchNodeId,
        info.eventNodeId,
        first,
        info.defaultHeadNodeId
      )
      baseDispatch.type = updated.type
      baseDispatch.args = updated.args
      if (updated.next) baseDispatch.next = updated.next
      else delete baseDispatch.next
      normalizedInfos.push({ ...info, cases: first, equalNodeId: undefined })
    }

    for (const chunk of chunks.slice(1)) {
      if (!chunk.length) continue
      const newEventId = (maxId += 1)
      const newDispatchId = (maxId += 1)

      const newEvent: IRNode = { ...baseEvent, id: newEventId, next: [newDispatchId] }
      const newDispatch = buildDispatch(newDispatchId, newEventId, chunk)

      newNodes.push(newEvent, newDispatch)
      nodesById.set(newEventId, newEvent)
      nodesById.set(newDispatchId, newDispatch)
      normalizedInfos.push({
        eventNodeId: newEventId,
        dispatchNodeId: newDispatchId,
        cases: chunk
      })
    }
  }

  if (newNodes.length) {
    nodes.push(...newNodes)
  }
  infos = normalizedInfos

  if (infos.length < 2) return ir

  const caseCounts = new Map<string, number>()
  infos.forEach((info) => {
    info.cases.forEach((c) => {
      caseCounts.set(c.timerName, (caseCounts.get(c.timerName) ?? 0) + 1)
    })
  })

  const eligible = infos.filter(
    (info) =>
      info.defaultHeadNodeId === undefined &&
      info.cases.every((c) => (caseCounts.get(c.timerName) ?? 0) === 1)
  )
  if (eligible.length < 2) return ir

  const ordered = [...eligible].sort((a, b) => a.eventNodeId - b.eventNodeId)

  const groups: DispatchInfo[][] = []
  let buf: DispatchInfo[] = []
  let bufCases = 0

  ordered.forEach((info) => {
    if (info.cases.length > maxCases) {
      if (buf.length) {
        groups.push(buf)
        buf = []
        bufCases = 0
      }
      groups.push([info])
      return
    }
    if (buf.length && bufCases + info.cases.length > maxCases) {
      groups.push(buf)
      buf = []
      bufCases = 0
    }
    buf.push(info)
    bufCases += info.cases.length
  })
  if (buf.length) groups.push(buf)

  const mergeGroups = groups.filter((g) => g.length >= 2)
  if (!mergeGroups.length) return ir

  const replaceMap = new Map<number, number>()
  const removeIds = new Set<number>()
  const newDispatches: IRNode[] = []

  mergeGroups.forEach((group) => {
    const baseEventId = group[0]?.eventNodeId
    if (!baseEventId) return

    const aggCases: DispatchCase[] = []
    group.forEach((info) => aggCases.push(...info.cases))
    if (!aggCases.length) return

    const newDispatchId = (maxId += 1)
    const controlArg: ConnectionArgument = {
      type: 'conn',
      value: { node_id: baseEventId, index: TIMER_NAME_INDEX, type: 'str' }
    }
    const caseArgs: Argument[] = aggCases.map((c) => ({ type: 'str', value: c.timerName }))

    const next: NextDetail[] = []
    aggCases.forEach((c, idx) => {
      if (c.headNodeId === undefined) return
      next.push({ node_id: c.headNodeId, source_index: idx + 1 })
    })

    const newDispatch: IRNode = {
      id: newDispatchId,
      type: 'multiple_branches',
      args: [controlArg, ...caseArgs]
    }
    if (next.length) newDispatch.next = next
    newDispatches.push(newDispatch)

    const baseEvent = nodesById.get(baseEventId)
    if (baseEvent) {
      baseEvent.next = [newDispatchId]
    }

    group.slice(1).forEach((info) => replaceMap.set(info.eventNodeId, baseEventId))

    group.forEach((info) => {
      removeIds.add(info.dispatchNodeId)
      if (info.eventNodeId !== baseEventId) {
        removeIds.add(info.eventNodeId)
      }
      if (info.equalNodeId !== undefined) {
        removeIds.add(info.equalNodeId)
      }
    })
  })

  if (replaceMap.size) {
    nodes.forEach((node) => {
      const args = node.args ?? []
      for (const arg of args) {
        if (!isConnArg(arg)) continue
        const target = replaceMap.get(arg.value.node_id)
        if (target !== undefined) {
          arg.value.node_id = target
        }
      }
    })
  }

  const filtered = nodes.filter((n) => !removeIds.has(n.id))
  filtered.push(...newDispatches)
  ir.nodes = filtered

  return ir
}
