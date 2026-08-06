// @ts-nocheck
/**
 * GIL 数据流定点追踪：从指定节点的 InParam 反向追踪来源。
 * 不输出整张图的控制流或无关数据边。
 */

import { buildReport, loadDocument } from './parse-gil-node-graph.js'

const DEFAULT_MAX_DEPTH = 8
const DEFAULT_MAX_ITEMS = 16
const COMPOSITE_KIND = 'SysGraph'

function usage(exitCode = 0) {
  const text = [
    '用法: npx tsx tools/trace-gil-dataflow.ts <map.gil> --node <index|name> [选项]',
    '',
    '选项:',
    '  --graph <id|name|auto>   选择主图；auto 选择唯一非空用户图',
    '  --auto                   等价于 --graph auto',
    '  --composite <id|name>   在指定复合图内部选择目标节点',
    '  --node <index|name>     目标节点，必须明确指定',
    '  --input <index|name>    只追踪一个 InParam',
    '  --all-inputs            追踪目标节点的全部声明输入',
    `  --max-depth <n>         最大来源追踪深度（默认 ${DEFAULT_MAX_DEPTH}，0=无限制）`,
    '  --json                  输出数据流 JSON',
    '  -h, --help              显示帮助',
    '',
    '本工具只输出目标参数及其依赖路径。控制流导航请使用 trace-gil-exec-flow.ts。'
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
    node: undefined,
    input: undefined,
    allInputs: false,
    maxDepth: DEFAULT_MAX_DEPTH,
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
    } else if (arg === '--node') {
      options.node = valueAfter(i++, arg)
    } else if (arg.startsWith('--node=')) {
      options.node = arg.slice('--node='.length)
    } else if (arg === '--input') {
      options.input = valueAfter(i++, arg)
    } else if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length)
    } else if (arg === '--all-inputs') {
      options.allInputs = true
    } else if (arg === '--max-depth') {
      options.maxDepth = Number(valueAfter(i++, arg))
    } else if (arg.startsWith('--max-depth=')) {
      options.maxDepth = Number(arg.slice('--max-depth='.length))
    } else if (arg === '--json') {
      options.json = true
    } else {
      usage(1)
    }
  }

  if (options.graph && options.composite) throw new Error('--graph 与 --composite 不能同时使用')
  if (options.auto && options.graph) throw new Error('--auto 与 --graph <id|name> 不能同时使用')
  if (options.auto && options.composite) throw new Error('--auto 不能与 --composite 同时使用')
  if (!options.node) throw new Error('缺少 --node <index|name>')
  if (options.input !== undefined && options.allInputs) {
    throw new Error('--input 与 --all-inputs 不能同时使用')
  }
  if (options.input === undefined && !options.allInputs) {
    throw new Error('请指定 --input <index|name> 或 --all-inputs')
  }
  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0) {
    throw new Error('--max-depth 必须是非负整数')
  }
  if (options.maxDepth === 0) options.maxDepth = Infinity
  return { filePath, options }
}

function nodeMapOf(graph) {
  return new Map((graph.nodes ?? []).map((node) => [node.index, node]))
}

function inputLabel(input) {
  const range = input.folded_count ? `-${input.index_end}` : ''
  return `InParam[${input.index}${range}] ${input.name ?? 'InParam'}: ${input.type ?? '?'}`
}

function valueText(value) {
  if (value === undefined) return '未设置'
  if (typeof value === 'string') return JSON.stringify(value)
  return JSON.stringify(value)
}

function nodeMatch(node, spec) {
  const query = String(spec).toLowerCase()
  const api = String(node.api ?? '').toLowerCase()
  const stripped = api.replace(/^复合:/, '')
  return api === query || stripped === query
}

function findTargetNode(graph, spec) {
  const nodes = nodeMapOf(graph)
  if (/^\d+$/.test(String(spec))) {
    const node = nodes.get(Number(spec))
    if (!node) throw new Error(`图 ${graph.name} 中未找到节点 n=${spec}`)
    return node
  }
  const matches = [...nodes.values()].filter((node) => nodeMatch(node, spec))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new Error(
      `节点名称匹配多个，请改用 --node <index>：${matches
        .map((node) => `n=${node.index} ${node.api}`)
        .join(', ')}`
    )
  }
  throw new Error(`图 ${graph.name} 中未找到节点: ${spec}`)
}

function findTargetInputs(node, options) {
  if (options.allInputs) return [...(node.inputs ?? [])]
  const spec = String(options.input)
  if (/^\d+$/.test(spec)) {
    const input = (node.inputs ?? []).find((item) => item.index === Number(spec))
    if (!input) throw new Error(`节点 n=${node.index} 中未找到 InParam[${spec}]`)
    return [input]
  }
  const matches = (node.inputs ?? []).filter(
    (item) => String(item.name ?? '').toLowerCase() === spec.toLowerCase()
  )
  if (matches.length === 1) return matches
  if (matches.length > 1) {
    throw new Error(
      `参数名称匹配多个，请改用 --input <index>：${matches
        .map((item) => `${item.index}:${item.name}`)
        .join(', ')}`
    )
  }
  throw new Error(`节点 n=${node.index} 中未找到输入参数: ${spec}`)
}

function graphKey(graph) {
  return `${graph.scope ?? 'graph'}:${graph.id ?? graph.name ?? '?'}`
}

function boundaryForInput(graph, nodeIndex, inputIndex) {
  return (graph.boundary ?? []).find(
    (boundary) =>
      boundary.inner_node === nodeIndex &&
      boundary.inner?.kind === 3 &&
      boundary.inner?.index === inputIndex
  )
}

function boundaryForOutput(graph, outputIndex) {
  return (graph.boundary ?? []).find(
    (boundary) => boundary.outer?.kind === 4 && boundary.outer?.index === outputIndex
  )
}

function terminalInfo(node) {
  const nid = node.generic_id
  const known = new Map([
    [71, '事件上下文'],
    [72, '事件上下文'],
    [83, '事件上下文'],
    [385, '事件上下文'],
    [73, '获取自身实体'],
    [337, '读取图变量'],
    [50, '读取自定义变量'],
    [310, '游戏当前时间'],
    [75, '查询实体']
  ])
  if (known.has(nid)) return { terminal: true, note: known.get(nid) }
  if (node.kind === COMPOSITE_KIND) return { terminal: false, note: null }
  const hasConnectedInput = (node.inputs ?? []).some((input) => input.sources?.length > 0)
  if (!hasConnectedInput) return { terminal: true, note: '无上游数据依赖' }
  return { terminal: false, note: null }
}

function terminalDetails(node) {
  const details = (node.inputs ?? [])
    .filter((input) => input.present && !input.sources?.length && input.value !== undefined)
    .map((input) => ({
      index: input.index,
      name: input.name,
      type: input.type,
      value: input.value
    }))
  const result = []
  for (let i = 0; i < details.length; ) {
    let end = i + 1
    while (
      end < details.length &&
      details[end].name === details[i].name &&
      details[end].type === details[i].type &&
      JSON.stringify(details[end].value) === JSON.stringify(details[i].value) &&
      details[end].index === details[end - 1].index + 1
    ) {
      end++
    }
    if (end - i >= 5) {
      result.push({
        ...details[i],
        index_end: details[end - 1].index,
        folded_count: end - i
      })
    } else {
      result.push(...details.slice(i, end))
    }
    i = end
  }
  return result
}

function compositeReportFor(doc, sourceNode, cache) {
  if (sourceNode.kind !== COMPOSITE_KIND || !sourceNode.composite?.definition_id) return null
  const definitionId = sourceNode.composite.definition_id
  if (cache.has(definitionId)) return cache.get(definitionId)
  try {
    const report = buildReport(doc, {
      composite: String(definitionId),
      auto: false,
      graph: undefined,
      depth: 0,
      maxItems: DEFAULT_MAX_ITEMS
    })
    const graph = report.graph ?? null
    cache.set(definitionId, graph)
    return graph
  } catch {
    cache.set(definitionId, null)
    return null
  }
}

function traceNodeInputs(doc, cache, model, node, depth, maxDepth, callContext, stack) {
  const branches = (node.inputs ?? []).map((input) =>
    traceInput(doc, cache, model, node, input, depth, maxDepth, callContext, stack)
  )
  return collapseLiteralBranches(branches)
}

function traceInput(doc, cache, model, node, input, depth, maxDepth, callContext, stack) {
  const base = {
    index: input.index,
    name: input.name,
    type: input.type ?? '?'
  }
  const key = `${graphKey(model)}:${node.index}:${input.index}`
  if (stack.has(key)) return { ...base, source_type: 'cycle', cycle: true }
  const nextStack = new Set(stack)
  nextStack.add(key)

  const boundary = boundaryForInput(model, node.index, input.index)
  if (boundary && boundary.outer?.kind === 3) {
    const parent = callContext?.parentModel
    const parentNode = callContext?.parentNode
    const outerIndex = boundary.outer.index
    const parentInput = parentNode
      ? parentNode.inputs?.find((candidate) => candidate.index === outerIndex)
      : undefined
    const parentDependency =
      parent && parentNode && parentInput
        ? traceInput(
            doc,
            cache,
            parent,
            parentNode,
            parentInput,
            depth,
            maxDepth,
            callContext.parentCallContext,
            nextStack
          )
        : null
    return {
      ...base,
      source_type: 'parent_input',
      parent: {
        graph: parent?.name,
        node: parentNode?.index,
        composite: parentNode?.api,
        index: outerIndex,
        name: boundary.outer_name ?? `InParam[${outerIndex}]`
      },
      dependencies: parentDependency ? [parentDependency] : []
    }
  }

  if (!input.present || !input.sources?.length) {
    if (input.value !== undefined) {
      return { ...base, source_type: 'literal', value: input.value }
    }
    return { ...base, source_type: 'unconnected' }
  }

  return {
    ...base,
    source_type: 'node',
    sources: input.sources.map((source) =>
      traceSource(doc, cache, model, source, depth, maxDepth, callContext, nextStack)
    )
  }
}

function traceSource(doc, cache, model, source, depth, maxDepth, callContext, stack) {
  const sourceNode = nodeMapOf(model).get(source.node)
  const sourceInfo = {
    node: source.node,
    api: source.api ?? sourceNode?.api ?? '(不存在)',
    out_index: source.pin?.index ?? null,
    out_name: source.pin_name ?? null
  }
  if (!sourceNode) return { ...sourceInfo, note: '源节点不存在', terminal: true }

  const terminal = terminalInfo(sourceNode)
  const result = {
    ...sourceInfo,
    terminal: terminal.terminal,
    note: terminal.note ?? undefined
  }
  const details = terminalDetails(sourceNode)
  if (details.length > 0) result.details = details
  if (terminal.terminal || depth >= maxDepth) {
    if (!terminal.terminal && depth >= maxDepth) result.truncated = true
    return result
  }

  if (sourceNode.kind === COMPOSITE_KIND) {
    const impl = compositeReportFor(doc, sourceNode, cache)
    if (!impl) {
      result.note = '复合图没有可解析的实现'
      return result
    }
    const outputBoundary = boundaryForOutput(impl, source.pin?.index ?? 0)
    if (!outputBoundary) {
      result.note = '该复合输出没有内部边界映射'
      return result
    }
    const innerNode = nodeMapOf(impl).get(outputBoundary.inner_node)
    if (!innerNode) {
      result.note = '复合输出映射的内部节点不存在'
      return result
    }
    const nextContext = {
      parentModel: model,
      parentNode: sourceNode,
      parentCallContext: callContext
    }
    result.cross_graph = {
      graph: impl.name || sourceNode.composite.name,
      graph_id: impl.id,
      inner_node: innerNode.index,
      inner_api: innerNode.api,
      inner_output: outputBoundary.inner,
      inner_output_name: outputBoundary.inner_name,
      dependencies: traceNodeInputs(
        doc,
        cache,
        impl,
        innerNode,
        depth + 1,
        maxDepth,
        nextContext,
        stack
      )
    }
    return result
  }

  result.dependencies = traceNodeInputs(
    doc,
    cache,
    model,
    sourceNode,
    depth + 1,
    maxDepth,
    callContext,
    stack
  )
  return result
}

function sameLiteral(a, b) {
  return (
    a?.source_type === 'literal' &&
    b?.source_type === 'literal' &&
    JSON.stringify(a.value) === JSON.stringify(b.value) &&
    a.type === b.type &&
    a.name === b.name
  )
}

function collapseLiteralBranches(branches) {
  const result = []
  for (let i = 0; i < branches.length; ) {
    let end = i + 1
    while (end < branches.length && sameLiteral(branches[end - 1], branches[end])) end++
    if (end - i >= 5) {
      result.push({
        ...branches[i],
        index_end: branches[end - 1].index,
        folded_count: end - i
      })
    } else {
      result.push(...branches.slice(i, end))
    }
    i = end
  }
  return result
}

function collectTerminals(branch, result) {
  if (!branch) return
  if (branch.source_type === 'literal') {
    const terminal = {
      type: 'literal',
      input: branch.index,
      name: branch.name,
      value: branch.value
    }
    if (branch.folded_count) {
      terminal.input_end = branch.index_end
      terminal.folded_count = branch.folded_count
    }
    result.push(terminal)
  }
  if (branch.source_type === 'node') {
    for (const source of branch.sources ?? []) {
      if (source.terminal) {
        result.push({
          type: 'node',
          node: source.node,
          api: source.api,
          out_index: source.out_index,
          out_name: source.out_name,
          note: source.note,
          details: source.details
        })
      }
      for (const dependency of source.dependencies ?? []) collectTerminals(dependency, result)
      for (const dependency of source.cross_graph?.dependencies ?? []) {
        collectTerminals(dependency, result)
      }
    }
  }
  for (const dependency of branch.dependencies ?? []) collectTerminals(dependency, result)
}

function uniqueTerminals(branches) {
  const all = []
  for (const branch of branches) collectTerminals(branch, all)
  const seen = new Set()
  return all.filter((item) => {
    const key = JSON.stringify(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function renderBranch(branch, indent) {
  const lines = []
  const label = inputLabel(branch)
  if (branch.source_type === 'parent_input') {
    lines.push(`${indent}${label}`)
    lines.push(
      `${indent}  <- 复合边界 ${branch.parent?.composite ?? '当前复合接口'} ` +
        `InParam[${branch.parent?.index ?? '?'}] ${branch.parent?.name ?? ''}`
    )
    for (const dependency of branch.dependencies ?? []) {
      lines.push(...renderBranch(dependency, `${indent}    `))
    }
    return lines
  }
  if (branch.source_type === 'literal') {
    const folded = branch.folded_count ? `（重复 ${branch.folded_count} 次）` : ''
    lines.push(`${indent}${label} = ${valueText(branch.value)}${folded}`)
    return lines
  }
  if (branch.source_type === 'unconnected') {
    lines.push(`${indent}${label} (未连接)`)
    return lines
  }
  if (branch.source_type === 'cycle') {
    lines.push(`${indent}${label} (检测到循环依赖)`)
    return lines
  }

  lines.push(`${indent}${label}`)
  for (const source of branch.sources ?? []) {
    const out = source.out_name ?? `OutParam[${source.out_index ?? '?'}]`
    const note = source.note ? ` (${source.note})` : ''
    lines.push(`${indent}  <- n=${source.node} ${source.api}.${out}${note}`)
    for (const detail of source.details ?? []) {
      const detailName =
        source.note === '读取图变量' && detail.index === 0
          ? '变量'
          : (detail.name ?? `InParam[${detail.index}]`)
      const detailRange = detail.folded_count
        ? `[${detail.index}-${detail.index_end}]`
        : `[${detail.index}]`
      const folded = detail.folded_count ? `（重复 ${detail.folded_count} 次）` : ''
      lines.push(`${indent}     ${detailName}${detailRange}: ${valueText(detail.value)}${folded}`)
    }
    if (source.cross_graph) {
      lines.push(
        `${indent}     -> 进入复合图 ${source.cross_graph.graph} ` +
          `(n=${source.cross_graph.inner_node} ${source.cross_graph.inner_api})`
      )
      for (const dependency of source.cross_graph.dependencies ?? []) {
        lines.push(...renderBranch(dependency, `${indent}        `))
      }
    } else {
      for (const dependency of source.dependencies ?? []) {
        lines.push(...renderBranch(dependency, `${indent}     `))
      }
    }
    if (source.truncated) lines.push(`${indent}     ... 达到追踪深度限制`)
  }
  return lines
}

function buildDataflowReport(report, doc, options) {
  const graph = report.graph
  const target = findTargetNode(graph, options.node)
  const inputs = findTargetInputs(target, options)
  const cache = new Map()
  const branches = collapseLiteralBranches(
    inputs.map((input) =>
      traceInput(doc, cache, graph, target, input, 0, options.maxDepth, undefined, new Set())
    )
  )
  const terminals = uniqueTerminals(branches)

  return {
    input: report.input,
    target_node: {
      graph: graph.name || report.target.name,
      graph_id: graph.id,
      scope: graph.scope,
      index: target.index,
      api: target.api,
      generic_id: target.generic_id,
      kind: target.kind
    },
    target_inputs: inputs.map((input) => ({
      index: input.index,
      name: input.name,
      type: input.type ?? '?'
    })),
    dependency_paths: branches,
    terminal_sources: terminals
  }
}

function printHuman(report, result) {
  console.log(`文件: ${result.input.path}`)
  console.log(`SHA-256: ${result.input.sha256}`)
  console.log(
    `图: ${result.target_node.graph} (id=${result.target_node.graph_id ?? '?'}, scope=${result.target_node.scope})`
  )
  console.log(
    `目标节点: n=${result.target_node.index} ${result.target_node.api}  ` +
      `目标参数=${result.target_inputs.length}`
  )
  for (const branch of result.dependency_paths) {
    for (const line of renderBranch(branch, '')) console.log(line)
  }
  if (result.terminal_sources.length > 0) {
    console.log('\n终点来源:')
    for (const source of result.terminal_sources) {
      if (source.type === 'literal') {
        const range = source.folded_count
          ? `${source.input}-${source.input_end}`
          : `${source.input}`
        const folded = source.folded_count ? `（重复 ${source.folded_count} 次）` : ''
        console.log(
          `  字面量 InParam[${range}] ${source.name}: ${valueText(source.value)}${folded}`
        )
      } else {
        console.log(
          `  n=${source.node} ${source.api}.${source.out_name ?? `OutParam[${source.out_index ?? '?'}]`}` +
            `${source.note ? ` (${source.note})` : ''}`
        )
      }
    }
  }
}

function main() {
  const { filePath, options } = parseArgs(process.argv.slice(2))
  const doc = loadDocument(filePath)
  const report = buildReport(doc, {
    graph: options.graph,
    composite: options.composite,
    auto: options.auto,
    depth: 0,
    maxItems: DEFAULT_MAX_ITEMS
  })
  if (!report.graph) throw new Error(`目标图没有可解析的实现: ${report.target.name}`)
  const result = buildDataflowReport(report, doc, options)
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
  console.error(`追踪失败: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
