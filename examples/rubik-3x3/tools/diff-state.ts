// 对比两个状态快照 JSON，输出精确差值
// 用法：npx tsx examples/rubik-3x3/tools/diff-state.ts <labelA> <labelB>
import { readFileSync } from 'node:fs'

const a = JSON.parse(readFileSync(`.gsts/analysis/rubik-3x3-state-${process.argv[2]}.json`, 'utf8'))
const b = JSON.parse(readFileSync(`.gsts/analysis/rubik-3x3-state-${process.argv[3]}.json`, 'utf8'))
console.log(`A=${a.label} hash=${a.hash} actual=${a.actual}`)
console.log(`B=${b.label} hash=${b.hash} actual=${b.actual}`)
console.log('\nvisual deltas:')
for (const key of [
  'mainExpanded',
  'direct',
  'compositeInstances',
  'mbCases',
  'unconnectedCompositeNodes',
  'controlNodes',
  'dataFlowNodes',
  'dataFlowConsumed',
  'dataFlowUnconsumed',
  'flowEdges',
  'dataFlowEdges',
  'gameNodeCount'
]) {
  const av = a.visual[key]
  const bv = b.visual[key]
  if (av === undefined || bv === undefined) {
    console.log(`  ${key}: ${av ?? '-'} -> ${bv ?? '-'} (旧快照无此字段)`)
  } else {
    console.log(`  ${key}: ${av} -> ${bv} (Δ${bv - av})`)
  }
}
if (a.actual !== undefined && b.actual !== undefined) {
  console.log(`actual: ${a.actual} -> ${b.actual} (Δ${b.actual - a.actual})`)
}
