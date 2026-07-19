import fs from 'node:fs'
import path from 'node:path'

const out = path.resolve('dist-timer-composite-control-flow-callbacks/tests')
const jsonPath = path.join(out, 'timer_composite_control_flow_callbacks_test.json')
const graphs = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
  nodes: { type: string; args?: unknown[] }[]
  compositeDefs?: {
    name: string
    implNodes?: { type: string }[]
    implEdges?: Record<string, unknown[]>
    outflows?: unknown[]
  }[]
}[]

if (graphs.length !== 4) throw new Error(`expected 4 graphs, got ${graphs.length}`)

for (const [index, graph] of graphs.entries()) {
  const startTimers = graph.nodes.filter((node) => node.type === 'start_timer').length
  const timerEvents = graph.nodes.filter((node) => node.type === 'when_timer_is_triggered').length
  const compositeCalls = graph.nodes.filter((node) => node.type === '__composite_call__').length
  const branches = graph.nodes.filter((node) => node.type === 'double_branch').length
  const defs = graph.compositeDefs ?? []
  const implNodes = defs.flatMap((def) => def.implNodes ?? [])
  const implTimers = implNodes.filter((node) => node.type === 'start_timer').length
  const implTimerEvents = implNodes.filter((node) => node.type === 'when_timer_is_triggered').length
  const implCalls = implNodes.filter((node) => node.type === '__composite_call__').length

  if (index === 0 && (implTimers !== 1 || implTimerEvents !== 1)) {
    throw new Error('case E expected Timer nodes in the outer composite impl graph')
  }
  if (index === 1 && (implTimers !== 1 || implTimerEvents !== 1 || implCalls !== 1)) {
    throw new Error('case F expected Timer nodes in the nested child impl graph and a nested call')
  }
  if (index === 2 && (implTimers !== 1 || implTimerEvents !== 1)) {
    throw new Error('case G expected Timer nodes in the outer composite impl graph')
  }
  if (index === 3 && (implTimers !== 1 || implTimerEvents !== 1 || implCalls !== 1)) {
    throw new Error('case H expected Timer nodes and a nested composite call in impl graphs')
  }

  if (index === 0 && (startTimers !== 0 || timerEvents !== 0 || compositeCalls !== 1)) {
    throw new Error(`case E expected a composite call only in the main graph`)
  }
  if (index === 1 && (startTimers !== 0 || timerEvents !== 0 || compositeCalls !== 1)) {
    throw new Error(`case F expected a nested composite call only in the main graph`)
  }
  if (index === 2 && (startTimers !== 0 || timerEvents !== 0 || compositeCalls !== 1)) {
    throw new Error(`case G expected a composite call only in the main graph`)
  }
  if (index === 3 && (startTimers !== 1 || timerEvents !== 1 || compositeCalls !== 1 || branches < 2)) {
    throw new Error(`case H expected outer Timer and composite branch in the main graph`)
  }
}

const allNodes = graphs.flatMap((graph) => graph.nodes)
const totalCompositeCalls = allNodes.filter((node) => node.type === '__composite_call__').length
const totalBranches = allNodes.filter((node) => node.type === 'double_branch').length
const totalTimers = allNodes.filter((node) => node.type === 'start_timer').length

if (totalCompositeCalls < 4) throw new Error('expected one main-graph composite call per case')
if (totalBranches < 2) throw new Error('expected nested control-flow branches')
if (totalTimers !== 1) throw new Error(`expected one main-graph Timer registration, got ${totalTimers}`)

console.log('timer composite control-flow callback structure: 4/4 main graphs passed')
