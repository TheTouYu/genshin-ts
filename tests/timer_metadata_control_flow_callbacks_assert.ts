import fs from 'node:fs'
import path from 'node:path'

const out = path.resolve('dist-timer-metadata-control-flow-callbacks/tests')
const jsonPath = path.join(out, 'timer_metadata_control_flow_callbacks_test.json')
const graphs = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
  nodes: { type: string; args?: unknown[] }[]
}[]

if (graphs.length !== 4) throw new Error(`expected 4 graphs, got ${graphs.length}`)

const expected = [
  { startTimers: 1, timerEvents: 1, markers: 0 },
  { startTimers: 1, timerEvents: 1, markers: 0 },
  { startTimers: 1, timerEvents: 1, markers: 0 },
  { startTimers: 1, timerEvents: 1, markers: 0 }
]

for (const [index, graph] of graphs.entries()) {
  const counts = {
    startTimers: graph.nodes.filter((node) => node.type === 'start_timer').length,
    timerEvents: graph.nodes.filter((node) => node.type === 'when_timer_is_triggered').length,
    markers: graph.nodes.filter((node) => node.type === '__composite_call__').length
  }
  const want = expected[index]
  if (JSON.stringify(counts) !== JSON.stringify(want)) {
    throw new Error(`case ${String.fromCharCode(65 + index)} has ${JSON.stringify(counts)}`)
  }
}

console.log('timer metadata control-flow callback structure: 4/4 passed')
