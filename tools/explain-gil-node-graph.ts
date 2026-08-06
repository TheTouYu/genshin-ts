// @ts-nocheck
/**
 * 一键解读 GIL 节点图：事件入口 → 控制流主干 → 每节点参数来源 → 系统/复合节点说明。
 * 内部复用 parse-gil-node-graph 的解析，不重复实现底层解码。
 *
 * 用法:
 *   npx tsx tools/explain-gil-node-graph.ts <map.gil> --graph <id|名称>
 *   npx tsx tools/explain-gil-node-graph.ts <map.gil> --composite <名称> [--depth N]
 */

import { pathToFileURL } from 'node:url'

import { buildReport, loadDocument } from './parse-gil-node-graph.js'
import { ENUM_VALUE } from 'genshin-ts/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/enum_id.js'

function usage(exitCode = 0) {
  const text = [
    '用法: npx tsx tools/explain-gil-node-graph.ts <map.gil> [选项]',
    '',
    '选项:',
    '  --graph <id|name|auto>   选择主图；auto 选择唯一非空用户图',
    '  --composite <id|name>   解读指定复合/系统节点的定义接口',
    '  --depth <n>             嵌套复合展开层数（默认 0=不展开，仅显式指定才展开）',
    '  -h, --help              显示帮助',
    '',
    '输出: 事件入口、控制流执行树、每个节点输入参数来源、系统/复合节点说明。'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

function parseArgs(args) {
  if (args.includes('-h') || args.includes('--help')) usage(0)
  const filePath = args[0]
  if (!filePath || filePath.startsWith('-')) usage(1)

  const options = { graph: undefined, composite: undefined, depth: 0, auto: false }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    const next = () => args[++i]
    if (arg === '--graph') options.graph = next()
    else if (arg.startsWith('--graph=')) options.graph = arg.slice(8)
    else if (arg === '--composite') options.composite = next()
    else if (arg.startsWith('--composite=')) options.composite = arg.slice(12)
    else if (arg === '--depth') options.depth = Number(next())
    else if (arg.startsWith('--depth=')) options.depth = Number(arg.slice(8))
    else if (arg === '--auto') options.auto = true
    else usage(1)
  }
  if (options.graph && options.composite) throw new Error('--graph 与 --composite 不能同时使用')
  if (options.auto && options.graph) throw new Error('--auto 与 --graph <id|name> 不能同时使用')
  if (options.auto && options.composite) throw new Error('--auto 只能用于主图')
  if (!Number.isInteger(options.depth) || options.depth < 0)
    throw new Error('--depth 必须是非负整数')
  return { filePath, options }
}

// ---- 值/类型的人类可读化 ----

function enumName(value) {
  const found = Object.entries(ENUM_VALUE).find(([, v]) => v === value)
  return found ? `${found[0]}(${value})` : `枚举#${value}`
}

function literalText(value) {
  if (value === undefined) return undefined
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value.id !== undefined) return String(value.id)
  if (value.enum !== undefined) return enumName(value.enum)
  if (value.x !== undefined || value.y !== undefined || value.z !== undefined)
    return `(${value.x ?? 0}, ${value.y ?? 0}, ${value.z ?? 0})`
  if (value.concrete !== undefined) return literalText(value.value)
  try {
    const s = JSON.stringify(value)
    return s.length > 60 ? s.slice(0, 57) + '...' : s
  } catch {
    return String(value)
  }
}

// ---- 来源描述 ----

function sourceText(source, nodeMap) {
  const n = nodeMap.get(source.node)
  const api = source.api ?? n?.api ?? `n=${source.node}`
  const pin = source.pin_name ?? `Out[${source.pin?.index ?? '?'}]`
  return `n=${source.node} ${api}.${pin}`
}

function inputOrigin(input, nodeMap) {
  // input: {name, type, present, value?, sources?}
  if (input.present && input.sources?.length) {
    return input.sources.map((s) => sourceText(s, nodeMap)).join('、')
  }
  if (input.value !== undefined) {
    return `字面量 ${literalText(input.value)}`
  }
  return '未连线'
}

// ---- 控制流执行树 ----

// 事件入口判定（用户编辑器核验确认的语义）：
// 1) 监听信号类（SysGraph 无 InFlow 接口但有 OutFlow）
// 2) 系统事件类（When 前缀 / 白名单：实体创建时、定时器、变量变化时等）
// 3) 复合包裹事件类（用户把事件节点包进复合，定义同样无 InFlow 接口）
// 共同特征：没有输入控制流。无入边的普通节点（如 Set Custom Variable）不是事件入口，
// 按“孤立执行链”展示（调试时可能短暂不启用）。
function isEventNode(node) {
  return [71, 72, 83, 385].includes(node.generic_id) || /^When\b/.test(node.api ?? '')
}

// 事件入口 = 事件节点，或“信号/系统复合”类（无 InFlow 接口但有 OutFlow，如监听信号）
function eventLike(node) {
  return (
    isEventNode(node) ||
    (node.kind === 'SysGraph' &&
      !(node.composite?.interface?.inflows?.length ?? 0) &&
      Boolean(node.composite?.interface?.outflows?.length))
  )
}

function buildExecTree(graph, nodeMap) {
  const flowFrom = new Map() // node -> [{to, via}]
  const flowTo = new Map() // node -> 执行入边数
  for (const e of graph.flow ?? []) {
    if (!flowFrom.has(e.from.node)) flowFrom.set(e.from.node, [])
    flowFrom
      .get(e.from.node)
      .push({ to: e.to.node, via: e.from.pin_name ?? `Out[${e.from.pin?.index ?? 0}]` })
    flowTo.set(e.to.node, (flowTo.get(e.to.node) ?? 0) + 1)
  }
  const events = (graph.nodes ?? []).filter((n) => eventLike(n) && !flowTo.has(n.index))
  const orphans = (graph.nodes ?? []).filter(
    (n) => !eventLike(n) && !flowTo.has(n.index) && (flowFrom.get(n.index)?.length ?? 0) > 0
  )
  return { events, orphans, flowFrom, flowTo }
}

// ---- 输出 ----

function nodeLabel(node) {
  const c = node.composite
  if (!c) return node.api
  if (c.graph_id !== undefined) return `复合:${c.name} (impl图=${c.graph_id})`
  return `系统:${c.name}`
}

// 树上节点的关键参数摘要：变量设置类显示变量名，信号系统节点显示信号名
function keyParam(node, nodeMap) {
  if (node.composite && node.composite.graph_id === undefined) {
    const signal = (node.pins ?? []).find(
      (p) => p.kind === 'ClientExecNode' || p.kind === 'ClientSignal'
    )
    if (signal?.value !== undefined) return `信号=${literalText(signal.value)}`
    return undefined
  }
  if (/Local Variable/.test(node.api ?? '')) {
    // 局部变量 wire 无名（E<1016> 是 Local Variable 类型码），身份沿 E<1016> 连线传递
    const lv = (node.inputs ?? []).find((i) => i.type === 'E<1016>')
    if (lv) return `局部变量 ← ${inputOrigin(lv, nodeMap)}`
    return '局部变量'
  }
  if (/^Set\b/.test(node.api ?? '') && /Variable/.test(node.api ?? '')) {
    const str = (node.inputs ?? []).find((i) => i.type === 'Str' && i.value !== undefined)
    if (str) return `变量=${literalText(str.value)}`
  }
  return undefined
}

// 探测从 startNid 出发的线性折叠段：起点单出；段内节点单入单出、无真实条件、未访问
// 副作用：段内节点加入 visited（调用方链长 <3 时自行回退删除）
export function foldableChain(startNid, via, flowFrom, flowTo, nodeMap, visited) {
  const chain = []
  let cur = startNid
  let curVia = via
  while (cur !== undefined && !visited.has(cur)) {
    const n = nodeMap.get(cur)
    if (!n) break
    const o = flowFrom.get(cur) ?? []
    const merged = chain.length > 0 && (flowTo.get(cur) ?? 0) > 1
    if (o.length > 1 || merged) break // 分支点不折叠；链尾（无出边）允许入链
    const cond = conditionText(n, nodeMap)
    if (cond && !cond.startsWith('字面量 ')) break // 真实条件不折叠，保留分支信息
    chain.push({ nid: cur, via: curVia, node: n })
    visited.add(cur)
    if (o.length === 0) break // 链尾
    curVia = o[0].via
    cur = o[0].to
  }
  return chain
}

function printTree(entry, flowFrom, flowTo, nodeMap, kind = '事件', indent = '') {
  console.log(`${indent}${kind}: n=${entry.index} ${entry.api}`)
  const visited = new Set([entry.index])
  const printBranch = (nid, via, depth) => {
    const pad = indent + '  '.repeat(depth + 1)
    const node = nodeMap.get(nid)
    if (!node) {
      console.log(`${pad}${via} → n=${nid} (节点不存在)`)
      return
    }
    const outs = flowFrom.get(nid) ?? []
    // 线性链折叠：起点单出；段内节点单入单出且无真实条件；≥3 个节点合成一行
    // 局部变量：折叠前先探测，链太短(<3)时回退到逐行输出
    if (outs.length === 1 && !visited.has(nid)) {
      const chain = foldableChain(nid, via, flowFrom, flowTo, nodeMap, visited)
      if (chain.length >= 3) {
        const items = chain.map(({ nid: id, node: n }) => {
          const key = keyParam(n, nodeMap)
          return `n=${id} ${nodeLabel(n)}${key ? ` [${key}]` : ''}`
        })
        const lines = []
        for (let i = 0; i < items.length; i += 6) {
          const seg = items.slice(i, i + 6).join(' → ')
          lines.push(i === 0 ? `${pad}${chain[0].via} → ${seg}` : `${pad}→ ${seg}`)
        }
        console.log(lines.join('\n'))
        const tail = flowFrom.get(chain[chain.length - 1].nid) ?? []
        const next = tail[0]?.to
        if (next !== undefined) {
          if (visited.has(next)) {
            console.log(`${pad}(与上方路径合并/循环，不再展开)`)
          } else {
            printBranch(next, tail[0].via, depth)
          }
        }
        return
      }
      for (const c of chain) visited.delete(c.nid)
    }
    const cond = conditionText(node, nodeMap)
    const key = keyParam(node, nodeMap)
    console.log(`${pad}${via} → n=${nid} ${nodeLabel(node)}${key ? ` [${key}]` : ''}${cond ? `  [条件: ${cond}]` : ''}`)
    if (visited.has(nid)) {
      console.log(`${pad}(与上方路径合并/循环，不再展开)`)
      return
    }
    visited.add(nid)
    for (const child of outs) printBranch(child.to, child.via, depth + 1)
  }
  for (const child of flowFrom.get(entry.index) ?? []) {
    printBranch(child.to, child.via, 0)
  }
}

function conditionText(node, nodeMap) {
  // 分支/条件类节点：找第一个布尔输入
  const cond = (node.inputs ?? []).find((i) => i.name === 'Bol' || i.type === 'Bol')
  if (!cond) return undefined
  return inputOrigin(cond, nodeMap)
}

function printInputs(node, nodeMap, indent = '', boundaryIn = new Map()) {
  const inputs = node.inputs ?? []
  if (!inputs.length) {
    console.log(`${indent}    (无参数输入)`)
    return
  }
  for (const input of inputs) {
    let shown = inputOrigin(input, nodeMap)
    // 复合 impl 内部：未连线输入可能来自外部接口（boundary kind=3 数据输入映射）
    if (shown === '未连线') {
      const bound = boundaryIn.get(`${node.index}:${input.index}`)
      if (bound) shown = `接口 ${bound}`
    }
    console.log(`${indent}    ${input.name}${input.type ? `:${input.type}` : ''} ← ${shown}`)
  }
}

// 图正文：系统/复合节点说明 + 事件入口 + 控制流 + 参数来源
function explainGraphBody(graph, options, indent = '') {
  const nodeMap = new Map(graph.nodes.map((n) => [n.index, n]))
  const { events, orphans, flowFrom, flowTo } = buildExecTree(graph, nodeMap)
  // 复合 impl 图：外部接口数据输入（boundary inner kind=3）→ outer 名称，供内部节点参数来源标注
  const boundaryIn = new Map()
  for (const b of graph.boundary ?? []) {
    if (b.inner?.kind === 3) boundaryIn.set(`${b.inner_node}:${b.inner.index}`, b.outer_name)
  }

  if (!indent) {
    console.log(`图: ${graph.name ?? '(复合实现)'} (id=${graph.id}, ${graph.node_count} 节点)`)
    console.log(`连线: ${graph.dataflow.length} 条数据流, ${graph.flow.length} 条执行流`)
    console.log('')
  }

  // 系统/复合节点说明
  const special = graph.nodes.filter((n) => n.composite)
  if (special.length) {
    console.log(`${indent}【系统/复合节点】(${special.length})`)
    for (const n of special) {
      const c = n.composite
      if (c.graph_id === undefined) {
        const signal = (n.pins ?? []).find((p) => p.kind === 'ClientExecNode' || p.kind === 'ClientSignal')
        const sigName = signal?.value !== undefined ? literalText(signal.value) : '(未命名)'
        console.log(`${indent}  n=${n.index} ${nodeLabel(n)}：系统节点，无内部图；信号名 ${sigName}，参数行为由信号名决定`)
      } else {
        console.log(`${indent}  n=${n.index} ${nodeLabel(n)}：复合节点`)
      }
    }
    console.log('')
  }

  // 事件与控制流
  if (!events.length && !orphans.length) {
    console.log(`${indent}【控制流】无事件入口、无孤立执行链（执行流 ${graph.flow.length} 条）`)
  } else {
    console.log(`${indent}【事件入口】(${events.length})`)
    for (const ev of events) console.log(`${indent}  n=${ev.index} ${nodeLabel(ev)}`)
    console.log('')
    console.log(`${indent}【控制流】从事件入口出发的执行主干（分支条件注明数据来源）`)
    for (const ev of events) {
      const hasOut = (flowFrom.get(ev.index)?.length ?? 0) > 0
      if (!hasOut) {
        console.log(`${indent}事件: n=${ev.index} ${nodeLabel(ev)}（未连线，无执行出边）`)
      } else {
        printTree(ev, flowFrom, flowTo, nodeMap, '事件', indent)
      }
    }
    if (orphans.length) {
      // 复合 impl：外部 InFlow 入口（compositePins 中 outer.kind=1 的映射）不是孤立链
      const boundaryIn = new Map()
      for (const b of graph.boundary ?? []) {
        if (b.outer?.kind === 1) boundaryIn.set(b.inner_node, b.outer_name ?? `InFlow[${b.outer.index ?? 0}]`)
      }
      const external = orphans.filter((o) => boundaryIn.has(o.index))
      const realOrphans = orphans.filter((o) => !boundaryIn.has(o.index))
      if (external.length) {
        console.log(`${indent}【外部入口】复合由调用方 InFlow 驱动（${external.length} 条）：`)
        for (const orph of external) printTree(orph, flowFrom, flowTo, nodeMap, `外部入口 ${boundaryIn.get(orph.index)}`, indent)
      }
      if (realOrphans.length) {
        console.log('')
        console.log(`${indent}孤立执行链（不挂任何事件入口，${realOrphans.length} 条）：`)
        for (const orph of realOrphans) printTree(orph, flowFrom, flowTo, nodeMap, '入口', indent)
      }
    }
    console.log('')
  }

  // 参数来源
  if (!options.nested) {
    console.log(`${indent}【参数来源】每个节点的输入参数从哪来`)
    for (const node of graph.nodes) {
      console.log(`${indent}  n=${node.index} ${nodeLabel(node)}`)
      printInputs(node, nodeMap, indent, boundaryIn)
    }
  }
}

// 嵌套复合展开：递归输出 graph.children 中每个复合的内部逻辑
function printNestedComposites(graph, depth, indent = '') {
  const children = graph.children ?? []
  if (!children.length || depth <= 0) return
  console.log(`${indent}【嵌套复合展开】(${children.length} 个复合，展开 ${depth} 层)`)
  for (const child of children) {
    const iface = child.interface
    const fmt = (pins) => pins.map((p) => `${p.name}:${p.type ?? '?'}`).join(', ') || '(无)'
    const callSites = child.call_sites.length ? `调用点 n=${child.call_sites.join('/')}` : ''
    console.log(`${indent}┌─ ${child.name} (impl图=${child.graph_id ?? '无'}) ${callSites}`)
    if (!child.graph) {
      const reason =
        child.status === 'no-implementation-graph'
          ? '系统节点，无内部图'
          : child.status === 'cycle'
            ? '循环引用，跳过'
            : '未展开'
      console.log(`${indent}│   ${reason}`)
      continue
    }
    if (iface) {
      console.log(`${indent}│   接口: inputs=[${fmt(iface.inputs ?? [])}] outputs=[${fmt(iface.outputs ?? [])}]`)
      console.log(`${indent}│         inflows=[${fmt(iface.inflows ?? [])}] outflows=[${fmt(iface.outflows ?? [])}]`)
    }
    explainGraphBody(child.graph, { nested: true }, indent + '│  ')
    printNestedComposites(child.graph, depth - 1, indent + '│  ')
  }
}


function explain(doc, report, options) {
  const { input, target, graph } = report
  console.log(`=== 图解读: ${target.name} (id=${target.graph_id ?? target.id ?? target.definition_id}, scope=${target.kind}) ===`)
  console.log(`文件: ${input.path}`)
  console.log(`SHA-256: ${input.sha256}`)
  console.log('')

  if (options.composite) {
    const t = target
    console.log(`复合定义: ${t.name} (definition_id=${t.definition_id}${t.graph_id !== undefined ? `, impl图=${t.graph_id}` : ''})`)
    const iface = t.interface
    if (iface) {
      const fmt = (pins) => pins.map((p) => `${p.name}:${p.type ?? '?'}`).join(', ') || '(无)'
      console.log(`接口: inputs=[${fmt(iface.inputs ?? [])}] outputs=[${fmt(iface.outputs ?? [])}]`)
      console.log(`     inflows=[${fmt(iface.inflows ?? [])}] outflows=[${fmt(iface.outflows ?? [])}]`)
    }
    if (!graph) {
      console.log(`状态: no-implementation-graph（系统节点，无内部图；参数行为由节点定义决定）`)
      return
    }
    console.log('')
    console.log(`复合内部: ${graph.name} (${graph.node_count} 节点)`)
    explainGraphBody(graph, options)
    printNestedComposites(graph, options.depth, '')
    return
  }

  explainGraphBody(graph, options)
  printNestedComposites(graph, options.depth, '')
}

function main() {
  const { filePath, options } = parseArgs(process.argv.slice(2))
  const doc = loadDocument(filePath)
  const report = buildReport(doc, options)
  explain(doc, report, options)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (error) {
    console.error(`解读失败: ${error.message}`)
    process.exitCode = 1
  }
}
