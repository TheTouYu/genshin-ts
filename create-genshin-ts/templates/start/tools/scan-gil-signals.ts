// @ts-nocheck
/**
 * 全量扫描 GIL 中的信号使用：主图 + 复合 impl 图全部节点，按信号名聚合发送/监听/事件定义。
 *
 * 信号名的编码位置：节点 ClientExecNode/ClientSignal pin（i1.kind=5/6）的字符串值。
 * 系统复合节点按定义名分类：发送信号 / 监听信号 / 其他（如"向服务器节点图发送信号"）。
 * impl 图（复合实现图）也会扫描——信号节点可能藏在复合内部（如 物理运动控制器、评分）。
 *
 * 用法:
 *   npx tsx tools/scan-gil-signals.ts <map.gil>              # 列出全部信号及使用图数
 *   npx tsx tools/scan-gil-signals.ts <map.gil> --signal 足球 # 指定信号的完整使用清单
 *   npx tsx tools/scan-gil-signals.ts <map.gil> --signal 足球 --json
 */

import { loadDocument } from './parse-gil-node-graph.js'

function usage(exitCode = 0) {
  const text = [
    '用法: npx tsx tools/scan-gil-signals.ts <map.gil> [选项]',
    '',
    '选项:',
    '  --signal <名称>   只扫描指定信号（默认列出全部信号及图数）',
    '  --json            输出 JSON（input/signal/usages/summary）',
    '  -h, --help        显示帮助',
    '',
    '输出: 每个信号的发送/监听/事件定义节点清单（含 impl 图），按图聚合的图数统计。'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

function parseArgs(args) {
  if (args.includes('-h') || args.includes('--help')) usage(0)
  const filePath = args[0]
  if (!filePath || filePath.startsWith('-')) usage(1)
  const options = { signal: undefined, json: false }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    const next = () => args[++i]
    if (arg === '--signal') options.signal = next()
    else if (arg.startsWith('--signal=')) options.signal = arg.slice(9)
    else if (arg === '--json') options.json = true
    else usage(1)
  }
  return { filePath, options }
}

// ---- 值提取 ----

function stringValue(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (value.bString?.val !== undefined) return value.bString.val
  if (Array.isArray(value)) return value.map(stringValue).find((v) => v !== undefined)
  return undefined
}

function pinKind(pin) {
  const k = pin?.i1?.kind
  if (k === 5 || k === 'ClientExecNode') return 5
  if (k === 6 || k === 'ClientSignal') return 6
  return undefined
}

// ---- 扫描 ----

function scan(doc) {
  const bySignal = new Map() // 信号名 -> [{scope, graphId, graphName, node, composite, event, compIndex, signalVersion}]
  const all = [
    ...[...doc.graphsById.entries()].map(([id, g]) => ({ id, g, scope: 'main' })),
    ...[...doc.implGraphsById.entries()].map(([id, g]) => ({ id, g, scope: 'impl' }))
  ]
  for (const { id, g, scope } of all) {
    const graphName =
      scope === 'impl'
        ? doc.defsByGraphId.get(id)?.name ?? '(无名复合)'
        : g.name ?? '(无名)'
    for (const node of g.nodes ?? []) {
      const genericId = node.genericId?.nodeId
      const def = doc.defsById.get(genericId)
      const composite = def?.name
      // 事件/行为参数：kind=3 输入 pin 的字符串值（如"向服务器节点图发送信号"的"事件"参数）
      const event = (node.pins ?? [])
        .map((p) => (pinKind(p) === undefined ? stringValue(p.value) : undefined))
        .find((v) => v !== undefined)
      for (const pin of node.pins ?? []) {
        if (pinKind(pin) === undefined) continue
        const signal = stringValue(pin.value)
        if (signal === undefined) continue
        if (!bySignal.has(signal)) bySignal.set(signal, [])
        bySignal.get(signal).push({
          scope,
          graphId: Number(id),
          graphName,
          node: node.nodeIndex,
          composite,
          event,
          compIndex: pin.compositePinIndex,
          signalVersion: node.signalVersion
        })
      }
    }
  }
  return bySignal
}

function classify(composite) {
  if (composite === '发送信号') return 'send'
  if (composite === '监听信号') return 'listen'
  return 'other'
}

function summarize(usages) {
  const groups = { send: [], listen: [], other: [] }
  for (const u of usages) groups[classify(u.composite)].push(u)
  const graphCount = new Set(usages.map((u) => `${u.scope}:${u.graphId}`)).size
  return {
    send: groups.send.length,
    listen: groups.listen.length,
    other: groups.other.length,
    graphs: graphCount,
    groups
  }
}

// ---- 输出 ----

function printHuman(signal, usages) {
  const s = summarize(usages)
  const label = { send: '发送', listen: '监听', other: '事件定义/其他' }
  console.log(`=== ${signal} 信号使用清单 ===`)
  console.log(`合计: ${s.send + s.listen + s.other} 节点 / ${s.graphs} 图 (发送 ${s.send}、监听 ${s.listen}、其他 ${s.other})`)
  for (const key of ['send', 'listen', 'other']) {
    const list = s.groups[key]
    if (!list.length) continue
    console.log(`\n【${label[key]}】(${list.length})`)
    for (const u of list.sort((a, b) => a.graphId - b.graphId || a.node - b.node)) {
      const scope = u.scope === 'impl' ? '复合impl' : '主图'
      const event = u.event ? ` 事件=${u.event}` : ''
      console.log(`  ${scope} ${u.graphId} ${u.graphName}: n=${u.node} ${u.composite ?? ''}${event}`)
    }
  }
}

function printAllSignals(bySignal) {
  console.log(`共 ${bySignal.size} 个信号被使用（发送/监听/其他 节点数，按图去重）：`)
  for (const [signal, usages] of [...bySignal.entries()].sort()) {
    const s = summarize(usages)
    console.log(`  ${signal}: 发送 ${s.send} / 监听 ${s.listen} / 其他 ${s.other}，${s.graphs} 图`)
  }
}

function main() {
  const { filePath, options } = parseArgs(process.argv.slice(2))
  const doc = loadDocument(filePath)
  const bySignal = scan(doc)

  if (!options.signal) {
    printAllSignals(bySignal)
    return
  }

  if (options.json) {
    const usages = bySignal.get(options.signal) ?? []
    const summary = summarize(usages)
    console.log(
      JSON.stringify(
        { input: { path: filePath, sha256: doc.sha256 }, signal: options.signal, usages, summary },
        null,
        2
      )
    )
    return
  }

  if (!bySignal.has(options.signal)) {
    console.error(`信号 "${options.signal}" 未被任何图使用（含 impl 图）`)
    console.error(`本文件全部信号: ${[...bySignal.keys()].join('、') || '(无)'}`)
    process.exit(1)
  }
  printHuman(options.signal, bySignal.get(options.signal))
}

main()
