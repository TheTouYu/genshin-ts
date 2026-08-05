// @ts-nocheck
/**
 * GIL 控制流导航：只显示执行入口、执行边、路径和复合接口。
 * 数据参数请交给 trace-gil-dataflow.ts 定点追踪。
 */

import { buildReport, loadDocument } from './parse-gil-node-graph.js'

const COMPOSITE_KIND = 'SysGraph'

function usage(exitCode = 0) {
  const text = [
    '用法: npx tsx tools/trace-gil-exec-flow.ts <map.gil> [选项]',
    '',
    '选项:',
    '  --graph <id|name|auto>   选择主图；auto 选择唯一非空用户图',
    '  --auto                   等价于 --graph auto',
    '  --composite <id|name>   把指定复合图作为独立主图解析',
    '  --json                  输出控制流 JSON',
    '  -h, --help              显示帮助',
    '',
    '本工具不输出全图数据流或节点参数。参数来源请使用 trace-gil-dataflow.ts。'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

function parseArgs(args) {
  if (args.includes('-h') || args.includes('--help')) usage(0)
  const filePath = args[0]
  if (!filePath || filePath.startsWith('-')) usage(1)

  const options = {
    graph: undefined,
    composite: undefined,
    auto: false,
    json: false
  }

  const valueAfter = (index, flag) => {
    const value = args[index + 1]
    if (!value || value.startsWith('-')) throw new Error(`${flag} 需要一个值`)
    return value
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--graph') {
      const value = valueAfter(i++, arg)
      if (value === 'auto') options.auto = true
      else options.graph = value
    } else if (arg.startsWith('--graph=')) {
      const value = arg.slice('--graph='.length)
      if (value === 'auto') options.auto = true
      else options.graph = value
    } else if (arg === '--auto') {
      options.auto = true
    } else if (arg === '--composite') {
      options.composite = valueAfter(i++, arg)
    } else if (arg.startsWith('--composite=')) {
      options.composite = arg.slice('--composite='.length)
    } else if (arg === '--json') {
      options.json = true
    } else {
      usage(1)
    }
  }

  if (options.graph && options.composite) throw new Error('--graph 与 --composite 不能同时使用')
  if (options.auto && options.graph) throw new Error('--auto 与 --graph <id|name> 不能同时使用')
  if (options.auto && options.composite) throw new Error('--auto 不能与 --composite 同时使用')
  return { filePath, options }
}

function nodeMapOf(graph) {
  return new Map((graph.nodes ?? []).map((node) => [node.index, node]))
}

function groupEdges(graph) {
  const incoming = new Map()
  const outgoing = new Map()
  for (const edge of graph.flow ?? []) {
    if (!incoming.has(edge.to.node)) incoming.set(edge.to.node, [])
    incoming.get(edge.to.node).push(edge)
    if (!outgoing.has(edge.from.node)) outgoing.set(edge.from.node, [])
    outgoing.get(edge.from.node).push(edge)
  }
  return { incoming, outgoing }
}

function hasPin(node, kind) {
  return (node.pins ?? []).some((pin) => pin.kind === kind)
}

function boundaryFlowInput(graph, nodeIndex) {
  return (graph.boundary ?? []).find(
    (boundary) => boundary.inner_node === nodeIndex && boundary.inner?.kind === 1
  )
}

function boundaryFlowOutputs(graph, nodeIndex) {
  return (graph.boundary ?? []).filter(
    (boundary) => boundary.inner_node === nodeIndex && boundary.inner?.kind === 2
  )
}

function nodeRef(node) {
  if (!node) return { index: null, api: '(不存在)' }
  return {
    index: node.index,
    api: node.api,
    generic_id: node.generic_id,
    kind: node.kind
  }
}

function compositeInterface(node) {
  if (!node?.composite) return undefined
  return {
    node: node.index,
    api: node.api,
    definition_id: node.composite.definition_id,
    name: node.composite.name,
    graph_id: node.composite.graph_id,
    interface: node.composite.interface
  }
}

function isEventNode(node) {
  return [71, 72, 83, 385].includes(node.generic_id) || /^When\b/.test(node.api ?? '')
}

function buildNodeSummaries(graph, incoming, outgoing) {
  return (graph.nodes ?? []).map((node) => {
    const incomingEdges = incoming.get(node.index) ?? []
    const outgoingEdges = outgoing.get(node.index) ?? []
    const compositeEntry = boundaryFlowInput(graph, node.index)
    const hasInflow =
      hasPin(node, 'InFlow') ||
      Boolean(node.composite?.interface?.inflows?.length) ||
      Boolean(compositeEntry)
    const eventLike =
      isEventNode(node) ||
      (node.kind === COMPOSITE_KIND && !node.composite?.interface?.inflows?.length)
    const eventEntry = eventLike && incomingEdges.length === 0 && !hasInflow
    const entryType = compositeEntry ? 'composite-inflow' : eventEntry ? 'event' : undefined
    return {
      ...nodeRef(node),
      has_inflow: hasInflow,
      branch_count: (node.pins ?? []).filter((pin) => pin.kind === 'OutFlow').length,
      incoming_count: incomingEdges.length,
      outgoing_count: outgoingEdges.length,
      event_entry: eventEntry,
      entry_type: entryType,
      entry_boundary: compositeEntry
        ? {
            outer: compositeEntry.outer,
            name: compositeEntry.outer_name
          }
        : undefined
    }
  })
}

function edgeView(edge, nodes) {
  return {
    from: {
      ...nodeRef(nodes.get(edge.from.node)),
      pin: edge.from.pin,
      pin_name: edge.from.pin_name
    },
    to: {
      ...nodeRef(nodes.get(edge.to.node)),
      pin: edge.to.pin,
      pin_name: edge.to.pin_name
    }
  }
}

function buildPath(edge, graph, nodes, outgoing, pathVisited, seen) {
  const target = nodes.get(edge.to.node)
  const cycle = pathVisited.has(edge.to.node)
  const merged = !cycle && seen.has(edge.to.node)
  if (!cycle) seen.add(edge.to.node)
  const nextVisited = new Set(pathVisited)
  if (!cycle) nextVisited.add(edge.to.node)

  const result = {
    via: {
      from: edge.from.node,
      branch: edge.from.pin_name,
      to_flow: edge.to.pin_name
    },
    node: nodeRef(target),
    boundary_outputs: boundaryFlowOutputs(graph, edge.to.node).map((boundary) => ({
      name: boundary.outer_name,
      index: boundary.outer?.index
    })),
    cycle,
    merged,
    children: []
  }
  if (cycle || merged) return result

  for (const next of outgoing.get(edge.to.node) ?? []) {
    result.children.push(buildPath(next, graph, nodes, outgoing, nextVisited, seen))
  }
  return result
}

function buildControlReport(report) {
  const graph = report.graph
  const nodes = nodeMapOf(graph)
  const { incoming, outgoing } = groupEdges(graph)
  const nodeSummaries = buildNodeSummaries(graph, incoming, outgoing)
  const entries = nodeSummaries.filter((node) => node.entry_type)
  const paths = entries.map((entry) => ({
    entry: {
      ...nodeRef(nodes.get(entry.index)),
      entry_type: entry.entry_type,
      boundary: entry.entry_boundary
    },
    branches: (() => {
      const seen = new Set([entry.index])
      return (outgoing.get(entry.index) ?? []).map((edge) =>
        buildPath(edge, graph, nodes, outgoing, new Set([entry.index]), seen)
      )
    })()
  }))

  return {
    input: report.input,
    target: {
      ...report.target,
      node_count: graph.node_count,
      execution_edge_count: graph.flow.length
    },
    event_entries: entries,
    nodes: nodeSummaries,
    execution_edges: graph.flow.map((edge) => edgeView(edge, nodes)),
    paths,
    composite_interfaces: (graph.nodes ?? []).map(compositeInterface).filter(Boolean)
  }
}

function renderPath(path, prefix, isLast) {
  const connector = isLast ? '└─ ' : '├─ '
  const childPrefix = prefix + (isLast ? '   ' : '│  ')
  const via = `${path.via.branch ?? 'Branch'} -> `
  const flow = path.via.to_flow ? ` (${path.via.to_flow})` : ''
  const boundaryExit =
    (path.boundary_outputs ?? []).length > 0
      ? `  [复合出口: ${path.boundary_outputs.map((item) => item.name ?? `OutFlow[${item.index}]`).join(', ')}]`
      : ''
  const suffix = path.cycle
    ? '  [循环]'
    : path.merged
      ? '  [已汇合]'
      : `${path.children.length === 0 ? '  [终点]' : ''}${boundaryExit}`
  console.log(
    `${prefix}${connector}${via}n=${path.node.index} ${path.node.api ?? '(不存在)'}${flow}${suffix}`
  )
  if (path.cycle || path.merged) return
  for (let i = 0; i < path.children.length; i++) {
    renderPath(path.children[i], childPrefix, i === path.children.length - 1)
  }
}

function printHuman(report, result) {
  const graph = report.graph
  console.log(`文件: ${report.input.path}`)
  console.log(`SHA-256: ${report.input.sha256}`)
  console.log(`图: ${report.target.name} (id=${report.target.id ?? report.target.graph_id ?? '?'})`)
  console.log(
    `统计: nodes=${graph.node_count} entries=${result.event_entries.length} execution_edges=${result.execution_edges.length}`
  )

  if (result.event_entries.length === 0) {
    console.log('\n入口: 0 个（未识别到具有执行出口的独立入口）')
  } else {
    console.log(`\n入口: ${result.event_entries.length} 个`)
    for (const entry of result.event_entries) {
      const prefix =
        entry.entry_type === 'composite-inflow'
          ? `外部入口 ${entry.entry_boundary?.name ?? 'InFlow'} -> `
          : ''
      console.log(`  ${prefix}n=${entry.index} ${entry.api}  branches=${entry.branch_count}`)
    }
  }

  console.log('\n控制流:')
  let renderedPath = false
  for (const path of result.paths) {
    const entryPrefix =
      path.entry.entry_type === 'composite-inflow'
        ? `外部入口 ${path.entry.boundary?.name ?? 'InFlow'} -> `
        : ''
    console.log(`  ${entryPrefix}${path.entry.api} (n=${path.entry.index})`)
    if (path.branches.length === 0) {
      console.log('    -> (无下游)')
      continue
    }
    renderedPath = true
    for (let i = 0; i < path.branches.length; i++) {
      renderPath(path.branches[i], '    ', i === path.branches.length - 1)
    }
  }
  if (!renderedPath && result.event_entries.length > 0) {
    console.log('  入口均无已连接的执行下游')
  }

  const disconnected = result.nodes.filter(
    (node) => node.incoming_count === 0 && node.outgoing_count === 0 && !node.entry_type
  )
  if (disconnected.length > 0) {
    const groups = new Map()
    for (const node of disconnected) {
      if (!groups.has(node.api)) groups.set(node.api, [])
      groups.get(node.api).push(node.index)
    }
    console.log(`\n未接入执行流的节点: ${disconnected.length} 个`)
    for (const [api, indexes] of groups) {
      console.log(`  ${api}: ${indexes.map((index) => `n=${index}`).join(', ')}`)
    }
  }

  if (result.composite_interfaces.length > 0) {
    console.log('\n复合节点接口:')
    for (const item of result.composite_interfaces) {
      const inputs = (item.interface?.inputs ?? [])
        .map((pin) => `${pin.name}:${pin.type ?? '?'}`)
        .join(', ')
      const outputs = (item.interface?.outputs ?? [])
        .map((pin) => `${pin.name}:${pin.type ?? '?'}`)
        .join(', ')
      const inflows = (item.interface?.inflows ?? []).map((pin) => pin.name).join(', ')
      const outflows = (item.interface?.outflows ?? []).map((pin) => pin.name).join(', ')
      console.log(
        `  n=${item.node} ${item.name} (graph=${item.graph_id ?? '无'}) ` +
          `inputs=[${inputs}] outputs=[${outputs}] ` +
          `inflows=[${inflows}] outflows=[${outflows}]`
      )
    }
  }
}

function main() {
  const { filePath, options } = parseArgs(process.argv.slice(2))
  const doc = loadDocument(filePath)
  const report = buildReport(doc, {
    ...options,
    depth: 0,
    maxItems: 16
  })
  if (!report.graph) throw new Error(`目标图没有可解析的实现: ${report.target.name}`)
  const result = buildControlReport(report)
  if (options.json) console.log(JSON.stringify(result, null, 2))
  else printHuman(report, result)
}

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0)
  throw error
})

try {
  main()
} catch (error) {
  console.error(`解析失败: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
